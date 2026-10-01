// Static Nimbus Ledger graph for the landing page (no backend). People, clause versions and decisions reuse the
// IDs, titles and dates in src/home/demoGraph.js (from the seed vault); policy versions and meeting notes come
// from data/vault/policies and data/vault/meeting-notes. Reasons are short forms of each decision's `reasons`.
import { NODES as BASE } from './demoGraph';

const POLICIES = [
  { id: 'POL-RET@v1', title: 'Customer Data Retention Policy v1', date: '2024-01-15', until: '2025-01-06', clause: 'RET-2.1@v1' },
  { id: 'POL-RET@v2', title: 'Customer Data Retention Policy v2', date: '2025-01-06', until: '2026-09-28', clause: 'RET-2.1@v2' },
  { id: 'POL-RET@v3', title: 'Customer Data Retention Policy v3', date: '2026-09-28', clause: 'RET-2.1@v3' },
  { id: 'POL-PROC@v1', title: 'Procurement Approval Policy v1', date: '2024-01-15', until: '2025-07-01', clause: 'PROC-3.1@v1' },
  { id: 'POL-PROC@v2', title: 'Procurement Approval Policy v2', date: '2025-07-01', clause: 'PROC-3.1@v2' },
];

const MEETINGS = [
  { id: 'MTG-2025-05-14', title: 'Infrastructure review - cloud provider', date: '2025-05-14', attendees: ['p-vikram', 'p-ananya', 'p-rohit', 'p-divya'] },
  { id: 'MTG-2025-06-11', title: 'Customer log retention review', date: '2025-06-11', attendees: ['p-ananya', 'p-farhan', 'p-vikram', 'p-sneha'],
    about: 'RET-2.1@v2' },
  { id: 'MTG-2025-08-12', title: 'Analytics data sync', date: '2025-08-12', attendees: ['p-ananya', 'p-farhan', 'p-sneha', 'p-divya'],
    about: 'RET-2.1@v2' },
];

// Short rule text per clause version, and the decision → source meeting links from each decision's front-matter.
export const RULE = {
  'RET-2.1@v1': 'max 365 days', 'RET-2.1@v2': 'max 180 days', 'RET-2.1@v3': 'max 90 days',
  'PROC-3.1@v1': 'CTO up to ₹5,00,000', 'PROC-3.1@v2': 'CTO up to ₹2,00,000',
};
const SOURCE = { 'DEC-006': 'MTG-2025-05-14', 'DEC-007': 'MTG-2025-06-11' };
const REASON = {
  'DEC-001': 'Notes were scattered; a plain-text vault stays on our hardware',
  'DEC-002': 'Fraud disputes can surface up to ten months later',
  'DEC-003': 'One region and one provider for every environment',
  'DEC-004': 'Replaces three manual month-end spreadsheets',
  'DEC-005': 'A restore drill showed weekly snapshots lost too much',
  'DEC-006': 'Data residency and cost',
  'DEC-007': 'The longest window the policy allows, for fraud investigations',
  'DEC-008': 'Accounts outlive the people who own them',
  'DEC-009': 'Self-hosted analytics within the CTO ceiling',
  'DEC-010': 'One framework for internal services',
};

// The policy change the landing animates, with the real scanner result from data/ground-truth.json
// (flags_on_live_v3_upload): exactly two historical decisions affected.
export const POLICY_CHANGE = {
  from: 'RET-2.1@v2', to: 'RET-2.1@v3', fromPolicy: 'POL-RET@v2', toPolicy: 'POL-RET@v3', date: '2026-09-28',
  breach: 'DEC-007', superseded: 'DEC-002', affected: ['DEC-007', 'DEC-002'],
};

// The source sentence behind DEC-007 (MTG-2025-06-11), for the "Explain" lineage card.
export const DEC007_SOURCE = {
  meeting: 'MTG-2025-06-11',
  before: '',
  highlight: 'Ananya decided to reduce customer log retention to 180 days, the longest period the policy allows',
  after: ', because fraud investigations need the longest window available.',
};

const kindOf = { decision: 'decision', clause: 'clause', person: 'person' };

export const NODES = [
  ...BASE.map(n => ({
    id: n.id, kind: kindOf[n.kind], title: n.title, date: n.date, until: n.until, owner: n.owner, reliedOn: n.reliedOn,
    supersedes: n.supersedes, role: n.role, reason: REASON[n.id], rule: RULE[n.id], source: SOURCE[n.id],
  })),
  ...POLICIES.map(p => ({ ...p, kind: 'policy' })),
  ...MEETINGS.map(m => ({ ...m, kind: 'evidence' })),
];
export const NODE_INDEX = new Map(NODES.map((n, i) => [n.id, i]));
export const byId = (id) => NODES[NODE_INDEX.get(id)];

// `late`: edges that only exist once RET-2.1 v3 arrives (drawn in by the policy-change animation).
export const EDGES = [];
const add = (source, target, type, late = false) => EDGES.push({ source, target, type, late });
for (const n of NODES) {
  if (n.kind === 'decision') {
    add(n.id, n.owner, 'MADE_BY');
    if (n.reliedOn) add(n.id, n.reliedOn, 'RELIED_ON');
    if (n.supersedes) add(n.id, n.supersedes, 'SUPERSEDES');
    if (n.source) add(n.id, n.source, 'SOURCE');
  }
  if (n.kind === 'policy') add(n.id, n.clause, 'CONTAINS', n.id === POLICY_CHANGE.toPolicy);
  if (n.kind === 'clause' && n.id !== POLICY_CHANGE.to) {
    const prev = { 'RET-2.1@v2': 'RET-2.1@v1', 'PROC-3.1@v2': 'PROC-3.1@v1' }[n.id];
    if (prev) add(n.id, prev, 'PREVIOUS');
  }
  if (n.kind === 'evidence') {
    for (const p of n.attendees) add(n.id, p, 'ATTENDED');
    if (n.about) add(n.id, n.about, 'DISCUSSES');
  }
}
add(POLICY_CHANGE.to, POLICY_CHANGE.from, 'PREVIOUS', true); // the v2 → v3 link

// Lineage for the hover card: why a node exists, as a short chain.
export function lineage(id) {
  const n = byId(id);
  if (!n) return [];
  if (n.kind === 'decision') {
    const steps = [{ kind: 'decision', text: n.id, sub: n.title }, { kind: 'reason', text: 'Reason', sub: n.reason }];
    if (n.reliedOn) steps.push({ kind: 'clause', text: n.reliedOn.replace('@', ' '), sub: 'relied on' }, { kind: 'rule', text: `'${RULE[n.reliedOn]}'`, sub: 'rule in force' });
    if (n.source) steps.push({ kind: 'evidence', text: n.source, sub: byId(n.source).title });
    else steps.push({ kind: 'person', text: byId(n.owner).title, sub: `decided ${n.date}` });
    return steps;
  }
  if (n.kind === 'clause') return [{ kind: 'clause', text: n.id.replace('@', ' '), sub: `'${RULE[n.id]}'` }, { kind: 'rule', text: n.until ? `in force ${n.date} → ${n.until}` : `in force since ${n.date}`, sub: n.title }];
  if (n.kind === 'policy') return [{ kind: 'policy', text: n.id.replace('@', ' '), sub: n.title }, { kind: 'clause', text: n.clause.replace('@', ' '), sub: `'${RULE[n.clause]}'` }];
  if (n.kind === 'evidence') return [{ kind: 'evidence', text: n.id, sub: n.title }, { kind: 'person', text: `${n.attendees.length} attendees`, sub: n.date }];
  return [{ kind: 'person', text: n.title, sub: n.role }, { kind: 'rule', text: n.until ? `${n.date} → ${n.until} (left)` : `since ${n.date}`, sub: 'still the owner of every decision they made' }];
}
