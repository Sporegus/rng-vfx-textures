// Desktop tools against a simulated Windows (FIXTURE: not real Windows).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openStore } = require('../store');
const { createLog } = require('../log');
const { createTasks } = require('../tasks');
const { createPermissions } = require('../permissions');
const { createTools } = require('../tools');
const { registerDesktop, createWindowRefs, createGuard } = require('../desktop');
const { sleep } = require('../util');

function fakeWin() {
  const state = {
    monitors: [{ index: 0, x: 0, y: 0, w: 1920, h: 1080, primary: true }, { index: 1, x: 1920, y: 0, w: 2560, h: 1440, primary: false }],
    windows: [{ hwnd: 11, title: 'Untitled - Notepad', process: 'notepad', pid: 100, x: 100, y: 100, w: 800, h: 600, min: false, max: false },
      { hwnd: 22, title: 'Discord', process: 'Discord', pid: 200, x: 300, y: 200, w: 1200, h: 800, min: false, max: false }],
    fg: 11, idleMs: 5000, locked: false, typed: '', focusedPassword: false, now: () => Date.now(),
  };
  const win = {
    state, available: () => true,
    windows: async () => state.windows.map(w => ({ ...w })),
    monitors: async () => state.monitors,
    foreground: async () => ({ ...state.windows.find(w => w.hwnd === state.fg) }),
    move: async (hwnd, mon) => { const w = state.windows.find(x => x.hwnd === hwnd); const m = state.monitors[mon]; w.x = m.x + 50; return { before: 0, after: mon, window: w }; },
    arrange: async (hwnd, op) => { const w = state.windows.find(x => x.hwnd === hwnd); w.min = op === 'minimize'; w.max = op === 'maximize'; return { ...w }; },
    focus: async (hwnd) => { state.fg = hwnd; return { foreground: true }; },
    idle: async () => ({ ms: state.idleMs, locked: state.locked }),
    type: async (t) => { state.typed += t; state.idleMs = 0; },
    uiaFocused: async () => state.focusedPassword ? { password: true, name: '[password field]' } : { value: state.typed },
    uiaFind: async () => [], uiaInvoke: async () => ({}),
  };
  return win;
}
function setup(win) {
  const store = openStore(':memory:'), log = createLog();
  const tasks = createTasks({ store, log }), permissions = createPermissions({ store, log });
  const tools = createTools({ permissions, log, store, locks: store });
  const refs = createWindowRefs({ win, selfPid: 999 });
  const apps = { open: async (name) => { if (/notepad/i.test(name)) { win.state.windows.push({ hwnd: 33, title: 'Notepad', process: 'notepad', pid: 300, x: 0, y: 0, w: 500, h: 400 }); return { opened: 'Notepad' }; } return { notFound: true, suggestions: [] }; } };
  registerDesktop({ tools, win, apps, log, refs });
  return { tasks, permissions, tools, refs, log };
}

test('open app is verified by finding its window', async () => {
  const win = fakeWin();
  win.state.windows = win.state.windows.filter(w => w.process !== 'notepad');
  const { tasks, tools } = setup(win);
  const t = tasks.create({ text: 'open notepad' });
  const r = await tools.run(t, { tool: 'app.open', args: { name: 'notepad' }, direct: true });
  assert.equal(r.verified, true);
  assert.match(r.evidence, /Notepad/);
});

test('"put that window on my other monitor" moves the last window and verifies the monitor (test 17-fixture)', async () => {
  const win = fakeWin();
  const { tasks, tools, refs } = setup(win);
  refs.saw(win.state.windows[1]); refs.saw(win.state.windows[0]);   // Notepad used last
  const t = tasks.create({ text: 'move' });
  const r = await tools.run(t, { tool: 'window.move', args: { which: 'that', to: 'other' }, direct: true });
  assert.equal(r.verified, true);
  assert.equal(r.result.title, 'Untitled - Notepad');
  assert.ok(win.state.windows[0].x >= 1920);
  // "I meant the other window" -> Discord
  const t2 = tasks.create({ text: 'move other' });
  const r2 = await tools.run(t2, { tool: 'window.move', args: { which: 'other', to: 'other' }, direct: true });
  assert.equal(r2.result.title, 'Discord');
});

test('typing needs a control grant; password fields are refused', async () => {
  const win = fakeWin();
  const { tasks, tools, permissions } = setup(win);
  const t = tasks.create({ text: 'type' });
  await assert.rejects(tools.run(t, { tool: 'control.type', args: { text: 'hello' }, direct: true }), (e) => e.category === 'denied');
  assert.equal(win.state.typed, '');
  permissions.grant({ scope: { kind: 'task', id: t.id }, categories: ['control'], targets: { app: ['any'] } });
  win.state.focusedPassword = true;
  await assert.rejects(tools.run(t, { tool: 'control.type', args: { text: 'hello' } }), /password/);
  win.state.focusedPassword = false;
  const r = await tools.run(t, { tool: 'control.type', args: { text: 'hello' } });
  assert.equal(win.state.typed, 'hello');
  assert.equal(r.verified, true);
});

test('automation pauses when you type or the window changes (test 14)', async () => {
  const win = fakeWin();
  let clock = 10000;
  const guard = createGuard({ win, now: () => clock });
  guard.expect(11);
  guard.injected();             // we typed at t=10000
  clock = 11000;
  win.state.idleMs = 1000;      // last input was ours
  await guard.check();
  win.state.idleMs = 100;       // someone typed 900 ms after us: that's you
  await assert.rejects(guard.check(), (e) => e.userInput && e.category === 'blocked');
  win.state.idleMs = 1000;
  win.state.fg = 22;            // the window in front changed
  await assert.rejects(guard.check(), (e) => e.focusChanged);
  win.state.fg = 11; win.state.locked = true;
  await assert.rejects(guard.check(), /locked/);
});

test('window tools say clearly they need Windows elsewhere', async () => {
  const win = { ...fakeWin(), available: () => false };
  const { tools } = setup(win);
  assert.equal(tools.get('window.move').available(), false);
});
