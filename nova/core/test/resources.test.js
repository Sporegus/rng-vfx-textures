// Resource pressure and performance profiles change what runs in the background, never Stop or your requests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createResources } = require('../resources');
const modes = require('../modes');
const { harness } = require('./harness');

test('low memory or a busy CPU (twice in a row) is pressure; a brief spike is not (P2 #5)', () => {
  const seq = [{ freeMemMB: 4000, totalMemMB: 16000, cpuPct: 95 }, { freeMemMB: 4000, totalMemMB: 16000, cpuPct: 20 }, { freeMemMB: 4000, totalMemMB: 16000, cpuPct: 96 }, { freeMemMB: 4000, totalMemMB: 16000, cpuPct: 97 }, { freeMemMB: 500, totalMemMB: 16000, cpuPct: 5 }, { freeMemMB: 6000, totalMemMB: 16000, cpuPct: 5 }];
  const changes = [];
  const r = createResources({ sample: () => seq.shift(), onChange: (s) => changes.push(s.level + (s.reason ? ': ' + s.reason : '')) });
  const levels = [r.check(), r.check(), r.check(), r.check(), r.check(), r.check()].map(s => s.level);
  assert.deepEqual(levels, ['ok', 'ok', 'ok', 'high', 'high', 'ok']);
  assert.match(changes[0], /busy/);
  assert.match(changes.join(' | '), /ok$/);
});

test('profiles map to real limits: Gaming starts no background jobs, Overnight two', () => {
  assert.equal(modes.performance('gaming').jobsConcurrent, 0);
  assert.equal(modes.performance('balanced').jobsConcurrent, 1);
  assert.equal(modes.performance('overnight').jobsConcurrent, 2);
  assert.equal(modes.performance('nonsense').jobsConcurrent, 1);
});

test('under pressure (or in Gaming) approved jobs wait in the queue, then start when it clears', async () => {
  const { openStore } = require('../store');
  const { createPermissions } = require('../permissions');
  const { createJobs } = require('../jobs');
  const { fixture } = require('../participants');
  const fs = require('fs'), os = require('os'), path = require('path');
  const store = openStore(':memory:');
  let allowed = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-res-'));
  fs.writeFileSync(path.join(dir, 'ok.txt'), 'x');
  const part = fixture('p', 'planner', async () => ({ status: 'complete', output: '{"done":true}' }));
  const jobs = createJobs({ store, permissions: createPermissions({ store }), participants: { p: part }, maxConcurrent: () => allowed });
  const j = jobs.draft('check a file', { workspace: dir, files: ['ok.txt'], participants: [{ id: 'p', role: 'planner' }, { id: 'p', role: 'implementer' }, { id: 'p', role: 'reviewer' }] });
  jobs.approve(j);
  assert.deepEqual(jobs.kick(), []);
  assert.equal(store.job(j.id).state, 'queued');
  allowed = 1;
  assert.deepEqual(jobs.kick(), [j.id]);
  for (let i = 0; i < 50 && store.job(j.id).state !== 'completed'; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(store.job(j.id).state, 'completed');
});

test('a pile-up of unfinished requests is refused instead of growing; Stop still works (P2 #4, #5)', async () => {
  const h = harness({ chooseWith: () => new Promise(() => {}) });
  for (let i = 0; i < 8; i++) h.pipeline.input({ text: 'why is the sky blue ' + i });
  await new Promise(r => setTimeout(r, 20));
  const r = await h.pipeline.input({ text: 'why is the grass green' });
  assert.equal(r.busy, true);
  assert.ok(h.replies().some(t => /still working on 8 things/.test(t)));
  const t0 = Date.now();
  h.pipeline.stopAll('test');
  assert.ok(Date.now() - t0 < 50);
  assert.equal(h.tasks.active().length, 0);
});
