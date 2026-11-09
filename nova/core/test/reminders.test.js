// Durable reminders (DST, missed, once only) and notification triage (real sources only, no replies).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { openStore } = require('../store');
const { createReminders } = require('../reminders');
const { createNotifications } = require('../notifications');
const { harness } = require('./harness');
const { createPipeline } = require('../pipeline');
const brain = require('../../brain/brain');

test('"remind me in 20 minutes" survives a restart and fires exactly once', () => {
  const store = openStore(':memory:');
  let t = Date.UTC(2026, 10, 9, 12, 0);
  const a = createReminders({ store, now: () => t });
  a.add({ text: 'stretch', inSeconds: 1200 });
  t += 1199e3; assert.deepEqual(a.due(), []);
  t += 2e3;
  const b = createReminders({ store, now: () => t });   // "restart"
  const fired = b.due();
  assert.equal(fired.length, 1); assert.equal(fired[0].late, false);
  assert.deepEqual(a.due(), [], 'never twice');
});

test('a reminder due while the PC was asleep is shown when it wakes, marked late', () => {
  const store = openStore(':memory:');
  let t = Date.UTC(2026, 10, 9, 12, 0);
  const r = createReminders({ store, now: () => t });
  r.add({ text: 'call mom', inSeconds: 60 });
  t += 3 * 3600e3;
  const f = r.due();
  assert.equal(f[0].late, true);
  assert.equal(f[0].status, 'missed');
});

test('daylight saving: a time that doesn\'t exist that day moves forward and says so (America/New_York)', () => {
  // run in a child with a real DST time zone: 2026-03-08 02:30 doesn't exist there
  const code = `const { nextLocal } = require(${JSON.stringify(path.join(__dirname, '..', 'reminders.js'))});
    const from = new Date(2026, 2, 8, 0, 30);
    const a = nextLocal({ h: 2, m: 30 }, from);
    const b = nextLocal({ h: 1, m: 30 }, new Date(2026, 10, 1, 0, 30));   // fall back: 1:30 happens twice
    console.log(JSON.stringify({ a, b, bLocal: new Date(b.due).toString() }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: 'America/New_York' } }).toString());
  assert.equal(out.a.shifted, true);
  assert.equal(out.a.wall, '03:30');
  assert.equal(out.b.shifted, false);
  assert.match(out.bLocal, /01:30:00 GMT-0400/, 'first occurrence (still daylight time)');
});

test('"remind me … ", "what reminders do I have", "cancel my reminder" through the pipeline', async () => {
  const h = harness();
  const reminders = createReminders({ store: h.store });
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async (s) => { h.pageRuns.push(s); return {}; } }, llm: null, reminders });
  await p.input({ text: 'remind me in 20 minutes to stretch' });
  assert.equal(reminders.pending().length, 1);
  assert.ok(!h.pageRuns.some(s => s.intent === 'reminder'), 'kept by the core, not a page timer');
  await p.input({ text: 'what reminders do I have' });
  assert.ok(h.replies().some(r => /stretch/.test(r)));
  await p.input({ text: 'cancel my reminder to stretch' });
  assert.equal(reminders.pending().length, 0);
});

test('triage: important first, routine grouped, duplicates merged, unavailable sources named, nothing replied (P2 #11)', async () => {
  const store = openStore(':memory:');
  const n = createNotifications({ store, important: () => ({ apps: [], contacts: ['Jordan'], topics: ['black sun'] }) });
  n.addSource('fixture-chat', { name: 'Fixture chat', available: () => ({ ok: true }), fetch: async () => [{ id: 'm1', app: 'Chat', title: 'Jordan: are we still on tonight?', at: Date.now() - 1000 }, { id: 'm2', app: 'Chat', title: 'Sam: lol', at: Date.now() - 2000 }] });
  n.push({ app: 'Nova jobs', title: 'Job done: add tests', sourceId: 'j1' });
  n.push({ app: 'Nova jobs', title: 'Job done: add tests', sourceId: 'j1' });
  n.push({ app: 'Nova jobs', title: 'Job needs you: deploy step', kind: 'blocked', sourceId: 'j2' });
  n.push({ app: 'Store', title: 'Sale on black sun merch', sourceId: 's1' });
  const d = await n.digest({ since: Date.now() - 3600e3 });
  const lines = d.text.split('\n');
  assert.equal(lines[0], 'Important:');
  assert.ok(lines.slice(1, 4).some(l => /Jordan/.test(l)) && lines.slice(1, 4).some(l => /deploy step/.test(l)) && lines.slice(1, 4).some(l => /black sun/i.test(l)));
  assert.ok(lines.some(l => /^Nova jobs: Job done: add tests$/.test(l)), 'the duplicate was merged');
  assert.ok(d.unavailable.some(u => /Windows notifications/.test(u)));
  assert.equal(typeof n.reply, 'undefined', 'there is no way to reply from here');
});
