// One colour, icon and label per entity type, used by the graph, legend, ID chips and tables alike.
// Icon paths are lucide's (24x24, stroke), inlined so the SVG graph can draw them without React components.
export const TYPES = {
  decision: { label: 'Decision', stroke: '#4F46E5', fill: '#EEF2FF', text: '#3730A3',
    icon: ['M12 2 2 7l10 5 10-5-10-5Z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'] },
  clause: { label: 'Clause', stroke: '#B45309', fill: '#FEF3C7', text: '#92400E',
    icon: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8'] },
  policy_version: { label: 'Policy version', stroke: '#9A3412', fill: '#FFEDD5', text: '#9A3412',
    icon: ['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'] },
  person: { label: 'Person', stroke: '#0369A1', fill: '#E0F2FE', text: '#075985',
    icon: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'] },
  project: { label: 'Project', stroke: '#047857', fill: '#D1FAE5', text: '#065F46',
    icon: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'] },
  meeting_note: { label: 'Meeting note', stroke: '#6D28D9', fill: '#EDE9FE', text: '#5B21B6',
    icon: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
  flag: { label: 'Policy impact flag', stroke: '#BE123C', fill: '#FFE4E6', text: '#9F1239',
    icon: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'] },
  proposal: { label: 'Proposal', stroke: '#0F766E', fill: '#CCFBF1', text: '#115E59',
    icon: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'] },
  document: { label: 'Document', stroke: '#475569', fill: '#F1F5F9', text: '#334155',
    icon: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'] },
};

// Best guess of an ID's type from its shape; the graph's own `type` wins when known.
export function typeOfId(id) {
  const s = String(id || '');
  if (/^#\d+$|^proposal-\d+/i.test(s)) return 'proposal';
  if (/^FLAG-/.test(s)) return 'flag';
  if (/^POL-[A-Z]+@v\d+$/.test(s)) return 'policy_version';
  if (/^[A-Z]{2,6}-\d+(\.\d+)*@v\d+$/.test(s)) return 'clause';
  if (/^MTG-\d{4}-\d{2}-\d{2}-/.test(s)) return 'decision';  // decision extracted from a meeting note
  if (/^MTG-/.test(s)) return 'meeting_note';
  if (/^DEC-/.test(s)) return 'decision';
  if (/^p-/.test(s)) return 'person';
  if (/^prj-/.test(s)) return 'project';
  return 'document';
}

export const typeMeta = (type) => TYPES[type] || TYPES.document;

// Plain-language names for the scanner's impact types (the codes stay in tooltips and the audit log).
export const IMPACT = {
  ONGOING_PRACTICE_BREACH: { label: 'Still breaching the new rule', cls: 'badge-note-rose' },
  RULE_CHANGED_SINCE: { label: 'Rule changed since', cls: 'badge-note-amber' },
  SUPERSEDED: { label: 'Replaced, historical only', cls: 'badge-note-slate' },
  MCP_PROPOSAL: { label: 'Proposed via MCP', cls: 'badge-note-sky' },
};
export const impactLabel = (code) => IMPACT[code]?.label || code;

// Human title of a /graph/view node. Labels look like 'DEC-004\n(Sign VendorCo contract …)',
// 'RET-2.1 @ v2\n(Max 180d)', 'Ananya Rao\n(CEO)', 'RULE_CHANGED_SINCE: DEC-004'.
export function nodeTitle(n) {
  const [a, b] = String(n.label || n.id).split('\n');
  const inner = b ? b.replace(/^\(|\)$/g, '') : '';
  if ((n.type === 'decision' || n.type === 'meeting_note') && inner) return inner;
  if (n.type === 'clause') return inner ? `${n.id} · ${inner}` : n.id;
  if (n.type === 'flag') {
    const m = /^([A-Z_]+):\s*(.+)$/.exec(a);
    return m ? `${impactLabel(m[1])}: ${m[2]}` : a;
  }
  if (n.type === 'person') return a;
  return a === n.id ? '' : a;
}

// Relation line styles (graph + legend): encoded by dash pattern, not colour alone.
export const RELATIONS = {
  MADE_BY: { label: 'made by', dash: '1 3', width: 1.2 },
  ABOUT: { label: 'about', dash: '', width: 1 },
  RELIED_ON: { label: 'relied on', dash: '', width: 2.2 },
  SUPERSEDES: { label: 'supersedes', dash: '7 4', width: 1.8 },
  JUSTIFIED_BY: { label: 'justified by', dash: '6 3 1 3', width: 1.2 },
  BELONGS_TO: { label: 'belongs to', dash: '2 2', width: 1 },
  AFFECTS: { label: 'flag affects', dash: '4 3', width: 1.8, danger: true },
  CAUSED_BY: { label: 'flag caused by', dash: '4 3', width: 1.8, danger: true },
  CONTRADICTED_BY: { label: 'contradicted by', dash: '4 3', width: 2, danger: true },
};
