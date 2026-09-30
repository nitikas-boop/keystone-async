"""C. Conflict, duplicate and collision handling. One pipeline: detect (C2), resolve (C3), record.

C1 claims: claim before you work, expiry, optimistic version checks, review locks, lead/owner override.
C2 detector: exact (normalised hash), structural (same clause or same field), semantic (local embedder, cosine).
   The deterministic layers decide THAT a pair is flagged and whether it conflicts; the LLM only explains.
C3 resolver: a Collision per conflicting pair, ruled by the domain authority (never a party, never the author);
   the winner becomes a new PolicyVersion through normal ingestion (so the staleness scanner runs), the loser is
   rejected, and the ruling is stored as a Decision node, so "why did we pick 90 not 60?" is answerable later.
"""
import hashlib
import json
import logging
import math
import re
from datetime import date, datetime, timezone

import httpx
import yaml

from . import compliance, config, db, graph, ingest, llm
from .contracts import audit, can_access, notify, org_owners
from .prompts_p2 import ADJUDICATOR_PROMPT

log = logging.getLogger('keystone.conflicts')
DUPLICATE, OVERLAP = 0.92, 0.80  # cosine thresholds (spec C2); tune on a labelled set
# ponytail: policy domain -> its authority (the domain's team lead); Person 1's teams and roles replace this map
AUTHORITY = {'POL-RET': 'farhan', 'POL-PROC': 'karthik'}  # user ids (users.id)
REVIEWER_ROLES = {'owner', 'lead', 'compliance'}
CLAIM_MINUTES = 120


class Conflict(Exception):
    def __init__(self, message: str, **extra):
        super().__init__(message)
        self.extra = extra


class Forbidden(Exception):
    pass


def normal(text: str) -> str:
    return ' '.join(re.findall(r'\w+', (text or '').lower()))


def content_sha(text: str) -> str:
    return hashlib.sha256(normal(text).encode()).hexdigest()


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


_embeddings: dict[str, list[float]] = {}


async def embed(text: str) -> list[float] | None:
    """Local embedder (Ollama). None if unavailable: the semantic layer is then skipped and the match list says so."""
    key = content_sha(text)
    if key not in _embeddings:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=4)) as h:
                r = await h.post(f'{config.OLLAMA_BASE_URL}/api/embed', json={'model': config.EMBED_MODEL, 'input': text})
                r.raise_for_status()
                _embeddings[key] = r.json()['embeddings'][0]
        except Exception as e:
            log.warning('embedding failed, semantic layer skipped: %s', e)
            return None
    return _embeddings[key]


def _iso(v):
    return v.isoformat() if isinstance(v, (date, datetime)) else v


# ---------------- C1: claims ----------------

def claim_out(r) -> dict:
    return {k: _iso(r[k]) for k in ('id', 'resource_ref', 'owner_id', 'created_at', 'expires_at', 'released_at',
                                    'overridden_by')}


def _ago(ts: datetime) -> str:
    m = int((datetime.now(timezone.utc) - ts).total_seconds() // 60)
    return f'{m} min ago' if m < 120 else f'{m // 60} h ago'


async def _active(c, org: str, ref: str):
    return await c.fetchrow('SELECT * FROM claims WHERE org_id=$1 AND resource_ref=$2 AND released_at IS NULL '
                            'AND expires_at > now() ORDER BY id DESC LIMIT 1', org, ref)


async def holder(org: str, ref: str) -> dict | None:
    async with db.pool.acquire() as c:
        r = await _active(c, org, ref)
    return claim_out(r) if r else None


async def claim(user: dict, ref: str, minutes: int = CLAIM_MINUTES) -> dict:
    org = user['org_id']
    async with db.pool.acquire() as c:
        async with c.transaction():
            await c.execute('SELECT pg_advisory_xact_lock(hashtext($1))', f'claim:{org}:{ref}')
            cur = await _active(c, org, ref)
            if cur is None or cur['owner_id'] == user['user_id']:
                if cur:  # re-claiming your own claim extends it
                    r = await c.fetchrow("UPDATE claims SET expires_at = now() + make_interval(mins => $2) "
                                         'WHERE id=$1 RETURNING *', cur['id'], minutes)
                    return claim_out(r)
                r = await c.fetchrow("INSERT INTO claims (org_id, resource_ref, owner_id, expires_at) VALUES "
                                     "($1, $2, $3, now() + make_interval(mins => $4)) RETURNING *",
                                     org, ref, user['user_id'], minutes)
                await audit.write('claim_created', user['actor'], {'resource_ref': ref, 'minutes': minutes},
                                  'claim', r['id'], conn=c)
                return claim_out(r)
    await audit.write('claim_blocked', user['actor'], {'resource_ref': ref, 'held_by': cur['owner_id']}, 'claim', cur['id'])
    raise Conflict(f"{cur['owner_id']} is working on this (claimed {_ago(cur['created_at'])})", claim=claim_out(cur))


async def release(user: dict, claim_id: int) -> dict:
    r = await db.pool.fetchrow('UPDATE claims SET released_at=now() WHERE id=$1 AND org_id=$2 AND owner_id=$3 '
                               'AND released_at IS NULL RETURNING *', claim_id, user['org_id'], user['user_id'])
    if r is None:
        raise Conflict('not your active claim')
    return claim_out(r)


async def _release_ref(org: str, ref: str, owner: str, conn=None):
    await (conn or db.pool).execute('UPDATE claims SET released_at=now() WHERE org_id=$1 AND resource_ref=$2 '
                                    'AND owner_id=$3 AND released_at IS NULL', org, ref, owner)


async def override(user: dict, claim_id: int, reassign_to: str | None = None) -> dict:
    """Team lead or Owner can override or reassign a claim."""
    if user['role'] not in ('lead', 'owner'):
        raise Forbidden('only a Team lead or an Owner can override a claim')
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow('UPDATE claims SET released_at=now(), overridden_by=$3 WHERE id=$1 AND org_id=$2 '
                             'AND released_at IS NULL RETURNING *', claim_id, user['org_id'], user['user_id'])
        if r is None:
            raise Conflict('no such active claim')
        new = None
        if reassign_to:
            new = await c.fetchrow('INSERT INTO claims (org_id, resource_ref, owner_id, expires_at) VALUES ($1, $2, $3, '
                                   "now() + make_interval(mins => $4)) RETURNING *",
                                   user['org_id'], r['resource_ref'], reassign_to, CLAIM_MINUTES)
        await audit.write('claim_overridden', user['actor'], {'resource_ref': r['resource_ref'],
                          'was': r['owner_id'], 'reassigned_to': reassign_to}, 'claim', claim_id, conn=c)
    if reassign_to:
        notify(reassign_to, 'claim_reassigned', str(new['id']))
    return claim_out(new or r)


# ---------------- proposals ----------------

def proposal_out(r) -> dict:
    d = {k: _iso(v) for k, v in dict(r).items() if k != 'embedding'}
    d['ref'] = f"PROP-{r['id']}"
    return d


async def _proposal(org: str, pid: int, conn=None):
    r = await (conn or db.pool).fetchrow('SELECT * FROM policy_proposals WHERE id=$1 AND org_id=$2', pid, org)
    if r is None:
        raise LookupError('no such proposal')
    return r


async def create_proposal(user: dict, body: dict) -> dict:
    """A draft claims its clause: nobody else can start a draft on that clause until it is submitted or expires."""
    for k in ('policy_id', 'clause_id', 'title', 'clause_text', 'effective_from'):
        if not body.get(k):
            raise ValueError(f'{k} is required')
    if body.get('field') and not isinstance(body.get('new_value'), (int, float, dict)):
        raise ValueError('new_value must be a number (or a map by role) when field is set')
    await claim(user, f"clause:{body['clause_id']}")
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow(
            'INSERT INTO policy_proposals (org_id, policy_id, clause_id, title, clause_text, field, new_value, '
            'effective_from, rationale, author_id, content_sha, from_simulation) '
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            user['org_id'], body['policy_id'], body['clause_id'], body['title'], body['clause_text'], body.get('field'),
            body.get('new_value'), body['effective_from'], body.get('rationale') or '', user['user_id'],
            content_sha(body['clause_text']), body.get('from_simulation'))
        await audit.write('policy_proposed', user['actor'], {'status': 'draft', 'clause_id': r['clause_id']},
                          'policy_proposal', r['id'], [r['clause_id']], conn=c)
    return proposal_out(r)


EDITABLE = ('title', 'clause_text', 'field', 'new_value', 'effective_from', 'rationale')


async def edit_proposal(user: dict, pid: int, version: int, changes: dict) -> dict:
    """Every edit carries the version it was made from; an out-of-date save is rejected."""
    ch = {k: v for k, v in changes.items() if k in EDITABLE}
    if not ch:
        raise ValueError(f'editable fields: {", ".join(EDITABLE)}')
    p = await _proposal(user['org_id'], pid)
    if p['author_id'] != user['user_id']:
        raise Forbidden('only the author can edit a draft')
    if p['status'] != 'draft':
        raise Conflict(f"proposal is {p['status']}; only drafts can be edited")
    sets = ', '.join(f'{k}=${i + 3}' for i, k in enumerate(ch))
    vals = [date.fromisoformat(v) if k == 'effective_from' and isinstance(v, str) else v for k, v in ch.items()]
    r = await db.pool.fetchrow(
        f"UPDATE policy_proposals SET {sets}, version=version+1, updated_at=now(), "
        f"content_sha=${len(ch) + 3} WHERE id=$1 AND version=$2 AND status='draft' RETURNING *",
        pid, version, *vals, content_sha(ch.get('clause_text', p['clause_text'])))
    if r is None:
        raise Conflict('someone changed this, reload', current_version=p['version'])
    return proposal_out(r)


async def candidates(org: str, exclude: int | None) -> list[dict]:
    today = date.today()
    out = [{'ref': f"{r['clause_id']}@{r['version']}", 'kind': 'clause', 'policy_id': r['policy_id'],
            'clause_id': r['clause_id'], 'text': r['text'], 'fields': r['fields'] or {}, 'author': None, 'id': None,
            'embedding': None}
           for r in await db.pool.fetch('SELECT * FROM policy_clauses WHERE effective_from <= $1 AND '
                                        '(effective_to IS NULL OR effective_to > $1)', today)]
    for r in await db.pool.fetch("SELECT * FROM policy_proposals WHERE org_id=$1 AND status IN ('proposed', 'in_review') "
                                 'AND id <> $2', org, exclude or 0):
        out.append({'ref': f"PROP-{r['id']}", 'kind': 'proposal', 'policy_id': r['policy_id'],
                    'clause_id': r['clause_id'], 'text': r['clause_text'],
                    'fields': {r['field']: r['new_value']} if r['field'] else {}, 'author': r['author_id'],
                    'id': r['id'], 'embedding': r['embedding']})
    return out


def classify(p: dict, c: dict, sim: float | None) -> tuple[list[str], str | None, str | None]:
    """(layers, deterministic label or None, shared field). Pure: the whole flag decision, no model involved."""
    layers = []
    exact = content_sha(c['text']) == content_sha(p['clause_text'])
    if exact:
        layers.append('exact')
    pf = {p['field']: p['new_value']} if p.get('field') else {}
    shared = sorted(set(pf) & set(c['fields']))
    if c['clause_id'] == p['clause_id'] or shared:
        layers.append('structural')
    if sim is not None and sim >= OVERLAP:
        layers.append('semantic')
    if not layers or (c['kind'] == 'clause' and c['clause_id'] == p['clause_id'] and not exact):
        return [], None, None  # the clause this proposal amends is the point of the proposal, not a match
    if exact:
        return layers, 'duplicate', shared[0] if shared else None
    if shared:
        f = shared[0]
        return layers, 'duplicate' if c['fields'][f] == pf[f] else 'conflict', f
    return layers, None, None


def action_for(label: str | None, sim: float | None, exact: bool) -> str:
    if label == 'conflict':
        return 'collide'  # goes to C3 as a Collision; the author does not choose
    if label == 'duplicate' or exact or (sim or 0) > DUPLICATE:
        return 'block'
    return 'ask'


async def adjudicate(p: dict, c: dict, label: str | None, field: str | None, sim: float | None) -> tuple[str, str]:
    if field:
        fallback = (f"Both set {field}: {c['ref']} says {json.dumps(c['fields'][field])}, "
                    f"this proposal says {json.dumps(p['new_value'])}.")
    elif label == 'duplicate':
        fallback = f"Same text as {c['ref']}."
    else:
        fallback = f"Wording is {round((sim or 0) * 100)}% similar to {c['ref']}."
    try:
        out = await llm.chat_json(
            ADJUDICATOR_PROMPT,
            f"A ({c['ref']}): {c['text']}\nB (new proposal for {p['clause_id']}): {p['clause_text']}\n"
            f"Deterministic finding: {label or 'none'}",
            {'type': 'object', 'required': ['label', 'reason'], 'properties': {
                'label': {'type': 'string', 'enum': ['duplicate', 'overlap', 'conflict', 'unrelated']},
                'reason': {'type': 'string'}}}, timeout=90)
        return label or out['label'], (out.get('reason') or '').strip() or fallback
    except Exception as e:
        log.warning('adjudicator unavailable (%s); deterministic reason used', e)
        return label or 'overlap', fallback


async def detect(org: str, p: dict) -> list[dict]:
    """C2: every candidate the three layers flag, with an action: block (duplicate), ask (overlap), collide."""
    matches = []
    for c in await candidates(org, p.get('id')):
        ce = c['embedding'] or await embed(c['text'])
        sim = cosine(p['embedding'], ce) if p.get('embedding') and ce else None
        layers, label, field = classify(p, c, sim)
        if not layers:
            continue
        label, reason = await adjudicate(p, c, label, field, sim)
        matches.append({'ref': c['ref'], 'kind': c['kind'], 'layers': layers,
                        'similarity': None if sim is None else round(sim, 3), 'label': label, 'reason': reason,
                        'action': action_for(label if field or 'exact' in layers else None, sim, 'exact' in layers),
                        'clause_id': c['clause_id'], 'policy_id': c['policy_id'], 'field': field,
                        'value': c['fields'].get(field) if field else None, 'author': c['author'], 'proposal_id': c['id']})
    return matches


async def check_text(org: str, text: str) -> list[dict]:
    """Detector for a document before upload (Ingest modal): exact and semantic layers only."""
    probe = {'id': None, 'clause_id': None, 'clause_text': text, 'field': None, 'new_value': None,
             'embedding': await embed(text)}
    return await detect(org, probe)


CHOICES = ('cancel', 'link', 'supersede', 'keep_both')


async def submit(user: dict, pid: int, resolution: dict | None = None) -> dict:
    """draft -> proposed. Runs the detector. A duplicate or overlap needs the author's choice first; a conflict
    opens a Collision for the authority."""
    org = user['org_id']
    p = await _proposal(org, pid)
    if p['author_id'] != user['user_id']:
        raise Forbidden('only the author can submit this proposal')
    if p['status'] != 'draft':
        raise Conflict(f"proposal is {p['status']}, not a draft")
    emb = await embed(p['clause_text'])
    matches = await detect(org, {**dict(p), 'embedding': emb})
    needs_choice = [m for m in matches if m['action'] in ('block', 'ask')]
    if needs_choice and not resolution:
        raise Conflict('possible duplicate or overlap: choose cancel, link, supersede or keep_both', matches=matches)
    if resolution:
        choice = resolution.get('choice')
        if choice not in CHOICES:
            raise ValueError(f'choice must be one of {CHOICES}')
        if choice == 'keep_both' and not (resolution.get('reason') or '').strip():
            raise ValueError('keep_both needs a written reason')
        if choice in ('link', 'supersede') and resolution.get('target_ref') not in {m['ref'] for m in matches}:
            raise ValueError('target_ref must be one of the matches')
        if choice == 'cancel':
            return await _close(user, p, 'rejected', f"withdrawn by the author: {resolution.get('reason') or 'duplicate'}")
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow("UPDATE policy_proposals SET status='proposed', embedding=$2, matches=$3, resolution=$4, "
                             "updated_at=now() WHERE id=$1 AND status='draft' RETURNING *", pid, emb, matches, resolution)
        await audit.write('policy_proposed', user['actor'], {'status': 'proposed', 'matches': [
            {k: m[k] for k in ('ref', 'label', 'action', 'similarity')} for m in matches], 'resolution': resolution},
            'policy_proposal', pid, [p['clause_id']] + [m['ref'] for m in matches], conn=c)
        await _release_ref(org, f"clause:{p['clause_id']}", user['user_id'], conn=c)
    for m in matches:
        if m['action'] == 'collide':
            await open_collision(org, 'A' if m['kind'] == 'proposal' else 'B', r, m)
    return proposal_out(r)


# ---------------- C3: collisions ----------------

def authority_for(org: str, policy_id: str | None, parties: set[str]) -> str:
    """Default: the domain's authority. Never a party to the collision: then an Owner who is not a party."""
    a = AUTHORITY.get(policy_id or '')
    if a is None or a in parties:
        a = next((o for o in org_owners(org) if o not in parties), None) or org_owners(org)[0]
    return a


async def open_collision(org: str, type_: str, p, m: dict | None = None, *, ref_a: str | None = None,
                         ref_b: str | None = None, clause_id: str | None = None, policy_id: str | None = None,
                         parties: set[str] | None = None, summary: dict | None = None) -> dict:
    ref_a = ref_a or f"PROP-{p['id']}"
    ref_b = ref_b or m['ref']
    existing = await db.pool.fetchrow("SELECT * FROM collisions WHERE org_id=$1 AND status='open' AND "
                                      '((ref_a=$2 AND ref_b=$3) OR (ref_a=$3 AND ref_b=$2))', org, ref_a, ref_b)
    if existing:
        return collision_row(existing)
    parties = parties or {x for x in (p and p['author_id'], m and m['author']) if x}
    authority = authority_for(org, policy_id or (p and p['policy_id']), parties)
    summary = summary or {'field': m['field'], 'value_b': m['value'], 'reason': m['reason'], 'label': m['label']}
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow(
            'INSERT INTO collisions (org_id, type, proposal_a, proposal_b, ref_a, ref_b, clause_id, authority_id, summary) '
            'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', org, type_, p and p['id'],
            m and m.get('proposal_id'), ref_a, ref_b, clause_id or (p and p['clause_id']), authority, summary)
        await audit.write('collision_opened', 'system:detector', {'type': type_, 'authority': authority},
                          'collision', r['id'], [ref_a, ref_b], conn=c)
    notify(authority, 'collision_assigned', str(r['id']))  # E stores and shows it
    return collision_row(r)


def collision_row(r) -> dict:
    return {k: _iso(v) for k, v in dict(r).items()}


async def detect_decision_conflicts(org: str) -> list[dict]:
    """Type C: two active, ongoing decisions set the same field of the same clause to different values
    (DECISION_CONFLICT). One-off (completed) decisions such as two contracts of different sizes never conflict."""
    rows = await graph.q(
        'MATCH (d:Entity {group_id: $g})-[r:RELATES_TO {name: "RELIED_ON"}]->(c:Entity) '
        'WHERE d.type = "Decision" AND coalesce(d.rejected, false) = false AND coalesce(r.rejected, false) = false '
        'AND coalesce(d.status, "active") = "active" AND d.effect = "ongoing" '
        'RETURN DISTINCT d.key AS id, d.fields_json AS f, d.owner AS owner, c.clause_id AS clause, c.policy_id AS policy',
        g=config.GROUP_ID)
    by: dict[tuple, list] = {}
    for r in rows:
        for field, value in json.loads(r['f'] or '{}').items():
            by.setdefault((r['clause'], field), []).append((r['id'], value, r['owner'], r['policy']))
    out = []
    for (clause, field), ds in by.items():
        for i, a in enumerate(ds):
            for b in ds[i + 1:]:
                if a[1] != b[1]:
                    out.append(await open_collision(
                        org, 'C', None, None, ref_a=a[0], ref_b=b[0], clause_id=clause, policy_id=a[3],
                        parties={x for x in (a[2], b[2]) if x},
                        summary={'field': field, 'value_a': a[1], 'value_b': b[1], 'label': 'conflict',
                                 'reason': f'{a[0]} sets {field} = {a[1]}, {b[0]} sets {field} = {b[1]}.'}))
    return out


async def _decision_visibility(key: str) -> str:
    rows = await graph.q('MATCH (n:Entity {uuid: $u}) RETURN n.visibility AS v', u=graph.uid(key))
    return (rows[0]['v'] if rows else None) or 'org'


async def collision_visible(user: dict, r) -> bool:
    for ref in (r['ref_a'], r['ref_b']):
        if ref.startswith(('DEC-', 'RUL-')) and not can_access(
                user, {'type': 'decision', 'id': ref, 'visibility': await _decision_visibility(ref)}):
            return False
    return True


async def list_collisions(user: dict, status: str | None = None) -> list[dict]:
    rows = await db.pool.fetch('SELECT * FROM collisions WHERE org_id=$1 AND ($2::text IS NULL OR status=$2) '
                               'ORDER BY id DESC', user['org_id'], status)
    return [collision_row(r) for r in rows if await collision_visible(user, r)]


async def collision_detail(user: dict, cid: int) -> dict:
    """Side by side: both parties (author, date, clause, value), the value in force now, and /whatif impact."""
    from . import whatif
    r = await db.pool.fetchrow('SELECT * FROM collisions WHERE id=$1 AND org_id=$2', cid, user['org_id'])
    if r is None or not await collision_visible(user, r):
        raise LookupError('no such collision')
    out = collision_row(r)
    sides = []
    for pid, ref in ((r['proposal_a'], r['ref_a']), (r['proposal_b'], r['ref_b'])):
        if pid:
            p = await _proposal(user['org_id'], pid)
            side = {'ref': ref, 'kind': 'proposal', **proposal_out(p)}
            if p['field']:
                side['impact'] = await whatif.policy_impact(user, p['clause_id'], p['field'], p['new_value'],
                                                            p['effective_from'], role=None)
        elif '@' in ref:
            cid_, ver = ref.split('@')
            cl = await db.pool.fetchrow('SELECT * FROM policy_clauses WHERE clause_id=$1 AND version=$2', cid_, ver)
            side = {'ref': ref, 'kind': 'clause', 'clause_text': cl and cl['text'], 'fields': cl and cl['fields']}
        else:
            dec = await compliance.load_decision(ref)
            side = {'ref': ref, 'kind': 'decision', 'title': dec and dec['title'],
                    'decided_on': dec and dec['decided_on'].isoformat(), 'fields': dec and dec['fields']}
        sides.append(side)
    out['sides'] = sides
    if r['clause_id']:
        now = await compliance.clause_in_force(r['clause_id'], date.today())
        out['in_force'] = now and {'ref': f"{now['clause_id']}@{now['version']}", 'fields': now['fields'],
                                   'text': now['text']}
    return out


OUTCOMES = ('approve_a', 'approve_b', 'merge', 'reject_both', 'request_changes')


async def resolve(user: dict, cid: int, outcome: str, reason: str, merged: dict | None = None) -> dict:
    org = user['org_id']
    r = await db.pool.fetchrow('SELECT * FROM collisions WHERE id=$1 AND org_id=$2', cid, org)
    if r is None or not await collision_visible(user, r):
        raise LookupError('no such collision')
    if r['status'] != 'open':
        raise Conflict(f'collision is already {r["status"]}')
    if outcome not in OUTCOMES:
        raise ValueError(f'outcome must be one of {OUTCOMES}')
    if not (reason or '').strip():
        raise ValueError('a ruling needs a reason')
    a = r['proposal_a'] and await _proposal(org, r['proposal_a'])
    b = r['proposal_b'] and await _proposal(org, r['proposal_b'])
    parties = {x['author_id'] for x in (a, b) if x}
    if r['type'] == 'C':
        parties |= {d['owner'] for d in [await _owner(r['ref_a']), await _owner(r['ref_b'])] if d['owner']}
    if user['user_id'] != r['authority_id'] and user['role'] != 'owner':
        raise Forbidden(f"only the assigned authority ({r['authority_id']}) or an Owner can rule on this")
    if user['user_id'] in parties:
        raise Forbidden('a party to the collision cannot rule on it; an Owner who is not a party must')
    if outcome == 'merge' and not (merged and merged.get('clause_text')):
        raise ValueError('merge needs merged.clause_text (and field/new_value/effective_from)')

    winners, losers = [], []
    if outcome == 'approve_a':
        winners, losers = [a], [b]
    elif outcome == 'approve_b':
        winners, losers = [b], [a]
    elif outcome in ('reject_both', 'merge'):
        losers = [a, b]
    winners, losers = [x for x in winners if x], [x for x in losers if x]
    for w in winners:  # first: if activation fails (e.g. bad effective date) nothing else has changed
        await activate(user, w)
    for lo in losers:
        await _close(user, lo, 'rejected', f'collision #{cid}: {reason}')
    new = None
    if outcome == 'merge':
        base = a or b
        new = await _insert_proposal(user, {**{k: base[k] for k in ('policy_id', 'clause_id', 'title', 'field',
                                                                    'new_value', 'effective_from')},
                                            'rationale': f'Merged in collision #{cid}: {reason}', **merged},
                                     status='proposed')
    if outcome == 'request_changes':
        for x in (a, b):
            if x:
                await db.pool.execute("UPDATE policy_proposals SET status='draft', decision_reason=$2, version=version+1 "
                                      'WHERE id=$1', x['id'], f'changes requested in collision #{cid}: {reason}')

    ruling = await _ruling(user, r, outcome, reason, winners, losers, new)
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow("UPDATE collisions SET status='resolved', outcome=$2, resolved_by=$3, ruling_reason=$4, "
                               'ruling_decision_id=$5, resolved_at=now() WHERE id=$1 RETURNING *',
                               cid, outcome, user['user_id'], reason, ruling)
        await audit.write('collision_resolved', user['actor'], {'outcome': outcome, 'reason': reason,
                          'ruling': ruling, 'merged_into': new and new['ref']}, 'collision', cid,
                          [r['ref_a'], r['ref_b'], ruling], conn=c)
    for x in parties:
        notify(x, 'collision_resolved', str(cid))
    return {**collision_row(row), 'merged_proposal': new}


async def _owner(ref: str) -> dict:
    d = await compliance.load_decision(ref)
    rows = await graph.q('MATCH (n:Entity {uuid: $u}) RETURN n.owner AS o', u=graph.uid(ref))
    return {'owner': rows[0]['o'] if rows else None, 'decision': d}


async def _insert_proposal(user: dict, body: dict, status: str) -> dict:
    eff = body['effective_from']
    eff = date.fromisoformat(eff) if isinstance(eff, str) else eff
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow(
            'INSERT INTO policy_proposals (org_id, policy_id, clause_id, title, clause_text, field, new_value, '
            'effective_from, rationale, author_id, content_sha, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) '
            'RETURNING *', user['org_id'], body['policy_id'], body['clause_id'], body['title'], body['clause_text'],
            body.get('field'), body.get('new_value'), eff, body.get('rationale') or '', user['user_id'],
            content_sha(body['clause_text']), status)
        await audit.write('policy_proposed', user['actor'], {'status': status}, 'policy_proposal', r['id'],
                          [r['clause_id']], conn=c)
    return proposal_out(r)


async def _close(user: dict, p, status: str, reason: str) -> dict:
    async with db.pool.acquire() as c, c.transaction():
        r = await c.fetchrow('UPDATE policy_proposals SET status=$2, decision_reason=$3, reviewer_id=$4, decided_at=now(), '
                             'updated_at=now() WHERE id=$1 RETURNING *', p['id'], status, reason, user['user_id'])
        await audit.write('proposal_rejected', user['actor'], {'reason': reason}, 'policy_proposal', p['id'],
                          [p['clause_id']], conn=c)
        await c.execute('UPDATE claims SET released_at=now() WHERE org_id=$1 AND resource_ref = ANY($2) AND '
                        'released_at IS NULL', user['org_id'],
                        [f"policy_proposal:{p['id']}", f"clause:{p['clause_id']}"])
    return proposal_out(r)


def policy_markdown(policy_id: str, version: str, title: str, eff: date, clauses: list[dict], note: str) -> str:
    fm = {'doc_type': 'policy_version', 'policy_id': policy_id, 'version': version, 'title': title,
          'effective_from': eff, 'clauses': clauses}
    body = '\n\n'.join(f"**{c['clause_id']} {c.get('title', '')}.** {c['text']}" for c in clauses)
    return f"---\n{yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)}---\n# {title} ({version})\n\n{note}\n\n{body}\n"


async def activate(user: dict, p) -> dict:
    """The winner becomes a new PolicyVersion: copied from the latest version with the proposed clause replaced,
    ingested like any upload, so the staleness scanner flags affected decisions."""
    rows = await db.pool.fetch('SELECT * FROM policy_clauses WHERE policy_id=$1 ORDER BY effective_from', p['policy_id'])
    if rows:
        latest = rows[-1]
        if p['effective_from'] <= latest['effective_from']:
            raise ValueError(f"effective_from must be after {latest['effective_from']} ({p['policy_id']} "
                             f"{latest['version']} starts then)")
        clauses = [{'clause_id': r['clause_id'], 'title': r['title'], 'text': r['text'], 'fields': r['fields'] or {},
                    'checkable': r['checkable']} for r in rows if r['version'] == latest['version']]
        nums = [int(r['version'][1:]) for r in rows if r['version'][1:].isdigit()]
        version = f'v{max(nums) + 1}' if nums else f"{latest['version']}-1"
        fm = await db.pool.fetchval('SELECT front_matter FROM documents WHERE id=$1', f"{p['policy_id']}@{latest['version']}")
        title = (fm or {}).get('title') or p['title']
    else:
        clauses, version, title = [], 'v1', p['title']
    target = next((c for c in clauses if c['clause_id'] == p['clause_id']), None)
    if target is None:
        clauses.append(target := {'clause_id': p['clause_id'], 'title': p['title'], 'fields': {}, 'checkable': False})
    target['text'] = p['clause_text']
    if p['field']:
        target['fields'] = {**target['fields'], p['field']: p['new_value']}
        target['checkable'] = True
    note = (f"Effective from {p['effective_from']}. Adopted from proposal PROP-{p['id']} ({p['title']}), approved by "
            f"{user['user_id']}. {p['rationale']}").strip()
    out = await ingest.ingest(policy_markdown(p['policy_id'], version, title, p['effective_from'], clauses, note),
                              f"proposals/PROP-{p['id']}.md", user['actor'])
    async with db.pool.acquire() as c, c.transaction():
        await c.execute("UPDATE policy_proposals SET status='active', activated_document_id=$2, reviewer_id=$3, "
                        'decided_at=now(), updated_at=now() WHERE id=$1', p['id'], out['document_id'], user['user_id'])
        await c.execute("UPDATE policy_proposals SET status='superseded', updated_at=now() WHERE org_id=$1 AND "
                        "policy_id=$2 AND clause_id=$3 AND status='active' AND id<>$4",
                        p['org_id'], p['policy_id'], p['clause_id'], p['id'])
        await audit.write('proposal_approved', user['actor'], {'document_id': out['document_id'],
                          'flags': [f['id'] for f in out['flags']]}, 'policy_proposal', p['id'],
                          [p['clause_id'], out['document_id']], conn=c)
        await c.execute('UPDATE claims SET released_at=now() WHERE org_id=$1 AND resource_ref=$2 AND released_at IS NULL',
                        p['org_id'], f"policy_proposal:{p['id']}")
    return out


async def _ruling(user, r, outcome, reason, winners, losers, merged) -> str:
    """The ruling is a Decision (owner = the authority, reasons = the ruling) plus Proposal nodes with RULED_BY /
    REJECTED edges, so it shows in the graph and the chat can answer why."""
    rid = f"RUL-{r['id']}"
    today = date.today()
    in_force = r['clause_id'] and await compliance.clause_in_force(r['clause_id'], today)
    hidden = [ref for ref in (r['ref_a'], r['ref_b']) if ref.startswith('DEC-')
              and await _decision_visibility(ref) == 'restricted']
    words = {'approve_a': f"{r['ref_a']} approved, {r['ref_b']} rejected",
             'approve_b': f"{r['ref_b']} approved, {r['ref_a']} rejected",
             'merge': f"both merged into {merged and merged['ref']}", 'reject_both': 'both rejected',
             'request_changes': 'changes requested from both authors'}[outcome]
    fm = {'doc_type': 'decision', 'decision_id': rid, 'title': f"Ruling on collision #{r['id']}: {words}",
          'decided_on': today, 'owner': user.get('person_key') or user['user_id'], 'project': 'Policy governance',
          'visibility': 'restricted' if hidden else 'org', 'status': 'active', 'effect': 'completed', 'fields': {},
          'relied_on': [r['clause_id']] if in_force else [], 'reasons': reason}
    body = (f"{user['user_id']} ruled on collision #{r['id']} ({r['type']}) between {r['ref_a']} and {r['ref_b']}"
            f"{' on ' + r['clause_id'] if r['clause_id'] else ''}: {words}. Reason: {reason}")
    await ingest.ingest(f"---\n{yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)}---\n{body}\n",
                        f"rulings/{rid}.md", user['actor'])
    prov = {'source_doc': f'rulings/{rid}.md', 'visibility': fm['visibility'], 'confidence': 1.0,
            'extracted_by': 'human', 'human_verified': True, 'source_start': None, 'source_end': None,
            'source_quote': body}
    episode = graph.uid(f'episode:{rid}')
    for p, rel in [(w, 'RULED_BY') for w in winners] + [(lo, 'REJECTED') for lo in losers]:
        key = f"PROP-{p['id']}"
        await graph.upsert_node(key, 'Proposal', p['title'], {
            'valid_from': p['created_at'].date().isoformat(), 'status': 'active' if rel == 'RULED_BY' else 'rejected',
            'clause_id': p['clause_id'], 'author': p['author_id'], **prov})
        await graph.upsert_edge(key, rel, rid, f'{key} {rel} {rid}', graph.at(today), prov, episode)
    for ref in (r['ref_a'], r['ref_b']):
        if ref.startswith('DEC-'):
            await graph.upsert_edge(ref, 'RULED_BY', rid, f'{ref} RULED_BY {rid}', graph.at(today), prov, episode)
    return rid


# ---------------- single-proposal review (no collision) ----------------

async def start_review(user: dict, pid: int) -> dict:
    """Review lock: claims policy_proposal:<id>; anyone else trying to review is blocked (no double approval)."""
    p = await _proposal(user['org_id'], pid)
    if user['role'] not in REVIEWER_ROLES:
        raise Forbidden('only a Team lead, Compliance or an Owner can review proposals')
    if p['author_id'] == user['user_id']:
        raise Forbidden('an author can never review their own proposal')
    if p['status'] not in ('proposed', 'in_review'):
        raise Conflict(f"proposal is {p['status']}")
    await claim(user, f'policy_proposal:{pid}')
    r = await db.pool.fetchrow("UPDATE policy_proposals SET status='in_review', reviewer_id=$2, updated_at=now() "
                               'WHERE id=$1 RETURNING *', pid, user['user_id'])
    return proposal_out(r)


async def _reviewing(user: dict, pid: int):
    p = await _proposal(user['org_id'], pid)
    if p['status'] != 'in_review':
        raise Conflict(f"proposal is {p['status']}; start a review first")
    h = await holder(user['org_id'], f'policy_proposal:{pid}')
    if h is None or h['owner_id'] != user['user_id']:
        raise Conflict('someone else is reviewing this proposal' if h else 'your review lock expired; start again')
    if p['author_id'] == user['user_id']:
        raise Forbidden('an author can never approve their own proposal')
    open_c = await db.pool.fetchval("SELECT id FROM collisions WHERE status='open' AND (proposal_a=$1 OR proposal_b=$1)", pid)
    if open_c:
        raise Conflict(f'resolve collision #{open_c} first; this proposal is part of it')
    return p


async def approve(user: dict, pid: int) -> dict:
    p = await _reviewing(user, pid)
    if user['user_id'] != authority_for(user['org_id'], p['policy_id'], {p['author_id']}) and user['role'] != 'owner':
        raise Forbidden('only the policy domain authority or an Owner can approve this proposal')
    out = await activate(user, p)
    return {**proposal_out(await _proposal(user['org_id'], pid)), 'document_id': out['document_id'], 'flags': out['flags']}


async def reject(user: dict, pid: int, reason: str) -> dict:
    p = await _reviewing(user, pid)
    if not (reason or '').strip():
        raise ValueError('a rejection needs a reason')
    return await _close(user, p, 'rejected', reason)


async def list_proposals(user: dict, status: str | None = None) -> list[dict]:
    rows = await db.pool.fetch('SELECT * FROM policy_proposals WHERE org_id=$1 AND ($2::text IS NULL OR status=$2) '
                               'ORDER BY id DESC', user['org_id'], status)
    out = []
    for r in rows:
        d = proposal_out(r)
        d['claim'] = await holder(user['org_id'], f"policy_proposal:{r['id']}") or \
            (await holder(user['org_id'], f"clause:{r['clause_id']}") if r['status'] == 'draft' else None)
        out.append(d)
    return out


if __name__ == '__main__':
    assert normal('Logs: kept 90 days!') == 'logs kept 90 days'
    assert abs(cosine([1, 0], [1, 0]) - 1) < 1e-9 and cosine([1, 0], [0, 1]) == 0
    prop = {'clause_id': 'RET-9', 'clause_text': 'Logs 60 days', 'field': 'retention_days_max', 'new_value': 60}
    other = lambda kind, cid, v, text='x': {'kind': kind, 'clause_id': cid, 'text': text,
                                             'fields': {'retention_days_max': v}, 'ref': 'R'}
    assert classify(prop, other('proposal', 'RET-9', 90), 0.95)[1] == 'conflict'        # type A
    assert classify(prop, other('clause', 'RET-2.1', 90), None)[1] == 'conflict'        # type B (other clause)
    assert classify(prop, other('clause', 'RET-9', 90), 0.99)[0] == []                   # the clause it amends
    assert classify(prop, other('proposal', 'X', 60), None)[1] == 'duplicate'
    assert classify(prop, other('clause', 'RET-9', 60, 'Logs 60 days.'), None)[1] == 'duplicate'  # no-op change
    assert action_for('conflict', 0.99, False) == 'collide' and action_for(None, 0.95, False) == 'block'
    assert action_for(None, 0.85, False) == 'ask'
    print('conflicts self-check ok')
