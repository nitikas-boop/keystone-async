// Shared display formatters. Every amount, timestamp and clause reference on screen goes through here so the
// app shows one style: Indian digit grouping for ₹, IST with UTC alongside for timestamps (the audit log stores
// UTC), and clause references as PROC-3.1@v2.

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function inr(n) {
  return n == null || Number.isNaN(Number(n)) ? '—' : `₹${INR.format(Number(n))}`;
}

// Rewrites only ₹-prefixed numbers in backend or model-worded text: "₹500,000" -> "₹5,00,000",
// "₹5L" / "₹4 lakh" -> "₹5,00,000" / "₹4,00,000", "₹1 Cr" -> "₹1,00,00,000". Nothing else is touched.
const RUPEES = /₹\s?(\d+(?:,\d{2,3})*(?:\.\d+)?)(\s?(?:lakhs?|L|crores?|Cr)\b)?/gi;

export function fixRupees(text) {
  if (typeof text !== 'string') return text;
  return text.replace(RUPEES, (_, num, unit) => {
    let n = Number(num.replace(/,/g, ''));
    const u = (unit || '').trim().toLowerCase();
    if (u === 'l' || u.startsWith('lakh')) n *= 1e5;
    else if (u === 'cr' || u.startsWith('crore')) n *= 1e7;
    return inr(n);
  });
}

// "PROC-3.1 v1", "PROC-3.1 @ v1", "PROC-3.1-v1" -> "PROC-3.1@v1".
const CLAUSE = /\b([A-Z]{2,6}-\d+(?:\.\d+)*)(?:\s*@\s*|\s+|-)(v\d+)\b/g;

export function fixClauseRefs(text) {
  return typeof text === 'string' ? text.replace(CLAUSE, '$1@$2') : text;
}

// Stand-alone ISO dates in prose -> '14 Mar 2025'. Dates inside IDs (MTG-2025-05-14) are left alone.
const ISO_DATE = /(?<![\w-])(\d{4})-(\d{2})-(\d{2})(?![\w-])/g;

export function fixIsoDates(text) {
  return typeof text === 'string' ? text.replace(ISO_DATE, (m) => day(m)) : text;
}

// For any text the backend or the local model worded (answers, flag explanations, proposal bodies).
export const polish = (text) => fixIsoDates(fixClauseRefs(fixRupees(text)));

export const clauseRef = (clauseId, version) => (version ? `${clauseId}@${version}` : clauseId);

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MIN = 330;

// 'YYYY-MM-DD' (a calendar date, no time zone) -> '18 Jun 2025'.
export function day(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (d || '—');
}

// 'YYYY-MM-DD' -> 'Jun 2025'.
export function month(d) {
  const m = /^(\d{4})-(\d{2})/.exec(d || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (d || '—');
}

function parts(iso, offsetMin) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const s = new Date(t.getTime() + offsetMin * 60000);
  return {
    date: `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:${pad(s.getUTCSeconds())}`,
  };
}

// Fixed IST (UTC+05:30, no DST) regardless of the browser's own zone, with UTC alongside.
export function ts(iso) {
  const ist = parts(iso, IST_OFFSET_MIN), utc = parts(iso, 0);
  if (!ist) return { ist: iso || '—', utc: '', full: iso || '—' };
  return {
    ist: `${ist.date}, ${ist.time} IST`,
    utc: `${utc.time} UTC${utc.date !== ist.date ? ` (${utc.date})` : ''}`,
    time: `${ist.time} IST`,
    full: `${ist.date}, ${ist.time} IST · ${utc.time} UTC`,
  };
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function shortHash(h, n = 6) {
  if (!h) return '—';
  return h.length <= n * 2 ? h : `${h.slice(0, n)}…${h.slice(-n)}`;
}

// Today as a calendar date in IST (the org's zone), 'YYYY-MM-DD'.
export function todayIST() {
  const s = new Date(Date.now() + IST_OFFSET_MIN * 60000);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function addDays(d, n) {
  const t = new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
