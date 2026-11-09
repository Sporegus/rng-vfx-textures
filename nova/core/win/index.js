// Talks to helper.ps1: starts it on first use, sends JSON requests, matches
// replies by id, restarts it if it dies. Windows only; elsewhere every call
// fails with a clear "unavailable" error instead of pretending.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { NovaError } = require('../util');

// Linux (X11, e.g. a test machine): listing and focusing windows only, via xwininfo/xdotool
function linuxWindows({ execFileImpl = require('child_process').execFile } = {}) {
  const run = (cmd, args, ms = 3000) => new Promise((resolve, reject) => execFileImpl(cmd, args, { timeout: ms }, (e, out) => e ? reject(new NovaError('failed', e.message)) : resolve(String(out))));
  let has = null;
  const ok = () => { if (has === null) { const fs = require('fs'); has = !!process.env.DISPLAY && ['/usr/bin/xwininfo', '/usr/bin/xdotool'].every(f => fs.existsSync(f)); } return has; };
  return {
    ok,
    async windows() {
      const out = await run('xwininfo', ['-root', '-children']);
      const list = [];
      for (const line of out.split('\n')) {
        const m = line.match(/^\s*(0x[0-9a-f]+) "(.*)": \("([^"]*)" "([^"]*)"\)\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/);
        if (m && +m[5] > 50 && +m[6] > 50) list.push({ hwnd: parseInt(m[1], 16), title: m[2], process: (m[3] || m[4]).toLowerCase(), x: +m[7], y: +m[8], w: +m[5], h: +m[6] });
      }
      return list;
    },
    async foreground() { const id = parseInt(await run('xdotool', ['getwindowfocus']), 10); return (await this.windows()).find(w => w.hwnd === id) || null; },
    async focus(hwnd) { await run('xdotool', ['windowraise', String(hwnd)]); await run('xdotool', ['windowfocus', String(hwnd)]).catch(() => {}); return { focused: true }; },
  };
}

function createWin({ log, platform = process.platform, spawnImpl = spawn } = {}) {
  let child = null, buf = '', nextId = 1;
  const waiting = new Map();
  const available = () => platform === 'win32';
  const lx = platform === 'linux' ? linuxWindows() : null;
  // can list and focus windows (Windows, or Linux with X tools): enough to verify a launch
  const canList = () => available() || !!(lx && lx.ok());

  function start() {
    child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'helper.ps1')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        const w = waiting.get(m.id);
        if (!w) continue;
        waiting.delete(m.id); clearTimeout(w.timer);
        m.ok ? w.resolve(m.result) : w.reject(new NovaError('failed', m.error || 'Windows helper error'));
      }
    });
    child.stderr.on('data', (d) => log && log.event('win.stderr', { text: String(d).slice(0, 300) }));
    child.on('exit', (code) => {
      log && log.event('win.exit', { code });
      for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new NovaError('failed', 'The Windows helper stopped.')); }
      waiting.clear(); child = null; buf = '';
    });
    child.on('error', (e) => log && log.event('win.error', { message: e.message }));
  }

  function call(cmd, args = {}, timeoutMs = 8000) {
    if (lx && lx.ok() && ['windows', 'foreground', 'focus'].includes(cmd)) return cmd === 'focus' ? lx.focus(args.hwnd) : lx[cmd]();
    if (!available()) return Promise.reject(new NovaError('unavailable', 'That only works on Windows.'));
    if (!child) start();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(new NovaError('timeout', `Windows helper didn't answer ${cmd}`)); }, timeoutMs);
      waiting.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }

  return {
    available, canList, call,
    warm: () => !!child || !!(lx && lx.ok()),   // (the helper is already running: listing is quick)
    foreground: () => call('foreground'),
    windows: () => call('windows'),
    monitors: () => call('monitors'),
    move: (hwnd, monitor) => call('move', { hwnd, monitor }),
    arrange: (hwnd, op) => call('arrange', { hwnd, op }),
    focus: (hwnd) => call('focus', { hwnd }),
    idle: () => call('idle'),
    key: (vk, up) => call('key', { vk, up: !!up }),
    type: (text) => call('type', { text }, 30000),
    click: (x, y, button = 'left') => call('click', { x, y, button }),
    releaseAll: () => available() && child ? call('release_all', {}, 2000).catch(() => ({ released: 0 })) : Promise.resolve({ released: 0 }),
    uiaFocused: () => call('uia_focused'),
    uiaTree: (hwnd, opts = {}) => call('uia_tree', { hwnd, ...opts }, 15000),
    uiaSelection: () => call('uia_selection'),
    uiaFind: (hwnd, name) => call('uia_find', { hwnd, name }, 15000),
    uiaInvoke: (hwnd, name) => call('uia_invoke', { hwnd, name }),
    screenshot: (r) => call('screenshot', r, 15000),
    ocr: (png) => call('ocr', { png }, 30000),
    stop: () => { if (child) { try { child.kill(); } catch {} } },
  };
}

module.exports = { createWin };
