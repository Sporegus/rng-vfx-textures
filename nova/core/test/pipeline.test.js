// The request pipeline, end to end with fixtures (see harness.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness');
const llm = require('../llm');
const { sleep } = require('../util');

test('typed and voice commands go through the same pipeline and verify the app (tests 1, 6-fixture)', async () => {
  const h = harness();
  const a = await h.pipeline.input({ text: 'open discord', source: 'typed' });
  const b = await h.pipeline.input({ text: 'Nova, open spotify', source: 'voice', utteranceId: 'u1' });
  assert.equal(a.task.state, 'completed');
  assert.equal(b.task.state, 'completed');
  assert.ok(h.running.has('Discord') && h.running.has('Spotify'));
  assert.ok(h.replies().some(r => /Opened Discord/.test(r)));
  assert.ok(h.log.recent(200).some(e => e.type === 'tool.result' && e.verified === true));
});

test('silence and noise do nothing (test 2)', async () => {
  const h = harness();
  assert.deepEqual(await h.pipeline.input({ text: '   ', source: 'voice', utteranceId: 's1' }), { ignored: true });
  assert.equal(h.running.size, 0);
});

test('partial transcripts never act; a final one acts exactly once (test 3)', async () => {
  const h = harness();
  assert.ok((await h.pipeline.input({ text: 'open disc', source: 'voice', final: false })).partial);
  await h.pipeline.input({ text: 'open discord', source: 'voice', utteranceId: 'u9' });
  const again = await h.pipeline.input({ text: 'open discord', source: 'voice', utteranceId: 'u9' });
  assert.ok(again.duplicate);
  assert.equal(h.log.recent(500).filter(e => e.type === 'tool.result').length, 1);
});

test('an app that is not installed gets a helpful answer (test 7)', async () => {
  const h = harness({ installed: ['Notepad'] });
  const r = await h.pipeline.input({ text: 'open photoshop' });
  assert.equal(r.task.state, 'completed');
  assert.ok(h.replies().some(x => /couldn't find an app called "photoshop"/i.test(x)));
});

test('an uncertain app name asks instead of guessing; the correction is used (test 5)', async () => {
  const h = harness({ installed: ['Spotify', 'Steam'], chooseWith: (q) => q.options.find(o => o.value === 'Spotify').value });
  await h.pipeline.input({ text: 'open spotifi', source: 'voice', utteranceId: 'm1' });
  const q = h.events.find(e => e.type === 'choose');
  assert.ok(q && /Did you mean/.test(q.question));
  assert.ok(h.running.has('Spotify') && !h.running.has('Steam'));
});

test('"open Discord, actually Spotify" opens only Spotify (test 8)', async () => {
  const h = harness();
  await h.pipeline.input({ text: 'open discord, actually spotify' });
  assert.ok(h.running.has('Spotify'));
  assert.ok(!h.running.has('Discord'));
});

test('"No, Spotify" replaces a pending request and cancels it (test 8)', async () => {
  // Discord's launch waits on an approval that never comes; the correction cancels it
  let release;
  const h = harness({ approveWith: () => new Promise(r => { release = r; }) });
  const first = h.pipeline.input({ text: 'close discord' });      // asks first (risk: ask)
  await sleep(20);
  assert.ok(h.events.some(e => e.type === 'approve'));
  await h.pipeline.input({ text: 'no, open spotify' });
  const r1 = await first;
  assert.equal(r1.task.state, 'cancelled');
  assert.ok(h.running.has('Spotify'));
  assert.equal(h.pageRuns.length, 0, 'the cancelled close never ran');
});

test('stop works while the model is thinking (test 12)', async () => {
  const slow = llm.mock(['Paris is the capital.'], { delayMs: 2000 });
  const h = harness({ llm: slow });
  const p = h.pipeline.input({ text: 'what is the capital of france' });
  await sleep(50);
  const t0 = Date.now();
  await h.pipeline.input({ text: 'stop', source: 'voice', utteranceId: 'stop1' });
  const r = await p;
  assert.equal(r.task.state, 'cancelled');
  assert.ok(Date.now() - t0 < 250, 'stop took ' + (Date.now() - t0) + ' ms');
  assert.ok(!h.replies().includes('Paris is the capital.'));
});

test('stop works while waiting on approval and during a multi-step page task (tests 12, 13)', async () => {
  let runs = 0;
  const page = { run: async (step, signal) => { runs++; await sleep(300, signal); return { ok: true }; } };
  const h = harness({ page });
  const p = h.pipeline.input({ text: 'open chrome and look up hollow knight' });
  await sleep(80);
  h.pipeline.stopAll('test');
  const r = await p;
  assert.equal(r.task.state, 'cancelled');
  await sleep(400);
  assert.ok(runs <= 1, 'no further steps ran after stop');
});

test('questions are answered by the model and stream (not googled)', async () => {
  const h = harness({ llm: llm.mock(['Paris.']) });
  await h.pipeline.input({ text: 'what is the capital of france' });
  assert.ok(h.replies().includes('Paris.'));
  assert.equal(h.pageRuns.length, 0);
  assert.ok(h.events.some(e => e.type === 'reply' && e.partial));
});

test('without a chat brain, a question is not faked: she says so and offers a search', async () => {
  const h = harness({ chooseWith: () => 'no' });
  await h.pipeline.input({ text: 'what is the capital of france' });
  assert.ok(h.events.some(e => e.type === 'choose' && /chat brain/i.test(e.question)));
});

test('provider timeout / missing key do not freeze: the task fails cleanly (test 18)', async () => {
  const hang = { name: 'hang', model: 'x', available: () => ({ ok: true }), chat: ({ signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))) };
  const h = harness();
  const { createPipeline } = require('../pipeline');
  const brain = require('../../brain/brain');
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) },
    llm: llm.chooser({ hang: { ...hang, chat: (req) => require('../util').withTimeout(100, req.signal, (s) => hang.chat({ ...req, signal: s })) } }, ['hang']) });
  const r = await p.input({ text: 'what is the meaning of life' });
  assert.equal(r.task.state, 'failed');
  assert.equal(r.error, 'timeout');
  const anthropic = llm.anthropic({ key: () => null });
  assert.equal(anthropic.available().ok, false);
});

test('a model plan that tries something risky still needs your approval (tests 16, 33)', async () => {
  // the model was fooled by screen text into proposing to delete files: the permission layer stops it
  const fooled = llm.mock([JSON.stringify({ say: 'Sure!', steps: [{ tool: 'files.wipe', args: { path: 'C:/Users' } }] })]);
  const h = harness({ llm: fooled, approveWith: () => ({ allow: false }) });
  let wiped = false;
  h.tools.register({ name: 'files.wipe', purpose: 'Delete files', category: 'files_delete', effect: 'local', args: { type: 'object', properties: { path: { type: 'string' } } }, run: async () => { wiped = true; } });
  const r = await h.pipeline.input({ text: 'blorp the zibble' });
  assert.equal(wiped, false);
  assert.equal(r.error, 'denied');
  assert.ok(h.events.some(e => e.type === 'approve' && e.categories.includes('files_delete')));
});

test('a model cannot name a tool that does not exist or pass bad args', async () => {
  const h = harness({ llm: llm.mock([JSON.stringify({ steps: [{ tool: 'shell.exec', args: { cmd: 'format c:' } }] })]) });
  const r = await h.pipeline.input({ text: 'do the thing' });
  assert.equal(r.error, 'invalid');
});

test('risky page actions show one approval card; deny means nothing runs', async () => {
  const h = harness({ approveWith: () => ({ allow: false }) });
  const r = await h.pipeline.input({ text: 'organize my downloads' });
  assert.equal(r.error, 'denied');
  assert.equal(h.pageRuns.length, 0);
  assert.equal(h.events.filter(e => e.type === 'approve').length, 1);
});

test('voice approvals show what was heard and can be edited', async () => {
  const h = harness({ approveWith: (c) => c.heard ? { edit: 'open notepad' } : { allow: true } });
  await h.pipeline.input({ text: 'organize my downloads', source: 'voice', utteranceId: 'v1' });
  await sleep(30);
  assert.ok(h.events.some(e => e.type === 'approve' && e.heard === 'organize my downloads'));
  assert.ok(h.running.has('Notepad'));
});

test('status: "what are you doing" while something is pending', async () => {
  let release;
  const h = harness({ approveWith: () => new Promise(r => { release = r; }) });
  h.pipeline.input({ text: 'organize my downloads' });
  await sleep(20);
  await h.pipeline.input({ text: 'what are you doing?' });
  assert.ok(h.replies().some(r => /organize my downloads \(awaiting permission\)/.test(r)));
  release({ allow: false });
});

test('questions she can answer herself (math, time) skip the model', async () => {
  const { harness } = require('./harness');
  const h = harness();
  await h.pipeline.input({ text: 'what is 12 times 7' });
  assert.ok(h.pageRuns.some(s => s.intent === 'math'), JSON.stringify(h.pageRuns));
  assert.ok(!h.events.some(e => e.type === 'choose'));
});

test('a name you gave an app is used when opening it', async () => {
  const { createPipeline } = require('../pipeline');
  const brain = require('../../brain/brain');
  const h = harness();
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, appAlias: (n) => n.toLowerCase() === 'browser' ? 'Google Chrome' : null });
  await p.input({ text: 'open browser' });
  assert.ok(h.replies().some(r => /Opened Google Chrome/.test(r)), h.replies().join(' | '));
});
