// Routines/presets and learned workflows: preview, one approval, real steps, honest undo, versions.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness');
const { createWorkflows } = require('../workflows');
const { createPipeline } = require('../pipeline');
const brain = require('../../brain/brain');

function setup({ approve = () => ({ allow: true }), choose = () => 'yes' } = {}) {
  const h = harness({ approveWith: approve, chooseWith: choose, installed: ['Discord', 'Spotify', 'Notepad', 'Visual Studio Code'] });
  let st = { performance: 'balanced', dnd: false, reasoning: 'auto' };
  const workflows = createWorkflows({ store: h.store, log: h.log, settings: () => st, saveSettings: (p) => { st = { ...st, ...p }; } });
  workflows.ensurePresets();
  const aliases = {};
  const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async (s) => { h.pageRuns.push(s); return { ok: true }; } }, llm: null, workflows, settings: () => st, rememberAlias: (a, app) => { aliases[a] = app; }, appAlias: (n) => aliases[String(n).toLowerCase()] || null });
  return { h, workflows, pipeline, st: () => st, aliases };
}

test('starting a routine previews each step (and what can\'t be undone), asks once, then applies it (P2 #10)', async () => {
  const s = setup();
  await s.pipeline.input({ text: 'start gaming mode' });
  const card = s.h.events.find(e => e.type === 'approve');
  assert.match(card.title, /Start Gaming/);
  assert.ok(card.lines.some(l => /Set performance to gaming/.test(l)));
  assert.ok(card.lines.some(l => /Open Discord \(can't be undone/.test(l)));
  assert.equal(s.st().performance, 'gaming');
  assert.equal(s.st().dnd, true);
  assert.ok(s.h.replies().some(r => /Gaming is on: 3 of 3 done/.test(r)));
  // end it: settings go back; the app launch is reported as not undone
  await s.pipeline.input({ text: 'end gaming mode' });
  assert.equal(s.st().performance, 'balanced');
  assert.equal(s.st().dnd, false);
  assert.ok(s.h.replies().some(r => /Put back 2 settings\. Not undone \(can't be\): Open Discord/.test(r)));
});

test('a cancelled preview changes nothing; a missing app is reported as partial, not success', async () => {
  const s = setup({ approve: () => ({ allow: false }) });
  await s.pipeline.input({ text: 'start development mode' });
  assert.equal(s.st().reasoning, 'auto');
  assert.ok(s.h.replies().some(r => /didn't start Development/.test(r)));
  const t = setup();
  t.workflows.create({ name: 'Stream', steps: [{ type: 'app', name: 'OBS Studio' }, { type: 'setting', key: 'dnd', value: true }] });
  await t.pipeline.input({ text: 'start stream mode' });
  assert.ok(t.h.replies().some(r => /Stream is on: 1 of 2 done\. Didn't work: Open OBS Studio \(not installed\)/.test(r)));
});

test('"save that as …" keeps what you just did (after you confirm), with versions and revert', async () => {
  const s = setup();
  await s.pipeline.input({ text: 'open spotify' });
  await s.pipeline.input({ text: 'dark mode' });
  await s.pipeline.input({ text: 'save that as my chill setup' });
  const w = s.workflows.get('chill setup');
  assert.ok(w, 'saved');
  assert.deepEqual(w.steps.map(x => x.type + ':' + (x.name || x.intent)), ['app:Spotify', 'intent:theme']);
  assert.equal(w.provenance.kind, 'learned');
  s.workflows.edit('chill setup', { steps: [{ type: 'app', name: 'Spotify' }] });
  assert.equal(s.workflows.get('chill setup').version, 2);
  s.workflows.revert('chill setup');
  assert.equal(s.workflows.get('chill setup').steps.length, 2);
  // nothing destructive can be put in a routine
  assert.throws(() => s.workflows.create({ name: 'Bad', steps: [{ type: 'intent', intent: 'power', slots: { kind: 'shutdown' } }] }), /can't include/);
});

test('one approval is for that run only; "always" is your explicit choice and an edit cancels it (P2 #7)', async () => {
  let asked = 0;
  const s = setup({ approve: () => { asked++; return { allow: true }; } });
  await s.pipeline.input({ text: 'start study mode' });
  await s.pipeline.input({ text: 'start study mode' });
  assert.equal(asked, 2, 'asked each time: no permission was inferred from the first run');
  assert.equal(s.h.permissions.list().filter(g => g.active && g.persistent).length, 0);
  let n = 0;
  const t = setup({ approve: () => { n++; return { allow: true, remember: true }; } });
  await t.pipeline.input({ text: 'start study mode' });
  await t.pipeline.input({ text: 'start study mode' });
  assert.equal(n, 1, 'you chose "always for this version"');
  t.workflows.edit('study', { steps: [{ type: 'setting', key: 'dnd', value: true }] });
  await t.pipeline.input({ text: 'start study mode' });
  assert.equal(n, 2, 'edited routine asks again');
});

test('a correction becomes a remembered name only when you say so (P2 #7)', async () => {
  const s = setup({ choose: (q) => /Did you mean/.test(q.question) ? 'Visual Studio Code' : /Remember that "vsc"/.test(q.question) ? 'yes' : null });
  await s.pipeline.input({ text: 'open vsc' });
  assert.equal(s.aliases.vsc, 'Visual Studio Code');
  const t = setup({ choose: (q) => /Did you mean/.test(q.question) ? 'Visual Studio Code' : 'no' });
  await t.pipeline.input({ text: 'open vsc' });
  assert.deepEqual(t.aliases, {});
});
