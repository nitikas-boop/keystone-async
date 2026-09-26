"""Seed the graph from the vault in chronological order (§6.3). Run on the extraction machine (qwen3:14b),
on fresh volumes (docker compose down -v; up -d), then snapshot:
    docker compose exec backend python -m app.seed"""
import asyncio
from pathlib import Path

import yaml

from . import config, db, graph, ingest

ORDER = {'policy_version': 0, 'meeting_note': 1, 'decision': 2}  # same-day: rules before the notes and decisions


async def main():
    await db.connect()
    graph.make()
    await graph.g.build_indices_and_constraints()
    root = Path(config.VAULT_DIR)
    await ingest.ingest_people(yaml.safe_load((root / 'people.yaml').read_text(encoding='utf-8'))['people'])
    docs = []
    for p in root.rglob('*.md'):
        if 'inbox' in p.relative_to(root).parts:  # drop folder belongs to the watcher
            continue
        raw = p.read_text(encoding='utf-8').replace('\r\n', '\n')
        fm = ingest.parse(raw)[0]
        docs.append((ingest.ref_date(fm), ORDER[fm['doc_type']], p.relative_to(root).as_posix(), raw))
    for ref, _, path, raw in sorted(docs):
        out = await ingest.ingest(raw, path, 'user:nitika')
        print(ref, path, out['document_id'], out['extracted'], [f['id'] for f in out['flags']], flush=True)


if __name__ == '__main__':
    asyncio.run(main())
