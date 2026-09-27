import asyncio
from contextlib import asynccontextmanager
from datetime import date

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import ask, compliance, config, db, extract, graph, ingest
from . import views

# ponytail: hardcoded users (§9 "hardcoded auth is fine"); real auth/RBAC is roadmap
USERS = set(config.E('KEYSTONE_USERS', 'nitika,priya,farhan,ananya,karthik').split(','))


def actor(x_user: str | None = Header(None)) -> str:
    if x_user not in USERS:
        raise HTTPException(401, f'X-User header must be one of {sorted(USERS)}')
    return f'user:{x_user}'


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
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['*'], allow_headers=['*'])
app.include_router(views.router)


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
    except Exception:
        out['ollama'] = False
    if not (out['postgres'] and out['neo4j']):
        raise HTTPException(503, out)
    return out


# ---- documents ----

@app.post('/documents', status_code=201)
async def upload(file: UploadFile, who: str = Depends(actor)):
    try:
        raw = (await file.read()).decode('utf-8')
        return await ingest.ingest(raw, file.filename or 'upload.md', who)
    except (ValueError, UnicodeDecodeError) as e:
        raise HTTPException(422, str(e))


@app.get('/documents/{doc_id}')
async def get_document(doc_id: str):
    row = await db.pool.fetchrow('SELECT * FROM documents WHERE id=$1', doc_id)
    if not row:
        raise HTTPException(404, 'no such document')
    chunks = await db.pool.fetch('SELECT idx, start_off AS start, end_off AS end, text FROM chunks '
                                 'WHERE document_id=$1 ORDER BY idx', doc_id)
    return {**{k: row[k] for k in ('id', 'path', 'doc_type', 'front_matter', 'visibility')},
            'ref_time': row['ref_time'].isoformat(), 'body': row['raw'], 'chunks': [dict(c) for c in chunks]}


# ---- ask / graph ----

class AskIn(BaseModel):
    question: str
    as_of: date | None = None


@app.post('/ask')
async def ask_endpoint(body: AskIn, who: str = Depends(actor)):
    if not body.question.strip():
        raise HTTPException(422, 'question is empty')
    return await ask.ask(body.question.strip(), body.as_of or date.today(), who)


@app.get('/answers/{answer_id}')
async def get_answer(answer_id: str):
    row = await db.pool.fetchrow('SELECT id, response FROM answers WHERE id::text=$1', answer_id)
    if not row:
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
    out = await compliance.evaluate(decision_id, as_of or date.today(), ask.LOW_CONFIDENCE)
    if out is None:
        raise HTTPException(404, 'no such decision')
    return out


@app.get('/policies')
async def policies():
    rows = await db.pool.fetch('SELECT * FROM policy_clauses ORDER BY policy_id, effective_from, clause_id')
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
    return [{**dict(r), 'created_at': r['created_at'].isoformat()} for r in rows]


# ---- review queue ----

def proposal_out(r) -> dict:
    d = dict(r)
    d['to'] = d.pop('to_addr')
    for k in ('created_at', 'decided_at', 'executed_at'):
        d[k] = d[k] and d[k].isoformat()
    return d


@app.get('/proposals')
async def proposals(status: str | None = None):
    rows = await db.pool.fetch('SELECT * FROM proposals WHERE $1::text IS NULL OR status=$1 ORDER BY id', status)
    return [proposal_out(r) for r in rows]


class ProposalEdit(BaseModel):
    to: str | None = None
    subject: str | None = None
    body: str | None = None


class Reason(BaseModel):
    reason: str | None = None


async def _transition(pid: int, who: str, action: str, sql: str, *args, payload=None):
    """Only a proposed row can be edited, approved or rejected; the executor alone moves approved -> executed."""
    async with db.pool.acquire() as c, c.transaction():
        row = await c.fetchrow(f"UPDATE proposals SET {sql} WHERE id=$1 AND status='proposed' RETURNING *", pid, *args)
        if row is None:
            status = await c.fetchval('SELECT status FROM proposals WHERE id=$1', pid)
            raise HTTPException(404 if status is None else 409,
                                'no such proposal' if status is None else f'proposal is {status}, not proposed')
        await db.audit(who, action, 'proposal', str(pid), [row['decision_id'], row['clause_id']],
                       payload or {'status': row['status']}, conn=c)
        return proposal_out(row)


@app.patch('/proposals/{pid}')
async def edit_proposal(pid: int, body: ProposalEdit, who: str = Depends(actor)):
    ch = body.model_dump(exclude_none=True)
    if not ch:
        raise HTTPException(422, 'nothing to edit')
    return await _transition(pid, who, 'edited',
                             'to_addr=coalesce($2,to_addr), subject=coalesce($3,subject), body=coalesce($4,body)',
                             ch.get('to'), ch.get('subject'), ch.get('body'), payload=ch)


@app.post('/proposals/{pid}/approve')
async def approve(pid: int, who: str = Depends(actor)):
    return await _transition(pid, who, 'approved', "status='approved', decided_by=$2, decided_at=now()", who)


@app.post('/proposals/{pid}/reject')
async def reject(pid: int, body: Reason | None = None, who: str = Depends(actor)):
    return await _transition(pid, who, 'rejected', "status='rejected', decided_by=$2, decided_at=now()", who,
                             payload={'status': 'rejected', 'reason': body and body.reason})


# ---- ingestion review ----

@app.get('/extractions')
async def extractions(status: str | None = None, document_id: str | None = None):
    rows = await db.pool.fetch('SELECT * FROM extractions WHERE ($1::text IS NULL OR status=$1) '
                               'AND ($2::text IS NULL OR document_id=$2) ORDER BY id', status, document_id)
    return [extract.row_out(r) for r in rows]


class EdgeIn(BaseModel):
    kind: str = 'edge'
    source: str
    relation: str
    target: str


async def _review(ext_id, who, decision, changes=None):
    try:
        return await extract.review(ext_id, who, decision, changes)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.post('/extractions', status_code=201)
async def add_extraction(body: EdgeIn, who: str = Depends(actor)):
    if body.kind != 'edge' or body.relation not in {'RELIED_ON', 'MADE_BY', 'ABOUT', 'SUPERSEDES', 'JUSTIFIED_BY'}:
        raise HTTPException(422, 'only edges with an ontology relation can be added')
    try:
        return await extract.add_edge(who, body.source, body.relation, body.target)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.patch('/extractions/{ext_id}')
async def edit_extraction(ext_id: int, changes: dict, who: str = Depends(actor)):
    return await _review(ext_id, who, 'edit', changes)


@app.post('/extractions/{ext_id}/accept')
async def accept_extraction(ext_id: int, who: str = Depends(actor)):
    return await _review(ext_id, who, 'accept')


@app.post('/extractions/{ext_id}/reject')
async def reject_extraction(ext_id: int, who: str = Depends(actor)):
    return await _review(ext_id, who, 'reject')


# ---- audit ----

@app.get('/audit')
async def audit_log(after_id: int = 0, limit: int = 100):
    rows = await db.pool.fetch('SELECT * FROM audit_log WHERE id > $1 ORDER BY id LIMIT $2', after_id, min(limit, 500))
    return [{**dict(r), 'ts': r['ts'].isoformat()} for r in rows]
