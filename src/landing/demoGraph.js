// Static demo graph for the landing intro: works with no backend. IDs, titles and dates come from the seed vault
// (data/vault/people.yaml, decisions/DEC-*.md, policies/POL-*.md); clause versions use the app's "RET-2.1@v2" form.
// `date` is when a node enters the timeline; `until` is when it is superseded, expires or (for people) leaves.

const people = [
  { id: 'p-ananya', title: 'Ananya Rao', role: 'CEO', date: '2024-01-01' },
  { id: 'p-vikram', title: 'Vikram Shah', role: 'CTO', date: '2024-01-01', until: '2025-08-31' },
  { id: 'p-karthik', title: 'Karthik Rao', role: 'CTO', date: '2025-09-15' },
  { id: 'p-priya', title: 'Priya Menon', role: 'Ops Lead', date: '2026-05-01' },
  { id: 'p-farhan', title: 'Farhan Qureshi', role: 'Compliance', date: '2024-03-01' },
  { id: 'p-divya', title: 'Divya Nair', role: 'Engineer', date: '2024-02-01' },
  { id: 'p-rohit', title: 'Rohit Kulkarni', role: 'Engineer', date: '2024-06-01' },
  { id: 'p-sneha', title: 'Sneha Iyer', role: 'Analyst', date: '2024-09-01' },
].map(p => ({ ...p, kind: 'person' }));

const clauses = [
  { id: 'RET-2.1@v1', title: 'Customer log retention: max 365 days', date: '2024-01-15', until: '2025-01-06' },
  { id: 'RET-2.1@v2', title: 'Customer log retention: max 180 days', date: '2025-01-06', until: '2026-09-28', prev: 'RET-2.1@v1' },
  { id: 'RET-2.1@v3', title: 'Customer log retention: max 90 days', date: '2026-09-28', prev: 'RET-2.1@v2' },
  { id: 'PROC-3.1@v1', title: 'Purchase approval: CTO up to ₹5,00,000', date: '2024-01-15', until: '2025-07-01' },
  { id: 'PROC-3.1@v2', title: 'Purchase approval: CTO up to ₹2,00,000', date: '2025-07-01', prev: 'PROC-3.1@v1' },
].map(c => ({ ...c, kind: 'clause' }));

const decisions = [
  { id: 'DEC-001', title: 'Adopt an Obsidian vault for internal notes', date: '2024-03-12', owner: 'p-vikram' },
  { id: 'DEC-002', title: 'Retain customer logs for 300 days', date: '2024-07-22', owner: 'p-ananya', reliedOn: 'RET-2.1@v1', until: '2025-06-18' },
  { id: 'DEC-003', title: 'Standardise on AWS Mumbai', date: '2024-11-05', owner: 'p-vikram', until: '2025-05-20' },
  { id: 'DEC-004', title: 'Sign VendorCo contract for ₹4,00,000', date: '2025-03-14', owner: 'p-vikram', reliedOn: 'PROC-3.1@v1' },
  { id: 'DEC-005', title: 'Nightly encrypted backups', date: '2025-04-02', owner: 'p-divya' },
  { id: 'DEC-006', title: 'Move from AWS to an India-hosted cloud provider', date: '2025-05-20', owner: 'p-vikram', supersedes: 'DEC-003' },
  { id: 'DEC-007', title: 'Reduce customer log retention to 180 days', date: '2025-06-18', owner: 'p-ananya', reliedOn: 'RET-2.1@v2', supersedes: 'DEC-002' },
  { id: 'DEC-008', title: 'Quarterly access reviews', date: '2025-09-09', owner: 'p-farhan' },
  { id: 'DEC-009', title: 'Approve analytics tool for ₹1,80,000', date: '2025-11-25', owner: 'p-karthik', reliedOn: 'PROC-3.1@v2' },
  { id: 'DEC-010', title: 'Standardise internal services on FastAPI', date: '2026-02-10', owner: 'p-divya' },
].map(d => ({ ...d, kind: 'decision' }));

export const NODES = [...people, ...clauses, ...decisions];
export const NODE_INDEX = new Map(NODES.map((n, i) => [n.id, i]));
export const PEOPLE_BY_ID = new Map(people.map(p => [p.id, p]));

// The clause that flags DEC-007 the day it takes effect, and the rule it breaches.
export const BREACH = { clause: 'RET-2.1@v3', decision: 'DEC-007', date: '2026-09-28' };

export const EDGES = [
  ...decisions.map(d => ({ source: d.id, target: d.owner, type: 'MADE_BY' })),
  ...decisions.filter(d => d.reliedOn).map(d => ({ source: d.id, target: d.reliedOn, type: 'RELIED_ON' })),
  ...decisions.filter(d => d.supersedes).map(d => ({ source: d.id, target: d.supersedes, type: 'SUPERSEDES' })),
  ...clauses.filter(c => c.prev).map(c => ({ source: c.id, target: c.prev, type: 'PREVIOUS_VERSION' })),
  // Drawn only once the breach is reached: the red ripple runs from the new clause to the decision.
  { source: BREACH.clause, target: BREACH.decision, type: 'FLAGS' },
];

export const DAY_MS = 86400000;
export const toDay = (iso) => Date.parse(iso + 'T00:00:00Z') / DAY_MS;
export const fromDay = (d) => new Date(d * DAY_MS).toISOString().slice(0, 10);

// Numeric days, precomputed so the render loop never parses dates.
export const NODE_DAYS = NODES.map(n => ({ from: toDay(n.date), until: n.until ? toDay(n.until) : Infinity }));

export function describeNode(n) {
  if (n.kind === 'person') {
    const span = n.until ? `${n.date} → ${n.until} (left)` : `since ${n.date}`;
    return { id: n.id, title: n.title, date: span, owner: n.role };
  }
  const owner = n.owner ? PEOPLE_BY_ID.get(n.owner)?.title : null;
  const date = n.until ? `${n.date} (${n.kind === 'clause' ? 'expired' : 'superseded'} ${n.until})` : n.date;
  return { id: n.id, title: n.title, date, owner: owner || (n.kind === 'clause' ? 'Policy clause' : '') };
}
