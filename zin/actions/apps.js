// Opening and closing apps by name, music, media keys, volume and power.
// App names are matched against what's in your Start menu, so Zin can only
// launch things that are actually installed.
const { spawn } = require('child_process');
const { shell } = require('electron');
const ps = require('./ps');

// ---------------------------------------------------------------- finding apps by name
const ALIASES = {
  'vs code': 'visual studio code', vscode: 'visual studio code', code: 'visual studio code', chrome: 'google chrome', edge: 'microsoft edge',
  word: 'word', excel: 'excel', powerpoint: 'powerpoint', ppt: 'powerpoint', teams: 'microsoft teams', outlook: 'outlook', obs: 'obs studio',
  'file explorer': 'file explorer', explorer: 'file explorer', files: 'file explorer', calc: 'calculator', 'task manager': 'task manager',
  camera: 'camera', photos: 'photos', settings: 'settings', store: 'microsoft store', 'microsoft store': 'microsoft store', clock: 'clock',
};
// a few Windows tools that aren't always in the Start menu list
const BUILTIN = { calculator: 'calc.exe', notepad: 'notepad.exe', paint: 'mspaint.exe', 'file explorer': 'explorer.exe', 'task manager': 'taskmgr.exe',
  settings: 'ms-settings:', 'snipping tool': 'ms-screenclip:', 'microsoft store': 'ms-windows-store:', camera: 'microsoft.windows.camera:', clock: 'ms-clock:' };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// how well a typed name fits an app's name, 0..100
function fit(want, name) {
  const w = norm(want), n = norm(name);
  if (!w || !n) return 0;
  if (n === w) return 100;
  if (n.startsWith(w + ' ') || n.endsWith(' ' + w)) return 90;
  if (n.split(' ').includes(w)) return 85;
  if (n.startsWith(w)) return 80;
  if (n.includes(w)) return 70;
  const words = w.split(' ');
  if (words.length > 1 && words.every(x => n.includes(x))) return 75;
  const dist = Math.min(editDistance(w, n), ...n.split(' ').map(p => editDistance(w, p)));
  return dist <= Math.max(1, Math.floor(w.length / 5)) ? 65 - dist * 5 : 0;
}

let appCache = null, appCacheAt = 0;
async function startApps() {
  if (appCache && Date.now() - appCacheAt < 10 * 60000) return appCache;
  const out = await ps.run('Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress');
  let list = [];
  try { list = JSON.parse(out || '[]'); } catch {}
  appCache = (Array.isArray(list) ? list : [list]).filter(a => a && a.Name && a.AppID);
  appCacheAt = Date.now();
  return appCache;
}
async function findApp(name) {
  const want = ALIASES[norm(name)] || norm(name);
  const apps = await startApps();
  const ranked = apps.map(a => ({ a, s: fit(want, a.Name) })).filter(x => x.s >= 60).sort((x, y) => y.s - x.s || x.a.Name.length - y.a.Name.length);
  return { best: ranked[0] && ranked[0].s >= 65 ? ranked[0].a : null, suggestions: ranked.slice(0, 3).map(x => x.a.Name), want };
}

async function open(name) {
  const { best, suggestions, want } = await findApp(name).catch(() => ({ best: null, suggestions: [], want: norm(name) }));
  if (best) {
    spawn('explorer.exe', ['shell:AppsFolder\\' + best.AppID], { detached: true, stdio: 'ignore' }).unref();
    return { opened: best.Name };
  }
  const builtin = BUILTIN[want];
  if (builtin) {
    if (builtin.includes(':')) await shell.openExternal(builtin);
    else spawn(builtin, [], { detached: true, stdio: 'ignore' }).unref();
    return { opened: name };
  }
  return { notFound: true, suggestions };
}

// closes an app's windows politely (like clicking X), so it can ask to save
async function close(name) {
  const out = await ps.run('Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress');
  let procs = [];
  try { procs = JSON.parse(out || '[]'); } catch {}
  procs = Array.isArray(procs) ? procs : [procs];
  const want = ALIASES[norm(name)] || norm(name);
  const hits = procs.filter(p => p && (fit(want, p.ProcessName) >= 70 || fit(name, p.ProcessName) >= 70 || fit(want, p.MainWindowTitle) >= 85));
  if (!hits.length) return { notRunning: true };
  for (const p of hits) await ps.run('$p = Get-Process -Id ([int]$env:ZIN_ARG0) -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow() }', [p.Id]);
  return { closed: [...new Set(hits.map(p => p.ProcessName))] };
}

// ---------------------------------------------------------------- keys: media and volume
const VK = { play: 0xB3, pause: 0xB3, next: 0xB0, prev: 0xB1, stop: 0xB2, mute: 0xAD, down: 0xAE, up: 0xAF };
const PRESS = `Add-Type -Name K -Namespace Zin -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);'
$vk = [byte][int]$env:ZIN_ARG0; $n = [int]$env:ZIN_ARG1
for ($i = 0; $i -lt $n; $i++) { [Zin.K]::keybd_event($vk, 0, 0, [UIntPtr]::Zero); [Zin.K]::keybd_event($vk, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 15 }`;
const press = (key, times = 1) => ps.run(PRESS, [VK[key], times]);

async function media(cmd) { await press(cmd in VK ? cmd : 'play'); return { cmd }; }

// each volume key press moves Windows' volume by 2%
async function volume({ cmd, steps = 5, level }) {
  if (cmd === 'set') { await press('down', 50); await press('up', Math.round(Math.max(0, Math.min(100, level)) / 2)); return { level }; }
  if (cmd === 'mute' || cmd === 'unmute') { await press('mute'); return { cmd }; }
  await press(cmd === 'down' ? 'down' : 'up', steps);
  return { cmd };
}

// ---------------------------------------------------------------- music
// Opens Spotify on your song. (With Spotify Premium and a one-time login she could
// start it playing straight away; that needs the Spotify Web API, coming next.)
async function music({ query, kind }) {
  const apps = await startApps().catch(() => []);
  const hasSpotify = apps.some(a => /spotify/i.test(a.Name));
  if (!query) {
    if (hasSpotify) { await open('spotify'); await new Promise(r => setTimeout(r, 2500)); }
    await press('play');
    return { resumed: true };
  }
  const q = kind && kind !== 'track' ? `${query}` : query;
  if (hasSpotify) await shell.openExternal('spotify:search:' + encodeURIComponent(q));
  else await shell.openExternal('https://open.spotify.com/search/' + encodeURIComponent(q));
  return { opened: hasSpotify ? 'spotify' : 'web', query: q };
}

// ---------------------------------------------------------------- power
// delay in seconds; Windows shows its own "you're about to be signed out" notice
async function power({ kind, delay = 0 }) {
  const t = String(Math.max(0, Math.round(delay || 0)));
  if (kind === 'cancel') spawn('shutdown.exe', ['/a'], { windowsHide: true });
  else if (kind === 'restart') spawn('shutdown.exe', ['/r', '/t', t, '/c', 'Zin is restarting your PC.'], { windowsHide: true });
  else if (kind === 'sleep') {
    if (+t > 0) setTimeout(() => spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true }), +t * 1000);
    else spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true });
  } else spawn('shutdown.exe', ['/s', '/t', t, '/c', 'Zin is shutting down your PC.'], { windowsHide: true });
  return { kind, delay: +t };
}

module.exports = { open, close, media, volume, music, power, fit };
