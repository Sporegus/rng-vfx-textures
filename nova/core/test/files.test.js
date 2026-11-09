// File safety: content-based duplicates, previews with collisions, undo, locked files, approved folders only (P2 #12).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { openStore } = require('../store');
const { createFiles } = require('../files');

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-files-'));
  const w = (p, c) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
  w('a/photo.jpg', 'SAME-BYTES-123'); w('b/photo copy.jpg', 'SAME-BYTES-123'); w('c/other.jpg', 'SAME-BYTES-124');   // same size, different bytes
  w('d/photo.jpg', 'totally different content'); w('e/notes.txt', 'x');
  return root;
}

test('duplicates are decided by bytes: same name/size isn\'t enough', async () => {
  const root = tree();
  const f = createFiles({ store: openStore(':memory:'), roots: () => [root] });
  const r = await f.duplicates([root]);
  assert.equal(r.groups.length, 1);
  assert.deepEqual([r.groups[0].keep, ...r.groups[0].extra].map(p => path.relative(root, p)).sort(), ['a/photo.jpg', 'b/photo copy.jpg']);
  assert.ok(!r.groups.some(g => [g.keep, ...g.extra].some(p => /other|d\/photo/.test(p))));
});

test('a move is previewed with collisions renamed, never overwrites, and can be undone', () => {
  const root = tree();
  const store = openStore(':memory:');
  const f = createFiles({ store, roots: () => [root] });
  const dest = path.join(root, 'sorted');
  fs.mkdirSync(dest); fs.writeFileSync(path.join(dest, 'photo.jpg'), 'already here');
  const plan = f.planMove([path.join(root, 'a/photo.jpg'), path.join(root, 'd/photo.jpg')], dest);
  assert.deepEqual(plan.steps.map(s => path.basename(s.to)), ['photo (2).jpg', 'photo (3).jpg']);
  assert.equal(plan.enoughSpace, true);
  const res = f.applyMove(plan);
  assert.equal(res.done.length, 2);
  assert.equal(fs.readFileSync(path.join(dest, 'photo.jpg'), 'utf8'), 'already here', 'nothing overwritten');
  const u = f.undo(res.undo);
  assert.equal(u.back.length, 2);
  assert.equal(fs.readFileSync(path.join(root, 'a/photo.jpg'), 'utf8'), 'SAME-BYTES-123');
});

test('locked files and folders outside your approved ones are reported per file, not hidden', async () => {
  const root = tree();
  const trashed = [];
  const f = createFiles({ store: openStore(':memory:'), roots: () => [root], trash: async (p) => { if (/notes/.test(p)) throw Object.assign(new Error('busy'), { code: 'EBUSY' }); trashed.push(p); } });
  const r = await f.recycle([path.join(root, 'a/photo.jpg'), path.join(root, 'e/notes.txt'), path.join(os.tmpdir(), 'elsewhere.txt')]);
  assert.equal(r.done.length, 1);
  assert.equal(r.failed.length, 2);
  assert.ok(r.failed.some(x => /open in another program or locked/.test(x.why)));
  assert.ok(r.failed.some(x => /isn't in a folder you've let Nova work in/.test(x.why)));
  assert.throws(() => f.planMove([path.join(root, 'a/photo.jpg')], os.tmpdir()), /isn't in a folder/);
  const none = createFiles({ store: openStore(':memory:'), roots: () => [root] });
  await assert.rejects(none.recycle([path.join(root, 'a/photo.jpg')]), /Recycle Bin isn't available/);
});

test('"find duplicate files in my downloads": summary, choice, approval card, Recycle Bin (P2 #12)', async () => {
  const { harness } = require('./harness');
  const { createPipeline } = require('../pipeline');
  const brain = require('../../brain/brain');
  const root = tree();
  const trashed = [];
  const h = harness({ chooseWith: () => 'recycle' });
  const files = createFiles({ store: h.store, roots: () => [root], trash: async (p) => { trashed.push(p); } });
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, files, folders: () => root });
  await p.input({ text: 'find duplicate files in my downloads' });
  const card = h.events.find(e => e.type === 'approve');
  assert.match(card.title, /Move 1 duplicate to the Recycle Bin/);
  assert.deepEqual(card.categories, ['files_delete']);
  assert.equal(trashed.length, 1);
  assert.ok(fs.existsSync(path.join(root, 'a/photo.jpg')) || fs.existsSync(path.join(root, 'b/photo copy.jpg')), 'one copy stays');
});
