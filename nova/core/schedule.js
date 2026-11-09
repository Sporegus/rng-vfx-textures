// Scheduled job runs: "resume this job at 02:00" (once or daily).
// A schedule never creates permission: when it fires, the job still needs its
// own valid job approval, or it's left paused with the reason. Each due time
// fires at most once (recorded before running), so a restart or two Nova
// processes can't run it twice. Missed times (PC asleep) are skipped unless the
// schedule says "run once when I'm back".
'use strict';
const { id, NovaError } = require('./util');

function createScheduler({ store, jobs, log, now = () => Date.now(), tickMs = 30000 }) {
  let timer = null;
  const nextAt = (s, from) => {
    // s.at = "HH:MM" local time; daily or once
    const [h, m] = String(s.at).split(':').map(Number);
    const d = new Date(from); d.setSeconds(0, 0); d.setHours(h, m);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  function add({ jobId, at, repeat = 'once', missed = 'skip' }) {
    if (!/^\d{1,2}:\d{2}$/.test(String(at))) throw new NovaError('invalid', 'Use a time like 02:00.');
    if (!jobs.job(jobId)) throw new NovaError('not_found', 'No such job.');
    const s = { id: id('sched'), jobId, at, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, missed, lastRun: null, enabled: true, repeat, due: nextAt({ at }, now()) };
    save(s);
    log && log.event('schedule.added', { schedule: s.id, job: jobId, at, repeat });
    return s;
  }
  // the store's schedules table keeps id/job/at/tz/missed/lastRun/enabled; repeat+due ride in memory kind 'schedule_meta'
  function save(s) {
    store.putSchedule(s);
    store.remember('schedule:' + s.id, 'schedule_meta', { repeat: s.repeat, due: s.due });
  }
  function list() {
    const meta = Object.fromEntries(store.recall('schedule_meta').map(r => [r.key.slice(9), r.value]));
    return store.schedules().map(s => ({ ...s, ...(meta[s.id] || { repeat: 'once', due: null }) }));
  }
  function remove(sid) { store.tx(() => { store.db.prepare('DELETE FROM schedules WHERE id = ?').run(sid); store.forget('schedule:' + sid); }); }

  async function tick() {
    const t = now(), fired = [];
    for (const s of list()) {
      if (!s.enabled || !s.due || s.due > t) continue;
      const late = t - s.due > 10 * 60000;    // more than 10 minutes late: the PC was off or asleep
      // claim this due time first: whatever happens next, it never fires twice
      const claimed = store.acquire(`schedule:${s.id}:${s.due}`, id('sched-run'), 7 * 24 * 3600e3);   // a unique owner: nobody can take this claim again
      if (!claimed) continue;
      const ran = s.due;
      s.lastRun = t;
      s.due = s.repeat === 'daily' ? nextAt(s, t) : null;
      if (s.repeat !== 'daily') s.enabled = false;
      save(s);
      if (late && s.missed === 'skip') { log && log.event('schedule.skipped', { schedule: s.id, job: s.jobId, late: t - ran }); fired.push({ id: s.id, skipped: true }); continue; }
      const r = await jobs.resume(s.jobId).catch(e => ({ ok: false, reason: e.message }));
      log && log.event('schedule.fired', { schedule: s.id, job: s.jobId, ok: r.ok, reason: r.ok ? null : r.reason });
      fired.push({ id: s.id, ok: r.ok, reason: r.reason });
    }
    return fired;
  }
  return {
    add, list, remove, tick,
    start() { if (!timer) { timer = setInterval(() => tick().catch(() => {}), tickMs); tick().catch(() => {}); } },
    stop() { clearInterval(timer); timer = null; },
  };
}

module.exports = { createScheduler };
