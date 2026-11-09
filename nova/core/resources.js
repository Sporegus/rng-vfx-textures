// Watches the PC's memory and CPU (cheaply, every 15 s) so Nova backs off when
// the computer is under pressure: no new background jobs start, and the status
// says why. Interactive requests and Stop are never held back.
'use strict';
const os = require('os');

function cpuSnapshot() { return os.cpus().map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) })); }
function defaultSampler() {
  let prev = cpuSnapshot();
  return () => {
    const cur = cpuSnapshot();
    let idle = 0, total = 0;
    cur.forEach((c, i) => { idle += c.idle - (prev[i] ? prev[i].idle : 0); total += c.total - (prev[i] ? prev[i].total : 0); });
    prev = cur;
    return { freeMemMB: Math.round(os.freemem() / 1048576), totalMemMB: Math.round(os.totalmem() / 1048576), cpuPct: total ? Math.round(100 * (1 - idle / total)) : 0 };
  };
}

function createResources({ sample = defaultSampler(), intervalMs = 15000, log, onChange } = {}) {
  let state = { level: 'ok', reason: null, sample: null, at: null };
  let hotCpu = 0, timer = null;
  function check() {
    const s = sample();
    const lowMem = s.freeMemMB < Math.max(800, s.totalMemMB * 0.08);
    hotCpu = s.cpuPct >= 92 ? hotCpu + 1 : 0;      // two samples in a row, not a brief spike
    const level = lowMem || hotCpu >= 2 ? 'high' : 'ok';
    const reason = lowMem ? `low memory (${s.freeMemMB} MB free)` : hotCpu >= 2 ? `the processor is busy (${s.cpuPct}%)` : null;
    const changed = level !== state.level;
    state = { level, reason, sample: s, at: Date.now() };
    if (changed) { log && log.event('resources.pressure', { level, reason }); onChange && onChange(state); }
    return state;
  }
  return {
    check, status: () => state,
    start() { if (!timer) { timer = setInterval(check, intervalMs); timer.unref && timer.unref(); check(); } },
    stop() { clearInterval(timer); timer = null; },
  };
}

module.exports = { createResources, defaultSampler };
