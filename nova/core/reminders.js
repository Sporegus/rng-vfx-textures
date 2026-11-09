// Reminders that survive restarts. A clock time ("at 5pm") is kept as your local
// wall time; daylight-saving changes are handled: a time that doesn't exist that day
// (spring forward) moves to the first valid minute and she says so; an ambiguous one
// (fall back) uses the first occurrence. A reminder due while the PC was off or asleep
// is still shown when it wakes, marked late. Each one fires at most once.
'use strict';
const { id, NovaError } = require('./util');

// local wall time -> the next real moment it happens
function nextLocal({ h, m = 0, day = 0, vague = false }, from = new Date()) {
  const at = (hh) => { const d = new Date(from); d.setSeconds(0, 0); d.setDate(d.getDate() + day); d.setHours(hh, m, 0, 0); if (d <= from && !day) d.setDate(d.getDate() + 1); return d; };
  let when = at(h);
  if (vague && h < 12) { const pm = at(h + 12); if (pm < when) when = pm; }   // "at 5" = whichever 5 comes first
  const wanted = vague && when.getHours() >= 12 && h < 12 ? h + 12 : h;
  // if the clock jumped over that time (DST), JS already moved it forward: say so
  const shifted = when.getHours() !== wanted % 24 || when.getMinutes() !== m;
  return { due: when.getTime(), shifted, wall: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` };
}

function createReminders({ store, log, now = () => Date.now(), lateMs = 10 * 60000 }) {
  const all = () => store.recall('reminder').map(r => r.value).filter(Boolean);
  const save = (r) => { store.remember('reminder:' + r.id, 'reminder', r); return r; };
  function add({ text, inSeconds, at }) {
    const t = String(text || '').trim().slice(0, 200) || 'your reminder';
    let due, note = null, wall = null;
    if (inSeconds) { if (!(inSeconds > 0 && inSeconds < 366 * 86400)) throw new NovaError('invalid', 'That time is out of range.'); due = now() + inSeconds * 1000; }
    else if (at) { const n = nextLocal(at, new Date(now())); due = n.due; wall = n.wall; if (n.shifted) note = `That time doesn't exist that day (the clocks change), so I set it for ${n.wall}.`; }
    else throw new NovaError('invalid', 'When should I remind you?');
    const r = save({ id: id('rem'), text: t, due, wall, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, status: 'pending', created: now() });
    log && log.event('reminder.added', { reminder: r.id, inMs: due - now() });
    return { ...r, note };
  }
  function cancel(match) {
    const m = String(match || '').toLowerCase();
    const hits = all().filter(r => r.status === 'pending' && (!m || r.id === match || r.text.toLowerCase().includes(m)));
    for (const r of hits) { r.status = 'cancelled'; save(r); }
    return hits;
  }
  // due ones, each claimed once (even with two Nova processes or a restart in between)
  function due() {
    const t = now(), out = [];
    for (const r of all()) {
      if (r.status !== 'pending' || r.due > t) continue;
      if (!store.acquire('reminder-fire:' + r.id, id('fire'), 7 * 86400e3)) continue;
      r.status = t - r.due > lateMs ? 'missed' : 'fired';
      r.firedAt = t;
      save(r);
      out.push({ ...r, late: r.status === 'missed' });
      log && log.event('reminder.fired', { reminder: r.id, lateMs: t - r.due });
    }
    return out;
  }
  const pending = () => all().filter(r => r.status === 'pending').sort((a, b) => a.due - b.due);
  return { add, cancel, due, pending, list: all, nextLocal };
}

module.exports = { createReminders, nextLocal };
