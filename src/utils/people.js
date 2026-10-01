// Display names for people and audit actors. Names come from GET /team (the Person nodes); the few actors
// that are not people in the graph (the demo admin and the system processes) are named here.
const NON_PEOPLE = {
  nitika: 'Nitika (Keystone Admin)',
  'system:scanner': 'Impact scanner',
  'system:watcher': 'Vault folder watcher',
  executor: 'Executor (writes outbox/)',
};

// Mirrors the backend default RESTRICTED_READERS (backend/app/config.py). The frontend has no endpoint that
// reports it, so list views use this to hide restricted items; retrieval itself is filtered on the server.
export const RESTRICTED_READERS = ['nitika', 'farhan', 'ananya'];

// 'user:nitika', 'p-ananya', 'ananya', 'user:priya:mcp' -> the bare user key ('nitika', 'ananya', 'priya').
export function userKey(ref) {
  return String(ref || '').replace(/^user:/, '').replace(/:mcp$/, '').replace(/^p-/, '');
}

export function displayName(ref, team = []) {
  if (!ref) return '—';
  const raw = String(ref);
  if (NON_PEOPLE[raw]) return NON_PEOPLE[raw];
  const key = userKey(raw);
  if (NON_PEOPLE[key]) return NON_PEOPLE[key];
  const p = team.find(m => m.id === `p-${key}`);
  const name = p ? p.name : key.charAt(0).toUpperCase() + key.slice(1);
  return raw.endsWith(':mcp') ? `${name} (via MCP)` : name;
}

export function roleOf(ref, team = []) {
  const p = team.find(m => m.id === `p-${userKey(ref)}`);
  return p?.role || null;
}
