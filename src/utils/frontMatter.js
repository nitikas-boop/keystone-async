// Builds the Markdown + YAML front-matter documents that POST /documents ingests (backend/app/ingest.py), so people
// can record a decision or a policy version from a form instead of writing YAML by hand.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Dates stay bare so YAML loads them as dates (ingest.ref_date requires a date). Every other string is JSON-quoted,
// and lists/maps are written as JSON flow collections: JSON is valid YAML, so no escaping rules to get wrong.
export function yamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return ISO.test(v) ? v : JSON.stringify(v);
  return JSON.stringify(v);
}

const empty = (v) => v === undefined || v === '' || (Array.isArray(v) && !v.length)
  || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

export function toMarkdown(fm, body = '') {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (empty(v)) continue;
    if (Array.isArray(v) && v.every(x => x && typeof x === 'object')) {  // e.g. clauses: a block list of maps
      lines.push(`${k}:`);
      for (const item of v) {
        Object.entries(item).filter(([, x]) => !empty(x) || x === '')
          .forEach(([ik, iv], i) => lines.push(`${i ? '    ' : '  - '}${ik}: ${yamlValue(iv)}`));
      }
    } else {
      lines.push(`${k}: ${yamlValue(v)}`);
    }
  }
  lines.push('---');
  return `${lines.join('\n')}\n${body.trim()}\n`;
}

// The decision fields each checkable clause field needs, mirroring RULES in backend/app/compliance.py.
export const CLAUSE_NEEDS = {
  retention_days_max: [{ key: 'retention_days', label: 'Retention (days)', kind: 'number' }],
  approver_threshold_inr: [
    { key: 'amount_inr', label: 'Amount (₹)', kind: 'number' },
    { key: 'approver_role', label: 'Approved by (role)', kind: 'role' },
  ],
};

// The version of a clause in force on a date, from GET /policies (valid_from inclusive, valid_to exclusive).
export function clauseInForce(policies, clauseId, date) {
  for (const p of policies || []) {
    for (const v of p.versions) {
      const c = v.clauses.find(x => x.clause_id === clauseId);
      if (c && v.valid_from <= date && (!v.valid_to || date < v.valid_to)) return { ...c, version: v.version };
    }
  }
  return null;
}

export function nextDecisionId(ids) {
  const n = Math.max(0, ...ids.map(id => Number(/^DEC-(\d+)$/.exec(id)?.[1] || 0)));
  return `DEC-${String(n + 1).padStart(3, '0')}`;
}

export function nextVersion(versions) {
  const n = Math.max(0, ...versions.map(v => Number(/^v(\d+)$/.exec(v)?.[1] || 0)));
  return `v${n + 1}`;
}

// ---- decisions ----

export function decisionDoc(f) {
  const fields = {};
  for (const [k, v] of Object.entries(f.fields || {})) {
    if (v === '' || v == null) continue;
    fields[k] = typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
  }
  const fm = {
    doc_type: 'decision', decision_id: f.id, title: f.title, decided_on: f.decidedOn, owner: f.owner,
    project: f.project, visibility: f.visibility || 'org', relied_on: f.reliedOn, supersedes: f.supersedes,
    source: f.source, status: 'active', effect: f.effect, fields, reasons: f.reasons,
  };
  return toMarkdown(fm, f.body || f.reasons || '');
}

export function validateDecision(f, { decisionIds = [], policies = [] } = {}) {
  const problems = [];
  if (!/^DEC-\d{3,}$/.test(f.id || '')) problems.push('Decision ID must look like DEC-012.');
  else if (decisionIds.includes(f.id)) problems.push(`${f.id} already exists; saving would replace it. Use a new ID.`);
  if (!(f.title || '').trim()) problems.push('Give the decision a title.');
  if (!ISO.test(f.decidedOn || '')) problems.push('Pick the date the decision was made.');
  if (!f.owner) problems.push('Pick who made the decision.');
  if (!(f.reasons || '').trim()) problems.push('Record the reason for the decision.');
  if (f.supersedes && !decisionIds.includes(f.supersedes)) problems.push(`${f.supersedes} is not a recorded decision.`);
  for (const cid of f.reliedOn || []) {
    const c = ISO.test(f.decidedOn || '') && clauseInForce(policies, cid, f.decidedOn);
    if (!c) { problems.push(`No version of ${cid} was in force on the decision date.`); continue; }
    for (const [ruleField, needs] of Object.entries(CLAUSE_NEEDS)) {
      if (!c.checkable || !(ruleField in (c.fields || {}))) continue;
      for (const n of needs) {
        const v = (f.fields || {})[n.key];
        if (v === undefined || v === '') problems.push(`${cid} is machine-checked: fill in ${n.label.toLowerCase()}.`);
        else if (n.kind === 'number' && !/^\d+(\.\d+)?$/.test(String(v).trim())) problems.push(`${n.label} must be a number.`);
      }
    }
  }
  return problems;
}

// ---- policy versions ----

export function policyDoc(f) {
  const clauses = f.clauses.map(c => ({
    clause_id: c.clause_id, title: c.title, text: c.text,
    fields: c.fields && Object.keys(c.fields).length ? c.fields : {}, checkable: !!c.checkable,
  }));
  const body = [`# ${f.title} (${f.version})`, '', `Effective from ${f.effectiveFrom}.${f.summary ? ` ${f.summary.trim()}` : ''}`,
    ...clauses.map(c => `\n**${c.clause_id} ${c.title}.** ${c.text}`)].join('\n');
  return toMarkdown({ doc_type: 'policy_version', policy_id: f.policyId, version: f.version, title: f.title,
    effective_from: f.effectiveFrom, clauses }, body);
}

export function validatePolicy(f, { policies = [] } = {}) {
  const problems = [];
  const p = policies.find(x => x.policy_id === f.policyId);
  if (!/^POL-[A-Z0-9-]+$/.test(f.policyId || '')) problems.push('Policy ID must look like POL-RET.');
  if (!/^v\d+$/.test(f.version || '')) problems.push('Version must look like v3.');
  else if (p?.versions.some(v => v.version === f.version)) problems.push(`${f.policyId} ${f.version} already exists.`);
  if (!(f.title || '').trim()) problems.push('Give the policy a title.');
  if (!ISO.test(f.effectiveFrom || '')) problems.push('Pick the date this version takes effect.');
  const last = p?.versions.map(v => v.valid_from).sort().pop();
  if (last && ISO.test(f.effectiveFrom || '') && f.effectiveFrom <= last) {
    problems.push(`The effective date must be after ${last}, when the latest version took effect.`);
  }
  if (!f.clauses?.length) problems.push('A policy version needs at least one clause.');
  (f.clauses || []).forEach((c, i) => {
    if (!(c.clause_id || '').trim() || !(c.text || '').trim()) problems.push(`Clause ${i + 1} needs an ID and text.`);
    for (const [k, v] of Object.entries(c.fields || {})) {
      const nums = v && typeof v === 'object' ? Object.values(v) : [v];
      if (nums.some(x => x !== null && !Number.isFinite(x)) || (k === 'retention_days_max' && v == null)) {
        problems.push(`${c.clause_id || `Clause ${i + 1}`}: ${k} must be a number.`);
      }
    }
  });
  return problems;
}
