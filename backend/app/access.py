"""Roles and access (B): the one check behind every read, write, subscription, search, notification and export.

Labels: every node and source carries visibility (org | team | restricted) and a project; its team is the source's
`team`, else the team that owns its project (teams.projects). Hidden items simply do not appear.

  owner       everything, every team, restricted included; grants and revokes
  compliance  everything (read), across teams
  lead        org items, their team's items; approves joins; authority for their domain
  member      org items, their team's items
  auditor     read-only, time-limited, non-restricted items dated inside their invited range
A per-user grant (access_grants) opens one item to one person whatever its label.
"""
from . import config, db

ROLES = ('owner', 'lead', 'member', 'compliance', 'auditor')
READ_ALL = {'owner', 'compliance'}
PROJECT_TEAM: dict[str, dict[str, str]] = {}  # org_id -> {project name: team id}, refreshed per request
TEAM_BY_NAME: dict[str, dict[str, str]] = {}  # org_id -> {lower-case team name or id: team id}


async def refresh_projects(org_id: str):
    rows = await db.pool.fetch('SELECT id, name, projects FROM teams WHERE org_id = $1', org_id)
    PROJECT_TEAM[org_id] = {p: r['id'] for r in rows for p in r['projects']}
    TEAM_BY_NAME[org_id] = {k.lower(): r['id'] for r in rows for k in (r['name'], r['id'])}


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
    team = named.get(str(source.get('team') or '').lower()) or source.get('team') or PROJECT_TEAM.get(_org(), {}).get(project)
    vis = source.get('visibility')
    if not vis:
        if scope.lower() in ('org', 'organisation'):
            vis = 'org'
        elif scope.lower().startswith('team:') and (tid := named.get(scope.split(':', 1)[1].lower())):
            vis, team = 'team', tid  # Team/<name>/ of a real team
        else:
            vis = 'restricted'  # a group folder, or a team folder no team matches: nobody is widened by accident
    return {'team': team, 'project': project, 'visibility': vis, 'date': item_date(source)}


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
    return {'type': props.get('type') or 'edge', 'id': props.get('key') or props.get('id') or props.get('uuid'),
            'org_id': org_id, **label_for(props)}


def visible_filter(user: dict | None):
    if user is None:
        return lambda props: True
    return lambda props: can_access(user, resource_of(props, user['org_id']))


async def log_view(user: dict | None, resource: dict):
    """restricted_view: who opened which restricted item, and when."""
    if user and user.get('user_id') and (resource.get('visibility') == 'restricted'):
        await db.audit(f"user:{user['user_id']}", 'restricted_view', (resource.get('type') or 'item').lower(),
                       str(resource.get('id')), [str(resource.get('id'))], {'via': user.get('via')})


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
