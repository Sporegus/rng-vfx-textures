// Desktop tools: opening apps (and checking they opened), moving and arranging
// windows (and checking where they ended up), and keyboard/mouse control that
// stops the moment you move the mouse, type, lock the PC or the target window
// changes. Built on core/win (Windows only).
'use strict';
const { NovaError, sleep } = require('./util');

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
// does this window belong to the app we opened?
function windowMatches(w, appName) {
  const want = words(appName);
  if (!want.length) return false;
  const hay = (w.process + ' ' + w.title).toLowerCase();
  return want.some(x => hay.includes(x));
}

// keyboard/mouse guard: pauses automation when you take over
function createGuard({ win, now = () => Date.now(), toleranceMs = 200 }) {
  let lastInject = 0, expectHwnd = null;
  return {
    expect(hwnd) { expectHwnd = hwnd; },
    injected() { lastInject = now(); },
    async check(signal) {
      if (signal && signal.aborted) throw new NovaError('cancelled', 'Stopped.');
      const st = await win.idle();
      if (st.locked) throw new NovaError('blocked', 'The PC is locked, so I paused.', { pause: true });
      // GetLastInputInfo counts our own input too: input newer than ours means you touched something
      if (lastInject && st.ms + toleranceMs < now() - lastInject) throw new NovaError('blocked', 'You moved the mouse or typed, so I paused and let go.', { pause: true, userInput: true });
      if (expectHwnd) {
        const fg = await win.foreground();
        if (fg.hwnd !== expectHwnd) throw new NovaError('blocked', `The window changed to "${fg.title}", so I paused.`, { pause: true, focusChanged: true });
      }
    },
  };
}

function registerDesktop({ tools, win, apps, log, refs }) {
  const winOnly = () => win.available();
  const unavailable = () => 'That only works on Windows.';

  // ---- apps
  tools.register({
    name: 'app.open', purpose: 'Open an installed app by name', category: 'launch', effect: 'local', timeoutMs: 30000, retrySafe: false,   // (a cold Start-menu lookup can take a while on first use)
    args: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['name'], additionalProperties: false },
    target: (a) => ({ kind: 'app', value: a.name }),
    describe: (a) => `Open ${a.name}`,
    run: async ({ name }) => apps.open(name),   // (launch first; the window check comes after)
    verify: async ({ name }, r, { signal }) => {
      if (r.notFound) return { ok: true, evidence: 'not installed' };
      if (!win.available()) return { ok: false, evidence: 'cannot check windows on this OS' };
      // wait up to ~14 s for its window (new or already open, now in front); slow starters like Discord update first
      for (const end = Date.now() + 14000; Date.now() < end;) {
        const ws = await win.windows().catch(() => []);
        const hit = ws.find(w => windowMatches(w, r.opened || name));
        if (hit) { refs && refs.saw(hit); return { ok: true, evidence: `window "${hit.title}" (${hit.process}) is open` }; }
        await sleep(500, signal);
      }
      return { ok: false, evidence: 'no matching window appeared within 14 seconds' };
    },
  });

  // ---- windows
  const resolve = async (which) => {
    const w = refs ? await refs.resolve(which) : await win.foreground();
    if (!w) throw new NovaError('not_found', which === 'other' ? "I'm not sure which other window you mean." : "I couldn't tell which window you mean. Click it first, then ask again.");
    return w;
  };
  tools.register({
    name: 'window.move', purpose: 'Move a window to another monitor', category: 'window', effect: 'local', timeoutMs: 10000, available: winOnly, unavailableReason: unavailable,
    args: { type: 'object', properties: { which: { type: 'string', maxLength: 80 }, to: { type: 'string', enum: ['other', 'second', '2nd', 'left', 'right', 'main', 'primary', 'next', 'first', '1st', 'third', '3rd'] } }, required: ['to'], additionalProperties: false },
    describe: (a) => `Move ${a.which || 'that'} window to the ${a.to} monitor`,
    run: async ({ which = 'that', to }) => {
      const w = await resolve(which);
      const mons = await win.monitors();
      if (mons.length < 2) throw new NovaError('not_found', 'I only see one monitor.');
      const cur = mons.find(m => w.x + w.w / 2 >= m.x && w.x + w.w / 2 < m.x + m.w) || mons[0];
      const byX = [...mons].sort((a, b) => a.x - b.x);
      let dest;
      if (/^(main|primary)$/.test(to)) dest = mons.find(m => m.primary);
      else if (/^(first|1st)$/.test(to)) dest = byX[0];
      else if (/^(second|2nd)$/.test(to)) dest = byX[1];
      else if (/^(third|3rd)$/.test(to)) dest = byX[2];
      else if (to === 'left') dest = byX.filter(m => m.x < cur.x).pop();
      else if (to === 'right') dest = byX.find(m => m.x > cur.x);
      else dest = byX[(byX.indexOf(byX.find(m => m.index === cur.index)) + 1) % byX.length];
      if (!dest) throw new NovaError('not_found', `There's no monitor to the ${to}.`);
      if (dest.index === cur.index) return { moved: false, already: true, window: w, to: dest.index, say: `"${w.title}" is already on that monitor.` };
      const r = await win.move(w.hwnd, dest.index);
      return { ...r, to: dest.index, title: w.title, say: `Moved "${w.title}" to the other monitor.` };
    },
    verify: async (a, r) => r.already ? { ok: true, evidence: 'already there' } : { ok: r.after === r.to, evidence: `window now on monitor ${r.after}, wanted ${r.to}` },
  });
  tools.register({
    name: 'window.arrange', purpose: 'Minimize, maximize or snap a window', category: 'window', effect: 'local', timeoutMs: 8000, available: winOnly, unavailableReason: unavailable,
    args: { type: 'object', properties: { which: { type: 'string', maxLength: 80 }, op: { type: 'string', enum: ['minimize', 'maximize', 'restore', 'snap_left', 'snap_right'] } }, required: ['op'], additionalProperties: false },
    run: async ({ which = 'that', op }) => { const w = await resolve(which); const after = await win.arrange(w.hwnd, op); return { after, op, say: `Done: ${op.replace('_', ' ')} "${w.title}".` }; },
    verify: async ({ op }, r) => ({ ok: op === 'minimize' ? r.after.min : op === 'maximize' ? r.after.max : !r.after.min, evidence: `min=${r.after.min} max=${r.after.max}` }),
  });
  tools.register({
    name: 'window.focus', purpose: 'Bring a window to the front', category: 'window', effect: 'local', timeoutMs: 6000, available: winOnly, unavailableReason: unavailable,
    args: { type: 'object', properties: { which: { type: 'string', maxLength: 80 } }, additionalProperties: false },
    run: async ({ which = 'that' }) => { const w = await resolve(which); const r = await win.focus(w.hwnd); return { ...r, title: w.title, say: `Switched to "${w.title}".` }; },
    verify: async (a, r) => ({ ok: !!r.foreground, evidence: r.foreground ? 'window is in front' : 'Windows kept another window in front' }),
  });

  // ---- keyboard and mouse (needs your OK for the task; pauses if you take over)
  const guard = createGuard({ win });
  const controlTarget = (a) => ({ kind: 'app', value: a.app || 'any' });
  tools.register({
    name: 'control.type', purpose: 'Type text into the app in front', category: 'control', effect: 'local', timeoutMs: 30000, available: winOnly, unavailableReason: unavailable,
    args: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 }, app: { type: 'string', maxLength: 80 } }, required: ['text'], additionalProperties: false },
    target: controlTarget,
    run: async ({ text, app }, { signal }) => {
      const fg = await win.foreground();
      if (app && !windowMatches(fg, app)) throw new NovaError('blocked', `${app} isn't the window in front, so I didn't type.`);
      const focused = await win.uiaFocused().catch(() => null);
      if (focused && focused.password) throw new NovaError('blocked', "That's a password field. I don't type into those.");
      guard.expect(fg.hwnd);
      await guard.check(signal);
      // in chunks, re-checking between them, so you can take over at any moment
      for (let i = 0; i < text.length; i += 40) {
        await guard.check(signal);
        await win.type(text.slice(i, i + 40));
        guard.injected();
      }
      return { typed: text.length, into: fg.title, focused, say: `Typed it into "${fg.title}".` };
    },
    verify: async ({ text }, r) => {
      const f = await win.uiaFocused().catch(() => null);
      const ok = !!(f && f.value && f.value.includes(text.slice(-Math.min(20, text.length))));
      return { ok, evidence: ok ? 'the focused field now contains the text' : 'could not read the field back to confirm' };
    },
  });
  tools.register({
    name: 'control.press', purpose: 'Press a button in the app in front, by its name (accessibility, no coordinates)', category: 'control', effect: 'local', timeoutMs: 15000, available: winOnly, unavailableReason: unavailable,
    args: { type: 'object', properties: { name: { type: 'string', maxLength: 120 }, app: { type: 'string', maxLength: 80 } }, required: ['name'], additionalProperties: false },
    target: controlTarget,
    run: async ({ name, app }, { signal }) => {
      const fg = await win.foreground();
      if (app && !windowMatches(fg, app)) throw new NovaError('blocked', `${app} isn't the window in front.`);
      guard.expect(fg.hwnd);
      await guard.check(signal);
      const hits = await win.uiaFind(fg.hwnd, name);
      if (!hits.length) throw new NovaError('not_found', `I couldn't find "${name}" in ${fg.title}.`);
      if (hits.length > 1 && !hits.every(h => h.name === hits[0].name)) throw new NovaError('blocked', `There's more than one "${name}" there: ${hits.slice(0, 3).map(h => h.name).join(', ')}. Which one?`);
      await win.uiaInvoke(fg.hwnd, hits[0].name);
      guard.injected();
      return { pressed: hits[0].name, say: `Pressed "${hits[0].name}".` };
    },
  });
  return { guard, windowMatches };
}

// which window "that" / "the other one" means: the last two real windows you used
function createWindowRefs({ win, selfPid }) {
  const recent = [];
  function saw(w) {
    if (!w || !w.hwnd || w.pid === selfPid || !w.title) return;
    const i = recent.findIndex(x => x.hwnd === w.hwnd);
    if (i >= 0) recent.splice(i, 1);
    recent.unshift(w);
    if (recent.length > 8) recent.pop();
  }
  async function resolve(which = 'that') {
    const w = String(which).toLowerCase();
    const live = win.available() ? await win.windows().catch(() => []) : [];
    const alive = recent.filter(r => live.some(l => l.hwnd === r.hwnd)).map(r => live.find(l => l.hwnd === r.hwnd));
    if (/^(that|this|the|my|it|current)$/.test(w)) return alive[0] || null;
    if (/^(other|the other|other one)$/.test(w)) return alive[1] || null;
    // by name: "the chrome window"
    return live.find(l => windowMatches(l, w)) || null;
  }
  return { saw, resolve, recent: () => recent.slice() };
}

module.exports = { registerDesktop, createGuard, createWindowRefs, windowMatches };
