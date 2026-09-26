from contextlib import asynccontextmanager
from datetime import date

import httpx
from fastapi import FastAPI, HTTPException, UploadFile

from . import config, db, graph, ingest


@asynccontextmanager
async def lifespan(app):
    await db.connect()
    graph.make()
    await graph.g.build_indices_and_constraints()
    yield
    await graph.g.close()
    await db.pool.close()


app = FastAPI(title='Keystone', lifespan=lifespan)


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
    ok = out['postgres'] and out['neo4j']
    if not ok:
        raise HTTPException(503, out)
    return out


@app.post('/documents', status_code=201)
async def upload(file: UploadFile):
    try:
        raw = (await file.read()).decode('utf-8')
        return await ingest.ingest(raw, file.filename or 'upload.md')
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


@app.get('/graph')
async def read_graph(as_of: date | None = None):
    return await graph.read(as_of or date.today())
