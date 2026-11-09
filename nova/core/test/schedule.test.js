// Scheduled job runs fire once per due time, never create permission, and skip missed times.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openStore } = require('../store');
const { createScheduler } = require('../schedule');

function fakeJobs(store) {
  const calls = [];
  return { calls, job: (id) => ({ id }), resume: async (id) => { calls.push(id); return id === 'job-nogrant' ? { ok: false, reason: 'This job\'s approval has expired or was revoked, so it needs a fresh OK before it continues.' } : { ok: true }; } };
}
const at = (h, m) => { const d = new Date('2026-11-09T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };

test('a scheduled run fires once, even across ticks and a restart (test 40)', async () => {
  const store = openStore(':memory:');
  let t = at(1, 0);
  const jobs = fakeJobs(store);
  const s1 = createScheduler({ store, jobs, now: () => t });
  s1.add({ jobId: 'job-a', at: '02:00' });
  assert.deepEqual(await s1.tick(), []);            // not due yet
  t = at(2, 0) + 5000;
  const f = await s1.tick();
  assert.equal(f.length, 1); assert.equal(f[0].ok, true);
  assert.deepEqual(await s1.tick(), []);            // same due time: never again
  const s2 = createScheduler({ store, jobs, now: () => t });   // "restart"
  assert.deepEqual(await s2.tick(), []);
  assert.deepEqual(jobs.calls, ['job-a']);
  assert.equal(s2.list()[0].enabled, false);
});

test('a schedule never grants permission: without a valid job approval it reports why', async () => {
  const store = openStore(':memory:');
  let t = at(1, 0);
  const s = createScheduler({ store, jobs: fakeJobs(store), now: () => t });
  s.add({ jobId: 'job-nogrant', at: '01:30' });
  t = at(1, 31);
  const f = await s.tick();
  assert.equal(f[0].ok, false);
  assert.match(f[0].reason, /needs a fresh OK/);
});

test('missed while the PC was off: skipped by default, daily schedules move to tomorrow', async () => {
  const store = openStore(':memory:');
  let t = at(1, 0);
  const jobs = fakeJobs(store);
  const s = createScheduler({ store, jobs, now: () => t });
  s.add({ jobId: 'job-b', at: '02:00', repeat: 'daily' });
  t = at(9, 0);                                     // woke up 7 hours late
  const f = await s.tick();
  assert.equal(f[0].skipped, true);
  assert.equal(jobs.calls.length, 0);
  const next = s.list()[0];
  assert.ok(next.enabled && next.due > t && new Date(next.due).getHours() === 2);
});
