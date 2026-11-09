// Games: policy, and the controller playing the REAL local fixture game in a real
// browser (Chromium via Playwright): it sees the frame, holds keys, and the game's
// own counter is the evidence. Roblox is only ever opened through its official link.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createController, createGames, policy, PROFILES, playwrightAdapter } = require('../games');
const { openStore } = require('../store');
const { harness } = require('./harness');
const { createPipeline } = require('../pipeline');
const brain = require('../../brain/brain');

const FIXTURE = 'file://' + path.resolve(__dirname, '../../games/fixture/index.html');
let chromium = null;
try { chromium = require('playwright').chromium; } catch {}
const browserTest = chromium ? test : test.skip;
const results = [];
const REPORT = path.resolve(__dirname, '../../games/fixture/results.json');

async function game(seed = 7) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
  await page.goto(`${FIXTURE}?seed=${seed}`);
  await page.waitForFunction(() => /State: playing/.test(document.getElementById('hud').textContent));
  await page.bringToFront();
  return { browser, page, adapter: playwrightAdapter(page) };
}

test('prohibited automation is refused, whatever the game (test 39)', () => {
  for (const t of ['use an executor to inject a script in roblox', 'make an anti-afk so I don\'t get kicked', 'read the game memory for the coin count', 'run an aimbot', 'dupe items in my game', 'edit and publish black sun', 'tamper with the game packets'])
    assert.equal(policy(t).ok, false, t);
  assert.equal(policy('collect the coins in the test game').ok, true);
});

browserTest('the controller completes the fixture from what it sees (tests 36, 37)', async () => {
  const g = await game(7);
  try {
    const ctl = createController({ adapter: g.adapter, profile: PROFILES['nova-fixture'] });
    const res = await ctl.run({ maxMs: 60000 });
    results.push({ case: 'complete seed 7', ...res, evidence: res.evidence.length });
    assert.equal(res.status, 'completed', res.reason);
    assert.match(await g.page.textContent('#hud'), /Coins: 5\/5/);
    assert.equal(res.stats.falls, 0, 'safe paths avoid the pit');
    assert.deepEqual(g.adapter.held(), [], 'no key left held');
  } finally { await g.browser.close(); }
});

browserTest('after falling in the pit it recovers and finishes (failure/recovery case)', async () => {
  const g = await game(7);
  try {
    const ctl = createController({ adapter: g.adapter, profile: PROFILES['nova-fixture'] });
    let n = 0;
    // a gust shoves her into the pit mid-run: the failure she has to notice and recover from
    const res = await ctl.run({ maxMs: 60000, onStep: () => { if (++n === 4) g.page.evaluate(() => window.fixtureGust()); } });
    results.push({ case: 'recover', ...res, evidence: res.evidence.length });
    assert.equal(res.status, 'completed', res.reason);
    assert.equal(res.stats.falls, 1, 'the fall was noticed');
    assert.match(await g.page.textContent('#hud'), /Lives: 2/);
  } finally { await g.browser.close(); }
});

browserTest('losing focus pauses and lets go of the keys (test 38)', async () => {
  const g = await game(11);
  try {
    const ctl = createController({ adapter: g.adapter, profile: PROFILES['nova-fixture'] });
    let n = 0;
    const res = await ctl.run({ maxMs: 30000, onStep: () => { if (++n === 3) g.page.evaluate(() => window.fixturePause(true)); } });
    results.push({ case: 'blur', ...res, evidence: res.evidence.length });
    assert.equal(res.status, 'paused');
    assert.match(res.reason, /lost focus/);
    assert.deepEqual(g.adapter.held(), []);
  } finally { await g.browser.close(); }
});

browserTest('Stop mid-hold releases the key at once', async () => {
  const g = await game(3);
  try {
    const ctl = createController({ adapter: g.adapter, profile: PROFILES['nova-fixture'] });
    const ac = new AbortController();
    let stoppedAt = 0;
    const p = ctl.run({ signal: ac.signal, maxMs: 30000, onStep: () => {} });
    await new Promise(r => setTimeout(r, 900));
    stoppedAt = Date.now(); ac.abort();
    const res = await p;
    const releaseMs = Date.now() - stoppedAt;
    results.push({ case: 'stop', status: res.status, releaseMs });
    assert.equal(res.status, 'stopped');
    assert.deepEqual(g.adapter.held(), []);
    assert.ok(releaseMs < 250, `released in ${releaseMs} ms`);
    // and the player really stopped moving
    const a = await g.page.screenshot(); await g.page.waitForTimeout(200); const b = await g.page.screenshot();
    assert.ok(a.equals(b), 'frame unchanged after stop');
  } finally { await g.browser.close(); }
});

browserTest('your own input takes over: the controller pauses (test 38)', async () => {
  const g = await game(7);
  try {
    let touched = false;
    const guard = { check: () => touched ? { ok: false, reason: 'You took over the keyboard, so I paused.' } : { ok: true } };
    const ctl = createController({ adapter: g.adapter, profile: PROFILES['nova-fixture'], guard });
    let n = 0;
    const res = await ctl.run({ maxMs: 30000, onStep: () => { if (++n === 2) touched = true; } });
    assert.equal(res.status, 'paused');
    assert.match(res.reason, /took over/);
  } finally { await g.browser.close(); }
});

test('Roblox: official link only, no playing; unknown experience is never guessed', async () => {
  const launched = [];
  const store = openStore(':memory:');
  const games = createGames({ store, launch: async (u) => launched.push(u) });
  const h = harness();
  const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, games });
  await pipeline.input({ text: 'Nova, join my roblox game' });
  assert.ok(h.replies().some(r => /Send me the experience's link/.test(r)));
  assert.equal(launched.length, 0);
  await pipeline.input({ text: 'join this roblox game https://www.roblox.com/games/1234567/some-obby' });
  assert.deepEqual(launched, ['https://www.roblox.com/games/1234567']);
  await pipeline.input({ text: 'play roblox for me and grind the quests' });
  assert.ok(h.replies().some(r => /won't play or press keys for you there/.test(r)));
  await pipeline.input({ text: 'use an executor in roblox' });
  assert.ok(h.replies().some(r => /I won't do that: it uses an exploit/.test(r)));
  assert.equal(launched.length, 1);
});

browserTest('"play the test game" goes through one game approval, then plays (pipeline)', async () => {
  const g = await game(7);
  try {
    const h = harness();
    const games = createGames({ store: h.store, log: h.log, sessions: { has: (id) => id === 'nova-fixture', open: async () => g.adapter } });
    const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, games });
    await pipeline.input({ text: 'Nova, play the test game for 1 minute' });
    const card = h.events.find(e => e.type === 'approve');
    assert.match(card.title, /Let Nova play Nova coin fixture/);
    assert.ok(card.categories.includes('game'));
    assert.ok(h.replies().some(r => /^Done\. Collected 5\/5 coins/.test(r)), h.replies().join(' | '));
  } finally { await g.browser.close(); }
});

test.after(() => { if (results.length) fs.writeFileSync(REPORT, JSON.stringify({ ran: new Date().toISOString(), browser: 'Chromium (Playwright, headless)', results }, null, 2) + '\n'); });
