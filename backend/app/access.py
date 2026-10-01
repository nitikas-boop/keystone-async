"""Roles and access (B): the one check behind every read, write, subscription, search, notification and export.

Labels: every node and source carries visibility (org | team | restricted) and a project; its team is the source's
`team`, else the team that owns its project (teams.projects). Hidden items simply do not appear.

  owner       everything, every team, restricted included; grants and revokes
  compliance  everything (read), across teams
  lead        org items, their team's items; approves joins; authority for their domain
  member      org items, their team's items; with assigned projects (jurisdiction) only those projects' items,
              their department's policies and the org chart
  auditor     read-only, time-limited, non-restricted items dated inside their invited range
A per-user grant (access_grants) opens one item to one person whatever its label.
"""
from datetime import datetime, timezone

from . import config, db

ROLES = ('owner', 'lead', 'member', 'compliance', 'auditor')
READ_ALL = {'owner', 'compliance'}
PROJECT_TEAM: dict[str, dict[str, str]] = {}  # org_id -> {project name: team id}, refreshed per request
TEAM_BY_NAME: dict[str, dict[str, str]] = {}  # org_id -> {lower-case team name or id: team id}
POLICY_TEAM: dict[str, dict[str, str]] = {}   # org_id -> {policy id: the department (team id) that owns it}


async def refresh_projects(org_id: str):
    rows = await db.pool.fetch('SELECT id, name, projects, policies FROM teams WHERE org_id = $1', org_id)
    PROJECT_TEAM[org_id] = {p: r['id'] for r in rows for p in r['projects']}
    TEAM_BY_NAME[org_id] = {k.lower(): r['id'] for r in rows for k in (r['name'], r['id'])}
    POLICY_TEAM[org_id] = {p: r['id'] for r in rows for p in r['policies']}


def _org() -> str:
    from .contracts import current_user
    return (current_user() or {}).get('org_id') or config.GROUP_ID


def item_date(src: dict) -> str | None:
    d = (src.get('decided_on') or src.get('meeting_date') or src.get('effective_from') or src.get('valid_from')
         or src.get('ref_time') or src.get('date'))
    return str(d)[:10] if d else None


def label_for(source: dict) -> dict:
    """Explicit visibility wins. A scanned file's folder scope decides otherwise: Organisation/ -> org,
    Team/... -> team (the scanning user's team), Groups/... -> restricted."""
    project, scope = source.get('project'), source.get('scope') or 'org'
    named = TEAM_BY_NAME.get(_org(), {})
    team = (named.get(str(source.get('team') or '').lower()) or source.get('team')
            or PROJECT_TEAM.get(_org(), {}).get(project) or POLICY_TEAM.get(_org(), {}).get(source.get('policy_id')))
    vis = source.get('visibility')
    if not vis:
        if scope.lower() in ('org', 'organisation'):
            vis = 'org'
        elif scope.lower().startswith('team:') and (tid := named.get(scope.split(':', 1)[1].lower())):
            vis, team = 'team', tid  # Team/<name>/ of a real team
        else:
            vis = 'restricted'  # a group folder, or a team folder no team matches: nobody is widened by accident
    return {'team': team, 'project': project, 'visibility': vis, 'date': item_date(source)}


def member_projects(user: dict) -> set[str]:
    """An employee's projects: the ones assigned to them, else every project of the teams they belong to (their
    department). An employee in no team with projects has none."""
    if user.get('assigned_projects'):
        return set(user['assigned_projects'])
    teams = set(user.get('teams', ()))
    return {p for p, t in PROJECT_TEAM.get(user.get('org_id'), {}).items() if t in teams}


def in_jurisdiction(user: dict, resource: dict) -> bool:
    """An employee (member): the org chart, their projects' items (assigned, else their department's), and items
    (policies) owned by their department. Anything tied to neither (another department's project or policy, a
    meeting note, a flag) is outside it, whatever its org label. Leads, compliance and the owner have no such limit."""
    if user.get('role') != 'member':
        return True
    if (resource.get('type') or '').lower() == 'person':
        return True
    if resource.get('project'):
        return resource['project'] in member_projects(user)
    return resource.get('team') is not None and resource['team'] in user.get('teams', ())


def can_access(user: dict | None, resource: dict, action: str = 'read') -> bool:
    if user is None:  # a system process (watcher, scanner, executor), not a person
        return True
    role = user.get('role')
    if role not in ROLES:
        return False
    # Rows without org_id are the pre-tenancy knowledge tables, which belong to the default org.
    if (resource.get('org_id') or config.GROUP_ID) != user['org_id']:
        return False
    if action != 'read' and role == 'auditor':
        return False
    if 'members' in resource:  # channels and DMs: exactly the participants, not even the owner otherwise
        return user['user_id'] in resource['members']
    if resource.get('type') == 'audit_log':
        return role in READ_ALL
    if role in READ_ALL or resource.get('id') in user.get('grants', ()):
        return True
    if not in_jurisdiction(user, resource):
        return False
    vis = resource.get('visibility') or 'org'
    if role == 'auditor':
        d = resource.get('date')
        return vis != 'restricted' and (not d or (user.get('audit_from') or '0000') <= d <= (user.get('audit_to') or '9999'))
    if vis == 'restricted':
        return False
    if vis == 'team':
        return resource.get('team') is not None and resource['team'] in user.get('teams', ())
    return True


def resource_of(props: dict, org_id: str | None = None) -> dict:
    """A graph node's (or edge's) property dict as a can_access resource."""
    label = label_for(props)
    if props.get('type') == 'Project':  # a project node is its own project
        label['project'] = props.get('key')
    return {'type': props.get('type') or 'edge', 'id': props.get('key') or props.get('id') or props.get('uuid'),
            'org_id': org_id, **label}


def visible_filter(user: dict | None):
    if user is None:
        return lambda props: True
    return lambda props: can_access(user, resource_of(props, user['org_id']))


async def log_view(user: dict | None, resource: dict):
    """restricted_view: who opened which restricted item, and when."""
    if user and user.get('user_id') and (resource.get('visibility') == 'restricted'):
        await db.audit(f"user:{user['user_id']}", 'restricted_view', (resource.get('type') or 'item').lower(),
                       str(resource.get('id')), [str(resource.get('id'))], {'via': user.get('via')})


# ---- jurisdiction refusals: who to ask, and the audit row ----

async def _person(user_id: str | None) -> dict | None:
    r = user_id and await db.pool.fetchrow('SELECT id, display_name, designation FROM users WHERE id = $1', user_id)
    return r and {'user_id': r['id'], 'name': r['display_name'], 'designation': r['designation']}


async def contact_for(user: dict, items: list[dict]) -> dict:
    """Who an employee should ask about items outside their jurisdiction (best match first): the lead of the first
    one's owning team (its project's or policy's department), else the compliance lead; and their own department
    head."""
    team = next((t for p in items if (t := resource_of(p, user['org_id']).get('team'))), None)
    lead = team and await db.pool.fetchval('SELECT lead_id FROM teams WHERE id = $1 AND org_id = $2', team, user['org_id'])
    if not lead:
        lead = await db.pool.fetchval("SELECT user_id FROM memberships WHERE org_id = $1 AND role = 'compliance' "
                                      "AND status = 'active' ORDER BY user_id LIMIT 1", user['org_id'])
    head = user.get('team_id') and await db.pool.fetchval('SELECT lead_id FROM teams WHERE id = $1', user['team_id'])
    contact, dept_head = await _person(lead), await _person(head)
    return {'contact': contact, 'department_head': dept_head if dept_head != contact else None}


def refusal_text(user: dict, who: dict) -> str:
    scope = ' / '.join(x for x in (user.get('department'), user.get('designation')) if x) or user.get('role')
    c, h = who.get('contact'), who.get('department_head')
    ask = f"the project lead {c['name']} ({c['designation']})" if c else 'your team lead'
    if h:
        ask += f" or your department head {h['name']} ({h['designation']})"
    return (f'Access restricted: this falls outside your assigned role jurisdiction [{scope}]. '
            f'To request context or access, please contact {ask}.')


async def deny(user: dict, attempted: str, reason: str, via: str) -> None:
    """ACCESS_DENIED_ATTEMPT in the hash-chained audit log (owner and compliance read it). The row carries the user
    (actor), the attempted resource (object_id), where it came from (object_type question | node) and the time; the
    reason and the question text are in the payload, which the chain stores as its hash only."""
    await db.audit(f"user:{user['user_id']}", 'ACCESS_DENIED_ATTEMPT', 'question' if via == 'ask' else 'node',
                   str(attempted), [str(attempted)],
                   {'user': user['user_id'], 'attempted_resource': attempted, 'reason': reason, 'via': via,
                    'timestamp': datetime.now(timezone.utc).isoformat()})


async def relabel(doc_id: str, visibility: str, team: str | None = None) -> dict:
    """Change a source's access label: the document, its extraction candidates, and every node and edge it produced
    (people and projects are shared across sources and keep their own label). team pins a team explicitly;
    otherwise the team follows the source's project."""
    from . import graph
    if visibility not in ('org', 'team', 'restricted'):
        raise ValueError('visibility must be org, team or restricted')
    doc = await db.pool.fetchrow('SELECT path FROM documents WHERE id = $1', doc_id)
    if doc is None:
        raise LookupError(f'no such document {doc_id}')
    async with db.pool.acquire() as c, c.transaction():
        await c.execute("UPDATE documents SET visibility = $2, front_matter = CASE WHEN $3::text IS NULL THEN "
                        "front_matter ELSE front_matter || jsonb_build_object('team', $3::text) END WHERE id = $1",
                        doc_id, visibility, team)
        await c.execute('UPDATE extractions SET visibility = $2 WHERE document_id = $1', doc_id, visibility)
    props = {'visibility': visibility, **({'team': team} if team else {})}
    nodes = await graph.q('MATCH (n:Entity {group_id: $g}) WHERE (n.key = $k OR n.source_doc = $p) '
                          'AND NOT n.type IN ["Person", "Project"] SET n += $props RETURN n.key AS k',
                          g=graph.gid(), k=doc_id, p=doc['path'], props=props)
    edges = await graph.q('MATCH ()-[e:RELATES_TO {group_id: $g}]->() WHERE e.source_doc = $p SET e += $props '
                          'RETURN count(e) AS n', g=graph.gid(), p=doc['path'], props=props)
    return {'document_id': doc_id, 'visibility': visibility, 'team': team, 'nodes': sorted(r['k'] for r in nodes),
            'edges': edges[0]['n'] if edges else 0}
