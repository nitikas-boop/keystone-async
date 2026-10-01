"""Keystone MCP server (stdio, JSON-RPC 2.0, stdlib only). Read tools + one proposal-only write tool.

Any MCP client (Claude Desktop, an IDE agent) can ask Keystone questions and propose actions; nothing it does can
approve or execute: proposals land in the Review Queue as 'proposed' and wait for a human.

  {"mcpServers": {"keystone": {"command": "python", "args": ["<repo>/mcp/keystone_mcp.py"],
                               "env": {"KEYSTONE_EMPLOYEE_ID": "NL-003", "KEYSTONE_PASSWORD": "..."}}}}

It signs in as a Keystone user (KEYSTONE_EMPLOYEE_ID + KEYSTONE_PASSWORD) and gets an agent session: it sees exactly
what that user may see, and it can never approve. The Owner can switch it off on the Plugins page.
Env: KEYSTONE_URL (default http://localhost:8000). Dev only: KEYSTONE_USER (X-User header, backend with
KEYSTONE_DEV_AUTH=1) when no employee ID is set.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

URL = os.environ.get('KEYSTONE_URL', 'http://localhost:8000')
USER = os.environ.get('KEYSTONE_USER', 'priya')
EMPLOYEE_ID = os.environ.get('KEYSTONE_EMPLOYEE_ID')
_token = None


def _auth() -> dict:
    """Bearer token from /auth/login (client=mcp), fetched once; X-User only as the dev fallback."""
    global _token
    if not EMPLOYEE_ID:
        return {'X-User': USER}
    if _token is None:
        req = urllib.request.Request(URL + '/auth/login', method='POST', headers={'Content-Type': 'application/json'},
                                     data=json.dumps({'employee_id': EMPLOYEE_ID, 'client': 'mcp',
                                                      'password': os.environ.get('KEYSTONE_PASSWORD', '')}).encode())
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                _token = json.load(r)['token']
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'Keystone sign-in failed {e.code}: {e.read().decode(errors="replace")}')
    return {'Authorization': f'Bearer {_token}'}


def call(method, path, body=None, **query):
    global _token
    q = urllib.parse.urlencode({k: v for k, v in query.items() if v})
    req = urllib.request.Request(URL + path + (f'?{q}' if q else ''), method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={**_auth(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            _token = None  # session expired: sign in again on the next call
        raise RuntimeError(f'Keystone {e.code}: {e.read().decode(errors="replace")}')


def schema(required=(), **optional):
    props = {k: {'type': 'string', 'description': d} for k, d in (*required, *optional.items())}
    return {'type': 'object', 'properties': props, 'required': [k for k, _ in required]}


TOOLS = {
    'ask': ('Ask Keystone about past decisions and policies. Returns a cited answer, or exactly '
            '"I have no recorded decision about that".',
            schema([('question', 'The question')], as_of='YYYY-MM-DD point in time (default today)'),
            lambda a: call('POST', '/ask', {'question': a['question'], 'as_of': a.get('as_of')})),
    'check_compliance': ('Deterministic compliance of one decision against the clause version in force on its date.',
                         schema([('decision_id', 'e.g. DEC-004')], as_of='YYYY-MM-DD'),
                         lambda a: call('GET', f"/decisions/{a['decision_id']}/compliance", as_of=a.get('as_of'))),
    'list_policies': ('All policies with every version, validity window and clause fields.', schema(),
                      lambda a: call('GET', '/policies')),
    'list_flags': ('Policy-impact flags (ONGOING_PRACTICE_BREACH, RULE_CHANGED_SINCE, SUPERSEDED).',
                   schema(impact_type='filter by impact type'),
                   lambda a: call('GET', '/flags', impact_type=a.get('impact_type'))),
    'list_proposals': ('Proposals in the human review queue.', schema(status='proposed|approved|rejected|executed'),
                       lambda a: call('GET', '/proposals', status=a.get('status'))),
    'verify_audit_chain': ('Recompute the hash-chained audit log; returns the first broken row if any.', schema(),
                           lambda a: call('GET', '/audit/verify')),
    'propose_action': ('Propose a notification about a decision. Creates a PROPOSAL only: a human must approve it in '
                       'the Keystone Review Queue before the executor sends anything.',
                       schema([('decision_id', 'e.g. DEC-007'), ('clause_id', 'e.g. RET-2.1@v3'),
                               ('subject', 'Email subject'), ('body', 'Email body')]),
                       lambda a: call('POST', '/proposals',
                                      {k: a[k] for k in ('decision_id', 'clause_id', 'subject', 'body')})),
}


def handle(msg, name='keystone', tools=TOOLS):
    m, p = msg.get('method'), msg.get('params') or {}
    if m == 'initialize':
        return {'protocolVersion': p.get('protocolVersion', '2025-06-18'), 'capabilities': {'tools': {}},
                'serverInfo': {'name': name, 'version': '1.1'}}
    if m == 'tools/list':
        return {'tools': [{'name': n, 'description': d, 'inputSchema': s} for n, (d, s, _) in tools.items()]}
    if m == 'tools/call':
        tool = p.get('name')
        if tool not in tools:
            raise ValueError(f'unknown tool {tool}')
        try:
            out = tools[tool][2](p.get('arguments') or {})
            return {'content': [{'type': 'text', 'text': json.dumps(out, ensure_ascii=False, indent=1)}]}
        except (RuntimeError, OSError, KeyError) as e:
            return {'content': [{'type': 'text', 'text': f'{type(e).__name__}: {e}'}], 'isError': True}
    if m == 'ping':
        return {}
    raise LookupError(m)


def main(name='keystone', tools=TOOLS):
    for line in sys.stdin:
        if not line.strip():
            continue
        msg = json.loads(line)
        if 'id' not in msg:  # notification, e.g. notifications/initialized
            continue
        try:
            reply = {'jsonrpc': '2.0', 'id': msg['id'], 'result': handle(msg, name, tools)}
        except LookupError as e:
            reply = {'jsonrpc': '2.0', 'id': msg['id'], 'error': {'code': -32601, 'message': f'method not found: {e}'}}
        except Exception as e:
            reply = {'jsonrpc': '2.0', 'id': msg['id'], 'error': {'code': -32603, 'message': str(e)}}
        sys.stdout.write(json.dumps(reply) + '\n')  # ASCII-escaped: Windows consoles are not UTF-8
        sys.stdout.flush()


if __name__ == '__main__':
    main()
