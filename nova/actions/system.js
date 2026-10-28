// PC info and quick system toggles.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell, desktopCapturer, screen } = require('electron');
const ps = require('./ps');

function cpuTimes() {
  return os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
}

async function stats() {
  const a = cpuTimes();
  await new Promise(r => setTimeout(r, 400));
  const b = cpuTimes();
  const cpu = Math.round(100 * (1 - (b.idle - a.idle) / Math.max(1, b.total - a.total)));
  let disk = null;
  try {
    const st = fs.statfsSync(process.platform === 'win32' ? 'C:\\' : '/');
    disk = { free: st.bavail * st.bsize, total: st.blocks * st.bsize };
  } catch {}
  return { cpu, memUsed: os.totalmem() - os.freemem(), memTotal: os.totalmem(), disk, uptime: os.uptime(), cpuName: (os.cpus()[0] || {}).model };
}

const PERSONALIZE = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
async function theme(mode) {
  if (mode === 'toggle') {
    const cur = await ps.run(`(Get-ItemProperty '${PERSONALIZE}').AppsUseLightTheme`);
    mode = cur.trim() === '0' ? 'light' : 'dark';
  }
  const v = mode === 'light' ? 1 : 0;
  await ps.run(`Set-ItemProperty '${PERSONALIZE}' -Name AppsUseLightTheme -Value ${v} -Type Dword; Set-ItemProperty '${PERSONALIZE}' -Name SystemUsesLightTheme -Value ${v} -Type Dword`);
  return { mode };
}

// Only these apps can be opened; Nova can't launch anything else.
const APPS = {
  calculator: 'calc.exe', notepad: 'notepad.exe', paint: 'mspaint.exe', explorer: 'explorer.exe',
  taskmgr: 'taskmgr.exe', settings: 'ms-settings:', snip: 'ms-screenclip:', store: 'ms-windows-store:',
  storage: 'ms-settings:storagesense', display: 'ms-settings:display', sound: 'ms-settings:sound', bluetooth: 'ms-settings:bluetooth',
};
async function open(name) {
  const target = APPS[name];
  if (!target) throw new Error("I don't know that app yet.");
  if (target.includes(':')) await shell.openExternal(target);
  else spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
  return { opened: name };
}

async function lock() {
  spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref();
  return {};
}

async function screenshot(app) {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  if (!src) throw new Error("Couldn't grab the screen.");
  const dir = path.join(app.getPath('pictures'), 'Nova Screenshots');
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  await fs.promises.writeFile(file, src.thumbnail.toPNG());
  shell.showItemInFolder(file);
  return { path: file };
}

module.exports = { stats, theme, open, lock, screenshot, APPS };
