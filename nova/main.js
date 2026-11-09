// Nova main process: owns the see-through overlay window, the tray menu,
// global hotkeys, settings, and everything that touches the PC.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const sprites = require('./src/sprites');
const createActions = require('./actions');
const windowWatcher = require('./actions/windows');
const startVoice = require('./voice');
const { startCore } = require('./core/app');

// She used to be called Zin: move her old settings, memory and downloaded voice
// models over so nothing is lost or downloaded again
(function keepOldData() {
  const appData = app.getPath('appData');
  const [oldDir, newDir] = [path.join(appData, 'Zin'), path.join(appData, 'Nova')];
  if (!fs.existsSync(oldDir)) return;
  if (!fs.existsSync(newDir)) { try { fs.renameSync(oldDir, newDir); } catch { app.setPath('userData', oldDir); return; } }
  const notes = (name) => path.join(app.getPath('documents'), `${name} Notes.txt`);
  try { if (fs.existsSync(notes('Zin')) && !fs.existsSync(notes('Nova'))) fs.renameSync(notes('Zin'), notes('Nova')); } catch {}
})();

// "npm run voice-record": record her training sentences in your ElevenLabs voice
// (voice/training), then quit, without starting Nova herself
if (process.argv.includes('--record-voice')) {
  const { safeStorage } = require('electron');
  app.whenReady()
    .then(() => require('./voice/training/record')(app, safeStorage))
    .catch((e) => { console.error('\n' + e.message + '\n'); process.exitCode = 1; })
    .finally(() => app.quit());
  return; // (main.js is a CommonJS module, so this ends it here)
}

if (!app.requestSingleInstanceLock()) app.quit();

const DEFAULTS = {
  // 'idle' is her approved hologram idle (art/idle); the older looks stay in the tray menu
  skin: 'idle', hat: 'none', size: 3, sound: true,
  wander: true, followWindows: true, startWithWindows: false, introDone: false,
  // voice: talk out loud, listen for "Nova", which voice, a little higher pitch, the smaller speech model
  // (nova is her own voice; sparkle, mochi and luna are extra expressive; heart, bella... stock ones)
  voice: false, listen: false, voiceName: 'nova', cute: true, earsLight: false, voiceOffered: false,
  // chat: the local AI model for conversation; what she remembers about you
  // chatModel: your own model instead (a .gguf file or an hf: name), for tinkerers
  chat: false, chatModel: null, memory: [], userName: null, city: null, units: null,
  // your ElevenLabs voice (the API key itself is stored encrypted, separately)
  // (the voice ID is the one made for Nova; elevenReady means a key has been saved)
  elevenVoiceId: 'X9FWmStt6EWpyHmBlB7C', elevenModel: 'quick', elevenReady: false,
  // global shortcuts (changeable in Tasks panel > Settings) and which monitor she lives on (null = main one)
  shortcuts: { menu: 'Control+Alt+Space', hide: 'Control+Alt+Z', ptt: 'Control+Alt+V', stop: 'Control+Alt+X' },
  display: null,
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
}
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {}
  if (win && !win.isDestroyed()) win.webContents.send('settings', settings);
  if ('startWithWindows' in patch) app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows });
  if ('followWindows' in patch) settings.followWindows ? startWatcher() : stopWatcher();
  if ('shortcuts' in patch) applyShortcuts();
  if ('display' in patch && win) { fitOverlay(); send('teleport-in'); }
  if ('skin' in patch || 'hat' in patch) refreshTray();
  else buildTrayMenu();
}

let win = null, tray = null, actions = null, watcher = null, voice = null, core = null;

// ------------------------------------------------------------- overlay window
// the monitor she lives on: the one you picked, or the main one (and the main one again if yours is unplugged)
const homeDisplay = () => screen.getAllDisplays().find(d => d.id === settings.display) || screen.getPrimaryDisplay();
function fitOverlay() {
  if (!win || win.isDestroyed()) return;
  const a = homeDisplay().workArea;   // (can start at negative coordinates, left of or above the main monitor)
  win.setBounds(a);
  win.webContents.send('bounds', a);
}
function createOverlay() {
  const area = homeDisplay().workArea;
  win = new BrowserWindow({
    x: area.x, y: area.y, width: area.width, height: area.height,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    backgroundColor: '#00000000',
    icon: spriteIcon(64),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  // keep the overlay matching the screen if the taskbar / resolution changes
  const fit = fitOverlay;
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

// ------------------------------------------------------------- window tracking
// Nova can sit on top of whatever window you're using. A small PowerShell
// helper reports the active window's position a couple of times a second.
function startWatcher() {
  if (watcher || process.platform !== 'win32') return;
  watcher = windowWatcher.start((w) => {
    if (!win || win.isDestroyed()) return;
    if (w && w.pid === process.pid) return; // that's us
    win.webContents.send('active-window', toOverlay(w));
  });
}
function stopWatcher() {
  if (watcher) { watcher.stop(); watcher = null; }
  if (win && !win.isDestroyed()) win.webContents.send('active-window', null);   // (at quit the window is already gone)
}
function toOverlay(w) {
  if (!w || w.min || !w.title || w.title === 'Program Manager') return null;
  let r = { x: w.l, y: w.t, width: w.r - w.l, height: w.b - w.t };
  if (screen.screenToDipRect) r = screen.screenToDipRect(null, r);
  const a = homeDisplay().workArea;
  return { id: w.h, title: w.title, maximized: !!w.max, x: r.x - a.x, y: r.y - a.y, width: r.width, height: r.height };
}

// ------------------------------------------------------------- tray
// The tray icon is drawn from the sprite engine, so it always matches Nova's skin.
function spriteIcon(size) {
  // her hologram look: the tray icon is her head from the approved idle
  if (sprites.SKINS[settings.skin] && sprites.SKINS[settings.skin].video) {
    const img = nativeImage.createFromPath(path.join(__dirname, 'art', 'idle', 'idle-poster.png'));
    if (!img.isEmpty()) return img.crop({ x: 54, y: 0, width: 220, height: 220 }).resize({ width: size, height: size, quality: 'best' });
  }
  const W = sprites.W, H = sprites.H;
  const rgba = sprites.frameRGBA('idle', 0, settings.skin, settings.hat);
  if (!sprites.SKINS[settings.skin]) settings.skin = 'holo';
  // crop to head and shoulders so the icon reads at tray size
  const x0 = 11, y0 = 2, side = 26;
  const bgra = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const si = ((y + y0) * W + (x + x0)) * 4, di = (y * side + x) * 4;
    if (y + y0 >= H || x + x0 >= W) continue;
    bgra[di] = rgba[si + 2]; bgra[di + 1] = rgba[si + 1]; bgra[di + 2] = rgba[si]; bgra[di + 3] = rgba[si + 3];
  }
  return nativeImage.createFromBitmap(bgra, { width: side, height: side }).resize({ width: size, height: size, quality: 'good' });
}
function refreshTray() {
  if (!tray) return;
  tray.setImage(spriteIcon(32));
  buildTrayMenu();
}
const send = (cmd, arg) => win && !win.isDestroyed() && win.webContents.send('command', cmd, arg);
function buildTrayMenu() {
  if (!tray) return;
  const radio = (label, key, value) => ({ label, type: 'radio', checked: settings[key] === value, click: () => saveSettings({ [key]: value }) });
  const check = (label, key) => ({ label, type: 'checkbox', checked: !!settings[key], click: (m) => saveSettings({ [key]: m.checked }) });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Nova', enabled: false },
    { label: 'Talk to Nova', accelerator: settings.shortcuts.menu, click: () => send('menu') },
    { label: 'Tasks, approvals & settings…', click: () => core && core.openPanel('tasks') },
    { label: 'Stop everything', accelerator: settings.shortcuts.stop, click: () => core && core.stop('tray') },
    { label: 'Teleport to my mouse', click: () => send('teleport') },
    { label: 'Play the intro again', click: () => send('intro') },
    { type: 'separator' },
    { label: 'Skin', submenu: Object.entries(sprites.SKINS).map(([k, v]) => radio(v.name, 'skin', k)) },
    { label: 'Accessory', submenu: sprites.HATS.map(h => radio(h === 'none' ? 'None' : h[0].toUpperCase() + h.slice(1), 'hat', h)) },
    { label: 'Monitor', submenu: screen.getAllDisplays().map((d, i) => ({ label: `Monitor ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (main)' : ''} — ${d.size.width}×${d.size.height}${d.scaleFactor !== 1 ? ` at ${Math.round(d.scaleFactor * 100)}%` : ''}`, type: 'radio', checked: homeDisplay().id === d.id, click: () => saveSettings({ display: d.id }) })) },
    { label: 'Size', submenu: [radio('Small', 'size', 2), radio('Medium', 'size', 3), radio('Large', 'size', 4), radio('Huge', 'size', 5)] },
    check('Sound', 'sound'),
    { label: 'Voice', submenu: [
      check('Talk out loud', 'voice'),
      check('Listen for "Nova"', 'listen'),
      { label: 'Push to talk', accelerator: settings.shortcuts.ptt, click: () => send('ptt', Date.now()) },
      { type: 'separator' },
      radio('Nova (her own voice, free)', 'voiceName', 'nova'),
      { type: 'separator' },
      { label: 'My ElevenLabs voice (online)', type: 'radio', checked: settings.voiceName === 'eleven', enabled: !!settings.elevenReady, click: () => saveSettings({ voiceName: 'eleven' }) },
      { label: settings.elevenReady ? 'Change my ElevenLabs voice…' : 'Set up my ElevenLabs voice…', click: () => { if (!win.isVisible()) toggleVisible(); send('eleven-setup'); } },
      { type: 'separator' },
      { label: 'Natural (needs a graphics card, 2.5 GB)', enabled: false },
      ...['tara', 'leah', 'jess', 'mia', 'zoe'].map(k => radio(k[0].toUpperCase() + k.slice(1), 'voiceName', k)),
      { label: 'Extra expressive (less steady)', enabled: false },
      ...[['sparkle', 'Sparkle (bright, playful)'], ['mochi', 'Mochi (sweet, bubbly)'], ['luna', 'Luna (soft, gentle)']].map(([k, l]) => radio(l, 'voiceName', k)),
      { label: 'Other smooth voices', enabled: false },
      ...[['heart', 'Heart (sweet)'], ['bella', 'Bella (bright)'], ['nicole', 'Nicole (soft)'], ['sky', 'Sky (airy)'], ['aoede', 'Aoede (warm)']].map(([k, l]) => radio(l, 'voiceName', k)),
      check('Higher, cuter pitch (other smooth voices)', 'cute'),
      { type: 'separator' },
      check('Smaller speech model (for slower PCs)', 'earsLight'),
      check('Chat brain (free, runs on your PC)', 'chat'),
      { label: 'Forget what I told her', enabled: !!((settings.memory || []).length || settings.userName), click: () => saveSettings({ memory: [], userName: null }) },
    ] },
    check('Wander around when idle', 'wander'),
    check('Sit on my windows', 'followWindows'),
    check('Start with Windows', 'startWithWindows'),
    { type: 'separator' },
    { label: win && win.isVisible() ? 'Hide Nova' : 'Show Nova', accelerator: settings.shortcuts.hide, click: toggleVisible },
    { label: 'Quit', click: () => app.quit() },
  ]));
}
function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide(); else { win.showInactive(); send('teleport-in'); }
  buildTrayMenu();
}

// ------------------------------------------------------------- global shortcuts
// Registered from settings. One that's taken by another app (or invalid) is
// reported in Tasks panel > Settings instead of failing silently.
let shortcutProblems = [];
const SHORTCUT_ACTIONS = {
  menu: () => { if (!win.isVisible()) toggleVisible(); send('menu'); },
  hide: () => toggleVisible(),
  ptt: () => { if (!win.isVisible()) toggleVisible(); send('ptt', Date.now()); },
  stop: () => { if (core) core.stop('shortcut'); },
};
function applyShortcuts() {
  globalShortcut.unregisterAll();
  shortcutProblems = [];
  const seen = new Map();
  for (const [name, fn] of Object.entries(SHORTCUT_ACTIONS)) {
    const accel = (settings.shortcuts || {})[name] || DEFAULTS.shortcuts[name];
    if (!accel) continue;
    if (seen.has(accel)) { shortcutProblems.push({ name, accel, why: `also used for ${seen.get(accel)}` }); continue; }
    let ok = false;
    try { ok = globalShortcut.register(accel, fn); } catch { shortcutProblems.push({ name, accel, why: 'not a valid shortcut' }); continue; }
    if (!ok) shortcutProblems.push({ name, accel, why: 'another app is already using it' });
    else seen.set(accel, name);
  }
  if (shortcutProblems.length) console.warn('Nova shortcuts not available:', shortcutProblems);
}

// ------------------------------------------------------------- IPC
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_, patch) => { saveSettings(patch); return settings; });
ipcMain.on('capture', (_, on) => { if (win) win.setIgnoreMouseEvents(!on, { forward: true }); });
ipcMain.on('focus', () => { if (win) win.focus(); });
ipcMain.on('blur', () => { if (win) win.blur(); });
ipcMain.on('hide', () => toggleVisible());
ipcMain.handle('action', async (_, name, args) => {
  try { return { ok: true, ...(await actions.run(name, args || {})) }; }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
});

// ------------------------------------------------------------- startup
app.whenReady().then(() => {
  loadSettings();
  if (process.platform === 'win32') app.setAppUserModelId('com.nova.desktop');
  actions = createActions({ app, getWin: () => win, settings: () => settings, saveSettings, toOverlay });
  createOverlay();
  tray = new Tray(spriteIcon(32));
  tray.setToolTip('Nova');
  tray.on('click', () => { if (!win.isVisible()) toggleVisible(); send('menu'); });
  buildTrayMenu();
  if (settings.followWindows) startWatcher();
  voice = startVoice({ app, getWin: () => win, settings: () => settings, saveSettings, actions });
  // Nova's core: one pipeline for everything you ask, with approvals, Stop (Ctrl+Alt+X) and the Tasks panel
  try { core = startCore({ app, getWin: () => win, settings: () => settings, saveSettings, actions, voice, shortcutStatus: () => ({ shortcuts: settings.shortcuts, problems: shortcutProblems }) }); }
  catch (e) { console.error('Nova core failed to start:', e); }
  applyShortcuts();
  screen.on('display-removed', () => buildTrayMenu()); screen.on('display-added', () => buildTrayMenu());
  // she moved to her approved hologram idle: switch once, then your choice sticks
  if (!settings.idleSkinSet) saveSettings({ skin: 'idle', idleSkinSet: true });
  if (process.argv.includes('--panel') && core) core.openPanel('tasks');
  // self-tests: start, then quit on our own after N ms (checks that Nova exits cleanly)
  if (process.env.NOVA_SELFTEST_QUIT_MS) setTimeout(() => app.quit(), Number(process.env.NOVA_SELFTEST_QUIT_MS));
});
app.on('second-instance', () => send('menu'));
// each step on its own: one failing must not stop the others or leave Nova running
app.on('will-quit', () => { for (const f of [() => globalShortcut.unregisterAll(), stopWatcher, () => core && core.close()]) { try { f(); } catch (e) { console.error('quit step failed:', e.message); } } });
app.on('window-all-closed', () => app.quit());
