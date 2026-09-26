"""Executor: a separate process, the only thing that acts, and only on rows a human approved (§6.9).
MCP is a later feature; for now the action is writing the notification as an RFC 5322 .eml into outbox/.
Run: python -m app.executor"""
import asyncio
import logging
from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timezone
from pathlib import Path

from . import config, db

log = logging.getLogger('keystone.executor')


def to_eml(p) -> bytes:
    m = EmailMessage()
    m['From'] = 'keystone@nimbus-ledger.local'
    m['To'] = p['to_addr']
    m['Subject'] = p['subject']
    m['Date'] = format_datetime(datetime.now(timezone.utc))
    m['X-Keystone-Proposal'] = str(p['id'])
    m['X-Keystone-Approved-By'] = p['decided_by']
    m.set_content(p['body'])
    return bytes(m)


async def run_once() -> int | None:
    async with db.pool.acquire() as c, c.transaction():
        p = await c.fetchrow("SELECT * FROM proposals WHERE status='approved' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED")
        if p is None:
            return None
        path = Path(config.OUTBOX_DIR) / f"proposal-{p['id']}.eml"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(to_eml(p))  # same filename on retry, so a failed commit just rewrites it
        await c.execute("UPDATE proposals SET status='executed', executed_at=now(), outbox_file=$2 "
                        "WHERE id=$1 AND status='approved'", p['id'], path.name)
        await db.audit('executor', 'executed', 'proposal', str(p['id']), [p['decision_id'], p['clause_id']],
                       {'outbox_file': path.name, 'eml_sha256': db.sha256_hex(path.read_text())}, conn=c)
        return p['id']


async def main(interval: float = 2):
    logging.basicConfig(level=logging.INFO)
    await db.connect()
    while True:
        try:
            while (pid := await run_once()) is not None:
                log.info('executed proposal %s', pid)
        except Exception:
            log.exception('executor tick failed')
        await asyncio.sleep(interval)


if __name__ == '__main__':
    asyncio.run(main())
