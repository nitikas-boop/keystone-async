import asyncio
import json
import importlib
import logging
import pkgutil
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

import httpx
import openai
from fastapi import Depends, FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .reasoning import ModelUnavailable
from . import ask, compliance, comms, config, contracts, db, extract, graph, ingest, permissions, scanner, stt
from . import views
from .contracts import actor, human, writer


@asynccontextmanager
async def lifespan(app):
    await db.connect()
    graph.make()
    await graph.g.build_indices_and_constraints()
    watcher = asyncio.create_task(ingest.watch())
    yield
    watcher.cancel()
    await graph.g.close()
    await db.pool.close()


app = FastAPI(title='Keystone', lifespan=lifespan)
log = logging.getLogger('keystone.api')


# Registered before CORS so CORS wraps it: an unhandled error otherwise becomes a bare 500 without CORS headers,
# and the browser shows "Failed to fetch" instead of the cause. Local model failures (Ollama down, model not
# pulled; Graphiti reaches Ollama through the openai client) are 503 with Ollama's own message.
@app.middleware('http')
async def surface_errors(request, call_next):
    try:
        return await call_next(request)
    except openai.APIError as e:
        log.error('local model error on %s: %s', request.url.path, e)
        return JSONResponse({'detail': f'local model error: the backend could not use Ollama at {config.OLLAMA_BASE_URL} '
                                       f'({e}). Start Ollama; `ollama list` must show {config.ANSWER_MODEL} and '
                                       f'{config.EMBED_MODEL}.'}, 503)
    except Exception as e:
        log.exception('unhandled error on %s', request.url.path)
        return JSONResponse({'detail': f'{type(e).__name__}: {e}'}, 500)


# Resolves the caller (contracts.current_user) for everything below it; CORS still wraps its 401s.
app.middleware('http')(contracts.bind_user)
# Any localhost port by default: Vite moves to 5174+ when 5173 is taken. Credentials: the session is a cookie.
app.add_middleware(CORSMiddleware, allow_origin_regex=config.CORS_ORIGIN_REGEX, allow_credentials=True,
                   allow_methods=['*'], allow_headers=['*'])
app.include_router(views.router)
app.include_router(contracts.router)  # Person 2's stub /contracts/login|logout (fires the hooks)
# Each person's routers are discovered, so neither edits this file again (KEYSTONE-BUILD-SPLIT.md section 4).
for _pkg in ('routers_p1', 'routers_p2'):
    for _m in sorted(pkgutil.iter_modules([str(Path(__file__).parent / _pkg)]), key=lambda m: m.name):
        _mod = importlib.import_module(f'.{_pkg}.{_m.name}', __package__)
        if hasattr(_mod, 'router'):  # helper modules without a router are skipped
            app.include_router(_mod.router)


def _can(resource: dict, action: str = 'read') -> bool:
    return contracts.can_access(contracts.current_user(), resource, action)


@app.get('/health')
async def health():
    out = {'telemetry': False, 'models': {'answer': config.ANSWER_MODEL, 'embed': config.EMBED_MODEL,
                                          'extract': config.EXTRACT_MODEL}}
    try:
        out['postgres'] = await db.pool.fetchval('SELECT 1') == 1
    except Exception:
        out['postgres'] = False
    try:
        out['neo4j'] = bool(await graph.q('RETURN 1 AS ok'))
    except Exception:
        out['neo4j'] = False
    try:
        async with httpx.AsyncClient(timeout=3) as h:
            tags = (await h.get(f'{config.OLLAMA_BASE_URL}/api/tags')).json()
        names = {m['name'] for m in tags.get('models', [])}
        out['ollama'] = {m: (m in names or f'{m}:latest' in names) for m in (config.ANSWER_MODEL, config.EMBED_MODEL)}
    except Exception as e:
        out['ollama'] = False
        out['ollama_error'] = f'cannot reach {config.OLLAMA_BASE_URL}: {type(e).__name__}: {e}'
    if not (out['postgres'] and out['neo4j']):
        raise HTTPException(503, out)
    return out


# ---- documents ----

@app.post('/documents', status_code=201)
async def upload(file: UploadFile, doc_date: date | None = Form(None), title: str | None = Form(None),
                 who: str = Depends(writer)):
    """A Keystone document (Markdown with front-matter), or any .md/.txt/.pdf/.docx without it. The latter is stored
    as a meeting_note dated doc_date: the date comes from the uploader, never from the model or the upload time."""
    name = file.filename or 'upload.md'
    try:
        raw = await asyncio.to_thread(ingest.text_of, name, await file.read())
        if not ingest.has_front_matter(raw):
            if not doc_date:
                try:
                    await ingest.ingest(raw, name, who)  # raises the front-matter error and records the failed run
                except ValueError as e:
                    raise ValueError(f'{e}; or give the date it was written or agreed (doc_date) to store it as a '
                                     'plain document')
            return await ingest.ingest_source(raw, name, who, doc_id=ingest.doc_id_for(name),
                                              title=(title or '').strip() or Path(name).stem, meeting_date=doc_date,
                                              label={'visibility': 'org'})
        try:
            fm = ingest.parse(raw)[0]
        except Exception:
            fm = {}  # ingest reports the format error itself
        fields = fm.get('fields') or {}
        _authority(fields.get('amount_inr') if isinstance(fields, dict) else None, 'upload')
        await _may_author(fm)
        return await ingest.ingest(raw, name, who)
    except (ValueError, UnicodeDecodeError) as e:
        raise HTTPException(422, str(e))


async def _may_author(fm: dict):
    """Policy versions: CEO or Compliance Lead. Decisions: executives, or a lead inside their domain; a member
    proposes instead (POST /decision-proposals)."""
    u = contracts.current_user()
    kind = fm.get('doc_type') if isinstance(fm, dict) else None
    if kind == 'policy_version':
        await permissions.require_cap(u, 'policy.upload')
    elif kind == 'decision':
        await permissions.require_cap(u, 'decision.create')
        if not permissions.can(u, 'approve.any'):
            dom = await permissions.decision_domain(fm)
            if dom not in permissions.domains(u):
                await permissions.deny(u, 'decision.create', f"this decision is in the {dom or 'unassigned'} domain; "
                                       f"a lead records decisions only in their own ({', '.join(sorted(permissions.domains(u))) or 'none'})")


@app.get('/documents/{doc_id}')
async def get_document(doc_id: str):
    row = await db.pool.fetchrow('SELECT * FROM documents WHERE id=$1', doc_id)
    res = row and {'type': 'document', 'id': doc_id,
                   **contracts.label_for({**row['front_matter'], 'visibility': row['visibility']})}
    if not row or not _can(res):  # same 404 either way: no hint that something is hidden
        raise HTTPException(404, 'no such document')
    await contracts.log_view(res)
    chunks = await db.pool.fetch('SELECT idx, start_off AS start, end_off AS end, text FROM chunks '
                                 'WHERE document_id=$1 ORDER BY idx', doc_id)
    return {**{k: row[k] for k in ('id', 'path', 'doc_type', 'front_matter', 'visibility')},
            'ref_time': row['ref_time'].isoformat(), 'body': row['raw'], 'chunks': [dict(c) for c in chunks]}


@app.post('/transcribe')
async def transcribe(file: UploadFile, meeting_date: date | None = Form(None), title: str | None = Form(None),
                     who: str = Depends(writer)):
    """Local Whisper. With meeting_date the transcript comes back as a meeting_note Markdown doc ready for /documents."""
    audio = await file.read()
    if not audio:
        raise HTTPException(422, 'empty audio')
    name = file.filename or 'recording.webm'
    text = await asyncio.to_thread(stt.transcribe, audio, '.' + name.rsplit('.', 1)[-1] if '.' in name else '.webm')
    if not text:
        raise HTTPException(422, 'no speech recognised')
    out = {'text': text}
    if meeting_date:
        out['markdown'] = stt.meeting_markdown(text, meeting_date, title or f'Meeting {meeting_date}', name)
    return out


# ---- ask / graph ----

class AskIn(BaseModel):
    question: str
    as_of: date | None = None
    session_id: str | None = None


@app.post('/ask')
async def ask_endpoint(body: AskIn, who: str = Depends(actor)):
    if not body.question.strip():
        raise HTTPException(422, 'question is empty')
    try:
        return await ask.ask(body.question.strip(), body.as_of or date.today(), who, session_id=body.session_id)
    except ModelUnavailable as e:
        raise HTTPException(503, str(e))


@app.get('/answers/{answer_id}')
async def get_answer(answer_id: str):
    row = await db.pool.fetchrow('SELECT id, response FROM answers WHERE id::text=$1', answer_id)
    r = row and row['response']
    used = r and [*(r.get('highlight_nodes') or []), *(c.get('id') for c in r.get('citations') or []),
                  *(n.get('id') for n in (r.get('subgraph') or {}).get('nodes') or [])]
    if not row or await graph.hidden_keys([k for k in used if k]):
        raise HTTPException(404, 'no such answer')
    return {'answer_id': str(row['id']), **row['response']}


@app.get('/graph')
async def read_graph(as_of: date | None = None):
    return await graph.read(as_of or date.today())


# ---- decisions / policies / flags ----

@app.get('/decisions')
async def decisions(as_of: date | None = None):
    g = await graph.read(as_of or date.today())
    return [n for n in g['nodes'] if n['type'] == 'Decision']


@app.get('/decisions/{decision_id}/compliance')
async def decision_compliance(decision_id: str, as_of: date | None = None):
    out = None if await graph.hidden_keys([decision_id]) else         await compliance.evaluate(decision_id, as_of or date.today(), ask.LOW_CONFIDENCE)
    if out is None:
        raise HTTPException(404, 'no such decision')
    return out


@app.get('/policies')
async def policies():
    rows = await db.pool.fetch('SELECT * FROM policy_clauses ORDER BY policy_id, effective_from, clause_id')
    ok = contracts.visible_filter(contracts.current_user())  # a department's policies: jurisdiction (B)
    rows = [r for r in rows if ok({'type': 'PolicyVersion', 'key': r['document_id'], 'policy_id': r['policy_id']})]
    out = {}
    for r in rows:
        v = out.setdefault(r['policy_id'], {}).setdefault(r['version'], {
            'policy_id': r['policy_id'], 'version': r['version'], 'document_id': r['document_id'],
            'valid_from': str(r['effective_from']), 'valid_to': r['effective_to'] and str(r['effective_to']),
            'clauses': []})
        v['clauses'].append({'clause_id': r['clause_id'], 'title': r['title'], 'text': r['text'],
                             'fields': r['fields'], 'checkable': r['checkable']})
    return [{'policy_id': p, 'versions': list(vs.values())} for p, vs in out.items()]


@app.get('/flags')
async def flags(impact_type: str | None = None):
    rows = await db.pool.fetch(
        'SELECT f.*, p.id AS proposal_id FROM flags f LEFT JOIN proposals p ON p.flag_id = f.id '
        'WHERE $1::text IS NULL OR f.impact_type = $1 ORDER BY f.created_at', impact_type)
    hidden = await graph.hidden_keys([r['decision_id'] for r in rows])
    return [{**dict(r), 'created_at': r['created_at'].isoformat()} for r in rows if r['decision_id'] not in hidden]


# ---- review queue ----

def proposal_out(r) -> dict:
    d = dict(r)
    d['to'] = d.pop('to_addr')
    d['severity'] = scanner.SEVERITY[d['impact_type']]
    for k in ('created_at', 'decided_at', 'executed_at'):
        d[k] = d[k] and d[k].isoformat()
    return d


@app.get('/proposals')
async def proposals(status: str | None = None):
    """Every proposal the viewer may see; `can_approve` / `approve_block` say whether they may act on it."""
    rows = await db.pool.fetch('SELECT * FROM proposals WHERE $1::text IS NULL OR status=$1 ORDER BY id', status)
    hidden = await graph.hidden_keys([r['decision_id'] for r in rows])
    u, out = contracts.current_user(), []
    for r in rows:
        if r['decision_id'] in hidden:
            continue
        why = await permissions.approval_block(u, **await proposal_gate(r)) if u and u.get('user_id') else 'sign in'
        out.append({**proposal_out(r), 'can_approve': why is None, 'approve_block': why})
    return out


class ProposalIn(BaseModel):
    decision_id: str
    clause_id: str
    to: str = scanner.NOTIFY
    subject: str
    body: str


@app.post('/proposals', status_code=201)
async def create_proposal(body: ProposalIn, who: str = Depends(writer)):
    """The MCP write tool: it can only create a row in status 'proposed'. Approval stays a human click in the
    Review Queue, and only the executor acts on approved rows."""
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow(
            "INSERT INTO proposals (decision_id, clause_id, impact_type, to_addr, subject, body, domain, proposed_by) "
            "VALUES ($1, $2, 'MCP_PROPOSAL', $3, $4, $5, $6, $7) RETURNING *",
            body.decision_id, body.clause_id, body.to, body.subject, body.body,
            permissions.domain_for_clause(body.clause_id), who.split(':')[1])
        await db.audit(f'{who}:mcp', 'proposed', 'proposal', str(row['id']), [body.decision_id, body.clause_id],
                       {'status': 'proposed', 'via': 'mcp'}, conn=c)
    return proposal_out(row)


class ProposalEdit(BaseModel):
    to: str | None = None
    subject: str | None = None
    body: str | None = None


class Reason(BaseModel):
    reason: str | None = None


async def _transition(pid: int, who: str, action: str, sql: str, *args, payload=None):
    """Only a proposed row can be edited, approved or rejected; the executor alone moves approved -> executed."""
    decision = await db.pool.fetchval('SELECT decision_id FROM proposals WHERE id=$1', pid)
    if decision is None or await graph.hidden_keys([decision]):
        raise HTTPException(404, 'no such proposal')
    p = await db.pool.fetchrow('SELECT * FROM proposals WHERE id=$1', pid)
    await permissions.check_approval(contracts.current_user(), 'proposal', pid, **await proposal_gate(p))
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow(f"UPDATE proposals SET {sql} WHERE id=$1 AND status='proposed' RETURNING *", pid, *args)
        if row is None:
            status = await c.fetchval('SELECT status FROM proposals WHERE id=$1', pid)
            raise HTTPException(404 if status is None else 409,
                                'no such proposal' if status is None else f'proposal is {status}, not proposed')
        await db.audit(who, action, 'proposal', str(pid), [row['decision_id'], row['clause_id']],
                       payload or {'status': row['status']}, conn=c)
        if row['proposed_by'] and action in ('approved', 'rejected'):
            await comms.notify(row['proposed_by'], f'proposal_{action}', str(pid), conn=c,
                               detail=(payload or {}).get('reason'))
        return proposal_out(row)


async def decision_facts(decision_id: str) -> dict:
    """Owner (person key) and amount of a decision, for the approval rules."""
    rows = await graph.q('MATCH (d:Entity {uuid: $u}) RETURN d.owner AS owner, d.fields_json AS f',
                         u=graph.uid(decision_id))
    if not rows:
        return {'owner': None, 'amount': None}
    fields = json.loads(rows[0]['f'] or '{}')
    return {'owner': rows[0]['owner'], 'amount': fields.get('amount_inr')}


async def proposal_gate(p) -> dict:
    facts = await decision_facts(p['decision_id'])
    return {'domain': p['domain'] or permissions.domain_for_clause(p['clause_id']), 'proposer': p['proposed_by'],
            'decision_owner': facts['owner'], 'amount': facts['amount']}


@app.patch('/proposals/{pid}')
async def edit_proposal(pid: int, body: ProposalEdit, who: str = Depends(human)):
    ch = body.model_dump(exclude_none=True)
    if not ch:
        raise HTTPException(422, 'nothing to edit')
    return await _transition(pid, who, 'edited',
                             'to_addr=coalesce($2,to_addr), subject=coalesce($3,subject), body=coalesce($4,body)',
                             ch.get('to'), ch.get('subject'), ch.get('body'), payload=ch)


@app.post('/proposals/{pid}/approve')
async def approve(pid: int, who: str = Depends(human)):
    return await _transition(pid, who, 'approved', "status='approved', decided_by=$2, decided_at=now()", who)


@app.post('/proposals/{pid}/reject')
async def reject(pid: int, body: Reason | None = None, who: str = Depends(human)):
    return await _transition(pid, who, 'rejected', "status='rejected', decided_by=$2, decided_at=now()", who,
                             payload={'status': 'rejected', 'reason': body and body.reason})


# ---- ingestion review ----

@app.get('/extractions')
async def extractions(status: str | None = None, document_id: str | None = None):
    rows = await db.pool.fetch('SELECT * FROM extractions WHERE ($1::text IS NULL OR status=$1) '
                               'AND ($2::text IS NULL OR document_id=$2) ORDER BY id', status, document_id)
    return [extract.row_out(r) for r in rows
            if _can({'type': 'extraction', 'id': str(r['id']), **contracts.label_for({'visibility': r['visibility']})})]


class EdgeIn(BaseModel):
    kind: str = 'edge'
    source: str
    relation: str
    target: str


async def _review(ext_id, who, decision, changes=None):
    vis = await db.pool.fetchval('SELECT visibility FROM extractions WHERE id=$1', ext_id)
    if vis is not None and not _can({'type': 'extraction', 'id': str(ext_id), **contracts.label_for({'visibility': vis})},
                                    'write'):
        raise HTTPException(404, f'no such extraction {ext_id}')
    try:
        return await extract.review(ext_id, who, decision, changes)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.post('/extractions', status_code=201)
async def add_extraction(body: EdgeIn, who: str = Depends(human)):
    if body.kind != 'edge' or body.relation not in {'RELIED_ON', 'MADE_BY', 'ABOUT', 'SUPERSEDES', 'JUSTIFIED_BY'}:
        raise HTTPException(422, 'only edges with an ontology relation can be added')
    try:
        return await extract.add_edge(who, body.source, body.relation, body.target)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.patch('/extractions/{ext_id}')
async def edit_extraction(ext_id: int, changes: dict, who: str = Depends(human)):
    await _within_authority(ext_id, changes)
    return await _review(ext_id, who, 'edit', changes)


def _authority(amount, verb: str = 'approve'):
    """An amount above the signed-in person's approval authority (memberships.approval_authority_inr) is refused."""
    cap = (contracts.current_user() or {}).get('approval_authority_inr')
    if cap is not None and isinstance(amount, (int, float)) and amount > cap:
        raise HTTPException(403, f'₹{amount:,.0f} is above your approval authority (₹{cap:,.0f}); a lead with a '
                                 f'higher limit or the owner must {verb} it')


async def _within_authority(ext_id: int, changes: dict | None = None):
    """Accepting an extracted decision approves it: its amount must be within the approver's authority."""
    cap = (contracts.current_user() or {}).get('approval_authority_inr')
    key = cap is not None and await db.pool.fetchval(
        "SELECT source_key FROM extractions WHERE id=$1 AND kind='node' AND type='Decision'", ext_id)
    if not key:
        return
    rows = await graph.q('MATCH (n:Entity {uuid: $u}) RETURN n.fields_json AS f', u=graph.uid(key))
    fields = (changes or {}).get('fields') or json.loads((rows and rows[0]['f']) or '{}')
    _authority(fields.get('amount_inr') if isinstance(fields, dict) else None)


@app.post('/extractions/{ext_id}/accept')
async def accept_extraction(ext_id: int, who: str = Depends(human)):
    await _within_authority(ext_id)
    return await _review(ext_id, who, 'accept')


@app.post('/extractions/{ext_id}/reject')
async def reject_extraction(ext_id: int, who: str = Depends(human)):
    return await _review(ext_id, who, 'reject')


# ---- audit ----

@app.get('/audit')
async def audit_log(after_id: int = 0, limit: int = 100):
    """CEO and Compliance Lead: the whole chain. Everyone else: only the rows they are the actor of. Rows are never
    edited or deleted here (the app role can only INSERT and SELECT the log)."""
    u = contracts.current_user()
    if permissions.can(u, 'audit.full'):
        rows = await db.pool.fetch('SELECT * FROM audit_log WHERE id > $1 ORDER BY id LIMIT $2', after_id,
                                   min(limit, 500))
    elif permissions.can(u, 'audit.own'):
        rows = await db.pool.fetch('SELECT * FROM audit_log WHERE id > $1 AND actor IN ($3, $3 || \':mcp\') '
                                   'ORDER BY id LIMIT $2', after_id, min(limit, 500), f"user:{u['user_id']}")
    else:
        raise HTTPException(401, 'sign in required')
    return [{**dict(r), 'ts': r['ts'].isoformat()} for r in rows]


@app.get('/audit/verify')
async def verify_chain():
    """Server-side chain check: recompute every row hash and link; report the first broken row."""
    await permissions.require_cap(contracts.current_user(), 'audit.full')
    rows = await db.pool.fetch('SELECT * FROM audit_log ORDER BY id')
    prev = '0' * 64
    for r in rows:
        if r['prev_hash'] != prev:
            return {'ok': False, 'rows': len(rows), 'first_broken_id': r['id'],
                    'message': f"Row #{r['id']}: prev_hash does not match the previous row's hash."}
        if db.row_hash(r) != r['hash']:
            return {'ok': False, 'rows': len(rows), 'first_broken_id': r['id'],
                    'message': f"Row #{r['id']}: stored hash does not match its contents."}
        prev = r['hash']
    return {'ok': True, 'rows': len(rows), 'first_broken_id': None,
            'message': f'Verified {len(rows)} rows on the server: every hash recomputes and every link holds.'}
