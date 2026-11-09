// Store, log, tasks, permissions and the tool executor.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openStore } = require('../store');
const { createLog, redact } = require('../log');
const { createTasks } = require('../tasks');
const { createPermissions } = require('../permissions');
const { createTools } = require('../tools');
const { sleep } = require('../util');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nova-core-'));
function setup() {
  const store = openStore(':memory:');
  const log = createLog();
  const tasks = createTasks({ store, log });
  const permissions = createPermissions({ store, log });
  const tools = createTools({ permissions, log, store, locks: store });
  return { store, log, tasks, permissions, tools };
}

test('store migrates, survives reopen and keeps data', () => {
  const dir = tmp(), file = path.join(dir, 'nova.db');
  let s = openStore(file);
  assert.equal(s.version(), 2);
  s.putJob({ id: 'job_1', goal: 'g', state: 'queued', created: 1, priority: 'high', notes: 'mine' });
  s.close();
  s = openStore(file);
  assert.equal(s.job('job_1').goal, 'g');
  assert.equal(s.job('job_1').priority, 'high');
  s.close();
});

test('an existing v1 database upgrades in place and keeps its jobs', () => {
  const { MIGRATIONS } = require('../store');
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(tmp(), 'old.db');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);'); db.exec(MIGRATIONS[0]);
  db.prepare("INSERT INTO meta (k, v) VALUES ('schema', '1')").run();
  db.prepare("INSERT INTO jobs (id, goal, state, contract, created, updated, version) VALUES ('job_old', 'old job', 'paused', '{}', 1, 1, 1)").run();
  db.close();
  const s = openStore(file);
  assert.equal(s.version(), 2);
  assert.equal(s.job('job_old').goal, 'old job');
  assert.equal(s.job('job_old').priority, 'normal');
  s.close();
});

test('outbox refuses a second send intent for the same handoff', () => {
  const s = openStore(':memory:');
  assert.equal(s.outboxIntent({ id: 'o1', jobId: 'j', iteration: 'i1', destination: 'claude', payloadHash: 'h' }).created, true);
  const again = s.outboxIntent({ id: 'o2', jobId: 'j', iteration: 'i1', destination: 'claude', payloadHash: 'h' });
  assert.equal(again.created, false);
  assert.equal(again.existing.id, 'o1');
});

test('leases: one owner at a time, expired lease can be taken', async () => {
  const s = openStore(':memory:');
  assert.ok(s.acquire('desktop-input', 'a', 50));
  assert.ok(!s.acquire('desktop-input', 'b', 50));
  await sleep(70);
  assert.ok(s.acquire('desktop-input', 'b', 50));
});

test('log redacts secrets in keys and values (test 24: token handling)', () => {
  const r = redact({ apiKey: 'abc', note: 'my key is sk-ant-abcdefghijklmnopqrstuvwxyz123456', nested: { token: 'x' }, auth: 'Bearer abcdefghijklmnop' });
  assert.equal(r.apiKey, '[redacted]');
  assert.equal(r.nested.token, '[redacted]');
  assert.ok(!JSON.stringify(r).includes('sk-ant-abc'));
  const log = createLog();
  log.event('x', { header: 'Bearer abcdefghijklmnopqrst' });
  assert.ok(!log.export().includes('abcdefghijklmnopqrst'));
});

test('task state machine rejects invalid transitions and ignores late results', () => {
  const { tasks } = setup();
  const t = tasks.create({ text: 'open notepad' });
  assert.throws(() => tasks.move(t, 'verifying'), /can't go/);
  tasks.move(t, 'executing');
  tasks.cancel(t);
  assert.equal(t.state, 'cancelled');
  assert.equal(tasks.move(t, 'completed'), false);   // a late result can't revive it
  assert.equal(t.state, 'cancelled');
  assert.ok(t.ac.signal.aborted);
});

test('a failure never leaves a task thinking', () => {
  const { tasks } = setup();
  const t = tasks.create({ text: 'x' });
  tasks.fail(t, new Error('boom'));
  assert.equal(t.state, 'failed');
  assert.equal(tasks.active().length, 0);
});

test('permissions: direct low-impact OK, control needs a grant bound to that task (tests 9, 10)', () => {
  const { permissions } = setup();
  assert.ok(permissions.check({ category: 'launch', direct: true }).ok);
  assert.ok(!permissions.check({ category: 'control', direct: true, scope: { kind: 'task', id: 't1' } }).ok);
  permissions.grant({ scope: { kind: 'task', id: 't1' }, categories: ['control'], targets: { app: ['spotify'] } });
  assert.ok(permissions.check({ category: 'control', scope: { kind: 'task', id: 't1' }, target: { kind: 'app', value: 'Spotify' } }).ok);
  // another task can't reuse it, and another app isn't covered
  assert.ok(!permissions.check({ category: 'control', scope: { kind: 'task', id: 't2' }, target: { kind: 'app', value: 'spotify' } }).ok);
  assert.ok(!permissions.check({ category: 'control', scope: { kind: 'task', id: 't1' }, target: { kind: 'app', value: 'discord' } }).ok);
  // a category it didn't grant
  assert.ok(!permissions.check({ category: 'files_delete', scope: { kind: 'task', id: 't1' } }).ok);
});

test('permissions: expiry, revoke on stop, changed message invalidates (tests 9, 11)', () => {
  let t = 1000;
  const permissions = createPermissions({ now: () => t });
  const g = permissions.grant({ scope: { kind: 'task', id: 'a' }, categories: ['communicate'], targets: { channel: ['123'] }, effects: { text: 'what are we playing?' }, ttlMs: 500 });
  const ok = (text, channel = '123') => permissions.check({ category: 'communicate', scope: { kind: 'task', id: 'a' }, target: { kind: 'channel', value: channel }, effects: { text } }).ok;
  assert.ok(ok('what are we playing?'));
  assert.ok(!ok('send me your password'));          // changed message
  assert.ok(!ok('what are we playing?', '999'));     // changed destination
  t = 2000;
  assert.ok(!ok('what are we playing?'));            // expired
  const g2 = permissions.grant({ scope: { kind: 'task', id: 'b' }, categories: ['control'] });
  permissions.revokeAll('stop');
  assert.ok(!permissions.check({ category: 'control', scope: { kind: 'task', id: 'b' } }).ok);
  assert.ok(g.revoked && g2.revoked);
});

test('permissions: install/purchase/security are never granted', () => {
  const { permissions } = setup();
  assert.throws(() => permissions.grant({ scope: { kind: 'task', id: 'a' }, categories: ['purchase'] }), /doesn't do/);
  assert.ok(permissions.check({ category: 'install', direct: true }).never);
});

test('tool executor: validates args, denies without grant, verifies postcondition (test 21)', async () => {
  const { tasks, tools, permissions } = setup();
  let ran = 0;
  tools.register({ name: 'fake.type', purpose: 'type text', category: 'control', effect: 'local',
    args: { type: 'object', properties: { text: { type: 'string', maxLength: 10 } }, required: ['text'], additionalProperties: false },
    run: async () => { ran++; return { typed: true }; }, verify: async () => ({ ok: false, evidence: 'field still empty' }) });
  const t = tasks.create({ text: 'type hi' });
  await assert.rejects(tools.run(t, { tool: 'fake.type', args: { text: 'hi', extra: 1 } }), /not allowed/);
  await assert.rejects(tools.run(t, { tool: 'fake.type', args: { text: 'hi' }, direct: true }), (e) => e.category === 'denied');
  assert.equal(ran, 0, 'no input injected without approval');
  permissions.grant({ scope: { kind: 'task', id: t.id }, categories: ['control'] });
  const r = await tools.run(t, { tool: 'fake.type', args: { text: 'hi' } });
  assert.equal(ran, 1);
  assert.equal(r.verified, false);      // sent, but the postcondition failed: reported as unverified
});

test('tool executor: an external action that times out is never retried (test 20)', async () => {
  const { tasks, tools, permissions } = setup();
  let sends = 0;
  tools.register({ name: 'fake.send', purpose: 'send', category: 'communicate', effect: 'external', retrySafe: true, retries: 3, timeoutMs: 50,
    args: { type: 'object' }, run: async (a, { signal }) => { sends++; await sleep(500, signal); } });
  const t = tasks.create({ text: 'send' });
  permissions.grant({ scope: { kind: 'task', id: t.id }, categories: ['communicate'] });
  await assert.rejects(tools.run(t, { tool: 'fake.send', args: {} }), (e) => e.category === 'unverified' && e.ambiguous);
  assert.equal(sends, 1);
});

test('tool executor: cancel mid-run stops it and no queued input follows (tests 12, 13)', async () => {
  const { tasks, tools, permissions } = setup();
  const keys = [];
  tools.register({ name: 'fake.keys', purpose: 'press keys', category: 'control', effect: 'local', timeoutMs: 5000,
    args: { type: 'object' }, run: async (a, { signal }) => { for (let i = 0; i < 10; i++) { await sleep(20, signal); keys.push(i); } } });
  const t = tasks.create({ text: 'press' });
  permissions.grant({ scope: { kind: 'task', id: t.id }, categories: ['control'] });
  const p = tools.run(t, { tool: 'fake.keys', args: {} });
  await sleep(50);
  tasks.cancel(t);
  await assert.rejects(p, (e) => e.category === 'cancelled');
  const n = keys.length;
  await sleep(100);
  assert.equal(keys.length, n, 'no key presses after cancellation');
  assert.ok(n < 10);
});

test('two tasks cannot hold desktop input at once (test 34)', async () => {
  const { tasks, tools, permissions } = setup();
  tools.register({ name: 'fake.hold', purpose: 'hold', category: 'control', effect: 'local', timeoutMs: 1000,
    args: { type: 'object' }, run: async (a, { signal }) => { await sleep(150, signal); return {}; } });
  const a = tasks.create({ text: 'a' }), b = tasks.create({ text: 'b' });
  for (const t of [a, b]) permissions.grant({ scope: { kind: 'task', id: t.id }, categories: ['control'] });
  const pa = tools.run(a, { tool: 'fake.hold', args: {} });
  await sleep(20);
  await assert.rejects(tools.run(b, { tool: 'fake.hold', args: {} }), /Another task is using the mouse/);
  await pa;
  await tools.run(b, { tool: 'fake.hold', args: {} });   // free again afterwards
});
