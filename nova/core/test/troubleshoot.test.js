// Troubleshooting a project: evidence from its own check, memory of attempts, verified fix (P2 #14).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { harness } = require('./harness');
const { createProjects } = require('../projects');
const { createTroubleshoot } = require('../troubleshoot');
const { createPipeline } = require('../pipeline');
const { createJobs } = require('../jobs');
const brain = require('../../brain/brain');

function setup() {
  const h = harness();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-proj-'));
  fs.writeFileSync(path.join(dir, 'game.js'), 'exports.spawn = () => { throw new TypeError("map is undefined") };\n');
  fs.writeFileSync(path.join(dir, 'check.js'), "require('./game.js').spawn(); console.log('spawned ok');\n");
  const projects = createProjects({ store: h.store, log: h.log });
  const p = projects.upsert({ name: 'Dungeon', folders: [dir], checks: [{ name: 'check', command: [process.execPath, 'check.js'] }], constraints: ['No paid assets'] });
  projects.setActive(p.id);
  const jobs = createJobs({ store: h.store, permissions: h.permissions, log: h.log, participants: {} });
  const troubleshoot = createTroubleshoot({ store: h.store, projects, log: h.log, jobs });
  const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, projects, troubleshoot, jobs });
  return { h, dir, projects, troubleshoot, pipeline, jobs, p };
}

test('"why isn\'t dungeon working": runs its check, shows the actual error, no guessing', async () => {
  const s = setup();
  await s.pipeline.input({ text: "why isn't dungeon working" });
  const r = s.h.replies().join('\n');
  assert.match(r, /Dungeon: `.+check\.js` fails/);
  assert.match(r, /TypeError: map is undefined/);
  assert.match(r, /evidence/);
});

test('a fix is a scoped job verified by the same check; "check again" verifies; tried fixes are remembered', async () => {
  const s = setup();
  await s.pipeline.input({ text: "why isn't dungeon working" });
  await s.pipeline.input({ text: 'fix it' });
  const job = s.jobs.list()[0];
  assert.equal(job.state, 'draft');
  assert.deepEqual(job.contract.testCommand, [process.execPath, 'check.js']);
  assert.ok(job.contract.constraints.some(c => /Don't delete data, weaken security, disable or skip tests/.test(c)));
  // the change didn't help
  await s.pipeline.input({ text: 'check again' });
  assert.ok(s.h.replies().some(r => /Still failing with the same error\. The last change didn't help/.test(r)));
  await s.pipeline.input({ text: "why isn't dungeon working" });
  assert.ok(s.h.replies().some(r => /Already tried for this exact error: job .+ \(didn't help\)/.test(r)));
  // a real fix, verified by rerunning the check
  fs.writeFileSync(path.join(s.dir, 'game.js'), 'exports.spawn = () => true;\n');
  await s.pipeline.input({ text: 'check again' });
  assert.ok(s.h.replies().some(r => /Fixed: `.+` passes now \(verified by rerunning it\)/.test(r)));
});

test('no project, no check: she says what she needs instead of reading around the PC', async () => {
  const h = harness();
  const projects = createProjects({ store: h.store, log: h.log });
  const t = createTroubleshoot({ store: h.store, projects });
  const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, projects, troubleshoot: t });
  await pipeline.input({ text: "why isn't my game working" });
  assert.ok(h.replies().some(r => /Which project or app\?/.test(r)));
});
