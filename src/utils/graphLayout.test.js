import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from './graphLayout.js';

const nodes = [
  { id: 'DEC-001', type: 'decision', date: '2024-02-01' },
  { id: 'DEC-002', type: 'decision', date: '2024-02-03' },
  { id: 'DEC-003', type: 'decision', date: '2025-05-20' },
  { id: 'RET-2.1@v1', type: 'clause', date: '2024-01-15' },
  { id: 'RET-2.1@v2', type: 'clause', date: '2025-01-06' },
  { id: 'p-ananya', type: 'person', date: '2024-01-01' },
  { id: 'Project Atlas', type: 'project', date: null },
];

test('deterministic regardless of input order', () => {
  const a = layout(nodes, { today: '2026-09-29' });
  const b = layout([...nodes].reverse(), { today: '2026-09-29' });
  assert.deepEqual(a.pos, b.pos);
});

test('x is proportional to date', () => {
  const { pos } = layout(nodes, { today: '2026-09-29' });
  assert.ok(pos['DEC-001'].x < pos['DEC-003'].x);
  assert.ok(pos['RET-2.1@v1'].x < pos['RET-2.1@v2'].x);
});

test('no two nodes overlap and lanes do not interleave', () => {
  const { pos } = layout(nodes, { today: '2026-09-29' });
  const pts = Object.values(pos);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 40, `overlap ${i} ${j}`);
    }
  }
  assert.ok(pos['RET-2.1@v1'].y < pos['DEC-001'].y && pos['DEC-001'].y < pos['p-ananya'].y);
});

test('close dates stack into sub-rows instead of overlapping', () => {
  const { pos } = layout(nodes, { today: '2026-09-29' });
  assert.notEqual(pos['DEC-001'].y, pos['DEC-002'].y);
});
