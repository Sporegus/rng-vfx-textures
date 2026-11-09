// Projects and the reference inbox: resolved, never guessed; isolated from each other.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { harness } = require('./harness');
const { createProjects } = require('../projects');
const { createReferences } = require('../references');
const { createPipeline } = require('../pipeline');
const brain = require('../../brain/brain');
const llmMod = require('../llm');

function setup({ choose = () => 'open', clip = {}, llm = null } = {}) {
  const h = harness({ chooseWith: (q) => typeof choose === 'function' ? choose(q) : choose, llm });
  const opened = [];
  const projects = createProjects({ store: h.store, log: h.log, launch: { app: async (task, n) => { opened.push('app:' + n); return { ok: true }; }, url: async (u) => opened.push('url:' + u), path: async (p) => opened.push('path:' + p) } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-refs-'));
  const references = createReferences({ store: h.store, dir, log: h.log, projects, clipboard: { image: () => clip.image || null, text: () => clip.text || '' }, open: { path: async (p) => opened.push('path:' + p), url: async (u) => opened.push('url:' + u) } });
  const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: llm ? llmMod.chooser({ mock: llm }, ['mock']) : null, projects, references });
  return { h, projects, references, pipeline, opened, dir };
}

test('"let\'s work on Black Sun" opens only what the profile lists; unknown projects are not guessed', async () => {
  const s = setup();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blacksun-'));
  s.projects.upsert({ name: 'Black Sun', aliases: ['bs'], folders: [work], launch: [{ kind: 'app', name: 'Roblox Studio' }, { kind: 'folder', path: work }], task: 'armour pass', next: 'mask variants', blockers: ['waiting on art'] });
  await s.pipeline.input({ text: "let's work on black sun" });
  assert.deepEqual(s.opened, ['app:Roblox Studio', 'path:' + work]);
  const q = s.h.events.find(e => e.type === 'choose');
  assert.match(q.question, /Current task: armour pass/);
  assert.match(q.question, /Blocked by: waiting on art/);
  assert.ok(s.h.replies().some(r => /Working on Black Sun. Opened Roblox Studio/.test(r)));
  await s.pipeline.input({ text: "let's work on moon base" });
  assert.ok(s.h.replies().some(r => /don't have a project called "moon base"/.test(r)));
  assert.equal(s.opened.length, 2);
});

test('references keep source, project and a copy; finding stays inside the active project (P2 #8)', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const s = setup({ clip: { image: { png, size: { width: 1, height: 1 } } } });
  const a = s.projects.upsert({ name: 'Black Sun' }), b = s.projects.upsert({ name: 'Other Game' });
  s.projects.setActive(a.id);
  await s.pipeline.input({ text: 'save this image as an armour reference' });
  const saved = s.references.list();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].project, a.id);
  assert.equal(saved[0].tag, 'armour');
  assert.ok(fs.existsSync(saved[0].file) && saved[0].sha256 && saved[0].source === 'clipboard image');
  s.references.add({ kind: 'link', url: 'https://example.com/mask-ideas', tag: 'mask', projectId: b.id });
  await s.pipeline.input({ text: 'find the mask reference I saved' });
  assert.ok(s.h.replies().some(r => /don't have a saved reference matching "mask" in Black Sun/.test(r)), 'the other project\'s mask reference is not shown');
  s.projects.setActive(b.id);
  await s.pipeline.input({ text: 'find the mask reference' });
  assert.ok(s.opened.includes('url:https://example.com/mask-ideas'));
});

test('nothing on the clipboard: nothing is saved, and nothing else is looked at', async () => {
  const s = setup();
  await s.pipeline.input({ text: 'remember this link for the terrain' });
  assert.equal(s.references.list().length, 0);
  assert.ok(s.h.replies().some(r => /Copy the link first/.test(r)));
});

test('answers get the active project\'s context only (P2 #6)', async () => {
  const m = llmMod.mock(['ok', 'ok']);
  const s = setup({ llm: m });
  const a = s.projects.upsert({ name: 'Black Sun', constraints: ['No paid assets'] }), b = s.projects.upsert({ name: 'Secret Other', constraints: ['Codename Falcon'] });
  s.projects.addNote(a.id, 'The armour uses the obsidian palette');
  s.projects.addNote(b.id, 'The armour for Falcon is gold');
  s.projects.setActive(a.id);
  await s.pipeline.input({ text: 'what palette does the armour use?' });
  const sys = m.calls[0].system;
  assert.match(sys, /No paid assets/);
  assert.match(sys, /obsidian palette/);
  assert.ok(!/Falcon|gold/.test(sys), 'nothing from the other project');
});
