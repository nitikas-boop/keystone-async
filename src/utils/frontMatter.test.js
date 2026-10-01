// Run: node --test "src/**/*.test.js"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clauseInForce, decisionDoc, nextDecisionId, nextVersion, policyDoc, validateDecision, validatePolicy, yamlValue } from './frontMatter.js';
import { evidenceMarkdown } from './evidence.js';

const POLICIES = [{
  policy_id: 'POL-PROC',
  versions: [
    { version: 'v1', valid_from: '2024-01-15', valid_to: '2025-07-01',
      clauses: [{ clause_id: 'PROC-3.1', checkable: true, fields: { approver_threshold_inr: { CTO: 500000, CEO: null } } }] },
    { version: 'v2', valid_from: '2025-07-01', valid_to: null,
      clauses: [{ clause_id: 'PROC-3.1', checkable: true, fields: { approver_threshold_inr: { CTO: 200000, CEO: null } } }] },
  ],
}];

test('yaml values: dates bare, strings quoted, collections as JSON', () => {
  assert.equal(yamlValue('2025-03-14'), '2025-03-14');
  assert.equal(yamlValue('Keep: logs "raw"'), '"Keep: logs \\"raw\\""');
  assert.equal(yamlValue(['RET-2.1']), '["RET-2.1"]');
  assert.equal(yamlValue({ CTO: 200000, CEO: null }), '{"CTO":200000,"CEO":null}');
});

test('decision document matches the seed layout', () => {
  const md = decisionDoc({ id: 'DEC-012', title: 'Sign Acme contract', decidedOn: '2025-08-01', owner: 'p-karthik',
    project: 'Procurement', reliedOn: ['PROC-3.1'], effect: 'completed', fields: { amount_inr: '150000', approver_role: 'CTO' },
    reasons: 'Within the CTO ceiling.' });
  assert.match(md, /^---\ndoc_type: "decision"\ndecision_id: "DEC-012"\n/);
  assert.match(md, /\ndecided_on: 2025-08-01\n/);
  assert.match(md, /\nfields: \{"amount_inr":150000,"approver_role":"CTO"\}\n/);
  assert.match(md, /\n---\nWithin the CTO ceiling.\n$/);
  assert.doesNotMatch(md, /supersedes|source:/);
});

test('decision validation', () => {
  const ok = { id: 'DEC-012', title: 't', decidedOn: '2025-08-01', owner: 'p-karthik', reasons: 'r', reliedOn: ['PROC-3.1'],
    fields: { amount_inr: '150000', approver_role: 'CTO' } };
  assert.deepEqual(validateDecision(ok, { decisionIds: ['DEC-011'], policies: POLICIES }), []);
  assert.match(validateDecision({ ...ok, id: 'DEC-011' }, { decisionIds: ['DEC-011'], policies: POLICIES })[0], /already exists/);
  assert.match(validateDecision({ ...ok, decidedOn: '2023-01-01' }, { policies: POLICIES })[0], /No version of PROC-3.1/);
  assert.match(validateDecision({ ...ok, fields: { approver_role: 'CTO' } }, { policies: POLICIES })[0], /amount/);
  assert.equal(clauseInForce(POLICIES, 'PROC-3.1', '2025-07-01').version, 'v2');
  assert.equal(clauseInForce(POLICIES, 'PROC-3.1', '2025-06-30').version, 'v1');
});

test('policy document and validation', () => {
  const f = { policyId: 'POL-PROC', version: 'v3', title: 'Procurement Approval Policy', effectiveFrom: '2026-10-01',
    clauses: [{ clause_id: 'PROC-3.1', title: 'Approval authority', text: 'The CTO may approve up to ₹1,00,000.',
      fields: { approver_threshold_inr: { CTO: 100000, CEO: null } }, checkable: true }] };
  const md = policyDoc(f);
  assert.match(md, /\nclauses:\n  - clause_id: "PROC-3.1"\n    title: "Approval authority"\n/);
  assert.match(md, /\n    checkable: true\n---\n# Procurement Approval Policy \(v3\)/);
  assert.deepEqual(validatePolicy(f, { policies: POLICIES }), []);
  assert.match(validatePolicy({ ...f, version: 'v2' }, { policies: POLICIES })[0], /already exists/);
  assert.match(validatePolicy({ ...f, effectiveFrom: '2025-01-01' }, { policies: POLICIES })[0], /must be after 2025-07-01/);
});

test('next ids', () => {
  assert.equal(nextDecisionId(['DEC-009', 'DEC-011', 'X']), 'DEC-012');
  assert.equal(nextVersion(['v1', 'v2']), 'v3');
});

test('evidence markdown carries question, citations, compliance and audit block', () => {
  const md = evidenceMarkdown({
    answer_id: '42', question: 'Was VendorCo approved correctly?', as_of: '2025-03-14', refused: false,
    sentences: [{ text: 'Yes, under PROC-3.1 v1.', source_ids: ['DEC-004', 'PROC-3.1@v1'] }],
    citations: [{ id: 'DEC-004', title: 'Sign VendorCo', date: '2025-03-10', source_doc: 'decisions/DEC-004.md', quote: 'decided_on: 2025-03-10' }],
    compliance: [{ decision_id: 'DEC-004', decided_on: '2025-03-10', result: 'compliant', as_of: '2026-09-30', current_result: 'non_compliant',
      checks: [{ source_id: 'PROC-3.1@v1' }], current: [{ source_id: 'PROC-3.1@v2' }] }],
  }, { askedBy: 'Priya Menon (Ops Lead)', auditRow: { id: 24, ts: '2026-09-30T05:00:00Z', hash: 'a'.repeat(64) } });
  assert.match(md, /^# Keystone evidence: Was VendorCo approved correctly\?/);
  assert.match(md, /Yes, under PROC-3.1@v1. \[DEC-004\]\[PROC-3.1@v1\]/);
  assert.match(md, /> decided_on: 2025-03-10/);
  assert.match(md, /then \(10 Mar 2025\) Compliant under PROC-3.1@v1; as of 30 Sep 2026 Non-compliant under PROC-3.1@v2/);
  assert.match(md, /block 24 of Keystone's tamper-evident audit log/);
});
