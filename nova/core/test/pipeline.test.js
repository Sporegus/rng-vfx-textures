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
  // organizing waits on an approval that never comes; the correction cancels it
  let release;
  const h = harness({ approveWith: () => new Promise(r => { release = r; }) });
  const first = h.pipeline.input({ text: 'organize my downloads' });      // asks first (risk: ask)
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
  const r = await h.pipeline.input({ text: 'handle my stuff please' });
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

test('vague requests are clarified, never guessed; messages never go to a guessed place (P2 #1, #2)', async () => {
  const h = harness();
  for (const t of ['send it', 'open the thing', 'put it there']) await h.pipeline.input({ text: t });
  assert.equal(h.pageRuns.length, 0);
  assert.ok(!h.events.some(e => e.type === 'approve'));
  assert.ok(h.replies().some(r => /Send what, and to whom\? I won't guess/.test(r)));
  assert.ok(h.replies().some(r => /What should I open\?/.test(r)));
});

test('a low-confidence guess is checked with you and never reported as done (P2 #2)', async () => {
  const h = harness({ chooseWith: (q) => /Did you mean: turn the volume (down|up)\?|Did you mean: change the volume\?/.test(q.question) ? 'no' : null });
  await h.pipeline.input({ text: 'make it quieter in here' });
  assert.ok(h.events.some(e => e.type === 'choose' && /Did you mean: (turn the volume|change the volume)/.test(e.question)));
  assert.equal(h.pageRuns.length, 0);
  assert.ok(!h.replies().some(r => /quieter|turned|lowered/i.test(r) && !/Did you mean/.test(r)), 'never claims it did it');
  const h2 = harness({ chooseWith: () => 'yes' });
  await h2.pipeline.input({ text: 'make it quieter in here' });
  assert.ok(h2.pageRuns.some(s => s.intent === 'volume'));
  // a one-word command that can only mean one thing runs directly
  const h3 = harness();
  await h3.pipeline.input({ text: 'mute' });
  assert.ok(h3.pageRuns.some(s => s.intent === 'volume' && s.slots.cmd === 'mute'));
  assert.ok(!h3.events.some(e => e.type === 'choose'));
});

test('"the second option" answers the open question, and only that (P2 #9)', async () => {
  const h = harness({ chooseWith: () => new Promise(() => {}) });   // you haven't clicked anything
  const p = h.pipeline.input({ text: 'why is the sky blue' });     // no brain: "Search the web instead?" [Search the web, No thanks]
  await new Promise(r => setTimeout(r, 30));
  await h.pipeline.input({ text: 'the first one' });
  await p;
  assert.ok(h.pageRuns.some(s => s.intent === 'web.search'), 'the first option (search) ran');
  assert.ok(h.events.some(e => e.type === 'answered' && e.value === 'web'), 'the open card was closed with that answer');
  const h2 = harness();
  await h2.pipeline.input({ text: 'do the second option' });
  assert.ok(h2.replies().some(r => /don't have a question open/.test(r)));
});

test('writing requests go to a model; without one she says so plainly', async () => {
  const h = harness();
  await h.pipeline.input({ text: 'write me a short poem about rain' });
  assert.ok(h.replies().some(r => /Writing, rewriting and translating need a chat brain/.test(r)));
  assert.equal(h.pageRuns.length, 0, 'not turned into a note');
  const h2 = harness({ llm: llm.mock(['Rain taps the glass…']) });
  await h2.pipeline.input({ text: 'write me a short poem about rain' });
  assert.ok(h2.replies().some(r => /Rain taps/.test(r)));
});

test('reasoning modes map to real request settings; Auto escalates once when unsure (P2 #16)', async () => {
  const m = llm.mock(["I'm not sure, it depends.", 'Because of how cache lines work: …']);
  const h = harness({ llm: m });
  await h.pipeline.input({ text: 'is a linked list faster than an array?' });
  assert.equal(m.calls.length, 2, 'escalated once');
  assert.equal(m.calls[0].maxTokens, 500);
  assert.equal(m.calls[1].maxTokens, 1500);
  assert.ok(h.log.recent(100).some(e => e.type === 'reasoning.escalated'));
  const modes = require('../modes');
  assert.equal(modes.pickReasoning('auto', 'what time is it in tokyo'), 'quick');
  assert.equal(modes.pickReasoning('auto', 'why does my build fail when I add this plugin'), 'think');
  assert.equal(modes.pickReasoning('auto', 'research and compare the two engines with sources'), 'thorough');
  assert.equal(modes.pickReasoning('quick', 'research everything'), 'quick', 'an explicit mode wins');
});

test('"wait" drops a pending approval without doing it or pausing jobs; a repeated utterance runs once (P2 #9)', async () => {
  let release, hang = true;
  const h = harness({ approveWith: () => hang ? new Promise(r => { release = r; }) : { allow: true } });
  const p = h.pipeline.input({ text: 'organize my downloads', source: 'voice', utteranceId: 'u-1' });
  await new Promise(r => setTimeout(r, 20));
  await h.pipeline.input({ text: 'wait', source: 'voice', utteranceId: 'u-2' });
  release && release({ allow: true });   // a late click can't revive it
  await p;
  hang = false;
  assert.equal(h.pageRuns.length, 0, 'nothing ran');
  assert.ok(h.replies().some(r => /dropped that/.test(r)));
  await h.pipeline.input({ text: 'organize my downloads', source: 'voice', utteranceId: 'u-3' });
  const before = h.pageRuns.length;
  await h.pipeline.input({ text: 'organize my downloads', source: 'voice', utteranceId: 'u-3' });
  assert.equal(h.pageRuns.length, before, 'the same utterance is not acted on twice');
});

test('mic checks get a straight answer; questions about her never turn into a web search', async () => {
  const h = harness();
  await h.pipeline.input({ text: 'can you hear me?', source: 'voice' });
  assert.ok(h.replies().some(r => /Yes, I can hear you/.test(r)));
  await h.pipeline.input({ text: 'are you there?' });
  assert.ok(h.replies().some(r => /I'm here/.test(r)));
  await h.pipeline.input({ text: 'what do you think about pizza?' });
  assert.ok(h.replies().some(r => /Pizza\? I'm a fan/.test(r)));
  assert.ok(!h.events.some(e => e.type === 'choose'), 'no "search the web?" offer');
});

test('closing an app doesn\'t ask (only deleting does); closing the window Nova runs in is flagged', async () => {
  const h = harness();
  await h.pipeline.input({ text: 'close spotify' });
  assert.ok(!h.events.some(e => e.type === 'approve'), 'no approval card for closing');
  const run = h.pageRuns.find(s => s.intent === 'app.close');
  assert.ok(run && run.approved === true, 'the page is told not to ask again');
  const h2 = harness({ chooseWith: () => 'no' });
  await h2.pipeline.input({ text: 'close powershell' });
  assert.ok(h2.events.some(e => e.type === 'choose' && /closing it closes me too/.test(e.question)));
  assert.equal(h2.pageRuns.length, 0);
  const h3 = harness({ approveWith: () => ({ allow: false }) });
  await h3.pipeline.input({ text: 'clean up junk files' });
  assert.ok(h3.events.some(e => e.type === 'approve'), 'deleting still asks');
});

test('"get the fuck out of the way" moves Nova aside; it never becomes a junk cleanup', async () => {
  const h = harness();
  await h.pipeline.input({ text: 'get the fuck out of the way', source: 'voice' });
  assert.deepEqual(h.pageRuns.map(s => s.intent), ['nova.move']);
  assert.ok(!h.events.some(e => e.type === 'approve'));
  await h.pipeline.input({ text: 'go away' });
  assert.equal(h.pageRuns[1].intent, 'nova.hide');
  const { route } = require('../router');
  assert.equal(route('open the fucking spotify').text, 'open spotify');
});

test('without a chat brain, a half-sure match for something that asks permission is confirmed first', async () => {
  const h = harness({ chooseWith: () => 'no' });
  await h.pipeline.input({ text: 'move out of the way please now' });   // a fuzzy one
  const h2 = harness({ chooseWith: (q) => /Did you mean/.test(q.question) ? 'no' : null });
  await h2.pipeline.input({ text: 'tidy my stuff' });                    // clean.junk at ~0.64
  assert.ok(h2.events.some(e => e.type === 'choose' && /Did you mean: clean up junk files\?|Did you mean:/.test(e.question)));
  assert.ok(!h2.events.some(e => e.type === 'approve'), 'no approval card for a guess');
  assert.equal(h2.pageRuns.length, 0);
});

test('with a chat brain, messy speech is interpreted into a command she knows (then the usual checks apply)', async () => {
  const m = llm.mock([JSON.stringify({ command: 'clean up junk files' })]);
  const h = harness({ llm: m, approveWith: () => ({ allow: false }) });
  await h.pipeline.input({ text: 'yo my pc is so cluttered with crap can u sort that', source: 'voice' });
  assert.match(m.calls[0].system, /Examples of commands Nova understands/);
  assert.ok(h.events.some(e => e.type === 'approve'), 'deleting still needs your OK');
  assert.equal(h.pageRuns.length, 0);
  const m2 = llm.mock([JSON.stringify({ ask: 'Do you want me to close the window or move it?' })]);
  const h2 = harness({ llm: m2 });
  await h2.pipeline.input({ text: 'deal with that thing over there' });
  assert.ok(h2.replies().some(r => /close the window or move it/.test(r)));
  assert.equal(h2.pageRuns.length, 0);
});

test('everyday chat gets a reply and never runs a command', async () => {
  for (const [text, re] of [['i am bored', /bored/i], ['you are cute', /blush|thank you|stop it/i], ['i love you', /love you too|right back/i], ['im tired', /break|rest|rough/i],
    ['lets talk', /mind|ears/i], ['i feel sad', /sorry|here for you|hug/i], ['what is your favorite color', /Blue/], ['im good wbu', /great too|awesome/i], ['my mom is annoying', /./], ['lol', /./]]) {
    const h = harness();
    await h.pipeline.input({ text });
    assert.equal(h.pageRuns.length, 0, `"${text}" ran ${h.pageRuns.map(s => s.intent)}`);
    assert.ok(!h.events.some(e => e.type === 'choose' || e.type === 'approve'), `"${text}" asked something`);
    assert.ok(h.replies().some(r => re.test(r)), `"${text}" → ${h.replies()}`);
  }
});

test('chat with a request in it does the request; real commands are unchanged', async () => {
  let h = harness();
  await h.pipeline.input({ text: "i'm bored, play some music" });
  assert.deepEqual(h.pageRuns.map(s => s.intent), ['music.play']);
  for (const [text, intent] of [['open up spotify on chrome', 'web.open'], ['openroblox.com', 'web.open'], ['turn the volume down', 'volume'], ['tell me a joke', 'fun.joke'], ['i want to listen to drake', 'music.play']]) {
    h = harness();
    await h.pipeline.input({ text });
    assert.deepEqual(h.pageRuns.map(s => s.intent), [intent], text);
  }
  h = harness();
  await h.pipeline.input({ text: 'open up spotify on chrome' });
  assert.equal(h.pageRuns[0].slots.browser, 'chrome');
  assert.equal(h.pageRuns[0].slots.sites[0].url, 'https://open.spotify.com');
  h = harness();
  await h.pipeline.input({ text: 'open up to me' });
  assert.equal(h.pageRuns.length, 0, '"open up to me" is not an app');
});

test('an on-device brain that can decide does it in one call, with the conversation so far', async () => {
  const calls = [];
  const fake = { name: 'local', model: 'on-device', vision: false, available: () => ({ ok: true }),
    decide: async (req) => { calls.push(req); return /talked about/.test(req.text) ? { kind: 'command', command: 'organize my downloads', reply: '' } : { kind: 'chat', command: '', reply: 'Sounds fun!' }; },
    chat: async () => { throw new Error('chat should not be called for an interpretation'); } };
  const { createPipeline } = require('../pipeline');
  const brain = require('../../brain/brain');
  const h = harness();
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async (s) => { h.pageRuns.push(s); return {}; } }, llm: llm.chooser({ local: fake }, ['local']) });
  await p.input({ text: 'could you deal with the stuff we talked about earlier' });
  assert.equal(calls.length, 1, 'one model call');
  assert.match(calls[0].text, /talked about earlier/, 'the model saw the whole sentence');
  assert.deepEqual(h.pageRuns.map(s => s.intent), ['organize']);
});

test('"close it" right after opening an app means that app; with nothing to refer to she asks', async () => {
  const h = harness();
  await h.pipeline.input({ text: 'open discord' });
  await h.pipeline.input({ text: 'ok close it' });
  assert.deepEqual(h.pageRuns.map(s => [s.intent, s.slots.apps.map(a => a.toLowerCase())]), [['app.close', ['discord']]]);
  const h2 = harness();
  await h2.pipeline.input({ text: 'close it' });
  assert.equal(h2.pageRuns.length, 0);
  assert.ok(h2.replies().some(r => /What should I close/.test(r)));
});
