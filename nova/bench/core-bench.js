// Benchmark: Nova's real core (router, brain, pipeline, permissions, tools, jobs,
// games, research, screen) with a FAKE PC (no Windows), measuring:
//   - accuracy: did each request get the correct outcome (bench/requests.js)?
//   - warm latency: same process, repeated (median, p95, n)
//   - cold latency: a fresh Node process per request (start-up + first request)
//   - soak: hundreds of mixed requests + Stops; heap, tasks and listeners must not grow
// Usage: node bench/core-bench.js <label>     (writes bench/results/<label>.json)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const REQUESTS = require('./requests');

function makeCore() {
  const { harness } = require('../core/test/harness');
  const { createPipeline } = require('../core/pipeline');
  const { createJobs } = require('../core/jobs');
  const { createGames } = require('../core/games');
  const { createResearch } = require('../core/research');
  const { createScreen } = require('../core/screen');
  const brain = require('../brain/brain');
  const h = harness({ installed: ['Notepad', 'Discord', 'Spotify', 'Google Chrome'] });
  const fakeWin = { available: () => false };
  const deps = {
    tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, llm: null,
    page: { run: async (step) => { h.pageRuns.push(step); return { ok: true }; } },
    jobs: createJobs({ store: h.store, permissions: h.permissions, log: h.log, participants: {} }),
    games: createGames({ store: h.store, permissions: h.permissions, log: h.log, launch: async () => {} }),
    research: createResearch({ log: h.log, minGapMs: 0, fetchImpl: async () => { throw new Error('offline (benchmark has no network)'); } }),
    screen: createScreen({ win: fakeWin, llm: null, settings: () => ({}), saveSettings: () => {}, log: h.log }),
  };
  const extra = (() => { try { return require('./core-extra')(h, deps); } catch { return {}; } })();   // Phase 2 additions plug in here
  const pipeline = createPipeline({ ...deps, ...extra });
  return { h, pipeline };
}

function score(req, h, before) {
  const ev = h.events.slice(before.events);
  const runs = h.pageRuns.slice(before.runs);
  // what she said, including questions she asked you (a choice card is her answer too)
  const replies = ev.filter(e => e.type === 'reply' || e.type === 'choose').map(e => e.text || e.question || '');
  const inputs = h.log.recent(400).filter(e => e.type === 'input');
  const route = (inputs[inputs.length - 1] || {}).route;
  const toolRuns = h.log.recent(400).filter(e => e.type === 'tool.result').length - before.tools;
  const expects = Array.isArray(req.expect) ? req.expect : [req.expect];
  const ok = expects.some(exp => check(exp));
  function check(exp) {
  const [kind, arg] = [exp.split(':')[0], exp.slice(exp.indexOf(':') + 1)];
  let ok = false;
  if (kind === 'page') ok = runs.some(s => s.intent === arg);
  else if (kind === 'opened') ok = replies.some(r => r.includes('Opened ' + arg));
  else if (kind === 'route') ok = route === arg;
  else if (kind === 'reply') ok = replies.some(r => new RegExp(arg, 'i').test(r));
  else if (kind === 'clarify') ok = !runs.length && toolRuns === 0 && !ev.some(e => e.type === 'approve') && (ev.some(e => e.type === 'choose') || replies.some(r => /\?/.test(r)));
  return ok;
  }
  return { ok, route, ran: runs.map(s => s.intent), replies: replies.slice(-2).map(r => r.slice(0, 120)) };
}

async function once(core, req) {
  const { h, pipeline } = core;
  const before = { events: h.events.length, runs: h.pageRuns.length, tools: h.log.recent(400).filter(e => e.type === 'tool.result').length };
  const t0 = process.hrtime.bigint();
  await pipeline.input({ text: req.text, source: 'typed' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, ...score(req, h, before) };
}
const stats = (a) => { const s = a.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)]; return { n: s.length, median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) }; };

async function main() {
  // child mode: one cold request in a fresh process
  if (process.argv[2] === '--cold') {
    const t0 = process.hrtime.bigint();
    const core = makeCore();
    const r = await once(core, REQUESTS[Number(process.argv[3])]);
    process.stdout.write(JSON.stringify({ total: Number(process.hrtime.bigint() - t0) / 1e6, request: r.ms }));
    process.exit(0);
  }
  const label = process.argv[2] || 'run';
  const WARM = 7;
  const out = { label, ran: new Date().toISOString(), machine: `${os.cpus()[0].model} ×${os.cpus().length}, ${Math.round(os.totalmem() / 1e9)} GB, ${process.platform} ${os.release()}, Node ${process.version}`,
    note: 'Fake PC (no Windows), no model provider, no network. Measures Nova\'s own routing/pipeline overhead and decision accuracy, not app launches or model answers.', requests: [] };
  const core = makeCore();
  for (const req of REQUESTS) await once(core, req);   // warm-up pass
  for (let i = 0; i < REQUESTS.length; i++) {
    const req = REQUESTS[i];
    const warm = [];
    let last;
    for (let k = 0; k < WARM; k++) { const c = makeCoreCached(); last = await once(c, req); warm.push(last.ms); }
    let cold = null;
    try { cold = JSON.parse(execFileSync(process.execPath, [__filename, '--cold', String(i)], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).toString()); } catch (e) { cold = { error: e.message.slice(0, 100) }; }
    out.requests.push({ cat: req.cat, text: req.text, expect: req.expect, needs: req.needs || null, ok: last.ok, route: last.route, ran: last.ran, reply: last.replies[last.replies.length - 1] || null, warm: stats(warm), cold });
    process.stdout.write(`${last.ok ? 'OK  ' : 'MISS'} ${req.cat.padEnd(12)} ${req.text.padEnd(54)} route=${String(last.route).padEnd(11)} warm ${stats(warm).median} ms  cold ${cold.total ? cold.total.toFixed(0) + ' ms' : cold.error}\n`);
  }
  // per category
  out.summary = {};
  for (const cat of [...new Set(REQUESTS.map(r => r.cat))]) {
    const rs = out.requests.filter(r => r.cat === cat);
    out.summary[cat] = { correct: rs.filter(r => r.ok).length, of: rs.length, warmMedianMs: stats(rs.map(r => r.warm.median)).median, coldMedianMs: stats(rs.filter(r => r.cold.total).map(r => r.cold.total)).median };
  }
  out.summary.all = { correct: out.requests.filter(r => r.ok).length, of: out.requests.length };
  // soak: 600 mixed requests with a Stop every 25, on one long-lived core
  const soakCore = makeCore();
  global.gc && global.gc();
  const heap0 = process.memoryUsage().heapUsed;
  const samples = [];
  for (let i = 0; i < 600; i++) {
    const req = REQUESTS[i % REQUESTS.length];
    if (req.text === 'stop') continue;
    const p = soakCore.pipeline.input({ text: req.text, source: i % 3 ? 'typed' : 'voice', utteranceId: 'soak-' + i });
    if (i % 25 === 24) soakCore.pipeline.stopAll('soak');
    await p;
    if (i % 100 === 99) { global.gc && global.gc(); samples.push({ i: i + 1, heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1), activeTasks: soakCore.h.tasks.active().length, events: soakCore.h.events.length }); }
  }
  global.gc && global.gc();
  out.soak = { requests: 600, stopsEvery: 25, heapStartMB: +(heap0 / 1048576).toFixed(1), heapEndMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1), samples, activeTasksAtEnd: soakCore.h.tasks.active().length, note: 'events grow because the benchmark harness records every UI event on purpose; tasks/handles must return to 0' };
  out.soak.activeHandles = process._getActiveHandles ? process._getActiveHandles().length : null;
  fs.writeFileSync(path.join(__dirname, 'results', label + '.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('\nAccuracy:', Object.entries(out.summary).map(([k, v]) => `${k} ${v.correct}/${v.of}`).join(' · '));
  console.log('Soak:', JSON.stringify(out.soak.samples), 'active tasks at end', out.soak.activeTasksAtEnd);
}
// warm runs reuse one core (a real Nova process keeps one)
let cached = null;
function makeCoreCached() { return cached || (cached = makeCore()); }
main().catch(e => { console.error(e); process.exit(1); });
