"""Seed the graph from the vault in chronological order (§6.3). Run on the extraction machine (qwen3:14b),
on fresh volumes (docker compose down -v; up -d), then snapshot:
    docker compose exec backend python -m app.seed
Each run writes one ingestion_runs row; a document that fails is recorded there and the seed continues.
Resumable: re-running skips documents a previous run already finished (same sha256); --force re-ingests all."""
import asyncio
import hashlib
import sys
from pathlib import Path

import yaml

from . import config, db, graph, ingest

ORDER = {'policy_version': 0, 'meeting_note': 1, 'decision': 2}  # same-day: rules before the notes and decisions


async def main(force: bool = False) -> int:
    await db.connect()
    graph.make()
    await graph.g.build_indices_and_constraints()
    root = Path(config.VAULT_DIR)
    run = await ingest.start_run('seed')
    results = {}
    try:
        await ingest.ingest_people(yaml.safe_load((root / 'people.yaml').read_text(encoding='utf-8'))['people'])
        docs = []
        for p in root.rglob('*.md'):
            if 'inbox' in p.relative_to(root).parts:  # drop folder belongs to the watcher
                continue
            path = p.relative_to(root).as_posix()
            raw = p.read_text(encoding='utf-8').replace('\r\n', '\n')
            try:
                fm = ingest.parse(raw)[0]
                docs.append((ingest.ref_date(fm), ORDER[fm['doc_type']], path, raw))
            except Exception as e:
                results[path] = ingest.error_entry(e, hashlib.sha256(raw.encode()).hexdigest())
                print('FAILED', path, results[path]['error'], flush=True)
        done = {} if force else await ingest.completed_docs()
        for ref, _, path, raw in sorted(docs):
            sha = hashlib.sha256(raw.encode()).hexdigest()
            if done.get(path, {}).get('sha256') == sha:
                results[path] = {**done[path], 'status': 'skipped'}
                print(ref, path, 'skipped (already ingested)', flush=True)
                continue
            try:
                out = await ingest._ingest(raw, path, 'user:nitika')
                results[path] = ingest.doc_entry(out, sha)
                msg = [ref, path, out['document_id'], out['extracted'], [f['id'] for f in out['flags']]]
                msg += ['FAILED', out['extraction_error']] if out.get('extraction_error') else []
            except Exception as e:
                results[path] = ingest.error_entry(e, sha)
                msg = ['FAILED', ref, path, results[path]['error']]
            await ingest.update_run(run, ingest.summarise(results)[0])  # progress survives a hang or kill
            print(*msg, flush=True)
    except Exception as e:
        stats = ingest.summarise(results)[0]
        await ingest.update_run(run, stats, 'failed', f'{type(e).__name__}: {e}')
        raise
    stats, status, error = ingest.summarise(results)
    await ingest.update_run(run, stats, status, error)
    print(f"seed run {run}: {status}; ok={stats['ok']} skipped={stats['skipped']} failed={stats['failed']}", flush=True)
    return 1 if stats['failed'] else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main(force='--force' in sys.argv[1:])))
