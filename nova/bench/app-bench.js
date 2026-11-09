// Benchmark the REAL Nova app (Electron) through Playwright:
//   cold start → first answer, warm typed requests → answer visible, listening indicator,
//   Stop round trip, memory by process at idle and after a soak (requests, menus, Stops),
//   and renderer memory per look (hologram video vs pixel sprite).
// Needs Playwright + a display (on Linux: xvfb-run). Usage: node bench/app-bench.js <label>
'use strict';
const { _electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const APP = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stats = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); if (!s.length) return null; const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)]; return { n: s.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
const WARM = ['what is 7 times 3', 'what time is it', 'dark mode', 'set a timer for 2 minutes', 'tell me a joke', 'hi nova', 'what can you do', 'how are you', 'what are you doing', 'thanks'];

async function launch(extra = {}) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bench-'));
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ introDone: true, voiceOffered: true, wander: false, ...extra }));
  const t0 = Date.now();
  const app = await _electron.launch({ executablePath: require('electron'), args: [APP, '--no-sandbox', '--disable-gpu', `--user-data-dir=${ud}`], cwd: APP });
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.novaDebug && window.nova);
  return { app, page, t0, ready: Date.now() - t0 };
}
const metrics = (app) => app.evaluate(({ app }) => app.getAppMetrics().map(p => ({ type: p.type, name: p.name || p.serviceName || '', mb: Math.round(p.memory.workingSetSize / 1024), cpu: Math.round(p.cpu.percentCPUUsage * 10) / 10 })));
async function ask(page, text, expectFn) {
  return page.evaluate(async ([text]) => {
    document.querySelector('.b-x') && document.querySelector('#bubble').classList.contains('hidden') === false && document.querySelector('.b-x').click();
    const before = document.querySelector('#b-text').textContent;
    const t = performance.now(); novaDebug.command(text);
    return await new Promise((r) => { const iv = setInterval(() => { const now = document.querySelector('#b-text').textContent; if (!document.querySelector('#bubble').classList.contains('hidden') && now && now !== before && now !== '…' && now.length > 2) { clearInterval(iv); r(performance.now() - t); } if (performance.now() - t > 8000) { clearInterval(iv); r(null); } }, 2); });
  }, [text]);
}

(async () => {
  const label = process.argv[2] || 'run';
  const out = { label, ran: new Date().toISOString(), machine: `${os.cpus()[0].model} ×${os.cpus().length}, ${Math.round(os.totalmem() / 1e9)} GB RAM, ${process.platform}`, display: process.env.DISPLAY ? 'virtual display (Xvfb), software rendering (--disable-gpu)' : 'unknown', note: 'Not the target Windows PC. Use for before/after comparison on the same machine.' };
  // cold starts
  const cold = [];
  for (let i = 0; i < 3; i++) {
    const { app, page, t0, ready } = await launch();
    await sleep(300);
    const first = await ask(page, 'what is 7 times 3');
    cold.push({ windowReadyMs: ready, firstAnswerMs: first, launchToAnswerMs: Date.now() - t0 });
    app.process().kill('SIGKILL');
  }
  out.cold = { runs: cold, launchToAnswer: stats(cold.map(c => c.launchToAnswerMs)), firstAnswer: stats(cold.map(c => c.firstAnswerMs)) };
  // warm session
  const { app, page } = await launch();
  await sleep(2500);
  out.idleMetrics = await metrics(app);
  const warm = [];
  for (let k = 0; k < 3; k++) for (const t of WARM) { warm.push(await ask(page, t)); await sleep(120); }
  out.warmAnswer = stats(warm);
  // listening indicator + stop
  for (let i = 0; i < 15; i++) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('command', 'ptt', Date.now())); await sleep(200); await page.evaluate(() => { const x = document.querySelector('.b-x'); x && x.click(); }); await sleep(100); }
  const stops = [];
  for (let i = 0; i < 15; i++) stops.push(await page.evaluate(async () => { const t = performance.now(); await window.nova.core.stop(); return performance.now() - t; }));
  out.stopRoundTrip = stats(stops);
  // soak: 150 requests, 50 menu open/close, a Stop every 15
  const t0 = Date.now();
  for (let i = 0; i < 150; i++) {
    await page.evaluate((t) => { novaDebug.command(t); }, WARM[i % WARM.length]);
    await sleep(40);
    if (i % 3 === 0) await page.evaluate(() => { novaDebug.mainMenu(); });
    await sleep(40);
    await page.evaluate(() => { const x = document.querySelector('.b-x'); x && x.click(); });
    if (i % 15 === 14) await page.evaluate(() => window.nova.core.stop());
  }
  await sleep(2000);
  out.soak = { requests: 150, menus: 50, stops: 10, seconds: Math.round((Date.now() - t0) / 1000) };
  out.afterSoakMetrics = await metrics(app);
  out.windowsAfterSoak = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  out.rendererHeapMB = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  const log = fs.readdirSync(os.tmpdir()).length; void log;
  const t = await page.evaluate(() => 0); void t;
  const core = await app.evaluate(async () => 0); void core;
  const timings = JSON.parse(await page.evaluate(() => JSON.stringify([])));
  void timings;
  app.process().kill('SIGKILL');
  // renderer memory per look
  out.byLook = {};
  for (const skin of ['idle', 'holo']) {
    const s = await launch({ skin, idleSkinSet: true });
    await sleep(4000);
    const m = await metrics(s.app);
    out.byLook[skin] = { rendererMB: m.filter(p => p.type === 'Tab').reduce((a, p) => a + p.mb, 0), gpuMB: m.filter(p => p.type === 'GPU').reduce((a, p) => a + p.mb, 0), totalMB: m.reduce((a, p) => a + p.mb, 0), rendererCpu: m.filter(p => p.type === 'Tab').reduce((a, p) => a + p.cpu, 0) };
    s.app.process().kill('SIGKILL');
  }
  fs.writeFileSync(path.join(__dirname, 'results', label + '-app.json'), JSON.stringify(out, null, 2) + '\n');
  const sum = (m) => m.reduce((a, p) => a + p.mb, 0);
  console.log(JSON.stringify({ cold: out.cold.launchToAnswer, warm: out.warmAnswer, stop: out.stopRoundTrip, idleMB: sum(out.idleMetrics), afterSoakMB: sum(out.afterSoakMetrics), windows: out.windowsAfterSoak, byLook: out.byLook }, null, 1));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
