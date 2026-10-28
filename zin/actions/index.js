// Every action Zinx can do, by name. The page asks for one of these through
// preload.js; anything not listed here simply doesn't exist.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell, dialog } = require('electron');
const files = require('./files');
const organize = require('./organize');
const clean = require('./clean');
const wallpaper = require('./wallpaper');
const system = require('./system');
const windows = require('./windows');

module.exports = function createActions(ctx) {
  const undoDir = () => path.join(ctx.app.getPath('userData'), 'undo');
  const notesFile = () => path.join(ctx.app.getPath('documents'), 'Zinx Notes.txt');
  const plans = new Map(); // organize plans waiting for a yes
  const FOLDERS = { downloads: 'downloads', desktop: 'desktop', documents: 'documents', pictures: 'pictures' };

  async function pickFolder() {
    const r = await dialog.showOpenDialog(ctx.getWin(), { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  }
  // where did that Explorer window open? (so Zinx can run over and point at it)
  async function activeWindowSoon(ms = 900) {
    if (process.platform !== 'win32') return null;
    await new Promise(r => setTimeout(r, ms));
    try { return ctx.toOverlay(await windows.active()); } catch { return null; }
  }

  const table = {
    // ---- files
    'files.find': ({ query }) => files.find(query),
    'files.recent': () => files.recent(),
    'files.big': () => files.big(),
    'files.reveal': async ({ path: p }) => { shell.showItemInFolder(p); return { window: await activeWindowSoon() }; },
    'files.open': async ({ path: p }) => { const err = await shell.openPath(p); if (err) throw new Error(err); return {}; },
    'files.openFolder': async ({ folder }) => {
      const p = FOLDERS[folder] ? ctx.app.getPath(FOLDERS[folder]) : folder;
      await shell.openPath(p); return { window: await activeWindowSoon() };
    },

    // ---- organize
    'organize.plan': async ({ folder }) => {
      const dir = folder === 'pick' ? await pickFolder() : ctx.app.getPath(FOLDERS[folder] || 'downloads');
      if (!dir) return { canceled: true };
      const p = await organize.plan(dir);
      const id = String(Date.now());
      plans.set(id, p);
      return { id, folder: dir, summary: p.summary, count: p.moves.length };
    },
    'organize.apply': async ({ id }) => {
      const p = plans.get(id);
      if (!p) throw new Error('That plan expired, ask me again.');
      plans.delete(id);
      return organize.apply(p, undoDir());
    },
    'organize.undo': () => organize.undoLast(undoDir()),

    // ---- clean
    'clean.scan': () => clean.scan(),
    'clean.run': ({ ids }) => clean.run(Array.isArray(ids) ? ids : []),

    // ---- wallpaper
    'wallpaper.random': () => wallpaper.random(ctx),
    'wallpaper.pick': async () => {
      const r = await dialog.showOpenDialog(ctx.getWin(), { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }] });
      if (r.canceled) return { canceled: true };
      return wallpaper.set(r.filePaths[0], ctx);
    },
    'wallpaper.generated': ({ dataUrl }) => wallpaper.saveGenerated(dataUrl, ctx),
    'wallpaper.restore': () => wallpaper.restore(ctx),

    // ---- PC
    'system.stats': () => system.stats(),
    'system.theme': ({ mode }) => system.theme(mode || 'toggle'),
    'system.open': ({ app }) => system.open(app),
    'system.lock': () => system.lock(),
    'system.screenshot': () => system.screenshot(ctx.app),

    // ---- tools
    'web.search': async ({ q, site }) => {
      const url = site === 'youtube'
        ? 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q)
        : 'https://www.google.com/search?q=' + encodeURIComponent(q);
      await shell.openExternal(url); return {};
    },
    'notes.add': async ({ text }) => {
      const line = `[${new Date().toLocaleString()}] ${String(text).trim()}${os.EOL}`;
      await fs.promises.appendFile(notesFile(), line, 'utf8');
      return { path: notesFile() };
    },
    'notes.open': async () => {
      if (!fs.existsSync(notesFile())) await fs.promises.writeFile(notesFile(), `Zinx Notes${os.EOL}${os.EOL}`);
      await shell.openPath(notesFile()); return {};
    },
  };

  return {
    names: Object.keys(table),
    async run(name, args) {
      const fn = table[name];
      if (!fn) throw new Error('Unknown action: ' + name);
      return (await fn(args)) || {};
    },
  };
};
