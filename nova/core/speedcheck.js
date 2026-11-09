// "npm run speed-check": the same app launch done two ways on THIS PC, with the app closed
// before each try:
//   by hand:      Windows starts the app directly (the same Start-menu entry), timed until its window shows
//   through Nova: the typed request goes through her real pipeline, timed until she has confirmed the window
// The difference is what Nova adds. Also: a paraphrase, and the app already being open.
// Only apps that aren't already running are used, and only the windows this check opened are closed.
'use strict';
const { sleep } = require('./util');

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
const matches = (w, name) => { const p = String(w.process || '').toLowerCase(), t = String(w.title || '').toLowerCase(); return words(name).some(x => p.includes(x) || (!/chrome|msedge|firefox|explorer/.test(p) && t.includes(x))); };

async function speedCheck({ pipeline, win, actions, log, apps = ['notepad', 'calculator'], rounds = 3, report = () => {} }) {
  const out = { ran: new Date().toISOString(), platform: process.platform, apps: [] };
  if (!win.canList()) { out.error = 'Nova can\'t list windows on this PC, so it can\'t time when an app appears.'; return out; }
  await win.call('windows', {}, 30000).catch(() => {});   // (the window helper running, as it is once Nova has started)
  await actions.run('apps.warm', {}).catch(() => {});
  const listWins = () => win.windows().catch(() => []);
  const waitFor = async (name, t0, ms = 20000) => { for (;;) { if ((await listWins()).some(w => matches(w, name))) return Date.now() - t0; if (Date.now() - t0 > ms) return null; await sleep(120); } };
  const close = async (name) => { await actions.run('apps.close', { name }).catch(() => {}); for (let i = 0; i < 50 && (await listWins()).some(w => matches(w, name)); i++) await sleep(100); await sleep(700); };
  const trace = async (text) => {
    const n = pipeline.traces().length;
    await pipeline.input({ text, source: 'typed', timing: { typedAt: Date.now() } });
    return pipeline.traces().slice(n).find(t => t.text === text.slice(0, 60)) || pipeline.traces().slice(-1)[0];
  };
  for (const name of apps) {
    if ((await listWins()).some(w => matches(w, name))) { out.apps.push({ app: name, skipped: 'already open: close it and run the check again' }); continue; }
    const row = { app: name, byHand: [], nova: [] };
    for (let i = 0; i < rounds; i++) {
      // by hand: the OS starts it (no Nova logic in between)
      const t0 = Date.now();
      const r = await actions.run('apps.open', { name });
      if (r.notFound) { row.skipped = 'not installed'; break; }
      row.byHand.push(await waitFor(name, t0));
      await close(name);
      // through Nova
      const t = await trace(i === 1 ? `could you pull up ${name} for me` : `open ${name}`);
      row.nova.push({ said: t.text, understandMs: t.toDispatchMs, doMs: t.toDoneMs, totalMs: t.totalMs, appWindowMs: t.app && t.app.windowMs, path: t.path, modelCalls: t.modelCalls });
      report(`${name}: by hand ${row.byHand[i]} ms, through Nova ${t.totalMs} ms (understanding ${t.toDispatchMs} ms)`);
      if (i < rounds - 1) await close(name);
    }
    if (!row.skipped) {
      const t = await trace(`open ${name}`);   // already open: brought to the front
      row.alreadyOpen = { totalMs: t.totalMs, focused: !!(t.app && t.app.focused) };
      await close(name);
      const med = (a) => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
      row.median = { byHandMs: med(row.byHand), novaTotalMs: med(row.nova.map(x => x.totalMs)), novaUnderstandMs: med(row.nova.map(x => x.understandMs)) };
      row.median.novaAddsMs = row.median.novaTotalMs != null && row.median.byHandMs != null ? row.median.novaTotalMs - row.median.byHandMs : null;
    }
    out.apps.push(row);
  }
  log && log.event('speedcheck', { apps: out.apps.map(a => ({ app: a.app, ...(a.median || { skipped: a.skipped }) })) });
  return out;
}

module.exports = { speedCheck };
