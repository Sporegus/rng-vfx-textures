// Talks to helper.ps1: starts it on first use, sends JSON requests, matches
// replies by id, restarts it if it dies. Windows only; elsewhere every call
// fails with a clear "unavailable" error instead of pretending.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { NovaError } = require('../util');

function createWin({ log, platform = process.platform, spawnImpl = spawn } = {}) {
  let child = null, buf = '', nextId = 1;
  const waiting = new Map();
  const available = () => platform === 'win32';

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
    available, call,
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
