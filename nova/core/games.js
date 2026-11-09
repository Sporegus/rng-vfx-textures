// Games: graduated capabilities, a bounded controller, and per-game profiles.
//
//   observe  look at the game (screenshot + HUD text) and say what's there
//   advise   answer questions, plan, research guides
//   launch   open a game through its official route (store link, official deep link)
//   assist   one bounded action you asked for
//   play     a bounded routine toward a goal, with one game-scoped approval
//
// The controller loop is observe -> act (short key holds) -> release -> verify,
// with a watchdog that releases every key. It pauses when the game loses focus,
// when you touch the mouse/keyboard, or when the PC locks, and stops on Stop.
//
// Never: injection, exploit executors, memory reading/editing, packet tampering,
// anti-cheat or ban evasion, AFK-kick evasion, duplication glitches. Online games
// whose rules forbid automation (Roblox included) get observe/advise/launch only.
'use strict';
const { NovaError, sleep, id } = require('./util');
const png = require('./png');

const PROHIBITED = [
  [/\b(inject(or|ion)?|executor|exploits?|script hub|synapse|krnl|fluxus)\b/i, 'uses an exploit or injector'],
  [/\b(aim ?bot|wall ?hack|esp hack|trigger ?bot|speed ?hack|fly ?hack|noclip hack|cheats?)\b/i, 'is cheating'],
  [/\b(anti-?cheat|byfron|hyperion|ban evasion|evade (a |the )?ban)\b/i, 'gets around anti-cheat or bans'],
  [/\b(memory (read|edit|scan)\w*|cheat engine|(read|edit|scan) (its|the game'?s?) memory)\b/i, 'reads or edits game memory'],
  [/\b(packets?|network traffic)\b.*\b(edit|tamper|spoof|inject|modify)|\b(edit|tamper|spoof|inject|modify)\w*\b.*\b(packets?|network traffic)\b/i, 'tampers with network traffic'],
  [/\b(anti-?afk|afk (farm|bypass|kick)|avoid (the |being )?(afk|idle) kick|(evade|bypass) (afk|idle))\b/i, 'evades AFK detection'],
  [/\b(dupe|duplicat\w* (items?|glitch))\b/i, 'duplicates items'],
  [/\b(edit|publish|update|change|modify)\b.*\b(black sun|place file|my (roblox )?game|their (game|map)s?)\b/i, 'changes or publishes a game'],
];

const PROFILES = {
  'nova-fixture': {
    id: 'nova-fixture', name: 'Nova coin fixture (local test game)', online: false, automation: true,
    capabilities: ['observe', 'advise', 'assist', 'play'],
    keys: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' },
    speed: 220, maxHoldMs: 400, playerSize: 24, reach: 14, margin: 10,
    colors: { player: [0, 229, 255], coin: [255, 210, 63], hazard: [208, 52, 44] },
    hud: { re: /Coins:\s*(\d+)\/(\d+).*Lives:\s*(\d+).*State:\s*(\w+)/, fields: ['coins', 'total', 'lives', 'state'] },
    goal: 'collect every coin without falling in the red pit',
  },
  roblox: {
    id: 'roblox', name: 'Roblox', online: true, automation: false,
    capabilities: ['observe', 'advise', 'launch'],
    launchUrl: (placeId) => `https://www.roblox.com/games/${placeId}`,
    why: "Roblox's rules don't allow bots or automated play, so I'll open experiences through Roblox's own links and help with advice, but I won't play or press keys for you there.",
  },
};

function policy(text, profile) {
  const reasons = PROHIBITED.filter(([re]) => re.test(text)).map(([, why]) => why);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, profile };
}

// ------------------------------------------------------------------ the controller
// adapter: { observe() -> { png: Buffer, hud: string, focused: bool, scale? }, keyDown(k), keyUp(k), releaseAll() }
// guard (optional): { check() -> { ok, reason } } for user takeover / focus / lock
function createController({ adapter, profile, guard, log, now = () => Date.now() }) {
  const held = new Map();      // key -> watchdog timer
  async function down(k) {
    await adapter.keyDown(k);
    held.set(k, setTimeout(() => { up(k); log && log.event('game.watchdog', { key: k }); }, profile.maxHoldMs + 150));
  }
  async function up(k) { const t = held.get(k); if (t) clearTimeout(t); held.delete(k); try { await adapter.keyUp(k); } catch {} }
  async function releaseAll() { for (const k of [...held.keys()]) await up(k); try { await adapter.releaseAll(); } catch {} }

  async function look() {
    const o = await adapter.observe();
    const img = png.decode(o.png);
    const c = profile.colors;
    const player = png.blobs(img, c.player, { tol: 50, minPixels: 6 })[0] || null;
    const coins = png.blobs(img, c.coin, { tol: 60, minPixels: 3 });
    const hazards = png.blobs(img, c.hazard, { tol: 50, minPixels: 20 });
    const m = profile.hud && String(o.hud || '').match(profile.hud.re);
    const hud = {};
    if (m) profile.hud.fields.forEach((f, i) => { hud[f] = /^\d+$/.test(m[i + 1]) ? Number(m[i + 1]) : m[i + 1]; });
    return { player, coins, hazards, hud, focused: o.focused !== false, scale: o.scale || 1, at: now() };
  }

  // the next bounded move: one axis, toward the target, around hazards
  function plan(obs, target, safe) {
    const p = obs.player, s = obs.scale, half = profile.playerSize * s / 2, margin = profile.margin * s;
    const px = p.x + half, py = p.y + half;   // centre (blob is the square's box)
    const sweep = (ax, to) => ax === 'x'
      ? { x: Math.min(px, to) - half, y: py - half, w: Math.abs(to - px) + 2 * half, h: 2 * half }
      : { x: px - half, y: Math.min(py, to) - half, w: 2 * half, h: Math.abs(to - py) + 2 * half };
    const hits = (r) => safe && obs.hazards.some(hz => r.x < hz.x + hz.w + margin && r.x + r.w > hz.x - margin && r.y < hz.y + hz.h + margin && r.y + r.h > hz.y - margin);
    const dx = target.cx - px, dy = target.cy - py;
    const opts = [];
    if (Math.abs(dx) > profile.reach * s / 2) opts.push({ ax: 'x', d: dx, to: target.cx });
    if (Math.abs(dy) > profile.reach * s / 2) opts.push({ ax: 'y', d: dy, to: target.cy });
    opts.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    let move = opts.find(o => !hits(sweep(o.ax, o.to)));
    if (!move && opts.length) {
      // detour: step clear of the hazard on the side nearer the target
      const hz = obs.hazards[0];
      const above = hz.y - margin - half - 2, below = hz.y + hz.h + margin + half + 2, left = hz.x - margin - half - 2, right = hz.x + hz.w + margin + half + 2;
      const cand = [{ ax: 'y', to: Math.abs(above - py) < Math.abs(below - py) ? above : below }, { ax: 'x', to: Math.abs(left - px) < Math.abs(right - px) ? left : right }]
        .map(o => ({ ...o, d: o.to - (o.ax === 'x' ? px : py) })).filter(o => Math.abs(o.d) > 2 && !hits(sweep(o.ax, o.to)));
      move = cand.sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
    }
    if (!move) return null;
    const key = move.ax === 'x' ? (move.d > 0 ? profile.keys.right : profile.keys.left) : (move.d > 0 ? profile.keys.down : profile.keys.up);
    const ms = Math.max(30, Math.min(profile.maxHoldMs, Math.abs(move.d) / (profile.speed * s) * 1000));
    return { key, ms: Math.round(ms), axis: move.ax, dist: Math.round(Math.abs(move.d)) };
  }

  async function run({ signal, maxMs = 120000, maxActions = 400, avoidHazards = true, onStep } = {}) {
    const t0 = now(), evidence = [], stats = { actions: 0, falls: 0, observations: 0 };
    let safe = avoidHazards, lastLives = null, stuck = 0, lastSig = null;
    if (guard && guard.injected) guard.injected();   // input after this moment that isn't ours means you took over
    const result = (status, reason, obs) => ({ status, reason, stats: { ...stats, ms: now() - t0, coins: obs && obs.hud.coins, total: obs && obs.hud.total }, evidence: evidence.slice(-30) });
    try {
      for (;;) {
        if (signal && signal.aborted) return result('stopped', 'You stopped it.');
        if (now() - t0 > maxMs) return result('paused', `Reached the ${Math.round(maxMs / 1000)} s limit for this run.`);
        if (stats.actions >= maxActions) return result('paused', `Used the ${maxActions}-action limit.`);
        if (guard) {
          let g = { ok: true };
          try { g = (await guard.check(signal)) || { ok: true }; } catch (e) { if (e.category === 'cancelled') throw e; g = { ok: false, reason: e.message }; }
          if (g.ok === false) { await releaseAll(); return result('paused', g.reason); }
        }
        const obs = await look(); stats.observations++;
        if (!obs.focused || obs.hud.state === 'paused') { await releaseAll(); return result('paused', 'The game lost focus, so I let go of the keys and paused.', obs); }
        if (lastLives != null && obs.hud.lives < lastLives) { stats.falls++; safe = true; evidence.push({ t: now() - t0, note: 'fell into the hazard; switched to safe paths', lives: obs.hud.lives }); }
        lastLives = obs.hud.lives;
        if (obs.hud.state === 'won' || (obs.hud.total && obs.hud.coins === obs.hud.total)) return result('completed', `Collected ${obs.hud.coins}/${obs.hud.total} coins (read from the game's own counter).`, obs);
        if (obs.hud.state === 'over') return result('failed', 'Out of lives.', obs);
        // anything the profile doesn't know (a shop, a dialog, a menu): stop, let go, and hand it to you
        if (obs.hud.state && !['playing', 'recovering', 'won', 'over', 'paused'].includes(obs.hud.state)) { await releaseAll(); return result('paused', `Something unexpected came up in the game (${obs.hud.state}), so I let go and stopped. It's yours to handle${/shop|store|buy|purchase/i.test(obs.hud.state) ? '; I never buy anything' : ''}.`, obs); }
        if (!obs.hud.state) { await releaseAll(); return result('paused', 'I can\'t read the game\'s status any more, so I let go and stopped.', obs); }
        if (obs.hud.state === 'recovering' || !obs.player) { await sleep(120, signal); continue; }
        // nearest coin
        const pc = { x: obs.player.x + obs.player.w / 2, y: obs.player.y + obs.player.h / 2 };
        const target = obs.coins.slice().sort((a, b) => Math.hypot(a.cx - pc.x, a.cy - pc.y) - Math.hypot(b.cx - pc.x, b.cy - pc.y))[0];
        if (!target) { await sleep(100, signal); continue; }
        const mv = plan(obs, target, safe);
        if (!mv) return result('blocked', 'I can\'t find a safe path to the next coin.', obs);
        // act: one bounded hold, always released
        await down(mv.key);
        try { await sleep(mv.ms, signal); } finally { await up(mv.key); }
        stats.actions++;
        const sig = `${Math.round(pc.x / 4)},${Math.round(pc.y / 4)},${obs.hud.coins}`;
        stuck = sig === lastSig ? stuck + 1 : 0; lastSig = sig;
        if (stuck >= 6) return result('failed', 'My moves stopped changing anything in the game, so I stopped.', obs);
        evidence.push({ t: now() - t0, key: mv.key, ms: mv.ms, coins: obs.hud.coins, player: [Math.round(pc.x), Math.round(pc.y)] });
        onStep && onStep(mv, obs);
      }
    } catch (e) {
      if (e.category === 'cancelled') return result('stopped', 'You stopped it.');
      return result('failed', e.message);
    } finally {
      await releaseAll();
    }
  }
  // A recorded routine: only this game's own keys, replayed in bounded holds, until a
  // condition read from the game's HUD is met (or a limit/Stop). Never text, never other apps.
  async function routine(r, { signal, maxMs = 120000 } = {}) {
    const t0 = now(), stats = { loops: 0, actions: 0 };
    const allowed = new Set(Object.values(profile.keys));
    if (!r || !Array.isArray(r.steps) || !r.steps.length) throw new NovaError('invalid', 'That routine is empty.');
    if (r.game !== profile.id) throw new NovaError('blocked', `That routine was recorded for ${r.game}, not ${profile.name}.`);
    for (const st of r.steps) if (st.key && !allowed.has(st.key)) throw new NovaError('blocked', `The routine uses a key (${st.key}) that isn't one of this game's controls.`);
    const until = r.until || {};
    const done = (hud) => until.field && Number(hud[until.field]) >= Number(until.atLeast);
    const out = (status, reason, hud) => ({ status, reason, stats: { ...stats, ms: now() - t0, [until.field || 'value']: hud && hud[until.field] } });
    try {
      for (;;) {
        const obs = await look();
        if (done(obs.hud)) return out('completed', `Stopped when ${until.field} reached ${obs.hud[until.field]} (goal ${until.atLeast}).`, obs.hud);
        if (!obs.focused || obs.hud.state === 'paused') { await releaseAll(); return out('paused', 'The game lost focus, so I let go of the keys and paused.', obs.hud); }
        if (stats.loops >= (r.maxLoops || 10)) return out('paused', `Ran the routine ${stats.loops} times without reaching the goal.`, obs.hud);
        for (const st of r.steps) {
          if (signal && signal.aborted) return out('stopped', 'You stopped it.', obs.hud);
          if (now() - t0 > maxMs) return out('paused', 'Reached the time limit.', obs.hud);
          if (guard) { try { const g = (await guard.check(signal)) || { ok: true }; if (g.ok === false) { await releaseAll(); return out('paused', g.reason, obs.hud); } } catch (e) { if (e.category === 'cancelled') throw e; await releaseAll(); return out('paused', e.message, obs.hud); } }
          if (st.key) { await down(st.key); try { await sleep(Math.min(profile.maxHoldMs, Math.max(20, st.ms || 100)), signal); } finally { await up(st.key); } stats.actions++; }
          else await sleep(Math.min(2000, st.ms || 100), signal);
          const mid = await look();
          if (done(mid.hud)) return out('completed', `Stopped when ${until.field} reached ${mid.hud[until.field]} (goal ${until.atLeast}).`, mid.hud);
        }
        stats.loops++;
      }
    } catch (e) {
      if (e.category === 'cancelled') return out('stopped', 'You stopped it.');
      throw e;
    } finally { await releaseAll(); }
  }
  return { run, routine, look, plan, releaseAll, held: () => [...held.keys()] };
}

// Turn what you did in the game (key down/up events with times) into a routine.
// Only the game's own controls are kept: typed text, shortcuts and anything else
// (passwords, chat) are dropped, so a routine can never replay them.
function recordRoutine(events, profile, { until, maxLoops = 10 } = {}) {
  const allowed = new Set(Object.values(profile.keys));
  const steps = [], downAt = new Map();
  let last = null, dropped = 0;
  for (const e of events) {
    if (!allowed.has(e.key)) { dropped++; continue; }
    if (e.type === 'down' && !downAt.has(e.key)) {
      if (last != null && e.t - last > 30) steps.push({ wait: true, ms: Math.min(2000, e.t - last) });
      downAt.set(e.key, e.t);
    } else if (e.type === 'up' && downAt.has(e.key)) {
      steps.push({ key: e.key, ms: Math.min(profile.maxHoldMs, e.t - downAt.get(e.key)) });
      downAt.delete(e.key); last = e.t;
    }
  }
  return { game: profile.id, steps, until, maxLoops, dropped, recorded: new Date().toISOString() };
}

// ------------------------------------------------------------------ requests
// sessions: { open(profileId) -> adapter } for games Nova can run (the local fixture, in her own window)
function createGames({ store, permissions, log, launch, sessions, guardFor }) {
  const profiles = () => {
    const saved = store ? store.recall('game_profile').map(r => r.value) : [];
    return { ...PROFILES, ...Object.fromEntries(saved.map(p => [p.id, { ...p, automation: !!p.automation && !p.online }])) };
  };
  const places = () => store ? store.recall('roblox_place').map(r => r.value) : [];
  let current = null;

  async function handle(task, r, { ui, approve, reply, answer }) {
    const text = r.text;
    const pol = policy(text);
    if (!pol.ok) {
      log && log.event('game.refused', { reasons: pol.reasons });
      return reply(task, `I won't do that: it ${pol.reasons.join(' and ')}. I can still help you plan, find guides, or look at what's on screen.`, { blocked: true });
    }
    if (/\broblox\b/i.test(text)) return roblox(task, text, { ui, reply });
    if (/\broutines?\b/i.test(text)) return routines(task, text, { ui, approve, reply });
    const all = profiles();
    const prof = /\b(test|fixture|coin) ?game\b|\bcoins?\b/i.test(text) ? all['nova-fixture'] : Object.values(all).find(p => text.toLowerCase().includes(p.name.toLowerCase().split(' (')[0]));
    if (!prof) return reply(task, "I don't have a profile for that game, so I won't press keys in it. I can look at it with you and give advice: say \"what's on my screen\" or ask me about it.");
    if (!prof.automation) return reply(task, prof.why || `${prof.name} is online, so I'll only watch and advise there, not play.`);
    if (!sessions || !sessions.has(prof.id)) return reply(task, `I can't open ${prof.name} on this setup.`);
    const minutes = Math.min(10, Number((text.match(/(\d+)\s*min/) || [])[1]) || 2);
    let grant = null;
    try { grant = await approve(task, {
      title: `Let Nova play ${prof.name}?`,
      lines: [`Goal: ${prof.goal}.`, `Up to ${minutes} minute${minutes > 1 ? 's' : ''}; arrow keys only, only in that game window.`, 'She lets go of every key and pauses if the game loses focus or you touch the mouse or keyboard.', 'Stop anytime with the Stop button or Ctrl+Alt+X.'],
      categories: ['game', 'control'], targets: { game: [prof.id] }, ttlMs: minutes * 60000 + 30000,
    }); } catch (e) { if (e.category === 'denied') return reply(task, 'OK, I won\'t play.'); throw e; }
    const adapter = await sessions.open(prof.id);
    const ctl = createController({ adapter, profile: prof, guard: guardFor && guardFor(adapter), log });
    current = { task: task.id, ctl, id: id('play') };
    ui.status({ taskId: task.id, state: 'executing', text: `Playing ${prof.name}…` });
    const res = await ctl.run({ signal: task.ac && task.ac.signal, maxMs: minutes * 60000 });
    current = null;
    log && log.event('game.run', { profile: prof.id, status: res.status, actions: res.stats.actions, falls: res.stats.falls, ms: res.stats.ms });
    const extra = res.stats.falls ? ` I fell in the pit ${res.stats.falls} time${res.stats.falls > 1 ? 's' : ''} and switched to safer paths.` : '';
    return reply(task, `${res.status === 'completed' ? 'Done.' : res.status === 'stopped' ? 'Stopped, and I let go of every key.' : 'I paused.'} ${res.reason}${extra} (${res.stats.actions} moves, ${(res.stats.ms / 1000).toFixed(1)} s)`, { game: res });
  }

  // record what you do in a game (only its own keys are kept), then replay it until a goal
  const saved = () => store ? store.recall('game_routine').map(r => ({ key: r.key, ...r.value })) : [];
  async function routines(task, text, { ui, approve, reply }) {
    const prof = PROFILES['nova-fixture'];   // the only game with recording/replay allowed so far
    if (/\brecord\b/i.test(text)) {
      if (!sessions || !sessions.record) return reply(task, 'I can\'t record in this setup.');
      const name = ((text.match(/\b(?:called|named)\s+["“]?([\w -]{1,30})/i) || [])[1] || 'my routine').trim();
      const events = await sessions.record(prof.id, { task, ui });
      if (!events) return reply(task, 'Okay, I didn\'t save anything.');
      const r = recordRoutine(events, prof, { until: { field: 'coins', atLeast: 1 } });
      if (!r.steps.some(s => s.key)) return reply(task, 'I didn\'t see any of the game\'s keys (arrow keys), so there\'s nothing to save.');
      store.remember('routine:' + name.toLowerCase(), 'game_routine', { ...r, name });
      return reply(task, `Saved "${name}": ${r.steps.filter(s => s.key).length} key presses in ${prof.name}${r.dropped ? ` (I left out ${r.dropped} other key${r.dropped > 1 ? 's' : ''}; typed text is never recorded)` : ''}. Say "replay the ${name} routine until 3 coins".`);
    }
    const all = saved();
    if (!all.length) return reply(task, 'You haven\'t recorded a routine yet. Say "record a routine in the test game".');
    const r = all.find(x => text.toLowerCase().includes(String(x.name).toLowerCase())) || (all.length === 1 ? all[0] : null);
    if (!r) return reply(task, `Which routine? I have: ${all.map(x => x.name).join(', ')}.`);
    const n = Number((text.match(/until (?:i have |there are |you have )?(\d+)\s*coins?/i) || [])[1]) || 1;
    const run = { ...r, until: { field: 'coins', atLeast: n } };
    try {
      await approve(task, { title: `Replay "${r.name}" in ${prof.name}?`, lines: [`Its ${run.steps.filter(s => s.key).length} recorded arrow-key presses, up to ${run.maxLoops} times, until the game shows ${n} coin${n > 1 ? 's' : ''}.`, 'Only in that game window. Stop anytime (Ctrl+Alt+X).'], categories: ['game', 'control'], targets: { game: [prof.id] }, ttlMs: 3 * 60000 });
    } catch (e) { if (e.category === 'denied') return reply(task, 'Okay, I won\'t.'); throw e; }
    const adapter = await sessions.open(prof.id);
    const ctl = createController({ adapter, profile: prof, guard: guardFor && guardFor(adapter), log });
    current = { task: task.id, ctl };
    const res = await ctl.routine(run, { signal: task.ac && task.ac.signal, maxMs: 120000 });
    current = null;
    return reply(task, `${res.status === 'completed' ? 'Done.' : res.status === 'stopped' ? 'Stopped, and I let go of every key.' : 'I paused.'} ${res.reason} (${res.stats.loops} loop${res.stats.loops === 1 ? '' : 's'}, ${res.stats.actions} key presses)`, { game: res });
  }

  async function roblox(task, text, { ui, reply }) {
    const p = PROFILES.roblox;
    if (/\b(play|grind|farm|repeat|auto|do (the|my) (quest|obby|level)s?)\b/i.test(text) && !/\b(join|open|launch)\b/i.test(text)) return reply(task, p.why);
    const link = text.match(/roblox\.com\/games\/(\d+)/i);
    const idOnly = text.match(/\bplace(?: id)?\s*(\d{5,})/i);
    let placeId = link ? link[1] : idOnly ? idOnly[1] : null;
    if (!placeId) {
      const named = places().filter(pl => text.toLowerCase().includes(String(pl.alias).toLowerCase()));
      if (named.length === 1) placeId = named[0].placeId;
      else if (named.length > 1) {
        const pick = await ui.choose({ taskId: task.id, question: 'Which experience?', options: named.map(n => ({ label: `${n.alias} (${n.placeId})`, value: n.placeId })) });
        placeId = pick || null;
      }
    }
    if (!placeId) return reply(task, 'Send me the experience\'s link from roblox.com (or tell me its name after you\'ve saved it in Settings → Games) and I\'ll open it through Roblox. ' + p.why);
    const url = p.launchUrl(placeId);
    await launch(url);
    return reply(task, `Opened it on roblox.com — press Play there to join. ${p.why}`, { url });
  }

  return {
    handle, profiles, policy,
    addPlace: (alias, placeId) => { if (!/^\d{3,}$/.test(String(placeId))) throw new NovaError('invalid', 'A place ID is a number.'); store.remember('roblox:' + alias.toLowerCase(), 'roblox_place', { alias, placeId: String(placeId) }); },
    stop: async () => { if (current) await current.ctl.releaseAll(); },
  };
}

// ------------------------------------------------------------------ adapters
// Playwright page (tests / harness)
function playwrightAdapter(page, { hud = '#hud' } = {}) {
  const held = new Set();
  return {
    async observe() {
      const [shot, text, focused] = await Promise.all([page.screenshot({ type: 'png' }), page.textContent(hud), page.evaluate(() => document.hasFocus())]);
      return { png: shot, hud: text, focused };
    },
    keyDown: async (k) => { held.add(k); await page.keyboard.down(k); },
    keyUp: async (k) => { held.delete(k); await page.keyboard.up(k); },
    releaseAll: async () => { for (const k of [...held]) { held.delete(k); await page.keyboard.up(k); } },
    held: () => [...held],
  };
}
// Electron BrowserWindow that Nova opened herself (the fixture in the real app)
const ELECTRON_KEYS = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down' };
function electronAdapter(win, { hud = '#hud' } = {}) {
  const held = new Set();
  const wc = win.webContents;
  const send = (type, k) => wc.sendInputEvent({ type, keyCode: ELECTRON_KEYS[k] || k });
  return {
    async observe() {
      const img = await wc.capturePage();
      const text = await wc.executeJavaScript(`(document.querySelector(${JSON.stringify(hud)})||{}).textContent||''`);
      return { png: img.toPNG(), hud: text, focused: win.isFocused() && !win.isMinimized(), scale: img.getSize().width / win.getContentBounds().width };
    },
    keyDown: async (k) => { held.add(k); send('keyDown', k); },
    keyUp: async (k) => { held.delete(k); send('keyUp', k); },
    releaseAll: async () => { for (const k of [...held]) { held.delete(k); send('keyUp', k); } },
  };
}

module.exports = { createGames, createController, recordRoutine, policy, PROFILES, PROHIBITED, playwrightAdapter, electronAdapter };
