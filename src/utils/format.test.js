// Run: node --test "src/**/*.test.js"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { day, fixClauseRefs, fixIsoDates, fixRupees, inr, polish, ts } from './format.js';

test('inr uses Indian grouping', () => {
  assert.equal(inr(400000), '₹4,00,000');
  assert.equal(inr(200000), '₹2,00,000');
  assert.equal(inr(10000000), '₹1,00,00,000');
  assert.equal(inr(null), '—');
});

test('fixRupees rewrites only ₹-prefixed numbers', () => {
  assert.equal(fixRupees('lowered from ₹500,000 to ₹200,000.'), 'lowered from ₹5,00,000 to ₹2,00,000.');
  assert.equal(fixRupees('₹4,00,000 stays'), '₹4,00,000 stays');
  assert.equal(fixRupees('the ₹4 lakh contract'), 'the ₹4,00,000 contract');
  assert.equal(fixRupees('Limit ₹5L, now ₹2L)'), 'Limit ₹5,00,000, now ₹2,00,000)');
  assert.equal(fixRupees('₹1.5L'), '₹1,50,000');
  assert.equal(fixRupees('₹1 Cr'), '₹1,00,00,000');
  assert.equal(fixRupees('₹200000'), '₹2,00,000');
  assert.equal(fixRupees('500,000 and 180 days, no rupee sign'), '500,000 and 180 days, no rupee sign');
  assert.equal(fixRupees('₹5 limit'), '₹5 limit');
  assert.equal(fixRupees(null), null);
});

test('fixClauseRefs normalises clause versions', () => {
  assert.equal(fixClauseRefs('PROC-3.1 v1 and RET-2.1 @ v2 and RET-2.1-v3'), 'PROC-3.1@v1 and RET-2.1@v2 and RET-2.1@v3');
  assert.equal(fixClauseRefs('[PROC-3.1@v2] unchanged'), '[PROC-3.1@v2] unchanged');
  assert.equal(fixClauseRefs('POL-RET v1 and DEC-004'), 'POL-RET v1 and DEC-004');
});

test('fixIsoDates rewrites prose dates but not IDs', () => {
  assert.equal(fixIsoDates('decided 2025-03-14, as of 2026-09-30.'), 'decided 14 Mar 2025, as of 30 Sep 2026.');
  assert.equal(fixIsoDates('cites MTG-2025-05-14 and DEC-004'), 'cites MTG-2025-05-14 and DEC-004');
  assert.equal(fixIsoDates('[MTG-2025-08-12-DEC-008]'), '[MTG-2025-08-12-DEC-008]');
});

test('polish applies both', () => {
  assert.equal(polish('PROC-3.1 v2 caps the CTO at ₹200,000'), 'PROC-3.1@v2 caps the CTO at ₹2,00,000');
});

test('ts shows IST with UTC alongside, independent of the browser zone', () => {
  const t = ts('2026-09-28T08:41:44.466860+00:00');
  assert.equal(t.ist, '28 Sep 2026, 14:11:44 IST');
  assert.equal(t.utc, '08:41:44 UTC');
  assert.equal(ts('2026-09-28T20:00:00+00:00').utc, '20:00:00 UTC (28 Sep 2026)');
});

test('day formats calendar dates without zone shifts', () => {
  assert.equal(day('2025-06-11'), '11 Jun 2025');
  assert.equal(day(null), '—');
});
