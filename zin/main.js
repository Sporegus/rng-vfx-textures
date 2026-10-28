// Zin main process: owns the see-through overlay window, the tray menu,
// global hotkeys, settings, and everything that touches the PC.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const sprites = require('./src/sprites');
const createActions = require('./actions');
const windowWatcher = require('./actions/windows');
const startVoice = require('./voice');

if (!app.requestSingleInstanceLock()) app.quit();

const DEFAULTS = {
  skin: 'holo', hat: 'none', size: 3, sound: true,
  wander: true, followWindows: true, startWithWindows: false, introDone: false,
  // voice: talk out loud, listen for "Zin", which voice, a little higher pitch, the smaller speech model
  // (pixie is Zin's own smooth voice; sparkle, mochi and luna are extra expressive; heart, bella... stock ones)
  voice: false, listen: false, voiceName: 'pixie', cute: true, earsLight: false, voiceOffered: false,
  // chat: the local AI model for conversation; what she remembers about you
  // chatModel: your own model instead (a .gguf file or an hf: name), for tinkerers
  chat: false, chatModel: null, memory: [], userName: null, city: null, units: null,
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
}
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch {}
  if (win) win.webContents.send('settings', settings);
  if ('startWithWindows' in patch) app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows });
  if ('followWindows' in patch) settings.followWindows ? startWatcher() : stopWatcher();
  if ('skin' in patch || 'hat' in patch) refreshTray();
  else buildTrayMenu();
}

let win = null, tray = null, actions = null, watcher = null, voice = null;

// ------------------------------------------------------------- overlay window
function createOverlay() {
  const area = screen.getPrimaryDisplay().workArea;
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
  const fit = () => {
    const a = screen.getPrimaryDisplay().workArea;
    win.setBounds(a);
    win.webContents.send('bounds', a);
  };
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

// ------------------------------------------------------------- window tracking
// Zin can sit on top of whatever window you're using. A small PowerShell
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
  if (win) win.webContents.send('active-window', null);
}
function toOverlay(w) {
  if (!w || w.min || !w.title || w.title === 'Program Manager') return null;
  let r = { x: w.l, y: w.t, width: w.r - w.l, height: w.b - w.t };
  if (screen.screenToDipRect) r = screen.screenToDipRect(null, r);
  const a = screen.getPrimaryDisplay().workArea;
  return { id: w.h, title: w.title, maximized: !!w.max, x: r.x - a.x, y: r.y - a.y, width: r.width, height: r.height };
}

// ------------------------------------------------------------- tray
// The tray icon is drawn from the sprite engine, so it always matches Zin's skin.
function spriteIcon(size) {
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
const send = (cmd, arg) => win && win.webContents.send('command', cmd, arg);
function buildTrayMenu() {
  if (!tray) return;
  const radio = (label, key, value) => ({ label, type: 'radio', checked: settings[key] === value, click: () => saveSettings({ [key]: value }) });
  const check = (label, key) => ({ label, type: 'checkbox', checked: !!settings[key], click: (m) => saveSettings({ [key]: m.checked }) });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Zin', enabled: false },
    { label: 'Talk to Zin', accelerator: 'Ctrl+Alt+Space', click: () => send('menu') },
    { label: 'Teleport to my mouse', click: () => send('teleport') },
    { label: 'Play the intro again', click: () => send('intro') },
    { type: 'separator' },
    { label: 'Skin', submenu: Object.entries(sprites.SKINS).map(([k, v]) => radio(v.name, 'skin', k)) },
    { label: 'Accessory', submenu: sprites.HATS.map(h => radio(h === 'none' ? 'None' : h[0].toUpperCase() + h.slice(1), 'hat', h)) },
    { label: 'Size', submenu: [radio('Small', 'size', 2), radio('Medium', 'size', 3), radio('Large', 'size', 4), radio('Huge', 'size', 5)] },
    check('Sound', 'sound'),
    { label: 'Voice', submenu: [
      check('Talk out loud', 'voice'),
      check('Listen for "Zin"', 'listen'),
      { label: 'Push to talk', accelerator: 'Ctrl+Alt+V', click: () => send('ptt') },
      { type: 'separator' },
      { label: 'Natural (needs a graphics card, 2.5 GB)', enabled: false },
      ...['tara', 'leah', 'jess', 'mia', 'zoe'].map(k => radio(k[0].toUpperCase() + k.slice(1), 'voiceName', k)),
      { label: 'Zin\'s own', enabled: false },
      radio('Pixie (smooth, quick)', 'voiceName', 'pixie'),
      { label: 'Extra expressive (less steady)', enabled: false },
      ...[['sparkle', 'Sparkle (bright, playful)'], ['mochi', 'Mochi (sweet, bubbly)'], ['luna', 'Luna (soft, gentle)']].map(([k, l]) => radio(l, 'voiceName', k)),
      { label: 'Other smooth voices', enabled: false },
      ...[['heart', 'Heart (sweet)'], ['bella', 'Bella (bright)'], ['nicole', 'Nicole (soft)'], ['sky', 'Sky (airy)'], ['aoede', 'Aoede (warm)'], ['nova', 'Nova (clear)']].map(([k, l]) => radio(l, 'voiceName', k)),
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
    { label: win && win.isVisible() ? 'Hide Zin' : 'Show Zin', accelerator: 'Ctrl+Alt+Z', click: toggleVisible },
    { label: 'Quit', click: () => app.quit() },
  ]));
}
function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide(); else { win.showInactive(); send('teleport-in'); }
  buildTrayMenu();
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
  if (process.platform === 'win32') app.setAppUserModelId('com.zin.desktop');
  actions = createActions({ app, getWin: () => win, settings: () => settings, saveSettings, toOverlay });
  createOverlay();
  tray = new Tray(spriteIcon(32));
  tray.setToolTip('Zin');
  tray.on('click', () => { if (!win.isVisible()) toggleVisible(); send('menu'); });
  buildTrayMenu();
  globalShortcut.register('Control+Alt+Z', toggleVisible);
  globalShortcut.register('Control+Alt+Space', () => { if (!win.isVisible()) toggleVisible(); send('menu'); });
  if (settings.followWindows) startWatcher();
  voice = startVoice({ app, getWin: () => win, settings: () => settings, saveSettings, actions });
  globalShortcut.register('Control+Alt+V', () => { if (!win.isVisible()) toggleVisible(); send('ptt'); });
});
app.on('second-instance', () => send('menu'));
app.on('will-quit', () => { globalShortcut.unregisterAll(); stopWatcher(); });
app.on('window-all-closed', () => app.quit());
