"""G: the plugin page. Each plugin says what it can read and what it can do; Owner or Compliance turns it on or off."""
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from . import person, require, signed_in
from .. import db, graph, plugins

router = APIRouter(tags=['p1 plugins'])


def _find(pid: str) -> dict:
    p = next((p for p in plugins.catalogue() if p['id'] == pid), None)
    if p is None:
        raise HTTPException(404, f'no such plugin {pid}')
    return p


@router.get('/plugins')
async def listing(u: dict = Depends(signed_in)):
    await plugins.refresh(u['org_id'])
    return [{'id': p['id'], 'kind': p['kind'], 'name': p['name'], 'description': p.get('description') or p.get('note'),
             'reads': p['reads'], 'does': p['does'], 'enabled': plugins.is_enabled(u['org_id'], p['id']),
             'rules': [{k: r.get(k) for k in ('id', 'title', 'severity', 'source')} for r in p.get('rules') or []]}
            for p in plugins.catalogue()]


async def _set(pid: str, enabled: bool, u: dict):
    require(u, 'owner', 'compliance')
    _find(pid)
    async with db.pool.acquire() as c, c.transaction():
        await c.execute('INSERT INTO plugin_state (org_id, plugin_id, enabled, updated_by) VALUES ($1,$2,$3,$4) '
                        'ON CONFLICT (org_id, plugin_id) DO UPDATE SET enabled = $3, updated_by = $4, updated_at = now()',
                        u['org_id'], pid, enabled, u['user_id'])
        await db.audit(f"user:{u['user_id']}", 'plugin_enabled' if enabled else 'plugin_disabled', 'plugin', pid, [],
                       {'enabled': enabled}, conn=c)
    await plugins.refresh(u['org_id'])
    return {'id': pid, 'enabled': enabled}


@router.post('/plugins/{pid}/enable')
async def enable(pid: str, u: dict = Depends(person)):
    return await _set(pid, True, u)


@router.post('/plugins/{pid}/disable')
async def disable(pid: str, u: dict = Depends(person)):
    return await _set(pid, False, u)


@router.get('/plugins/{pid}/results')
async def results(pid: str, u: dict = Depends(signed_in)):
    """A rule pack run over the decisions the caller may see (today's graph). Empty while the pack is disabled."""
    p = _find(pid)
    if p['kind'] != 'rule_pack':
        raise HTTPException(422, 'only rule packs have results')
    rules = [r for r in plugins.load_rules(u['org_id']) if r['pack'] == pid]
    g = await graph.read(date.today())
    out = []
    for n in sorted((n for n in g['nodes'] if n['type'] == 'Decision'), key=lambda n: n['id']):
        fields = json.loads(n['attributes'].get('fields_json') or '{}')
        checks = [plugins.check(r, fields) for r in rules]
        checks = [c for c in checks if c['result'] != 'not_applicable']
        if checks:
            out.append({'decision_id': n['id'], 'title': n['label'], 'checks': checks})
    return {'plugin': pid, 'enabled': plugins.is_enabled(u['org_id'], pid), 'results': out}
