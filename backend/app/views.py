"""Read views for the frontend (Member 4): shapes and camelCase keys follow the original frontend mock data (since removed).
Everything is read from backend's own graph and tables. Ids stay backend-style (RET-2.1@v2, DEC-004, p-vikram).
What a caller sees is decided on the server by the access filter (app/access.py); include_restricted is accepted
for old clients and ignored."""
import json
import re
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query

from . import access, contracts, db, graph

router = APIRouter()

WIDTH, HEIGHT = 800, 520
X_MIN, X_MAX = 60, 740
MIN_GAP = 62
LANES = {'clause': 60, 'policy_version': 130, 'decision': 270, 'meeting_note': 350, 'project': 415, 'person': 475}
OFFSETS = [0, 34, -34, 68, -68]
COLORS = {'decision': ('#6366F1', '#4338CA'), 'clause': ('#D97706', '#B45309'), 'person': ('#0284C7', '#0369A1'),
          'project': ('#10B981', '#047857'), 'policy_version': ('#F59E0B', '#B45309'),
          'meeting_note': ('#8B5CF6', '#6D28D9')}
FUTURE_VISIBLE = {'Clause', 'PolicyVersion'}  # the policy lifecycle is shown greyed out before it takes effect


def type_key(t: str) -> str:
    return {'PolicyVersion': 'policy_version', 'MeetingNote': 'meeting_note'}.get(t, (t or 'unknown').lower())


def _iso(v):
    if hasattr(v, 'iso_format'):
        v = v.iso_format()
    return v.isoformat() if isinstance(v, (date, datetime)) else v


def _day(v) -> str | None:
    v = _iso(v)
    return v[:10] if isinstance(v, str) else None


def _month_label(d: str) -> str:
    return date.fromisoformat(d).strftime('%b %Y')


def slug(project: str) -> str:
    """'Project Atlas' -> 'prj-atlas', 'Internal Ops' -> 'prj-internal-ops'."""
    name = re.sub(r'^project\s+', '', project.strip(), flags=re.I)
    return 'prj-' + re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def _visible(p: dict, include_restricted: bool = False) -> bool:
    """The caller's access filter; include_restricted no longer opens anything."""
    return contracts.visible_filter(contracts.current_user())(p)


def _active(p: dict, d: str) -> bool:
    return (not p.get('rejected') and (p.get('valid_from') or '0000') <= d
            and (p.get('valid_to') is None or p['valid_to'] > d))


def _provenance(p: dict) -> dict:
    return {'sourceDoc': p.get('source_doc'),
            'sourceSpan': {'start': p.get('source_start'), 'end': p.get('source_end'), 'quote': p.get('source_quote')},
            'confidence': p.get('confidence'), 'extractedBy': p.get('extracted_by'),
            'humanVerified': p.get('human_verified'), 'visibility': p.get('visibility', 'org')}


def _fields(p: dict) -> dict:
    try:
        return json.loads(p.get('fields_json') or '{}')
    except ValueError:
        return {}


def clause_summary(fields: dict, checkable: bool = True) -> str:
    if 'retention_days_max' in fields:
        return f"Max {fields['retention_days_max']}d"
    if isinstance(fields.get('approver_threshold_inr'), dict) and fields['approver_threshold_inr'].get('CTO'):
        return f"Limit ₹{fields['approver_threshold_inr']['CTO'] / 100000:g}L"
    return 'Not checkable' if not checkable else ''


def compute_layout(nodes: list[dict]) -> dict[str, tuple[int, int]]:
    """nodes: [{id, type, date}] -> {id: (x, y)}. x = date across the canvas, y = one lane per type.
    Computed over ALL nodes (not the as-of subset) so a node stays put while the date slider moves.
    Same-lane nodes closer than MIN_GAP px are staggered vertically; undated nodes are spread evenly."""
    dates = sorted(n['date'] for n in nodes if n.get('date'))
    start = date.fromisoformat(min(dates + ['2024-01-01']))
    end = date.fromisoformat(max(dates + [date.today().isoformat()]))
    span = max((end - start).days, 1)
    by_lane: dict[str, list[tuple[float, str]]] = {}
    for n in nodes:
        by_lane.setdefault(n['type'], []).append(n)
    out = {}
    for lane, members in by_lane.items():
        undated = sorted(n['id'] for n in members if not n.get('date'))
        items = [(X_MIN + (date.fromisoformat(n['date']) - start).days / span * (X_MAX - X_MIN), n['id'])
                 for n in members if n.get('date')]
        items += [(X_MIN + (i + 1) * (X_MAX - X_MIN) / (len(undated) + 1), nid) for i, nid in enumerate(undated)]
        base = LANES.get(lane, HEIGHT - 20)
        placed: list[tuple[float, int]] = []
        for x, nid in sorted(items):
            used = {oi for px, oi in placed if abs(px - x) < MIN_GAP}
            oi = next((i for i in range(len(OFFSETS)) if i not in used), len(placed) % len(OFFSETS))
            placed.append((x, oi))
            out[nid] = (round(x), round(min(max(base + OFFSETS[oi], 16), HEIGHT - 16)))
    return out


async def _nodes() -> list[dict]:
    rows = await graph.q('MATCH (n:Entity {group_id: $g}) WHERE coalesce(n.rejected, false) = false '
                         'RETURN properties(n) AS p', g=graph.gid())
    return [{k: v for k, v in r['p'].items() if not k.endswith('_embedding')} for r in rows]


def _node_date(p: dict) -> str | None:
    return p.get('decided_on') or p.get('meeting_date') or p.get('valid_from') or p.get('joined')


async def _flags_in_force(as_of: str) -> list[dict]:
    """ONGOING_PRACTICE_BREACH flags whose new clause version is in force on as_of."""
    rows = await db.pool.fetch(
        "SELECT DISTINCT f.decision_id, f.clause_id, f.new_version, c.effective_from FROM flags f "
        "JOIN policy_clauses c ON c.clause_id = f.clause_id AND c.version = f.new_version "
        "WHERE f.impact_type = 'ONGOING_PRACTICE_BREACH' AND c.effective_from <= $1::date",
        date.fromisoformat(as_of))
    return [dict(r) for r in rows]


# ---- TEAM_MEMBERS ----

@router.get('/team')
async def team():
    """TEAM_MEMBERS shape: {id, name, role, joined, left?, status}."""
    today = date.today().isoformat()
    out = []
    for p in sorted((p for p in await _nodes() if p.get('type') == 'Person' and p.get('joined')),
                    key=lambda p: (p['joined'], p['key'])):
        departed = bool(p.get('left')) and p['left'] < today
        m = {'id': p['key'], 'name': p['name'], 'role': ('Former ' if departed else '') + (p.get('role') or ''),
             'joined': p['joined'], 'status': 'Departed' if departed else 'Active'}
        if p.get('left'):
            m['left'] = p['left']
        out.append(m)
    return out


# ---- TIMELINE_POINTS ----

@router.get('/timeline')
async def timeline(include_restricted: bool = False):
    """TIMELINE_POINTS shape: {date, label, event}, from policy effective dates, decisions and role changes."""
    pts: list[tuple[str, int, str]] = []
    by_day: dict[str, list[str]] = {}
    for r in await db.pool.fetch('SELECT clause_id, version, fields, checkable, effective_from FROM policy_clauses '
                                 'WHERE checkable ORDER BY effective_from, clause_id'):
        s = clause_summary(r['fields'] or {})
        by_day.setdefault(r['effective_from'].isoformat(), []).append(
            f"{r['clause_id']}@{r['version']}" + (f' ({s})' if s else ''))
    pts += [(d, 0, ' & '.join(v) + ' active') for d, v in by_day.items()]
    nodes = await _nodes()
    for p in nodes:
        if p.get('type') == 'Decision' and p.get('decided_on') and _visible(p, include_restricted):
            pts.append((p['decided_on'], 2, f"{p['key']} ({p['name']})"))
    people = [p for p in nodes if p.get('type') == 'Person' and p.get('joined')]
    first = min((p['joined'] for p in people), default=None)
    for p in people:
        if p['joined'] > first:
            pts.append((p['joined'], 1, f"{p['name']} joins as {p.get('role')}"))
        if p.get('left'):
            pts.append((p['left'], 1, f"{p['name']} departs ({p.get('role')})"))
    return [{'date': d, 'label': _month_label(d), 'event': e} for d, _, e in sorted(pts)]


# ---- GRAPH_NODES / GRAPH_EDGES with layout ----

def _label(p: dict, t: str, as_of: str) -> str:
    if t == 'decision':
        return f"{p['key']}\n({p['name']})"
    if t == 'clause':
        s = clause_summary(_fields(p), p.get('checkable', True))
        return f"{p.get('clause_id')} @ {p.get('version')}" + (f'\n({s})' if s else '')
    if t == 'person':
        role = p.get('role') or ''
        if role and p.get('left') and p['left'] < as_of:
            role = f'Ex-{role}'
        return f"{p['name']}\n({role})" if role else p['name']
    if t == 'meeting_note':
        return f"{p['key']}\n({p['name']})"
    return p['name']


@router.get('/graph/view')
async def graph_view(as_of: date | None = None, include_restricted: bool = False):
    """The as-of graph with stable x/y (the shape the graph panel expects). /graph is left unchanged for the chat."""
    d = (as_of or date.today()).isoformat()
    dt = graph.at(date.fromisoformat(d))
    all_nodes = await _nodes()
    pos = compute_layout([{'id': p['key'], 'type': type_key(p.get('type')), 'date': _node_date(p)} for p in all_nodes])
    flags = await _flags_in_force(d)
    stale = {f['decision_id'] for f in flags}
    nodes = {}
    for p in all_nodes:
        if not _visible(p, include_restricted):
            continue
        if (p.get('valid_from') or '0000') > d and p.get('type') not in FUTURE_VISIBLE:
            continue
        t = type_key(p.get('type'))
        color, glow = COLORS.get(t, ('#64748B', '#334155'))
        x, y = pos.get(p['key'], (WIDTH // 2, HEIGHT // 2))
        n = {'id': p['key'], 'label': _label(p, t, d), 'type': t, 'color': color, 'glow': glow, 'x': x, 'y': y,
             'isActive': _active(p, d), 'isStale': p['key'] in stale,
             'validFrom': p.get('valid_from'), 'validTo': p.get('valid_to'), 'provenance': _provenance(p)}
        if t in ('decision', 'meeting_note'):
            n['date'] = p.get('decided_on') or p.get('meeting_date')
        nodes[p['key']] = n

    rows = await graph.q('MATCH (a:Entity)-[e:RELATES_TO {group_id: $g}]->(b:Entity) '
                         'WHERE coalesce(e.rejected, false) = false AND a.key IN $keys AND b.key IN $keys '
                         'RETURN properties(e) AS p', g=graph.gid(), keys=list(nodes))
    edges = []
    for r in rows:
        e = r['p']
        if e.get('visibility') == 'restricted' and not _visible(e):
            continue
        va, ia = e.get('valid_at'), e.get('invalid_at')
        if va is not None and va.to_native() > dt and not (
                {nodes[e['source_key']]['type'], nodes[e['target_key']]['type']} <= {'clause', 'policy_version'}):
            continue
        active = ((va is None or va.to_native() <= dt) and (ia is None or ia.to_native() > dt)
                  and nodes[e['source_key']]['isActive'] and nodes[e['target_key']]['isActive'])
        edges.append({'id': e['uuid'], 'source': e['source_key'], 'target': e['target_key'], 'relation': e['name'],
                      'validFrom': _day(va), 'validTo': _day(ia), 'isActive': active, 'isConflict': False,
                      'provenance': _provenance(e)})
    for f in flags:  # derived from the scanner's flags table, not stored in the graph
        src, dst = f['decision_id'], f"{f['clause_id']}@{f['new_version']}"
        if src in nodes and dst in nodes:
            edges.append({'id': f'{src}|CONTRADICTED_BY|{dst}', 'source': src, 'target': dst,
                          'relation': 'CONTRADICTED_BY', 'validFrom': f['effective_from'].isoformat(), 'validTo': None,
                          'isActive': True, 'isConflict': True,
                          'provenance': {'sourceDoc': 'flags', 'sourceSpan': None, 'confidence': 1.0,
                                         'extractedBy': 'system:scanner', 'humanVerified': False,
                                         'visibility': 'org'}})
    # An employee sees the decisions outside their jurisdiction as locked placeholders: id and date only, no title,
    # no edges. Opening one (GET /nodes/{id}/source) says who to ask and is audited.
    u = contracts.current_user()
    if u and u.get('role') == 'member':
        for p in all_nodes:
            if p.get('type') == 'Decision' and p['key'] not in nodes and (p.get('valid_from') or '0000') <= d:
                x, y = pos.get(p['key'], (WIDTH // 2, HEIGHT // 2))
                nodes[p['key']] = {'id': p['key'], 'label': f"{p['key']}\n(locked)", 'type': 'decision', 'locked': True,
                                   'color': '#94A3B8', 'glow': '#CBD5E1', 'x': x, 'y': y, 'isActive': True,
                                   'isStale': False, 'validFrom': p.get('valid_from'), 'validTo': None,
                                   'date': p.get('decided_on'), 'provenance': {'visibility': 'locked'}}
    return {'asOf': d, 'nodes': list(nodes.values()), 'edges': edges}


# ---- project history ----

async def _project(project_id: str) -> dict:
    rows = await graph.q('MATCH (n:Entity {group_id: $g, type: "Project"}) WHERE coalesce(n.rejected, false) = false '
                         'RETURN n.key AS key', g=graph.gid())
    for r in rows:
        if project_id in (r['key'], slug(r['key'])):
            return {'projectId': slug(r['key']), 'name': r['key']}
    raise HTTPException(404, f'no such project {project_id}')


def _first_sentence(text: str) -> str:
    text = ' '.join((text or '').split())
    m = re.search(r'^(.+?[.!?])(\s|$)', text)
    return m.group(1) if m else text


@router.get('/projects/{project_id}/timeline')
async def project_timeline(project_id: str, include_restricted: bool = False):
    """A project's decisions ordered by decided_on, with owner and a one-line reason. id: 'prj-atlas' or the name."""
    proj = await _project(project_id)
    rows = await graph.q(
        'MATCH (d:Entity {group_id: $g})-[e:RELATES_TO {name: "ABOUT"}]->(p:Entity {key: $k}) '
        'WHERE d.type = "Decision" AND coalesce(d.rejected, false) = false AND coalesce(e.rejected, false) = false '
        'OPTIONAL MATCH (d)-[m:RELATES_TO {name: "MADE_BY"}]->(o:Entity) WHERE coalesce(m.rejected, false) = false '
        'OPTIONAL MATCH (d)-[s:RELATES_TO {name: "SUPERSEDES"}]->(x:Entity) WHERE coalesce(s.rejected, false) = false '
        'RETURN properties(d) AS d, o.key AS owner_id, o.name AS owner_name, collect(DISTINCT x.key) AS sup',
        g=graph.gid(), k=proj['name'])
    decisions = [{'id': r['d']['key'], 'title': r['d']['name'], 'decidedOn': r['d'].get('decided_on'),
                  'status': r['d'].get('status'),
                  'owner': {'id': r['owner_id'], 'name': r['owner_name']} if r['owner_id'] else None,
                  'reason': _first_sentence(r['d'].get('reasons')), 'supersedes': r['sup'] or None}
                 for r in rows if _visible(r['d'], include_restricted)]
    decisions.sort(key=lambda x: (x['decidedOn'] or '', x['id']))
    return {**proj, 'decisions': decisions}


# ---- citation target ----

@router.get('/nodes/{node_id}/source')
async def node_source(node_id: str, include_restricted: bool = False):
    """Citation target for a graph node: source document, exact passage (chunk) and provenance."""
    rows = await graph.q('MATCH (n:Entity {uuid: $u}) RETURN properties(n) AS p', u=graph.uid(node_id))
    if not rows or rows[0]['p'].get('rejected'):
        raise HTTPException(404, f'no such node {node_id}')
    p = rows[0]['p']
    if not _visible(p, include_restricted):
        u = contracts.current_user()
        if not (u and u.get('role') == 'member'):
            raise HTTPException(404, f'no such node {node_id}')  # no hint that something is hidden
        # An employee opening a node outside their jurisdiction (a locked graph node): who to ask, and an audit row.
        who = await access.contact_for(u, [p])
        await access.deny(u, p['key'], "opened a node outside the asker's jurisdiction", 'graph')
        raise HTTPException(403, {'restricted': True, 'node': p['key'], **who,
                                  'message': f"You do not have active clearance for node {p['key']}. "
                                             + access.refusal_text(u, who)})
    await contracts.log_view({'type': p.get('type'), 'id': p['key'], **contracts.label_for(p)})
    t = p.get('type')
    doc_id = {'Decision': p['key'], 'PolicyVersion': p['key'], 'MeetingNote': p['key'],
              'Clause': p.get('policy_id') and f"{p.get('policy_id')}@{p.get('version')}"}.get(t)
    doc = await db.pool.fetchrow('SELECT * FROM documents WHERE id=$1', doc_id) if doc_id else None
    if doc is None and p.get('source_doc'):
        doc = await db.pool.fetchrow('SELECT * FROM documents WHERE path=$1 ORDER BY ingested_at DESC LIMIT 1',
                                     p['source_doc'])
    passage = excerpt = None
    start, end, quote = p.get('source_start'), p.get('source_end'), p.get('source_quote')
    if doc is not None:
        chunks = await db.pool.fetch('SELECT idx, start_off, end_off, text FROM chunks WHERE document_id=$1 '
                                     'ORDER BY idx', doc['id'])
        needle = p.get('clause_id') or p['key']
        c = (next((c for c in chunks if start is not None and c['start_off'] <= start < c['end_off']), None)
             or next((c for c in chunks if quote and quote.strip() in c['text']), None)
             or next((c for c in chunks if needle in c['text']), None)
             or (chunks[0] if chunks else None))
        if c is not None:
            passage = {'idx': c['idx'], 'start': c['start_off'], 'end': c['end_off'], 'text': c['text']}
        if start is not None and end is not None:
            excerpt = doc['raw'][max(0, start - 120):end + 120]
    return {'nodeId': p['key'], 'type': type_key(t), 'label': p['name'], 'provenance': _provenance(p),
            'document': doc and {'id': doc['id'], 'path': doc['path'], 'docType': doc['doc_type'],
                                 'refTime': doc['ref_time'].isoformat(), 'visibility': doc['visibility']},
            'passage': passage, 'quote': quote, 'excerpt': excerpt}


# ---- ingestion runs ----

def _run_out(r) -> dict:
    return {**dict(r), 'started_at': r['started_at'].isoformat(),
            'finished_at': r['finished_at'] and r['finished_at'].isoformat()}


@router.get('/ingest/runs')
async def ingest_runs(limit: int = Query(20, ge=1, le=200)):
    """Seed / upload / watcher runs, newest first. Per-document outcomes are in stats.documents."""
    return [_run_out(r) for r in await db.pool.fetch('SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT $1', limit)]


@router.get('/ingest/runs/{run_id}')
async def ingest_run(run_id: int):
    r = await db.pool.fetchrow('SELECT * FROM ingestion_runs WHERE id=$1', run_id)
    if r is None:
        raise HTTPException(404, 'no such ingestion run')
    return _run_out(r)
