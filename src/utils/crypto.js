// Client-side verification of Keystone's hash-chained audit log.
// Mirrors backend/app/db.py (canonical_json, row_hash) and the audit_chain trigger in backend/sql/init.sql.

export async function sha256(message) {
  // No fallback: a fake hash would make verification meaningless.
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable (needs https or localhost)');
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Byte-identical to Postgres jsonb::text: keys ordered by (UTF-8 length, bytes), ", " and ": " separators.
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(', ') + ']';
  if (value && typeof value === 'object') {
    const enc = new TextEncoder();
    const keys = Object.keys(value).sort((a, b) => {
      const ea = enc.encode(a), eb = enc.encode(b);
      if (ea.length !== eb.length) return ea.length - eb.length;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return '{' + keys.map(k => `${JSON.stringify(k)}: ${canonicalJson(value[k])}`).join(', ') + '}';
  }
  return JSON.stringify(value);
}

// The API returns Python isoformat ("2026-09-26T18:16:27.123456+00:00"); the trigger hashed
// "YYYY-MM-DDTHH:MM:SS.ffffffZ". String surgery, because JS Dates drop microseconds.
function canonicalTs(ts) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(\+00:00|Z)$/.exec(ts);
  if (!m) throw new Error(`unexpected timestamp format: ${ts}`);
  return `${m[1]}.${(m[2] || '').padEnd(6, '0')}Z`;
}

// Browser-side check. Returns {ok, message, brokenId?, brokenPos?, checked}. onProgress(done, total) is called
// as rows are hashed; the chain position of the first broken row is 1-based.
export async function verifyAuditChain(rows, onProgress) {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  if (sorted.length === 0) return { ok: true, checked: 0, message: 'Audit log is empty: nothing to verify.' };
  let prev = null;
  for (const [i, r] of sorted.entries()) {
    const fail = (message) => ({ ok: false, message, brokenId: r.id, brokenPos: i + 1, checked: i });
    const expected = await sha256(canonicalJson({
      id: r.id, ts: canonicalTs(r.ts), actor: r.actor, action: r.action, object_type: r.object_type,
      object_id: r.object_id, source_ids: r.source_ids, payload_hash: r.payload_hash, prev_hash: r.prev_hash,
    }));
    if (expected !== r.hash) return fail(`Row #${r.id}: stored hash does not match its contents.`);
    const expectedPrev = prev ? prev.hash : (r.id === 1 ? '0'.repeat(64) : null);
    if (expectedPrev !== null && r.prev_hash !== expectedPrev) {
      return fail(`Row #${r.id}: chain broken, prev_hash does not match row #${prev ? prev.id : 'genesis'}.`);
    }
    prev = r;
    if (onProgress && (i % 25 === 24 || i === sorted.length - 1)) onProgress(i + 1, sorted.length);
  }
  return { ok: true, checked: sorted.length, message: `Verified ${sorted.length} rows: every hash recomputes and every link holds.` };
}

export function formatHash(hash, length = 12) {
  if (!hash) return "0000...0000";
  if (hash.length <= length * 2) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-length)}`;
}
