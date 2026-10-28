// Zin's brain and body: movement, physics, the speech bubble menus, and the
// little scripted "shows" that play while an action runs.
'use strict';
(async function () {
  const S = window.ZinSprites;
  const api = window.zin;
  let settings = await api.getSettings();

  const $ = (q) => document.querySelector(q);
  const zEl = $('#zin'), cv = $('#sprite'), ctx = cv.getContext('2d', { willReadFrequently: true });
  const bubble = $('#bubble'), bText = $('#b-text'), bBody = $('#b-body'), bChip = $('.b-chip');
  const fxCv = $('#fx'), fx = fxCv.getContext('2d');
  const tagEl = $('#tag'), hiEl = $('#hi');

  // The demo page has a fake taskbar; in the real app the window already stops above it.
  const bottomInset = window.ZIN_BOTTOM_INSET || 0;
  let W = innerWidth, H = innerHeight - bottomInset;
  function resize() { W = innerWidth; H = innerHeight - bottomInset; fxCv.width = W; fxCv.height = innerHeight; }
  addEventListener('resize', resize);
  resize();

  const sc = () => settings.size || 3;
  // heights above Zin's feet, in sprite pixels
  const CHEST = S.GROUND - 32, HEAD = S.GROUND - S.HEAD_TOP;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let now = performance.now();

  // ================================================================ state
  const z = {
    x: W - 160, y: H, vx: 0, vy: 0, facing: -1, mode: 'stand', // stand | fall | drag | jump
    perch: null, walk: null, jump: null, hold: null, landUntil: 0,
    sitting: false, asleep: false, talking: false, pointing: null, hiding: false,
    frame: 0, ft: 0, anim: 'idle', blinkUntil: 0, nextBlink: 0, thrown: 0,
  };
  let activeWin = null;
  let busy = 0; // >0 while an action show is running
  let lastInteraction = now, nextThink = now + 5000;
  const mouse = { x: W / 2, y: H / 2 };

  function applyTheme() {
    const s = S.skinOf(settings.skin);
    document.documentElement.style.setProperty('--accent', s.body);
    document.documentElement.style.setProperty('--accent2', s.dark);
    document.documentElement.style.setProperty('--glow', s.body);
  }
  applyTheme();

  // ================================================================ sound
  // Tiny chiptune bleeps made on the fly, no sound files needed.
  let ac = null;
  const SFX = {
    blip:  [['square', [[700, 0], [760, 0.02]], 0.035, 0.05]],
    pop:   [['square', [[420, 0], [840, 0.05]], 0.08, 0.06]],
    jump:  [['square', [[260, 0], [900, 0.14]], 0.16, 0.05]],
    land:  [['triangle', [[180, 0], [70, 0.08]], 0.1, 0.12]],
    boing: [['triangle', [[200, 0], [600, 0.06], [180, 0.2]], 0.24, 0.12]],
    ok:    [['square', [[523, 0], [659, 0.07], [784, 0.14], [1047, 0.21]], 0.32, 0.05]],
    err:   [['square', [[330, 0], [220, 0.12]], 0.24, 0.05]],
    glitch:[['sawtooth', [[1200, 0], [90, 0.05], [1500, 0.09], [60, 0.14]], 0.18, 0.04]],
    ding:  [['sine', [[1318, 0], [1318, 0.3]], 0.6, 0.15], ['sine', [[1760, 0.15]], 0.6, 0.1]],
    sweep: [['triangle', [[300, 0], [180, 0.12]], 0.14, 0.03]],
  };
  function sfx(name) {
    if (!settings.sound || !SFX[name]) return;
    try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume(); } catch { return; }
    const t0 = ac.currentTime;
    for (const [type, steps, dur, vol] of SFX[name]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      steps.forEach(([f, t]) => o.frequency.setValueAtTime(f, t0 + t));
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
  }

  // ================================================================ particles
  const parts = [];
  const GLYPH_HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
  function emit(kind, x, y, n = 8) {
    const s = S.skinOf(settings.skin);
    for (let i = 0; i < n; i++) {
      const p = { x, y, vx: rand(-80, 80), vy: rand(-220, -60), life: rand(0.6, 1.2), t: 0, size: Math.ceil(sc() * rand(0.7, 1.4)), kind };
      if (kind === 'sparkle') p.color = pick([s.body, s.light, '#ffffff', s.tip]);
      if (kind === 'dust') { p.color = pick(['#b9b3c9', '#d8d3e6', '#8f88a3']); p.vy = rand(-60, -10); p.vx = rand(-120, 120); }
      if (kind === 'paint') p.color = pick(['#ff3d8b', '#39f5ff', '#ffe14d', '#7cf29e', '#9d7dff']);
      if (kind === 'heart') { p.color = '#ff3d8b'; p.vy = rand(-90, -40); p.vx = rand(-30, 30); p.life = 1.4; }
      if (kind === 'confetti') { p.color = pick(['#ff3d8b', '#39f5ff', '#ffe14d', '#7cf29e']); p.vy = rand(-500, -250); p.vx = rand(-260, 260); p.life = 1.8; }
      if (kind === 'glitch') { p.color = pick(['#ff2fd0', '#39f5ff', '#ffffff']); p.vx = rand(-300, 300); p.vy = rand(-40, 40); p.life = 0.35; p.w = rand(8, 40); }
      parts.push(p);
    }
  }
  function drawParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'confetti' || p.kind === 'paint') p.vy += 700 * dt;
      fx.globalAlpha = 1 - p.t / p.life;
      fx.fillStyle = p.color;
      if (p.kind === 'heart') {
        const u = Math.max(2, sc() - 1);
        GLYPH_HEART.forEach((row, j) => [...row].forEach((c, k) => { if (c === 'X') fx.fillRect(Math.round(p.x + k * u), Math.round(p.y + j * u), u, u); }));
      } else if (p.kind === 'glitch') {
        fx.fillRect(Math.round(p.x), Math.round(p.y), p.w, sc());
      } else {
        fx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    fx.globalAlpha = 1;
  }

  // ================================================================ surfaces
  // Zin stands on the bottom of the screen (just above the taskbar) or on
  // top of the window you're using.
  function windowSurface() {
    const w = activeWin;
    if (!settings.followWindows || !w || w.maximized) return null;
    if (w.y < HEAD * sc() + 10 || w.y > H - 60 || w.width < 160) return null;
    return { id: w.id, x1: w.x + 12, x2: w.x + w.width - 12, y: w.y };
  }
  function floor() { return { id: null, x1: 24 * sc() * 0.6, x2: W - 24 * sc() * 0.6, y: H }; }
  function surface() { return (z.perch && windowSurface()) || floor(); }

  api.onActiveWindow((w) => {
    const prev = activeWin;
    activeWin = w;
    if (!z.perch) return;
    const ws = windowSurface();
    if (!ws || ws.id !== z.perch) { fallOff(); return; }
    if (prev && prev.id === w.id) {
      const dx = w.x - prev.x;
      z.x += dx; z.y = ws.y;
      if (z.walk) z.walk.x += dx;
      if (z.x < ws.x1 - 16 || z.x > ws.x2 + 16) fallOff();
    }
  });
  function fallOff() {
    if (z.mode !== 'stand') return;
    z.perch = null;
    startFall(0, -120);
    if (!busy && bubble.classList.contains('hidden') && Math.random() < 0.5) setTimeout(() => say(pick(['Whoa!', 'Hey! I was sitting there!', 'Rude.', 'Aaa—']), { ms: 1800 }), 300);
  }

  // ================================================================ movement
  function stopMoving() {
    if (z.walk) { const r = z.walk.resolve; z.walk = null; r(false); }
    if (z.jump) { const r = z.jump.resolve; z.jump = null; r(false); }
  }
  function startFall(vx, vy) {
    stopMoving();
    z.mode = 'fall'; z.vx = vx; z.vy = vy; z.perch = null; z.sitting = false;
  }
  function walkTo(x, opts = {}) {
    stopMoving();
    if (z.mode !== 'stand') return Promise.resolve(false);
    const s = surface();
    x = clamp(x, s.x1, s.x2);
    z.sitting = false; z.asleep = false;
    return new Promise((resolve) => {
      z.walk = { x, run: !!opts.run, anim: opts.anim || (opts.run ? 'run' : 'walk'), speed: (opts.speed || (opts.run ? 230 : 85)) * sc() / 2, resolve };
    });
  }
  function jumpTo(x, y, perchId) {
    stopMoving();
    if (z.mode !== 'stand') return Promise.resolve(false);
    sfx('jump');
    z.sitting = false; z.asleep = false; z.perch = null;
    const dist = Math.hypot(x - z.x, y - z.y);
    return new Promise((resolve) => {
      z.mode = 'jump';
      z.facing = x >= z.x ? 1 : -1;
      z.jump = { sx: z.x, sy: z.y, x, y, t: 0, dur: 0.45 + dist / 1800, arc: Math.max(70, z.y - y + 60), perchId, resolve };
    });
  }
  function land(perchId) {
    z.mode = 'stand'; z.vx = z.vy = 0; z.perch = perchId || null;
    z.landUntil = now + 220;
    sfx('land');
    emit('dust', z.x, z.y - 4, 6);
  }
  function play(anim, ms) {
    return new Promise((resolve) => {
      if (z.hold) z.hold.resolve();
      z.hold = { anim, until: now + ms, resolve };
    });
  }
  async function teleportTo(x, y) {
    sfx('glitch');
    zEl.classList.add('glitch');
    emit('glitch', z.x, z.y - CHEST * sc(), 14);
    await sleep(260);
    stopMoving();
    z.x = x; z.y = Math.min(y, H); z.perch = null;
    emit('glitch', z.x, z.y - CHEST * sc(), 14);
    await sleep(260);
    zEl.classList.remove('glitch');
    if (z.y < H) startFall(0, 0); else z.mode = 'stand';
  }
  const goFloor = async () => {
    if (!z.perch) return;
    const s = surface();
    const edge = z.x - s.x1 < s.x2 - z.x ? s.x1 - 50 : s.x2 + 50;
    await jumpTo(clamp(edge, 40, W - 40), H);
  };

  // ================================================================ main loop
  let last = performance.now();
  function tick(t) {
    now = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    physics(dt);
    brain();
    animate(dt);
    drawFx(dt);
    requestAnimationFrame(tick);
  }

  function physics(dt) {
    if (z.mode === 'stand') {
      const s = surface();
      if (z.perch && !windowSurface()) { fallOff(); return; }
      z.y = s.y;
      if (z.walk) {
        const d = z.walk.x - z.x;
        z.facing = d >= 0 ? 1 : -1;
        const step = z.walk.speed * dt;
        if (Math.abs(d) <= step) { z.x = z.walk.x; const r = z.walk.resolve; z.walk = null; r(true); }
        else z.x += Math.sign(d) * step;
        if (z.walk && z.walk.anim === 'sweep' && Math.random() < 0.3) emit('dust', z.x + z.facing * 14 * sc(), z.y - 3, 1);
      }
      if (z.chase) {
        if (now > z.chase.until) { z.chase = null; }
        else if (!z.walk) {
          const dx = mouse.x - z.x;
          if (Math.abs(dx) > 30) { z.facing = Math.sign(dx); z.x += Math.sign(dx) * Math.min(Math.abs(dx), 260 * sc() / 2 * dt); }
        }
      }
    } else if (z.mode === 'fall') {
      const prevY = z.y;
      z.vy += 2400 * dt;
      z.x += z.vx * dt; z.y += z.vy * dt;
      const m = 16 * sc();
      if (z.x < m) { z.x = m; z.vx = Math.abs(z.vx) * 0.6; sfx('boing'); }
      if (z.x > W - m) { z.x = W - m; z.vx = -Math.abs(z.vx) * 0.6; sfx('boing'); }
      if (z.y - HEAD * sc() < 0 && z.vy < 0) { z.y = HEAD * sc(); z.vy = Math.abs(z.vy) * 0.4; }
      if (Math.abs(z.vx) > 30) z.facing = Math.sign(z.vx);
      const ws = windowSurface();
      if (ws && z.vy > 0 && prevY <= ws.y && z.y >= ws.y && z.x >= ws.x1 && z.x <= ws.x2) { z.y = ws.y; landOrBounce(ws.id); }
      else if (z.y >= H) { z.y = H; landOrBounce(null); }
    } else if (z.mode === 'jump') {
      const j = z.jump;
      j.t += dt / j.dur;
      const t = Math.min(1, j.t);
      z.x = j.sx + (j.x - j.sx) * t;
      z.y = j.sy + (j.y - j.sy) * t - j.arc * 4 * t * (1 - t);
      if (t >= 1) { z.jump = null; land(j.perchId); j.resolve(true); }
    } else if (z.mode === 'drag') {
      z.x = mouse.x - drag.ox; z.y = mouse.y - drag.oy;
    }
  }
  function landOrBounce(perchId) {
    if (z.vy > 1100) {
      z.vy = -z.vy * 0.35; z.vx *= 0.7;
      sfx('boing'); emit('dust', z.x, z.y - 4, 8);
      return;
    }
    const wasThrown = z.thrown;
    z.thrown = 0;
    land(perchId);
    if (wasThrown > 1500) { play('dizzy', 1600); setTimeout(() => say(pick(['Wheeee!', 'Again! Again!', 'I can see sounds…', 'That was AWESOME']), { ms: 2200 }), 200); }
  }

  function currentAnim() {
    if (z.mode === 'drag') return 'dangle';
    if (z.mode === 'fall' || z.mode === 'jump') return 'fall';
    if (now < z.landUntil) return 'land';
    if (z.walk) return z.walk.anim;
    if (z.chase) return Math.abs(mouse.x - z.x) > 30 ? 'run' : 'love';
    if (z.hold) {
      if (now < z.hold.until) return z.hold.anim;
      const r = z.hold.resolve; z.hold = null; r();
    }
    if (z.pointing) return 'point';
    if (z.talking) return 'talk';
    if (z.asleep) return 'sleep';
    if (z.sitting) return 'sit';
    return 'idle';
  }

  let lastKey = '';
  function animate(dt) {
    const anim = currentAnim();
    if (anim !== z.anim) { z.anim = anim; z.frame = 0; z.ft = 0; }
    const a = S.ANIMS[anim];
    z.ft += dt;
    if (z.ft >= 1 / a.fps) { z.ft = 0; z.frame = a.loop ? z.frame + 1 : Math.min(z.frame + 1, a.frames - 1); }
    if (now > z.nextBlink) { z.blinkUntil = now + 130; z.nextBlink = now + rand(1800, 5000); }
    const blink = now < z.blinkUntil && ['idle', 'walk', 'sit', 'point', 'talk'].includes(anim);
    const s = sc();
    if (cv.width !== S.W * s || cv.height !== S.H * s) { cv.width = S.W * s; cv.height = S.H * s; lastKey = ''; }
    const key = [anim, z.frame % a.frames, settings.skin, settings.hat, z.facing, blink].join('|');
    if (key !== lastKey) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      S.draw(ctx, { anim, frame: z.frame, skin: settings.skin, hat: settings.hat, scale: s, flip: z.facing < 0, overrides: blink ? { eyes: 'blink' } : null });
      lastKey = key;
    }
    const left = Math.round(z.x - (S.W / 2) * s), top = Math.round(z.y - a.footY * s);
    zEl.style.transform = `translate(${left}px, ${top}px)`;
    if (!bubble.classList.contains('hidden')) placeBubble();
    if (!tagEl.classList.contains('hidden')) tagEl.style.transform = `translate(${Math.round(z.x - tagEl.offsetWidth / 2)}px, ${top + S.HEAD_TOP * s - 26}px)`;
    if (!hiEl.classList.contains('hidden')) hiEl.style.transform = `translate(${Math.round(z.x + 6 * s)}px, ${top + S.HEAD_TOP * s - 34}px)`;
  }

  // ================================================================ effects layer
  let dash = 0;
  const wipes = [];
  function drawFx(dt) {
    fx.clearRect(0, 0, fxCv.width, fxCv.height);
    // paint wipe trail (wallpaper show)
    for (let i = wipes.length - 1; i >= 0; i--) {
      const w = wipes[i];
      w.t += dt;
      if (w.t > 1.2) { wipes.splice(i, 1); continue; }
      fx.globalAlpha = 0.28 * (1 - w.t / 1.2);
      fx.fillStyle = w.color;
      fx.fillRect(w.x - 12, 0, 24, H);
    }
    fx.globalAlpha = 1;
    drawParticles(dt);
    if (z.pointing) drawArrow(dt);
  }
  function handPos() {
    const s = sc(), a = S.ANIMS[z.anim];
    const top = z.y - a.footY * s;
    const [hx, hy] = S.handOf(z.anim, z.frame);
    const left = z.x - (S.W / 2) * s;
    return { x: z.facing > 0 ? left + (hx + 0.5) * s : left + (S.W - hx - 0.5) * s, y: top + (hy + 0.5) * s };
  }
  function drawArrow(dt) {
    const p = z.pointing, h = handPos(), s = S.skinOf(settings.skin);
    dash -= dt * 60;
    fx.save();
    fx.strokeStyle = s.body; fx.lineWidth = 3; fx.lineCap = 'square';
    fx.setLineDash([9, 7]); fx.lineDashOffset = dash;
    fx.beginPath(); fx.moveTo(h.x, h.y); fx.lineTo(p.x, p.y); fx.stroke();
    fx.setLineDash([]);
    const ang = Math.atan2(p.y - h.y, p.x - h.x);
    fx.fillStyle = s.body;
    fx.beginPath();
    fx.moveTo(p.x, p.y);
    fx.lineTo(p.x - 14 * Math.cos(ang - 0.45), p.y - 14 * Math.sin(ang - 0.45));
    fx.lineTo(p.x - 14 * Math.cos(ang + 0.45), p.y - 14 * Math.sin(ang + 0.45));
    fx.fill();
    if (p.label) {
      fx.font = '700 12px Consolas, monospace';
      const tw = fx.measureText(p.label).width + 14;
      const lx = clamp(p.x - tw / 2, 4, W - tw - 4), ly = clamp(p.y - 34, 4, H - 24);
      fx.fillStyle = '#000'; fx.fillRect(lx + 3, ly + 3, tw, 20);
      fx.fillStyle = '#ff3355'; fx.fillRect(lx, ly, tw, 20);
      fx.fillStyle = '#fff'; fx.fillText(p.label, lx + 7, ly + 14);
    }
    fx.restore();
  }
  async function pointAt(x, y, label, ms = 3500) {
    z.facing = x >= z.x ? 1 : -1;
    z.pointing = { x, y, label };
    sfx('blip');
    await sleep(ms);
    z.pointing = null;
  }
  // Walk next to a window and point into it.
  async function showWindow(win, label) {
    if (!win) return;
    const s = sc();
    await goFloor();
    const leftSide = win.x - 30 * s > 20;
    const standX = leftSide ? win.x - 22 * s : Math.min(W - 30, win.x + win.width + 22 * s);
    await walkTo(standX, { run: true });
    await pointAt(win.x + (leftSide ? 60 : win.width - 60), clamp(win.y + Math.min(140, win.height / 2), 10, H - 10), label, 4000);
  }

  // ================================================================ mouse: hover, click, drag, throw
  let captured = false;
  function setCapture(on) { if (on !== captured) { captured = on; api.capture(on); } }
  function overZin(cx, cy) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor(cx - r.left), y = Math.floor(cy - r.top);
    if (x < 0 || y < 0 || x >= r.width || y >= r.height) return false;
    try { return ctx.getImageData(x, y, 1, 1).data[3] > 0; } catch { return true; }
  }
  let drag = null, press = null, clickTimer = null;
  const samples = [];
  document.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    samples.push([performance.now(), e.clientX, e.clientY]);
    if (samples.length > 6) samples.shift();
    if (press && !drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) startDrag();
    if (drag || press) return;
    setCapture(overZin(e.clientX, e.clientY) || !!e.target.closest('#bubble'));
  });
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !overZin(e.clientX, e.clientY)) return;
    press = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  });
  function startDrag() {
    stopMoving();
    z.mode = 'drag'; z.perch = null; z.sitting = false; z.asleep = false; z.hiding = false; z.chase = null;
    drag = { ox: press.x - z.x, oy: press.y - z.y };
    zEl.classList.add('dragging');
    sfx('pop');
    interaction();
  }
  document.addEventListener('pointerup', () => {
    if (drag) {
      const a = samples[0], b = samples[samples.length - 1];
      const dtv = a && b ? Math.max(0.016, (b[0] - a[0]) / 1000) : 1;
      const vx = a ? clamp((b[1] - a[1]) / dtv, -2600, 2600) : 0;
      const vy = a ? clamp((b[2] - a[2]) / dtv, -2600, 2600) : 0;
      drag = null; press = null;
      zEl.classList.remove('dragging');
      z.thrown = Math.hypot(vx, vy);
      startFall(vx, vy);
      return;
    }
    if (press) {
      press = null;
      // wait a moment to tell a single click from a double click
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; pet(); return; }
      clickTimer = setTimeout(() => { clickTimer = null; onClick(); }, 240);
    }
  });
  function interaction() { lastInteraction = now; }

  function onClick() {
    interaction();
    if (z.asleep) { wake(); return; }
    if (z.hiding) { z.hiding = false; foundMe(); return; }
    if (!bubble.classList.contains('hidden')) { closeBubble(); return; }
    mainMenu();
  }

  // ================================================================ speech bubble
  let bubbleToken = 0, pending = null, typeToken = 0;
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function placeBubble() {
    const s = sc(), bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const left = clamp(z.x - bw / 2, 8, W - bw - 8);
    let top = z.y - (HEAD + 4) * s - bh;
    if (top < 8) top = clamp(z.y + 8, 8, H - bh - 8);
    bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function busyChip(on) { bChip.textContent = on ? 'WORKING' : 'ONLINE'; bChip.classList.toggle('busy', on); }
  async function typeText(text) {
    const my = ++typeToken;
    bText.textContent = '';
    z.talking = true;
    let i = 0;
    for (const ch of text) {
      if (my !== typeToken) return;
      bText.textContent += ch;
      if (ch !== ' ' && i++ % 2 === 0) sfx('blip');
      await sleep(16);
    }
    z.talking = false;
  }
  function closeBubble() {
    bubble.classList.add('hidden');
    bubbleToken++;
    typeToken++;
    z.talking = false;
    if (pending) { const p = pending; pending = null; p(null); }
    api.blur();
  }
  bubble.querySelector('.b-x').addEventListener('click', closeBubble);

  // Shows a message with optional buttons / input / custom content.
  // Resolves with the clicked button's value, the typed text, or null.
  function ask(text, buttons = [], opts = {}) {
    if (pending) { const p = pending; pending = null; p(null); }
    const token = ++bubbleToken;
    bubble.classList.remove('hidden');
    bubble.classList.toggle('wide', !!opts.wide);
    bBody.innerHTML = '';
    sfx('pop');
    return new Promise((resolve) => {
      pending = resolve;
      const done = (v) => { if (pending === resolve) { pending = null; resolve(v); } };
      typeText(text);
      if (buttons.length || opts.input) busyChip(false); // waiting on you, not working
      if (opts.content) bBody.append(opts.content);
      if (opts.input) {
        const f = el('form', 'b-form');
        const inp = el('input');
        inp.placeholder = opts.input;
        inp.value = opts.value || '';
        const go = el('button', 'b-btn primary', '<span class="lb">Go</span>');
        f.append(inp, go);
        f.addEventListener('submit', (e) => { e.preventDefault(); if (inp.value.trim()) done(inp.value.trim()); });
        bBody.append(f);
        setTimeout(() => { api.focus(); inp.focus(); }, 60);
      }
      if (buttons.length) {
        const g = el('div', 'b-grid' + (opts.cols === 1 ? ' one' : opts.cols === 3 ? ' three' : ''));
        for (const b of buttons) {
          const bt = el('button', 'b-btn' + (b.primary ? ' primary' : '') + (b.ghost ? ' ghost' : '') + (b.on ? ' on' : ''));
          bt.innerHTML = (b.icon ? `<span class="ic">${b.icon}</span>` : '') + `<span class="lb">${esc(b.label)}${b.sub ? `<span class="sub">${esc(b.sub)}</span>` : ''}</span>`;
          bt.addEventListener('click', () => { sfx('blip'); interaction(); done(b.value !== undefined ? b.value : b.label); });
          g.append(bt);
        }
        bBody.append(g);
      }
      if (opts.ms) setTimeout(() => { if (token === bubbleToken) closeBubble(); }, opts.ms);
    });
  }
  // A message that closes itself.
  function say(text, opts = {}) {
    ask(text, opts.buttons || [], { ms: opts.ms || Math.max(2200, text.length * 60) });
    return sleep(Math.min(1200, text.length * 18 + 200));
  }
  const back = { icon: '←', label: 'Back', value: '__back', ghost: true };

  // Runs an action "show": keeps the idle brain quiet and the chip busy.
  async function task(fn) {
    busy++;
    z.sitting = false; z.asleep = false; z.hiding = false;
    busyChip(true);
    try { return await fn(); }
    catch (e) { sfx('err'); play('shrug', 1500); await say('Oops: ' + (e.message || e), { ms: 4000 }); }
    finally { busy--; busyChip(false); z.pointing = null; }
  }
  async function act(name, args) {
    const r = await api.action(name, args);
    if (!r.ok) throw new Error(r.error);
    return r;
  }
  // Run an action while Zin plays an animation, for at least `minMs`.
  async function withShow(promise, anim, minMs = 1200) {
    play(anim, 60000);
    const [r] = await Promise.all([promise, sleep(minMs)]);
    if (z.hold) { z.hold.until = 0; }
    return r;
  }
  const fmtBytes = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
  const shortDir = (p) => { const parts = p.split(/[\\/]/); return parts.slice(-3, -1).join('\\'); };

  // ================================================================ menus
  async function mainMenu() {
    interaction();
    if (z.mode === 'stand' && !z.walk) z.facing = z.x > W / 2 ? -1 : 1;
    const v = await ask(pick(['Hey! What do you need?', 'Zin at your service.', 'What are we doing?', 'Ready when you are!']), [
      { icon: '🧹', label: 'Clean up', value: 'clean' },
      { icon: '📦', label: 'Organize', value: 'organize' },
      { icon: '🔍', label: 'Find files', value: 'find' },
      { icon: '🎨', label: 'Wallpaper', value: 'wall' },
      { icon: '💻', label: 'My PC', value: 'pc' },
      { icon: '⏱️', label: 'Tools', value: 'tools' },
      { icon: '🎉', label: 'Fun', value: 'fun' },
      { icon: '✨', label: 'My look', value: 'look' },
    ], { input: 'or just tell me: "open spotify", "remind me in 10 min to stretch"…' });
    if (v == null) return;
    const menus = { clean: cleanMenu, organize: organizeMenu, find: findMenu, wall: wallpaperMenu, pc: pcMenu, tools: toolsMenu, fun: funMenu, look: lookMenu };
    if (menus[v]) return menus[v]();
    return command(v);
  }

  // ---------------------------------------------------------------- clean
  async function cleanMenu() {
    const v = await ask('Time to tidy! What should I go after?', [
      { icon: '🧹', label: 'Scan for junk', value: 'scan', primary: true },
      { icon: '🐘', label: 'Find big files', value: 'big' },
      { icon: '📦', label: 'Organize a folder', value: 'org' },
      back,
    ]);
    if (v === 'scan') return cleanScan();
    if (v === 'big') return bigFiles();
    if (v === 'org') return organizeMenu();
    if (v === '__back') return mainMenu();
  }
  function cleanScan() {
    return task(async () => {
      await goFloor();
      say('Sniffing around for junk…', { ms: 60000 });
      const r = await withShow(act('clean.scan'), 'work', 1800);
      const total = r.items.reduce((a, b) => a + b.bytes, 0);
      if (total < 1e6) { play('cheer', 1500); return say('Your PC is already squeaky clean! ✨'); }
      const list = el('div', 'b-list');
      const checks = {};
      for (const it of r.items) {
        const row = el('label', 'b-row');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = it.bytes > 0 && it.id !== 'recycle';
        checks[it.id] = cb;
        row.append(cb, el('span', 'grow', `${esc(it.label)}<small>${esc(it.note)}</small>`), el('span', 'num', fmtBytes(it.bytes)));
        list.append(row);
      }
      play('cheer', 900);
      const v = await ask(`Found ${fmtBytes(total)} of junk! Tick what I should clean:`, [
        { icon: '🧹', label: 'Clean it!', value: 'go', primary: true }, { label: 'Nah', value: 'no', ghost: true },
      ], { content: list, wide: true });
      if (v !== 'go') return v === 'no' && say('Okay, leaving it.');
      const ids = Object.keys(checks).filter(k => checks[k].checked);
      if (!ids.length) return say('Nothing ticked, nothing cleaned!');
      say('Sweep sweep sweep…', { ms: 60000 });
      const job = act('clean.run', { ids });
      // sweep back and forth across the screen until the job finishes
      let done = false; job.finally(() => { done = true; });
      const sweepAcross = async () => {
        let dir = z.x > W / 2 ? -1 : 1;
        while (!done) {
          await walkTo(dir > 0 ? Math.min(W - 60, z.x + 320) : Math.max(60, z.x - 320), { anim: 'sweep', speed: 110 });
          sfx('sweep');
          dir = -dir;
        }
      };
      await Promise.all([job, sweepAcross(), sleep(2500)]);
      const res = await job;
      sfx('ok'); emit('sparkle', z.x, z.y - CHEST * sc(), 24);
      play('cheer', 1800);
      await say(`Done! Freed up ${fmtBytes(res.freed)}. ✨`, { ms: 5000 });
    });
  }
  function bigFiles() {
    return task(async () => {
      say('Looking for the chonky files…', { ms: 60000 });
      const r = await withShow(act('files.big'), 'search', 1500);
      if (!r.results.length) { play('shrug', 1500); return say('No giant files over 50 MB. Nice!'); }
      const v = await ask('The biggest stuff in your folders:', r.results.slice(0, 8).map(f => ({ icon: '🐘', label: `${fmtBytes(f.size)} · ${f.name}`, sub: shortDir(f.path), value: f.path })), { cols: 1, wide: true });
      if (v) return revealFile(v, 'this one is big!');
    });
  }

  // files you haven't touched in ages; they only ever go to the Recycle Bin
  function oldFiles(folder) {
    return task(async () => {
      say('Digging through the old stuff…', { ms: 60000 });
      const r = await withShow(act('files.old', { folder }), 'search', 1500);
      if (!r.results.length) { play('cheer', 1500); return say('Nothing you\'ve left untouched for 6 months. Nice!'); }
      const list = el('div', 'b-list');
      const checks = [];
      for (const f of r.results.slice(0, 12)) {
        const row = el('label', 'b-row');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = /[\\/]downloads[\\/]/i.test(f.path);
        checks.push([cb, f.path]);
        const age = Math.floor((Date.now() - f.mtime) / (365 * 86400000));
        row.append(cb, el('span', 'grow', `${esc(f.name)}<small>${esc(shortDir(f.path))} · ${age >= 1 ? age + ' yr' : '6+ mo'} old</small>`), el('span', 'num', fmtBytes(f.size)));
        list.append(row);
      }
      play('think', 900);
      const v = await ask(`${r.total} files you haven't changed in 6+ months (${fmtBytes(r.bytes)}). Tick what can go. They go to the Recycle Bin, so you can get them back:`, [
        { icon: '🗑️', label: 'Recycle ticked', value: 'go', primary: true }, { label: 'Keep all', value: 'no', ghost: true },
      ], { content: list, wide: true });
      if (v !== 'go') return v === 'no' && say('Okay, keeping everything.');
      const paths = checks.filter(([cb]) => cb.checked).map(([, p]) => p);
      if (!paths.length) return say('Nothing ticked, nothing moved!');
      const res = await withShow(act('files.recycle', { paths }), 'sweep', 1200);
      sfx('ok'); play('cheer', 1400);
      await say(`Sent ${res.moved} file${res.moved === 1 ? '' : 's'} to the Recycle Bin.${res.failed.length ? ` ${res.failed.length} wouldn't budge.` : ''}`);
    });
  }

  // ---------------------------------------------------------------- organize
  async function organizeMenu() {
    const v = await ask('Which folder should I sort? I group files by type into folders. (You can also type "sort my desktop A to Z" or "by date".)', [
      { icon: '⬇️', label: 'Downloads', value: 'downloads', primary: true },
      { icon: '🖥️', label: 'Desktop', value: 'desktop' },
      { icon: '📄', label: 'Documents', value: 'documents' },
      { icon: '📂', label: 'Pick folder…', value: 'pick' },
      { icon: '↩️', label: 'Undo last sort', value: 'undo' },
      back,
    ]);
    if (v === '__back') return mainMenu();
    if (v === 'undo') return undoOrganize();
    if (v) return organize(v);
  }
  function organize(folder, mode = 'type') {
    return task(async () => {
      say('Let me look at what\'s in there…', { ms: 60000 });
      const plan = await withShow(act('organize.plan', { folder, mode }), 'think', 1200);
      if (plan.canceled) return closeBubble();
      if (!plan.count) { play('cheer', 1200); return say('Already tidy, nothing to sort!'); }
      const list = el('div', 'b-list');
      Object.entries(plan.summary).sort((a, b) => mode === 'type' ? b[1] - a[1] : a[0].localeCompare(b[0])).forEach(([cat, n]) => list.append(el('div', 'b-row', `<span class="grow">📁 ${esc(cat)}</span><span class="num">${n}</span>`)));
      const v = await ask(`I'll move ${plan.count} files into these folders:`, [
        { icon: '📦', label: 'Do it!', value: 'go', primary: true }, { label: 'Nope', value: 'no', ghost: true },
      ], { content: list });
      if (v !== 'go') return;
      say('Carrying boxes…', { ms: 60000 });
      const job = act('organize.apply', { id: plan.id });
      let done = false; job.finally(() => { done = true; });
      const haul = async () => {
        const home = z.x;
        while (!done) {
          await walkTo(home + (home > W / 2 ? -220 : 220), { anim: 'carry', speed: 120 });
          await walkTo(home, { anim: 'walk', speed: 160 });
        }
      };
      await Promise.all([job, haul(), sleep(2600)]);
      const res = await job;
      sfx('ok'); emit('confetti', z.x, z.y - CHEST * sc(), 30);
      play('cheer', 1600);
      const more = res.failed.length ? ` (${res.failed.length} were busy, I left them)` : '';
      const w = await ask(`All sorted! Moved ${res.moved} files${more}.`, [
        { icon: '👀', label: 'Show me', value: 'show', primary: true },
        { icon: '↩️', label: 'Undo', value: 'undo' },
      ]);
      if (w === 'undo') return undoOrganize();
      if (w === 'show') {
        const r = await act('files.openFolder', { folder: plan.folder });
        closeBubble();
        await showWindow(r.window, 'all sorted!');
      }
    });
  }
  function undoOrganize() {
    return task(async () => {
      const r = await withShow(act('organize.undo'), 'carry', 1500);
      if (r.nothing) return say('Nothing to undo!');
      sfx('ok');
      await say(`Put ${r.restored} files back where they were.`);
    });
  }

  // ---------------------------------------------------------------- find
  async function findMenu(prefill) {
    const v = await ask('What are you looking for?', [
      { icon: '🕒', label: 'Recent files', value: '__recent' }, back,
    ], { input: 'part of the name, like "resume"', value: prefill });
    if (v === '__back') return mainMenu();
    if (v === '__recent') return recentFiles();
    if (v) return findFiles(v);
  }
  function findFiles(query) {
    return task(async () => {
      await goFloor();
      say(`Searching for "${query}"…`, { ms: 60000 });
      const job = act('files.find', { query });
      let done = false; job.finally(() => { done = true; });
      const hunt = async () => {
        const start = z.x;
        for (let dir = 1; !done; dir = -dir) await walkTo(start + dir * 90, { anim: 'search', speed: 80 });
      };
      await Promise.all([job, hunt(), sleep(1800)]);
      const r = await job;
      if (!r.results.length) {
        sfx('err'); play('shrug', 2000);
        return ask(`Couldn't find anything called "${query}". 😔`, [{ icon: '🔍', label: 'Try again', value: 'again' }]).then(v => v && findMenu(query));
      }
      sfx('ok'); play('cheer', 800);
      const v = await ask(`Found ${r.total > r.results.length ? r.total + ' (showing ' + r.results.length + ')' : r.total}! Which one?`,
        r.results.slice(0, 8).map(f => ({ icon: f.isDir ? '📁' : '📄', label: f.name, sub: shortDir(f.path), value: f.path })), { cols: 1, wide: true });
      if (v) return revealFile(v, 'here it is!');
    });
  }
  function recentFiles() {
    return task(async () => {
      const r = await withShow(act('files.recent'), 'search', 1000);
      if (!r.results.length) return say('Nothing new this week.');
      const v = await ask('Things you touched this week:', r.results.map(f => ({ icon: '📄', label: f.name, sub: shortDir(f.path), value: f.path })), { cols: 1, wide: true });
      if (v) return revealFile(v, 'here!');
    });
  }
  function revealFile(p, label) {
    return task(async () => {
      closeBubble();
      play('folder', 600);
      const r = await act('files.reveal', { path: p });
      if (r.window) await showWindow(r.window, label);
      else { play('wave', 1500); say('Opened it in Explorer!'); }
    });
  }

  // ---------------------------------------------------------------- wallpaper
  async function wallpaperMenu() {
    const v = await ask('New wallpaper? I can paint you one!', [
      { icon: '🌆', label: 'Synthwave', value: 'synth', primary: true },
      { icon: '🌌', label: 'Space', value: 'space' },
      { icon: '⛰️', label: 'Pixel hills', value: 'hills' },
      { icon: '📺', label: 'Glitch', value: 'glitch' },
      { icon: '🎲', label: 'Random pic', value: 'random' },
      { icon: '🖼️', label: 'Pick image…', value: 'pick' },
      { icon: '↩️', label: 'Put old back', value: 'restore' },
      back,
    ]);
    if (v === '__back') return mainMenu();
    if (v) return wallpaperFrom(v);
  }
  function wallpaperFrom(v) {
    if (v === 'random' || v === 'pick' || v === 'restore') return task(async () => {
      say(v === 'restore' ? 'Putting it back…' : 'Ooh let me see…', { ms: 60000 });
      const r = await withShow(act('wallpaper.' + v), 'paint', 1000);
      if (r.canceled) return closeBubble();
      await paintShow();
    });
    return paintWallpaper(v);
  }
  function paintWallpaper(style) {
    return task(async () => {
      say('Painting a masterpiece…', { ms: 60000 });
      await sleep(80); // let the bubble show before the heavy drawing
      const dataUrl = await makeWallpaper(style);
      await act('wallpaper.generated', { dataUrl });
      await paintShow();
    });
  }
  async function paintShow() {
    await goFloor();
    const colors = ['#ff3d8b', '#39f5ff', '#ffe14d', '#7cf29e', '#9d7dff'];
    const from = z.x < W / 2 ? 60 : W - 60, to = W - from;
    await walkTo(from, { run: true });
    const trail = setInterval(() => { wipes.push({ x: z.x, t: 0, color: pick(colors) }); emit('paint', z.x, z.y - CHEST * sc(), 2); }, 40);
    await walkTo(to, { anim: 'paint', speed: 700 });
    clearInterval(trail);
    sfx('ok'); play('cheer', 1500);
    emit('sparkle', z.x, z.y - CHEST * sc(), 20);
    await say(pick(['Fresh! 🎨', 'Gorgeous, if I say so myself.', 'Masterpiece. Sign me up for a gallery.']), { ms: 3000 });
  }

  // Draws a wallpaper at your screen's real resolution.
  async function makeWallpaper(style) {
    const dpr = devicePixelRatio || 1;
    const w = Math.round(screen.width * dpr), h = Math.round(screen.height * dpr);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const sk = S.skinOf(settings.skin);
    let seed = Date.now() % 100000;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const zinAt = (anim, frame, x, y, scale, ctx2 = g) => S.draw(ctx2, { anim, frame, skin: settings.skin, hat: settings.hat, x: Math.round(x), y: Math.round(y), scale, flip: false });
    const stars = (n, maxY) => { for (let i = 0; i < n; i++) { g.globalAlpha = 0.3 + rnd() * 0.7; g.fillStyle = '#fff'; const s = rnd() < 0.1 ? 3 : 1.5; g.fillRect(rnd() * w, rnd() * maxY, s * dpr, s * dpr); } g.globalAlpha = 1; };

    if (style === 'synth') {
      const hz = h * 0.62;
      const sky = g.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, '#0d0221'); sky.addColorStop(0.6, '#3b0a5c'); sky.addColorStop(1, '#ff3d8b');
      g.fillStyle = sky; g.fillRect(0, 0, w, hz);
      stars(400, hz * 0.7);
      const r = h * 0.2, cx = w / 2, cy = hz - r * 0.35;
      const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, '#ffe14d'); sun.addColorStop(1, '#ff3d8b');
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = sun; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      for (let i = 0; i < 8; i++) { const yy = cy + r * 0.1 + i * r * 0.13; g.clearRect(cx - r, yy, r * 2, (i + 1) * r * 0.012); }
      g.restore();
      g.fillStyle = '#0b0016'; g.fillRect(0, hz, w, h - hz);
      g.strokeStyle = sk.body; g.lineWidth = 2 * dpr; g.shadowColor = sk.body; g.shadowBlur = 12 * dpr;
      for (let i = 1; i < 22; i++) { const yy = hz + (h - hz) * Math.pow(i / 22, 2.2); g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke(); }
      for (let i = -24; i <= 24; i++) { g.beginPath(); g.moveTo(cx + i * w * 0.012, hz); g.lineTo(cx + i * w * 0.12, h); g.stroke(); }
      g.shadowBlur = 0;
      const zs = Math.max(2, Math.round(h / 240));
      zinAt('sit', 0, w * 0.18, hz - S.ANIMS.sit.footY * zs, zs);
    } else if (style === 'space') {
      const bg = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.7);
      bg.addColorStop(0, '#120a2e'); bg.addColorStop(1, '#03010a');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const x = rnd() * w, y = rnd() * h, rr = (0.2 + rnd() * 0.35) * w;
        const n = g.createRadialGradient(x, y, 0, x, y, rr);
        n.addColorStop(0, pick([sk.body, sk.light, sk.dark]) + '55'); n.addColorStop(1, '#00000000');
        g.fillStyle = n; g.fillRect(0, 0, w, h);
      }
      g.globalCompositeOperation = 'source-over';
      stars(900, h);
      const px = w * 0.78, py = h * 0.3, pr = h * 0.14;
      const pl = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pl.addColorStop(0, sk.light); pl.addColorStop(1, sk.dark);
      g.fillStyle = pl; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = sk.light + 'aa'; g.lineWidth = 6 * dpr; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.35, -0.3, 0, Math.PI * 2); g.stroke();
      const zs = Math.max(2, Math.round(h / 190));
      zinAt('cheer', 2, w * 0.2, h * 0.5, zs);
    } else if (style === 'hills') {
      const k = 4 * dpr, lw = Math.ceil(w / k), lh = Math.ceil(h / k);
      const lo = document.createElement('canvas'); lo.width = lw; lo.height = lh;
      const l = lo.getContext('2d');
      const bands = ['#2a1b5c', '#3b2475', '#55308f', '#7b3fa8', '#b04aa8', '#ef6f8f', '#ffb27a'];
      bands.forEach((col, i) => { l.fillStyle = col; l.fillRect(0, Math.floor(lh * 0.6 * i / bands.length), lw, Math.ceil(lh * 0.6 / bands.length) + 1); });
      l.fillStyle = '#ffe9a8'; l.beginPath(); l.arc(lw * 0.7, lh * 0.45, lh * 0.09, 0, Math.PI * 2); l.fill();
      const layers = [[sk.light, 0.55], [sk.body, 0.66], [sk.dark, 0.78], [sk.outline, 0.9]];
      let top = 0;
      layers.forEach(([col, base], li) => {
        l.fillStyle = col;
        const ph = rnd() * 10, amp = lh * (0.06 - li * 0.008), fr = 0.02 + li * 0.012;
        for (let x = 0; x < lw; x++) {
          const y = Math.round(lh * base + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2.7 + ph) * amp * 0.4);
          l.fillRect(x, y, 1, lh - y);
          if (li === 2 && x === Math.round(lw * 0.25)) top = y;
        }
      });
      zinAt('sit', 1, lw * 0.25 - S.W / 2, top - S.ANIMS.sit.footY + 1, 1, l);
      g.imageSmoothingEnabled = false;
      g.drawImage(lo, 0, 0, lw * k, lh * k);
    } else {
      g.fillStyle = '#05030a'; g.fillRect(0, 0, w, h);
      const zs = Math.max(3, Math.round(h / 110));
      const tmp = document.createElement('canvas'); tmp.width = S.W * zs; tmp.height = S.H * zs;
      const t = tmp.getContext('2d');
      const x = w / 2 - (S.W / 2) * zs, y = h / 2 - (S.H / 2) * zs;
      for (const [col, dx] of [['#ff2fd0', -10], ['#39f5ff', 10]]) {
        t.clearRect(0, 0, tmp.width, tmp.height);
        zinAt('idle', 0, 0, 0, zs, t);
        t.globalCompositeOperation = 'source-in'; t.fillStyle = col; t.fillRect(0, 0, tmp.width, tmp.height); t.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.7; g.drawImage(tmp, x + dx * dpr, y); g.globalAlpha = 1;
      }
      zinAt('idle', 0, x, y, zs);
      for (let i = 0; i < 26; i++) {
        const sy = rnd() * h, sh = (4 + rnd() * 40) * dpr, off = (rnd() - 0.5) * 120 * dpr;
        g.drawImage(c, 0, sy, w, sh, off, sy, w, sh);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let yy = 0; yy < h; yy += 4 * dpr) g.fillRect(0, yy, w, 2 * dpr);
      g.font = `900 ${Math.round(h / 9)}px Consolas, monospace`;
      g.textAlign = 'center';
      g.fillStyle = '#ff2fd0'; g.fillText('ZIN', w / 2 - 6 * dpr, h * 0.88);
      g.fillStyle = '#39f5ff'; g.fillText('ZIN', w / 2 + 6 * dpr, h * 0.88);
      g.fillStyle = '#fff'; g.fillText('ZIN', w / 2, h * 0.88);
    }
    return c.toDataURL('image/png');
  }

  // ---------------------------------------------------------------- PC
  async function pcMenu() {
    const v = await ask('PC stuff! What do you need?', [
      { icon: '📊', label: 'How\'s my PC?', value: 'stats', primary: true },
      { icon: '🌙', label: 'Dark mode', value: 'dark' },
      { icon: '☀️', label: 'Light mode', value: 'light' },
      { icon: '📸', label: 'Screenshot', value: 'shot' },
      { icon: '🚀', label: 'Open an app', value: 'apps' },
      { icon: '🔒', label: 'Lock PC', value: 'lock' },
      back,
    ]);
    if (v === '__back') return mainMenu();
    if (v === 'stats') return pcStats();
    if (v === 'dark' || v === 'light') return setTheme(v);
    if (v === 'shot') return screenshot();
    if (v === 'apps') return appsMenu();
    if (v === 'lock') return task(async () => { await say('Locking! Bye for now 👋', { ms: 1500 }); await play('wave', 1200); await act('system.lock'); });
  }
  function pcStats() {
    return task(async () => {
      say('Checking your vitals…', { ms: 60000 });
      const r = await withShow(act('system.stats'), 'work', 1400);
      let battery = null;
      try { const b = navigator.getBattery && await navigator.getBattery(); if (b && !(b.charging && b.level === 1 && b.chargingTime === 0)) battery = b; } catch {}
      const box = el('div');
      const bar = (label, pct, text) => box.append(el('div', 'b-bar', `<span>${label}</span><div class="track"><div class="fill${pct > 85 ? ' hot' : ''}" style="width:${clamp(pct, 2, 100)}%"></div></div><span class="v">${text}</span>`));
      const mem = Math.round(100 * r.memUsed / r.memTotal);
      bar('CPU', r.cpu, r.cpu + '%');
      bar('RAM', mem, mem + '%');
      let diskPct = 0;
      if (r.disk) { diskPct = Math.round(100 * (1 - r.disk.free / r.disk.total)); bar('DISK', diskPct, fmtBytes(r.disk.free).replace(' ', '') + ' free'); }
      if (battery) bar('BATT', Math.round(battery.level * 100), Math.round(battery.level * 100) + '%');
      const hrs = Math.floor(r.uptime / 3600);
      box.append(el('div', 'b-note', `On for ${hrs >= 24 ? Math.floor(hrs / 24) + ' days ' : ''}${hrs % 24} hours`));
      let msg = 'Looking healthy! 💪';
      const buttons = [];
      if (diskPct > 90) { msg = 'Your disk is almost full! Want me to clean?'; buttons.push({ icon: '🧹', label: 'Clean up', value: 'clean', primary: true }); }
      else if (r.cpu > 85) msg = 'Your PC is sweating! Something is working hard.';
      else if (mem > 85) msg = 'Lots of stuff open. Maybe close a few tabs? 👀';
      if (hrs > 72) buttons.push({ icon: '🔁', label: 'Why restart?', value: 'restart' });
      play(msg.startsWith('Looking') ? 'cheer' : 'think', 1200);
      const v = await ask(msg, buttons, { content: box });
      if (v === 'clean') return cleanScan();
      if (v === 'restart') return say('Restarting now and then clears out memory and finishes updates. Your PC has been on a while!', { ms: 6000 });
    });
  }
  function setTheme(mode) {
    return task(async () => {
      play('paint', 900);
      await act('system.theme', { mode });
      sfx('ok');
      for (let i = 0; i < 20; i++) wipes.push({ x: (W / 20) * i + 20, t: -i * 0.03, color: mode === 'dark' ? '#000000' : '#ffffff' });
      await say(mode === 'dark' ? 'Lights off! 🌙' : 'Rise and shine! ☀️');
    });
  }
  function screenshot() {
    return task(async () => {
      closeBubble();
      await say('Say cheese! 3… 2… 1…', { ms: 1600 });
      await sleep(1700);
      zEl.style.visibility = 'hidden';
      await sleep(120);
      try { await act('system.screenshot'); }
      finally { zEl.style.visibility = ''; }
      sfx('ok');
      emit('sparkle', z.x, z.y - CHEST * sc(), 18);
      await say('Got it! Saved in Pictures › Zin Screenshots.');
    });
  }
  async function appsMenu() {
    const v = await ask('Which one?', [
      { icon: '🧮', label: 'Calculator', value: 'calculator' }, { icon: '📝', label: 'Notepad', value: 'notepad' },
      { icon: '🖌️', label: 'Paint', value: 'paint' }, { icon: '📁', label: 'Explorer', value: 'explorer' },
      { icon: '📈', label: 'Task Manager', value: 'taskmgr' }, { icon: '✂️', label: 'Snip', value: 'snip' },
      { icon: '⚙️', label: 'Settings', value: 'settings' }, back,
    ]);
    if (v === '__back') return pcMenu();
    if (v) return openApp(v);
  }
  function openApp(name) {
    return task(async () => {
      play('wave', 700);
      await act('system.open', { app: name });
      closeBubble();
    });
  }

  // ---------------------------------------------------------------- tools
  const timers = [];
  async function toolsMenu() {
    const v = await ask('Handy stuff:', [
      { icon: '⏱️', label: 'Timer', value: 'timer', primary: true },
      { icon: '🍅', label: 'Focus 25 min', value: 'pomo' },
      { icon: '📝', label: 'Quick note', value: 'note' },
      { icon: '📒', label: 'Open notes', value: 'notes' },
      { icon: '🌐', label: 'Google it', value: 'google' },
      { icon: '▶️', label: 'YouTube', value: 'yt' },
      back,
    ]);
    if (v === '__back') return mainMenu();
    if (v === 'timer') {
      const t = await ask('How long?', [{ label: '1 min', value: '1' }, { label: '5 min', value: '5' }, { label: '10 min', value: '10' }, { label: '30 min', value: '30' }], { input: 'or type minutes, like 15', cols: 3 });
      const m = parseFloat(t);
      if (m > 0) return startTimer(m * 60, 'Timer');
      return;
    }
    if (v === 'pomo') return startTimer(25 * 60, 'Focus time');
    if (v === 'note') { const t = await ask('What should I write down?', [], { input: 'type your note' }); if (t) return addNote(t); return; }
    if (v === 'notes') return task(() => act('notes.open').then(closeBubble));
    if (v === 'google' || v === 'yt') {
      const q = await ask(v === 'yt' ? 'What should I look up on YouTube?' : 'What should I Google?', [], { input: 'search…' });
      if (q) return webSearch(q, v === 'yt' ? 'youtube' : 'google');
    }
  }
  function startTimer(secs, label, opts = {}) {
    const t = { end: Date.now() + secs * 1000, label, reminder: !!opts.reminder };
    timers.push(t);
    sfx('ok'); play('cheer', 900);
    say(opts.text || `${label} set for ${secs >= 60 ? Math.round(secs / 60) + ' min' : secs + ' sec'}. I'll yell when it's done!`, { ms: 3000 });
  }
  setInterval(() => {
    if (!timers.length) { tagEl.classList.add('hidden'); return; }
    timers.sort((a, b) => a.end - b.end);
    const t = timers[0], left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    tagEl.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    tagEl.classList.remove('hidden');
    if (left <= 0) { timers.shift(); timerDone(t); }
  }, 500);
  async function timerDone(t) {
    const msg = t.reminder ? `Hey! Time to ${t.label}` : `${t.label} is done!`;
    try { new Notification('Zin', { body: msg, silent: true }); } catch {}
    for (let i = 0; i < 3; i++) setTimeout(() => sfx('ding'), i * 700);
    await goFloor();
    await walkTo(W / 2, { run: true });
    emit('confetti', z.x, z.y - CHEST * sc(), 30);
    play('cheer', 2500);
    ask(`⏰ ${msg}`, [{ label: 'Thanks!', value: 'ok', primary: true }, { label: '+5 min', value: 'snooze' }]).then(v => { if (v === 'snooze') startTimer(300, t.label, { reminder: t.reminder }); else if (v) closeBubble(); });
  }
  function addNote(text) {
    return task(async () => {
      const r = await withShow(act('notes.add', { text }), 'work', 900);
      sfx('ok');
      const v = await ask('Wrote it down in Documents › Zin Notes.txt ✍️', [{ label: 'Open notes', value: 'open' }]);
      if (v === 'open') { await act('notes.open'); closeBubble(); }
      return r;
    });
  }
  function webSearch(q, site) {
    return task(async () => { play('search', 800); await act('web.search', { q, site }); closeBubble(); });
  }

  // ---------------------------------------------------------------- fun
  const JOKES = [
    'Why did the PC go to the doctor? It had a virus. 🤒',
    'I would tell you a UDP joke, but you might not get it.',
    'Why was the computer cold? It left its Windows open.',
    'My favorite snack? Microchips. 🍟',
    'Why did the file go to therapy? Too many issues with its folder.',
    'What do you call an AI that cleans your PC? Overqualified. 💅',
    'There are 10 kinds of people: those who get binary and those who don\'t.',
    'Why don\'t keyboards sleep? They have two shifts.',
    'I tried to catch fog yesterday. Mist.',
    'Debugging: being the detective in a crime movie where you are also the murderer.',
  ];
  const EIGHT = ['Yes!', 'Absolutely not.', 'Ask again after snacks.', 'The signs point to yes.', 'My antenna says… maybe.', 'Without a doubt.', 'Hmm, nope.', 'Very likely!', 'Don\'t count on it.', 'Focus and ask again.'];
  async function funMenu() {
    const v = await ask('Let\'s have fun! 🎉', [
      { icon: '🕺', label: 'Dance', value: 'dance', primary: true },
      { icon: '🏃', label: 'Chase my mouse', value: 'chase' },
      { icon: '🙈', label: 'Hide & seek', value: 'hide' },
      { icon: '😂', label: 'Tell a joke', value: 'joke' },
      { icon: '🎱', label: 'Magic 8-ball', value: '8ball' },
      { icon: '🪙', label: 'Flip a coin', value: 'coin' },
      { icon: '🎲', label: 'Roll a die', value: 'dice' },
      { icon: '⚡', label: 'Teleport', value: 'tp' },
      back,
    ]);
    if (v === '__back') return mainMenu();
    if (v === 'dance') return dance();
    if (v === 'chase') return chase();
    if (v === 'hide') return hideAndSeek();
    if (v === 'joke') return joke();
    if (v === '8ball') { const q = await ask('Ask me a yes/no question…', [], { input: 'Should I…' }); if (q) return eightBall(); return; }
    if (v === 'coin') return coin();
    if (v === 'dice') return dice();
    if (v === 'tp') return teleportRandom();
  }
  async function dance() { closeBubble(); emit('sparkle', z.x, z.y - CHEST * sc(), 10); await play('dance', 4000); }
  function chase() { closeBubble(); z.chase = { until: now + 12000 }; say('Catch me if… wait, I\'m chasing YOU!', { ms: 2500 }); }
  async function joke() { play('talk', 1200); await say(pick(JOKES), { ms: 6000 }); }
  async function eightBall() { await play('think', 1200); sfx('pop'); play('cheer', 800); await say('🎱 ' + pick(EIGHT), { ms: 3500 }); }
  async function coin() { play('cheer', 1000); await sleep(900); sfx('ok'); await say(Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!'); }
  async function dice(sides = 6) { play('dance', 900); await sleep(900); sfx('ok'); await say('🎲 You rolled a ' + (1 + Math.floor(Math.random() * sides)) + (sides !== 6 ? ` (d${sides})` : '') + '!'); }
  async function teleportRandom() { closeBubble(); await teleportTo(rand(80, W - 80), H); play('cheer', 900); }
  async function hideAndSeek() {
    closeBubble();
    await say('Count to 3! No peeking!', { ms: 1800 });
    await sleep(1600);
    await goFloor();
    const left = Math.random() < 0.5;
    await teleportTo(left ? 30 : W - 30, H);
    z.hiding = true;
    z.facing = left ? 1 : -1;
    z.x = left ? -6 * sc() : W + 6 * sc(); // mostly off-screen, just peeking
    setTimeout(() => { if (z.hiding) say('…you\'re not even looking, are you 😤', { ms: 3000 }); }, 25000);
  }
  async function foundMe() {
    z.x = clamp(z.x, 40, W - 40);
    sfx('ok'); emit('confetti', z.x, z.y - CHEST * sc(), 24);
    play('cheer', 1500);
    await say(pick(['You found me!! 🎉', 'Nooo, my perfect spot!', 'How?! I was invisible!']));
  }
  async function pet() {
    interaction();
    z.asleep = false;
    sfx('pop');
    emit('heart', z.x - 10, z.y - HEAD * sc(), 5);
    await play('love', 1800);
  }
  async function wake() {
    z.asleep = false;
    sfx('boing');
    await play('angry', 600);
    await say(pick(['Huh?! I\'m up! I\'m up!', 'Five more minutes…', 'Was I snoring?']), { ms: 2200 });
  }

  // ---------------------------------------------------------------- look
  async function lookMenu() {
    const skins = Object.entries(S.SKINS).map(([k, v]) => ({ label: v.name, value: 'skin:' + k, on: settings.skin === k }));
    const hats = S.HATS.map(h => ({ label: h === 'none' ? 'No extras' : h[0].toUpperCase() + h.slice(1), value: 'hat:' + h, on: settings.hat === h }));
    const v = await ask('How do I look? Pick a color or an accessory:', [...skins, ...hats,
      { label: 'Smaller', value: 'size:-' }, { label: 'Bigger', value: 'size:+' },
      { icon: '😴', label: 'Nap time', value: 'nap' }, { icon: '👻', label: 'Hide me', value: 'hide' }, back,
    ], { cols: 3, wide: true });
    if (!v || v === '__back') return v && mainMenu();
    if (v === 'nap') { closeBubble(); z.asleep = true; return; }
    if (v === 'hide') { closeBubble(); return api.hide(); }
    const [k, val] = v.split(':');
    if (k === 'skin' || k === 'hat') { settings = await api.setSettings({ [k]: val }); applyTheme(); sfx('glitch'); zEl.classList.add('glitch'); setTimeout(() => zEl.classList.remove('glitch'), 300); }
    if (k === 'size') { const sizes = [2, 3, 4, 5]; const i = clamp(sizes.indexOf(sc()) + (val === '+' ? 1 : -1), 0, 3); settings = await api.setSettings({ size: sizes[i] }); }
    lastKey = '';
    return lookMenu();
  }

  // ================================================================ typed requests
  // Zin's brain (brain/brain.js) works out what you mean, offline and free;
  // this part asks for anything missing, checks before risky things, then does it.
  const B = window.ZinBrain;
  let lastStep = null;
  const sayStep = (step, opts) => { const t = B.replyFor(step); return t ? say(t, opts) : Promise.resolve(); };
  const seconds = (s) => s >= 3600 ? `${+(s / 3600).toFixed(1)} hr` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`;
  // seconds from now until a clock time like { h: 17, m: 30, day: 0 }
  function secondsUntil(at) {
    const now2 = new Date();
    const at1 = (h) => { const d = new Date(now2); d.setHours(h, at.m || 0, 0, 0); d.setDate(d.getDate() + (at.day || 0)); if (d <= now2) d.setDate(d.getDate() + 1); return d; };
    let when = at1(at.h);
    if (at.vague && at.h < 12) { const pm = at1(at.h + 12); if (pm < when) when = pm; } // "at 5" means whichever 5 comes first
    return Math.round((when - now2) / 1000);
  }
  async function confirmStep(step, yes) {
    play('think', 1200);
    const v = await ask(B.replyFor(step), [{ label: yes, value: 'go', primary: true }, { label: 'No', value: 'no', ghost: true }]);
    if (v === 'no') say('Okay, I won\'t.', { ms: 1800 });
    return v === 'go';
  }

  async function command(text) {
    interaction();
    const r = B.understand(text, { last: lastStep });
    if (r.unknown || !r.steps.length) {
      play('think', 1500);
      const v = await ask(r.reply, [...(r.suggestions || []).map(s => ({ label: s, value: 'try:' + s })), { icon: '📋', label: 'Show menu', value: 'menu', ghost: true }], { cols: 1, input: 'or try saying it another way' });
      if (v === 'menu') return mainMenu();
      if (v) return command(v.startsWith('try:') ? v.slice(4) : v);
      return;
    }
    for (let step of r.steps) {
      if (!step.ready) { play('shrug', 1500); await say(B.replyFor(step), { ms: 3500 }); continue; }
      // ask for details she still needs ("Which folder?")
      for (let tries = 0; step.missing.length && tries < 3; tries++) {
        const reply = await ask(B.replyFor(step), [], { input: 'type here…' });
        if (!reply) return;
        step = B.answer(step, reply).steps[0];
      }
      if (step.missing.length) return say('Sorry, I didn\'t catch that. Let\'s try again later!');
      if (step.intent !== 'cancel' && !step.intent.startsWith('chat.')) lastStep = { intent: step.intent, slots: step.slots };
      await doStep(step);
    }
  }

  async function doStep(step) {
    const s = step.slots;
    switch (step.intent) {
      // ---- files
      case 'files.find': return findFiles(s.query);
      case 'files.recent': return recentFiles();
      case 'files.big': return bigFiles();
      case 'files.old': return oldFiles(s.folder && s.folder !== 'pick' ? s.folder : null);
      case 'folder.open': return task(async () => {
        play('folder', 600);
        const w = await act('files.openFolder', { folder: s.folder });
        closeBubble();
        if (w.window) await showWindow(w.window, s.folder + '!');
      });
      case 'organize': return organize(s.folder || 'downloads', s.mode);
      case 'organize.undo': return undoOrganize();
      case 'clean.junk': return cleanScan();

      // ---- apps and the web
      case 'app.open': return task(async () => {
        play('wave', 700);
        for (const name of s.apps) {
          const w = await act('apps.open', { name });
          if (!w.notFound) continue;
          sfx('err'); play('shrug', 1500);
          const v = await ask(`I couldn't find an app called "${name}" on your PC.${w.suggestions.length ? ' Did you mean:' : ''}`,
            [...w.suggestions.map(n => ({ icon: '🚀', label: n, value: n })), { icon: '🔍', label: `Search the web for ${name}`, value: '__web' }], { cols: 1 });
          if (v === '__web') await act('web.search', { q: name, site: 'google' });
          else if (v) await act('apps.open', { name: v });
        }
        await sayStep(step, { ms: 2000 });
      });
      case 'app.close': return task(async () => {
        if (!await confirmStep(step, 'Close it')) return;
        for (const name of s.apps) {
          const w = await act('apps.close', { name });
          if (w.notRunning) await say(`${name} isn't open right now.`);
          else { sfx('ok'); await say(`Closed ${w.closed.join(', ')}. 👋`); }
        }
      });
      case 'web.open': return task(async () => {
        play('wave', 700);
        for (const site of s.sites) await act('web.open', { url: site.url });
        await sayStep(step, { ms: 2000 });
      });
      case 'web.search': return webSearch(s.query, s.engine);

      // ---- music and sound
      case 'music.play': return task(async () => {
        play('dance', 2500);
        say(B.replyFor(step), { ms: 3500 });
        const w = await act('music.play', { query: s.song, kind: s.kind });
        if (w.opened === 'web') say('I opened Spotify in your browser, since the app isn\'t installed. 🎧', { ms: 4000 });
        else if (s.song) say(`Found ${s.song} on Spotify. Hit play on the top result! 🎧`, { ms: 4000 });
      });
      case 'media.control': return task(async () => { await act('media.key', { cmd: s.cmd }); await sayStep(step, { ms: 1500 }); });
      case 'volume': return task(async () => { play('cheer', 800); await act('volume', s); await sayStep(step, { ms: 1500 }); });

      // ---- the PC
      case 'pc.stats': return pcStats();
      case 'theme': return setTheme(s.mode);
      case 'wallpaper': return s.style ? wallpaperFrom(s.style) : wallpaperMenu();
      case 'screenshot': return screenshot();
      case 'pc.lock': return task(async () => { await say('Bye for now 👋', { ms: 1200 }); await act('system.lock'); });
      case 'power': return task(async () => {
        if (s.kind === 'cancel') { await act('power', { kind: 'cancel' }); return sayStep(step); }
        const delay = s.delay || (s.at ? secondsUntil(s.at) : 0);
        if (!await confirmStep(step, { shutdown: 'Shut down', restart: 'Restart', sleep: 'Sleep' }[s.kind])) return;
        await act('power', { kind: s.kind, delay });
        await say(delay ? `Okay! ${s.kind === 'sleep' ? 'Sleeping' : s.kind === 'restart' ? 'Restarting' : 'Shutting down'} in ${seconds(delay)}. Say "cancel the shutdown" to stop it.` : 'Here we go! 👋', { ms: 4000 });
      });

      // ---- time and notes
      case 'timer': return startTimer(s.seconds, s.label === 'Timer' ? 'Timer' : s.label, { text: B.replyFor(step) });
      case 'reminder': {
        const secs = s.when.in || secondsUntil(s.when.at);
        return startTimer(secs, s.text, { reminder: true, text: B.replyFor(step) });
      }
      case 'note.add': return addNote(s.text);
      case 'notes.open': return task(() => act('notes.open').then(closeBubble));

      // ---- fun and chat
      case 'fun.dance': return dance();
      case 'fun.joke': return joke();
      case 'fun.coin': return coin();
      case 'fun.dice': return dice(s.sides);
      case 'fun.8ball': return eightBall();
      case 'fun.teleport': return teleportTo(clamp(mouse.x, 40, W - 40), H);
      case 'fun.sleep': closeBubble(); z.asleep = true; return;
      case 'chat.hello': play('wave', 1500); return sayStep(step);
      case 'chat.thanks': pet(); return sayStep(step);
      case 'chat.how': play('cheer', 1200); return sayStep(step);
      case 'help': return sayStep(step, { ms: 12000 });
      case 'cancel': return sayStep(step, { ms: 1500 });
      default: return sayStep(step);
    }
  }

  // ================================================================ idle brain
  function brain() {
    if (busy || z.mode !== 'stand' || z.walk || z.hold || z.chase || z.hiding || drag || press) return;
    if (!bubble.classList.contains('hidden')) { lastInteraction = now; return; }
    if (!z.asleep && now - lastInteraction > 180000) { z.asleep = true; z.sitting = false; return; }
    if (z.asleep || now < nextThink) return;
    nextThink = now + rand(5000, 14000);
    if (!settings.wander) return;
    const ws = windowSurface();
    const r = Math.random();
    if (ws && !z.perch && r < 0.3) { hopOnto(ws); return; }
    if (z.perch && r < 0.1) { goFloor(); return; }
    if (r < 0.6) { const s = surface(); walkTo(rand(s.x1, s.x2)); return; }
    if (r < 0.8) { z.sitting = true; return; }
    if (r < 0.88) { play('wave', 1400); return; }
    if (r < 0.95) { play('think', 2200); return; }
    play('dance', 2400);
  }
  async function hopOnto(ws) {
    const tx = clamp(z.x, ws.x1 + 30, ws.x2 - 30);
    await walkTo(tx);
    const now2 = windowSurface();
    if (now2 && now2.id === ws.id && z.mode === 'stand') { await jumpTo(clamp(z.x, now2.x1 + 20, now2.x2 - 20), now2.y, now2.id); z.sitting = Math.random() < 0.6; }
  }

  // ================================================================ intro & commands from the tray
  async function intro() {
    busy++;
    try {
      stopMoving();
      z.x = W - 140; z.y = H; z.mode = 'stand'; z.perch = null; z.facing = -1;
      await teleportTo(z.x, H);
      hiEl.classList.remove('hidden');
      sfx('pop');
      await play('wave', 1600);
      hiEl.classList.add('hidden');
      const v = await ask('I\'m Zin! I live on your screen now. 💙\nClick me for a menu, drag me around, or hit Ctrl+Alt+Space anytime.', [
        { label: 'Show me around', value: 'tour', primary: true }, { label: 'Got it', value: 'ok' },
      ]);
      settings = await api.setSettings({ introDone: true });
      if (v === 'tour') {
        busyChip(false);
        say('My settings live down in your tray, by the clock.', { ms: 4200 });
        await walkTo(W - 120);
        await pointAt(W - 150, H - 4, 'MY ICON', 3800);
        say('Grab me and throw me! I can sit on your windows too.', { ms: 4000 });
        await play('cheer', 2000);
        await say('Try typing "find" + a file name in my menu. Have fun!', { ms: 4000 });
      } else if (v) closeBubble();
    } finally { busy--; }
  }
  api.onSettings((s) => { settings = s; applyTheme(); lastKey = ''; });
  api.onCommand((cmd) => {
    if (cmd === 'menu') mainMenu();
    if (cmd === 'intro') intro();
    if (cmd === 'teleport') teleportTo(clamp(mouse.x, 40, W - 40), mouse.y);
    if (cmd === 'teleport-in') teleportTo(z.x, z.y);
  });

  requestAnimationFrame(tick);
  if (!settings.introDone) setTimeout(intro, 600);
  else teleportTo(z.x, H);

  // handy for the demo page / dev tools
  window.zinDebug = { z, mainMenu, command, say, play, makeWallpaper, intro };
})();
