// Drives the Keystone demo end to end and records it (Playwright video, silent). Logs a timestamp per scene;
// hold(n) keeps each scene on screen for n seconds so docs/DEMO-SCRIPT.md can be read over it.
// Changes the demo data (uploads RET-2.1 v3, approves the proposal): snapshot first, restore after.
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/record-demo.mjs demo-recording        (frontend on :5173, or set DEMO_URL)
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.DEMO_URL || 'http://localhost:5173';
const W = 1536, H = 864;
const OUT = process.argv[2] || 'video';
const t0 = Date.now();
const marks = [];
let sceneStart = Date.now();
const hold = async (sec) => { const left = sceneStart + sec * 1000 - Date.now(); if (left > 0) await page.waitForTimeout(left); };
const mark = (label) => { sceneStart = Date.now(); const s = (Date.now() - t0) / 1000; marks.push({ s, label }); console.log(`${s.toFixed(1).padStart(6)}s  ${label}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
// Visible cursor + scene caption (headless video has no cursor).
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(2,132,199,.35);border:2px solid #0284C7;pointer-events:none;transition:transform .1s;left:-50px;top:-50px';
    document.body.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.7)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
    const cap = document.createElement('div');
    cap.id = '__cap';
    cap.style.cssText = 'position:fixed;z-index:99998;left:50%;bottom:14px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(11,20,55,.88);color:#fff;font:600 13px system-ui;pointer-events:none;opacity:0;transition:opacity .3s';
    document.body.appendChild(cap);
  });
});
const page = await ctx.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate(t => { const c = document.getElementById('__cap'); if (c) { c.textContent = t; c.style.opacity = t ? '1' : '0'; } }, text);
async function click(locator, wait = 900) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
  await pause(250);
  await el.click();
  await pause(wait);
}
const header = (name) => page.locator('header button', { hasText: name });
async function waitAnswer() {
  await page.getByText('Keystone Pipeline Running...').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await page.getByText('Keystone Pipeline Running...').waitFor({ state: 'detached', timeout: 240000 });
  await pause(2500);
}
async function ask(chip, label) {
  mark(label);
  await caption(label);
  await click(page.locator('button', { hasText: chip }), 300);
  await waitAnswer();
}
async function wheel(dy, n) { for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await pause(120); } }

// 1. Landing page
await page.goto(URL);
await page.mouse.move(W / 2, H / 2);
await pause(1500);
mark('Landing page'); await caption('Keystone: sovereign decision memory');
await pause(3500);
await wheel(120, 45); await pause(1500);
await wheel(-400, 20); await pause(1000);

// 2. Sign in (pre-authenticated role)
await hold(28); mark('Enter workspace (role picker)'); await caption('Enter the workspace as a pre-authenticated role');
await click(page.getByRole('button', { name: /Sign In \/ Launch Console/ }), 1500);
await click(page.locator('button', { hasText: 'Priya Menon' }), 2500);

// 3. Unified workspace + questions
await hold(6); mark('Unified Workspace overview'); await caption('Unified Workspace: chat, temporal graph and review queue in one view');
await pause(4000);
await hold(20); await ask('Project Atlas History', 'Q1  Show the history of Project Atlas');
await hold(24); mark('Click a citation, graph inspector'); await caption('Every sentence cites a graph node; click to inspect');
await click(page.locator('.citation-pill-paper').last(), 3500);
await hold(14); await ask('Why We Left AWS', 'Q2  Why did we move off AWS in May 2025?');
await hold(18); await ask('VendorCo Contract', 'Q3  Was the ₹4 lakh VendorCo contract approved correctly?');

// 4. Temporal graph + time travel
await hold(32); mark('Temporal Graph view'); await caption('Temporal Graph: chat beside the graph, timeline on top');
await click(header('Temporal Graph'), 2500);
await hold(12); await ask('180-Day Retention', 'Q4  Was 180-day log retention compliant in Q2 2025?');
await hold(14); mark('Time travel: Jan 2024'); await caption('Drag the timeline: the graph shows what was in force on that date');
await click(page.getByRole('button', { name: /Jan 2024/ }), 3500);
await hold(7); mark('Time travel: Jan 2025'); await click(page.getByRole('button', { name: /Jan 2025/ }), 3000);
await hold(6); mark('Time travel: Jul 2025'); await click(page.getByRole('button', { name: /Jul 2025/ }), 3000);
await hold(6); mark('Time travel: Today'); await click(page.getByRole('button', { name: /^Today/ }), 3000);

// 5. Ingest a new policy version: impact scanner
await hold(6); mark('Ingest RET-2.1 v3'); await caption('A policy changes: ingest RET-2.1 v3 (90-day ceiling)');
await click(header('Ingest Document'), 1500);
await click(page.locator('button', { hasText: 'Policy RET-2.1 v3' }), 2500);
await hold(12); await click(page.getByRole('button', { name: /Upload & Run Scanner/ }), 500);
await page.getByText('Impact Scanner Findings').waitFor({ timeout: 300000 });
mark('Scanner flags DEC-007'); await caption('Impact scanner flags DEC-007 and queues a proposal');
await hold(20);
await click(page.getByRole('button', { name: /Proceed to Review Queue/ }), 2500);

// 6. Human-in-the-loop approval
await hold(20); mark('Review Queue: approve'); await caption('Nothing executes without a human: approve the proposal');
await pause(2500);
const row = page.locator('tr', { hasText: 'DEC-007' }).filter({ has: page.getByRole('button', { name: /Approve/ }) });
await click(row.getByRole('button', { name: /Approve/ }), 6000);
await hold(14); mark('Executor ran'); await caption('The executor picks up the approved action (writes outbox/proposal-N.eml)');
await pause(3000);

// 7. Ingestion review
await hold(12); mark('Ingestion Review'); await caption('Ingestion Review: extracted facts with their source sentence');
await click(header('Ingestion Review'), 5000);

// 8. Audit trail
await hold(14); mark('Audit Trail: verify chain'); await caption('Tamper-evident audit log: verify the SHA-256 hash chain');
await click(header('Audit Trail'), 2500);
await click(page.getByRole('button', { name: /Verify Full Chain/ }), 5000);

// 9. Refusal
await hold(20); await click(header('Unified Workspace'), 1500);
await ask('Trick Query', 'Q5  Why did we choose MongoDB? (not in the record)');
await caption('No evidence, no answer: Keystone refuses instead of guessing');

// 10. Home
await hold(16); mark('Home'); await caption('');
await click(page.getByRole('button', { name: 'Home' }), 3000);
await hold(16); mark('End');

const video = page.video();
await ctx.close();
await browser.close();
const path = await video.path();
fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2));
console.log('VIDEO', path);
