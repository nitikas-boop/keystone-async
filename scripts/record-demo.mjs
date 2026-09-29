// Drives the Keystone demo end to end and records it (Playwright video, silent). Logs a timestamp per scene;
// hold(n) keeps each scene on screen for n seconds so docs/DEMO-SCRIPT.md can be read over it.
// Changes the demo data (uploads RET-2.1 v3, approves the proposal): snapshot first, restore after.
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/record-demo.mjs demo-recording        (frontend on :5173, or set DEMO_URL)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.DEMO_URL || 'http://localhost:5173';
const W = 1536, H = 864;
const OUT = process.argv[2] || 'video';
const t0 = Date.now();
const marks = [];
let sceneStart = Date.now();
const hold = async (sec) => { const left = sceneStart + sec * 1000 - Date.now(); if (left > 0) await page.waitForTimeout(left); };
const mark = (label) => { sceneStart = Date.now(); const s = (Date.now() - t0) / 1000; marks.push({ s, label }); console.log(`${s.toFixed(1).padStart(6)}s  ${label}`); };

// Fake microphone: the voice question is a TTS recording played into getUserMedia, then transcribed by the
// backend's local Whisper exactly as a real microphone would be.
const VOICE = resolve('data/demo-upload/voice-question.wav');  // run from the repo root
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${VOICE}%noloop`] });
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
// View tabs carry their full name in `title` (the visible label is shortened on narrow screens).
const header = (name) => page.locator(`header nav button[title="${name}"]`).or(page.locator('header button', { hasText: name }));
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
await click(page.locator('.kst-citation').last(), 3500);
await hold(14); await ask('Why We Left AWS', 'Q2  Why did we move off AWS in May 2025?');
await hold(18); mark('Q3 by voice: VendorCo contract'); await caption('Q3 by voice: transcribed on this machine by local Whisper, then the same /ask pipeline');
await click(page.getByTestId('mic-button'), 5500);
await click(page.getByTestId('mic-button'), 300);
await waitAnswer();
await hold(22); mark('Visibility filter'); await caption('Visibility filter: DEC-008 is restricted, so it never reaches Priya’s retrieval');
await click(page.locator('textarea'), 200);
await page.keyboard.type('Why do we run quarterly access reviews?', { delay: 35 });
await page.keyboard.press('Enter');
await waitAnswer();

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
// Review Queue is a list + detail: open the DEC-007 proposal, then approve it in the detail pane.
await click(page.locator('ul[aria-label="Proposals"] button', { hasText: 'DEC-007' }), 2500);
await click(page.getByRole('button', { name: /^Approve/ }), 6000);
await hold(14); mark('Executor ran'); await caption('The executor picks up the approved action (writes outbox/proposal-N.eml)');
await pause(3000);

// 7. Ingestion review
await hold(12); mark('Meeting audio ingest'); await caption('Meeting audio in: transcribed locally, ingested as an ordinary meeting note');
await click(header('Ingest Document'), 1500);
await page.locator('input[type=file]').setInputFiles('data/demo-upload/meeting-2026-09-28.wav');
await page.locator('pre', { hasText: 'Transcript:' }).waitFor({ timeout: 120000 });
await pause(4000);
await hold(12); await click(page.getByRole('button', { name: /Upload & Run Scanner/ }), 500);
await page.getByText(/now wait in Ingestion Review|Extraction failed/).waitFor({ timeout: 300000 });
await pause(3000);
await click(page.locator('.paper-sheet-elevated > button').first(), 1500);
await hold(10); mark('Ingestion Review'); await caption('Ingestion Review: the Keycloak decision extracted from the audio waits for a human');
await click(header('Ingestion Review'), 5000);
await page.mouse.move(W / 2, H / 2, { steps: 15 }); await wheel(200, 15); await pause(3000);

// 8. Audit trail
await hold(14); mark('Audit Trail: verify chain'); await caption('Tamper-evident audit log: verified in the browser and by GET /audit/verify on the server');
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
