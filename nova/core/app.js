// Starts Nova's core inside the Electron main process and connects it to her
// page (the bubble) and the Tasks panel. Everything that decides or acts lives
// here, in one pipeline; the page only shows things and collects your answers.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { BrowserWindow, ipcMain, globalShortcut, safeStorage, shell, dialog, screen } = require('electron');
const { openStore } = require('./store');
const { createLog } = require('./log');
const { createTasks } = require('./tasks');
const { createPermissions, CATEGORIES } = require('./permissions');
const { createTools } = require('./tools');
const { createPipeline } = require('./pipeline');
const { createWin } = require('./win');
const { registerDesktop, createGuard, createWindowRefs } = require('./desktop');
const { createScreen } = require('./screen');
const { createDiscord, botAdapter } = require('./discord');
const { createResearch } = require('./research');
const { createJobs } = require('./jobs');
const { createGames, electronAdapter } = require('./games');
const participantsMod = require('./participants');
const llm = require('./llm');
const { id, sha256 } = require('./util');
const brain = require('../brain/brain');

// secrets (API keys, the Discord bot token) are encrypted with Windows' DPAPI via
// safeStorage, stored apart from settings, and never sent to the page or a model
function secrets(dir) {
  const file = (name) => path.join(dir, 'keys', name.replace(/[^a-z0-9-]/gi, '') + '.key');
  const cache = new Map();
  return {
    read(name) {
      if (cache.has(name)) return cache.get(name);
      let v = null;
      try { const b = fs.readFileSync(file(name)); v = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : null; } catch {}
      cache.set(name, v); return v;
    },
    save(name, value) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('This PC can\'t store keys safely.');
      fs.mkdirSync(path.dirname(file(name)), { recursive: true });
      fs.writeFileSync(file(name), safeStorage.encryptString(String(value).trim()));
      cache.set(name, String(value).trim());
    },
    forget(name) { fs.rmSync(file(name), { force: true }); cache.delete(name); },
    has(name) { return !!this.read(name); },
  };
}

function startCore({ app, getWin, settings, saveSettings, actions, voice }) {
  const dir = app.getPath('userData');
  const store = openStore(path.join(dir, 'nova.db'));
  const log = createLog({ dir: path.join(dir, 'logs') });
  const keys = secrets(dir);
  const tasks = createTasks({ store, log });
  const permissions = createPermissions({ store, log });
  const tools = createTools({ permissions, log, store, locks: store });
  const win = createWin({ log });
  const refs = createWindowRefs({ win, selfPid: process.pid });
  registerDesktop({ tools, win, log, refs, apps: { open: (name) => actions.run('apps.open', { name }) } });

  // ---- brains (each optional; Nova says plainly when none is set up)
  const providers = {
    anthropic: llm.anthropic({ key: () => keys.read('anthropic'), model: settings().anthropicModel || undefined }),
    openai: llm.openai({ key: () => keys.read('openai'), model: settings().openaiModel || undefined }),
    local: llm.local({ ask: (t, onText, sig) => voice.ask(t, onText, sig), ready: () => voice.chatReady() }),
  };
  const chooser = llm.chooser(providers, settings().brainOrder || ['anthropic', 'openai', 'local']);

  // ---- the page (bubble) and panel talk through these
  const waits = new Map();     // approval / choice id -> { resolve, card }
  const toPage = (type, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('core', { type, ...data }); };
  let panel = null;
  const toPanel = (type, data) => { if (panel && !panel.isDestroyed()) panel.webContents.send('core', { type, ...data }); };
  const both = (type, data) => { toPage(type, data); toPanel(type, data); };
  const history = [];
  const remember = (who, text, taskId) => { history.push({ who, text: String(text).slice(0, 2000), taskId, t: Date.now() }); if (history.length > 100) history.shift(); };
  const pendingWait = (kind, data, timeoutMs = 10 * 60000) => new Promise((resolve) => {
    const wid = data.id || id(kind);
    waits.set(wid, { resolve, kind, data: { ...data, id: wid } });
    both(kind, { ...data, id: wid });
    setTimeout(() => { if (waits.has(wid)) { waits.delete(wid); both('closed', { id: wid }); resolve(kind === 'approve' ? { allow: false, expired: true } : null); } }, timeoutMs);
  });
  const ui = {
    transcript: (e) => toPage('transcript', e),
    status: (e) => { both('status', e); },
    reply: (e) => { if (e.text) remember('nova', e.text, e.taskId); both('reply', e); },
    approve: (card) => pendingWait('approve', card),          // never auto-approved: only your click (or spoken yes) answers
    choose: (q) => pendingWait('choose', q),
    openPanel: (tab, extra) => openPanel(tab, extra),
    highlight: (r) => toPage('highlight', r),
  };
  ipcMain.on('core:answer', (_, wid, value) => {
    const w = waits.get(wid);
    if (!w) return;
    waits.delete(wid);
    both('closed', { id: wid });
    w.resolve(value);
  });

  // the page's own abilities (menus, files, timers...) run there, after the core has checked them
  const pageWaits = new Map();
  ipcMain.on('core:page:done', (_, pid, result) => { const r = pageWaits.get(pid); if (r) { pageWaits.delete(pid); if (result && result.said) remember('nova', String(result.said).slice(0, 500)); r(result || {}); } });
  const page = {
    run: (step, signal) => new Promise((resolve) => {
      const pid = id('page');
      pageWaits.set(pid, resolve);
      toPage('page', { id: pid, step: { intent: step.intent, slots: step.slots, ready: step.ready !== false, missing: step.missing || [], confidence: step.confidence, risk: step.risk }, approved: !!step.approved });
      if (signal) signal.addEventListener('abort', () => { if (pageWaits.delete(pid)) { toPage('page-cancel', { id: pid }); resolve({ cancelled: true }); } }, { once: true });
      setTimeout(() => { if (pageWaits.delete(pid)) resolve({ timeout: true }); }, 10 * 60000);
    }),
  };

  // ---- features
  const overlay = () => getWin();
  const screenCtx = createScreen({
    win, refs, llm: chooser, settings, saveSettings, log, selfPid: process.pid,
    hideSelf: async () => { const w = overlay(); if (!w || !w.isVisible()) return null; w.setOpacity(0); await new Promise(r => setTimeout(r, 90)); return () => { if (!w.isDestroyed()) w.setOpacity(1); }; },
  });
  const discord = createDiscord({ store, adapter: botAdapter({ token: () => keys.read('discord-bot') }), launch: (u) => shell.openExternal(u), log, permissions });
  const research = createResearch({ log });
  const participants = {
    'claude-cli': participantsMod.claudeCli('claude-cli', 'implementer', {}),
    'anthropic-api': participantsMod.apiModel('anthropic-api', 'planner', providers.anthropic, 'anthropic-api'),
    'openai-api': participantsMod.apiModel('openai-api', 'planner', providers.openai, 'openai-api'),
    ...demoParticipants(),
  };
  participants['claude-cli'].probe().catch(() => {});
  const jobs = createJobs({ store, permissions, log, participants });
  jobs.on((j) => toPanel('job', { job: j }));

  let fixtureWin = null;
  const games = createGames({
    store, permissions, log, launch: (u) => shell.openExternal(u),
    sessions: {
      has: (pid) => pid === 'nova-fixture',
      async open() {
        if (!fixtureWin || fixtureWin.isDestroyed()) {
          fixtureWin = new BrowserWindow({ width: 660, height: 520, useContentSize: true, title: 'Nova coin fixture', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
          await fixtureWin.loadFile(path.join(__dirname, '..', 'games', 'fixture', 'index.html'));
        }
        fixtureWin.show(); fixtureWin.focus();
        await new Promise(r => setTimeout(r, 400));
        return electronAdapter(fixtureWin);
      },
    },
    guardFor: () => (win.available() ? createGuard({ win }) : null),
  });

  const pipeline = createPipeline({ tasks, permissions, tools, log, llm: chooser, brain, ui, page, jobs, discord, screen: screenCtx, games, research });
  pipeline.onStop(() => { win.releaseAll(); games.stop(); for (const [wid, w] of waits) { waits.delete(wid); both('closed', { id: wid }); w.resolve(w.kind === 'approve' ? { allow: false, cancelled: true } : null); } toPage('stopped', {}); });
  tasks.on((t) => both('task', { task: t }));

  // ---- input from the page (typed, or voice after the wake word / push-to-talk)
  ipcMain.handle('core:input', async (_, msg) => {
    const m = { text: String(msg.text || '').slice(0, 2000), source: msg.source === 'voice' ? 'voice' : 'typed', final: msg.final !== false, utteranceId: msg.utteranceId || null };
    if (m.final) remember('you', m.text);
    const r = await pipeline.input(m);
    return { ok: !r.error, error: r.error || null };
  });
  const stop = (why) => { const t0 = Date.now(); const r = pipeline.stopAll(why); log.event('stop.latency', { ms: Date.now() - t0, why }); return r; };
  ipcMain.handle('core:stop', () => stop('stop button'));
  globalShortcut.register('Control+Alt+X', () => stop('shortcut Ctrl+Alt+X'));
  // the page tells us how fast it showed "listening" after the hotkey (measured there)
  ipcMain.on('core:timing', (_, what, ms) => { if (typeof ms === 'number' && ms >= 0 && ms < 60000) log.event('timing', { what: String(what).slice(0, 40), ms: Math.round(ms) }); });

  // ---- the Tasks panel
  function openPanel(tab = 'tasks', extra = {}) {
    if (!panel || panel.isDestroyed()) {
      const a = screen.getPrimaryDisplay().workArea;
      panel = new BrowserWindow({
        width: 820, height: 640, x: a.x + a.width - 860, y: a.y + 40, title: 'Nova — Tasks', autoHideMenuBar: true, show: false,
        backgroundColor: '#0d1726',
        webPreferences: { preload: path.join(__dirname, '..', 'panel-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      panel.loadFile(path.join(__dirname, '..', 'src', 'panel.html'));
      panel.once('ready-to-show', () => panel.show());
    } else panel.show();
    panel.webContents.once('did-finish-load', () => toPanel('tab', { tab, ...extra }));
    if (!panel.webContents.isLoading()) toPanel('tab', { tab, ...extra });
  }
  ipcMain.on('core:panel', (_, tab) => openPanel(tab || 'tasks'));

  const capability = () => {
    const winOk = win.available();
    const ch = chooser.status();
    const live = (ok, what, why) => ({ what, state: ok ? 'live' : 'not set up', why: ok ? '' : why });
    return [
      { what: 'Typed requests and the bubble', state: 'live', why: '' },
      { what: 'Push-to-talk / wake word', state: settings().listen || settings().voice ? 'live' : 'off', why: 'Tray > Voice (offline speech model, downloads on first use).' },
      { what: 'Opening apps (verified)', ...pick(winOk, 'Windows only.') },
      { what: 'Moving and arranging windows', ...pick(winOk, 'Windows only.') },
      { what: 'Reading the screen (UI text, OCR)', ...pick(winOk && settings().screenConsent, winOk ? 'Asks for consent the first time.' : 'Windows only.') },
      { what: 'Typing and pressing buttons for you', ...pick(winOk, 'Windows only; always asks first.') },
      { what: 'Answers from Claude (API)', ...pick(ch.anthropic && ch.anthropic.ok, 'Add an Anthropic API key in Settings.') },
      { what: 'Answers from ChatGPT models (API)', ...pick(ch.openai && ch.openai.ok, 'Add an OpenAI API key in Settings.') },
      { what: 'Answers from the free on-device brain', ...pick(ch.local && ch.local.ok, 'Tray > Voice > Chat brain.') },
      { what: 'Web research with sources', state: 'live', why: 'Wikipedia + DuckDuckGo (no account).' },
      { what: 'Discord: open a channel for you', state: 'live', why: 'Add the channel in Settings > Discord first.' },
      { what: 'Discord: post as the Nova bot', ...pick(keys.has('discord-bot'), 'Needs your own bot token (Settings > Discord). Never posts as you.') },
      { what: 'Discord: talk in a voice call', state: 'not built', why: 'Needs a bot with voice and text-to-speech; Nova has no voice yet.' },
      { what: 'Jobs between assistants: Claude Code CLI', ...pick(participants['claude-cli'].available().ok && !participants['claude-cli'].available().unchecked, 'Install Claude Code ("claude" command).') },
      { what: 'Jobs between assistants: your existing ChatGPT/Claude chats', state: 'not possible', why: 'Neither app lets another program post into a chat; Nova won\'t scrape sessions.' },
      { what: 'Games: Nova\'s test game', state: 'live', why: 'Say "play the test game".' },
      { what: 'Games: Roblox', state: 'launch + advice', why: 'Official links only; Roblox\'s rules don\'t allow automated play.' },
      { what: 'Her voice (text to speech)', state: 'later', why: 'Bubble text only for now; the speech output interface is ready.' },
    ];
    function pick(ok, why) { return { state: ok ? 'live' : 'not set up', why: ok ? '' : why }; }
  };

  // panel requests: read things, change settings, manage jobs/memory/keys. Nothing here runs a tool.
  ipcMain.handle('core:query', async (_, what, arg = {}) => {
    switch (what) {
      case 'overview': return {
        tasks: store.tasks(40), jobs: jobs.list(), history: history.slice(-60),
        waits: [...waits.values()].map(w => ({ kind: w.kind, ...w.data })),
        grants: permissions.list().filter(g => g.active).map(g => ({ id: g.id, scope: g.scope, categories: g.categories, targets: g.targets, expires: g.expires, title: g.details && g.details.title })),
      };
      case 'job': return { job: jobs.job(arg.id), events: jobs.events(arg.id), card: jobs.job(arg.id) ? jobs.card(jobs.job(arg.id)) : null, problems: jobs.job(arg.id) ? jobs.validateContract(jobs.job(arg.id)) : [] };
      case 'job:update': return jobs.update(arg.id, arg.patch);
      case 'job:pickFolder': { const r = await dialog.showOpenDialog(panel, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; }
      case 'job:approve': { const j = jobs.job(arg.id); jobs.approve(j); jobs.run(j.id).catch(e => log.event('job.run_error', { message: e.message })); return { ok: true }; }
      case 'job:pause': return jobs.control('pause_all');
      case 'job:finishStep': return jobs.control('finish_step');
      case 'job:resume': return jobs.resume(arg.id);
      case 'job:cancel': return jobs.cancel(arg.id);
      case 'job:delete': store.deleteJob(arg.id); return { ok: true };
      case 'job:demo': return startDemoJob();
      case 'digest': return jobs.digest();
      case 'participants': return Object.entries(participants).map(([k, p]) => ({ id: k, kind: p.kind, live: p.live, ...p.available() }));
      case 'diagnostics': return {
        timings: pipeline.timings(), log: log.recent(200), capability: capability(), providers: chooser.status(),
        platform: `${process.platform} ${os.release()}`, versions: { electron: process.versions.electron, node: process.versions.node, nova: app.getVersion() },
        winHelper: win.available(), db: store.version && store.version(),
      };
      case 'diagnostics:export': {
        const r = await dialog.showSaveDialog(panel, { defaultPath: path.join(app.getPath('documents'), `nova-diagnostics-${Date.now()}.json`) });
        if (r.canceled) return null;
        fs.writeFileSync(r.filePath, JSON.stringify({ exported: new Date().toISOString(), timings: pipeline.timings(), log: log.recent(1000), capability: capability() }, null, 2));
        return r.filePath;
      }
      case 'capability': return capability();
      case 'memory': return { items: store.recall().filter(m => !['game_profile'].includes(m.kind)), conversation: pipeline.context().history };
      case 'memory:forget': store.forget(arg.key); return { ok: true };
      case 'memory:forgetConversation': pipeline.forgetConversation(); history.length = 0; return { ok: true };
      case 'discord:targets': return store.recall('discord_target').map(r => ({ key: r.key, ...r.value }));
      case 'discord:add': return discord.addTarget(arg);
      case 'discord:remove': store.forget(arg.key); return { ok: true };
      case 'roblox:add': games.addPlace(arg.alias, arg.placeId); return { ok: true };
      case 'keys': return { anthropic: keys.has('anthropic'), openai: keys.has('openai'), 'discord-bot': keys.has('discord-bot') };
      case 'keys:save': if (!['anthropic', 'openai', 'discord-bot'].includes(arg.name)) return { ok: false }; keys.save(arg.name, arg.value); return { ok: true };
      case 'keys:forget': keys.forget(arg.name); return { ok: true };
      case 'grants:revoke': { const g = permissions.list().find(x => x.id === arg.id); if (g) permissions.revoke(g, 'you revoked it'); return { ok: true }; }
      case 'settings': return settings();
      case 'settings:set': {
        const allowed = ['screenConsent', 'quietHours', 'brainOrder', 'anthropicModel', 'openaiModel', 'presets'];
        const patch = Object.fromEntries(Object.entries(arg).filter(([k]) => allowed.includes(k)));
        saveSettings(patch); return settings();
      }
      case 'say': return pipeline.input({ text: String(arg.text || ''), source: 'typed' }).then(() => ({ ok: true }));
      case 'stop': return stop('panel');
    }
    return null;
  });

  // ---- the coordination demo: fixture assistants on a throwaway project, clearly labeled
  function demoParticipants() {
    let impl = 0;
    return {
      'demo-planner': participantsMod.fixture('demo-planner', 'planner', async (env) => ({ status: 'complete', output: /Last review: accept/.test(env.context) ? '{"done":true}' : /subtracts/.test(env.context) ? '{"task":"Fix add(): it subtracts instead of adding."}' : '{"task":"Create add.js exporting add(a, b)."}' })),
      'demo-implementer': participantsMod.fixture('demo-implementer', 'implementer', async () => ({ status: 'complete', output: 'nothing to do' })),
      'demo-reviewer': participantsMod.fixture('demo-reviewer', 'reviewer', async (env) => ({ status: 'complete', output: /PASS/.test(env.context) ? '{"verdict":"accept"}' : '{"verdict":"reject","corrections":"add subtracts","critical":true}' })),
    };
  }
  function startDemoJob() {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-demo-'));
    fs.writeFileSync(path.join(ws, 'check.js'), "const {add}=require('./add.js');if(add(2,3)!==5){console.error('add(2,3) should be 5');process.exit(1)}console.log('ok');\n");
    // the demo implementer writes into this folder (a fixture: first a bug, then the fix)
    let n = 0;
    participants['demo-implementer'].send = async () => { n++; fs.writeFileSync(path.join(ws, 'add.js'), n === 1 ? 'exports.add=(a,b)=>a-b;\n' : 'exports.add=(a,b)=>a+b;\n'); return { status: 'complete', output: n === 1 ? 'Wrote add.js.' : 'Fixed add.js; check.js passes.' }; };
    const j = jobs.draft('DEMO (fixtures, nothing live): make add.js add two numbers', {
      workspace: ws, files: ['add.js'], testCommand: [process.execPath, 'check.js'], criteria: ['add(2,3) is 5'],
      participants: [{ id: 'demo-planner', role: 'planner' }, { id: 'demo-implementer', role: 'implementer' }, { id: 'demo-reviewer', role: 'reviewer' }],
      budgets: { maxCycles: 6, maxHours: 0.25 },
      testEnv: { ELECTRON_RUN_AS_NODE: '1' },   // inside Nova, process.execPath is Electron: run it as plain Node
    });
    return { id: j.id };
  }

  // restart: only jobs with a valid restart-resume approval continue
  jobs.recover().then((r) => { if (r.length) log.event('jobs.recovered', { count: r.length, resumed: r.filter(x => x.resumed).length }); }).catch(() => {});
  log.event('core.started', { platform: process.platform, winHelper: win.available() });

  return { pipeline, store, log, jobs, games, stop, openPanel, close() { try { win.stop(); } catch {} try { store.close(); } catch {} } };
}

module.exports = { startCore, secrets };
