// Sprite lab for the chibi Zinx: animated preview on a grid floor, the pixel
// dissolve teleport, and a sheet of every frame.
(function () {
  const Z = window.ZinxChibi;
  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d');
  const box = document.getElementById('stage-box');
  let pal = 'red';
  let anim = 'idle', frame = 0, ft = 0;
  let showBase = true;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- layout
  let W = 0, H = 0, dpr = 1, horizon = 0;
  const floorBuf = document.createElement('canvas');
  const her = { x: 0, y: 0 };
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = box.clientWidth;
    H = Math.round(Math.max(380, Math.min(560, window.innerHeight * 0.6)));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    horizon = H * 0.34;
    if (!her.x) { her.x = W / 2; her.y = H * 0.93; }
    her.x = Math.min(W - 40, her.x); her.y = Math.min(H * 0.96, her.y);
    drawFloor();
  }
  // whole-number pixel scale, bigger closer to the front
  const scaleAt = (y) => {
    const front = Math.max(1, Math.min(4, Math.floor(Math.min(H * 0.56, W * 0.5) / Z.H)));
    const d = Math.max(0, Math.min(1, (y - horizon) / (H - horizon)));
    return Math.max(1, Math.round(front * (0.55 + 0.45 * d)));
  };
  const glowOf = () => Z.PALETTES[pal].hair[1];

  function drawFloor() {
    floorBuf.width = cv.width; floorBuf.height = cv.height;
    const g = floorBuf.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#05030a'); gr.addColorStop(0.34, '#140912'); gr.addColorStop(0.36, '#070308'); gr.addColorStop(1, '#020103');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const glow = glowOf();
    gr = g.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, W * 0.6);
    gr.addColorStop(0, glow + '30'); gr.addColorStop(1, glow + '00');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = glow + 'aa'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, horizon); g.lineTo(W, horizon); g.stroke();
    g.strokeStyle = glow + '2a';
    for (let i = 1; i < 16; i++) { const y = horizon + (H - horizon) * Math.pow(i / 16, 1.9); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -20; i <= 20; i++) { g.beginPath(); g.moveTo(W / 2 + i * W * 0.03, horizon); g.lineTo(W / 2 + i * W * 0.22, H); g.stroke(); }
  }

  // ---------------------------------------------------------------- her canvas
  const oc = document.createElement('canvas');
  const og = oc.getContext('2d', { willReadFrequently: true });
  oc.width = Z.W; oc.height = Z.H; // one canvas pixel = one sprite pixel
  const noise = new Float32Array(Z.W * Z.H).map((_, i) => 0.55 * Math.random() + 0.45 * (Math.floor(i / Z.W) / Z.H));
  function renderHer() {
    og.clearRect(0, 0, Z.W, Z.H);
    Z.draw(og, { anim, frame, pal, x: 0, y: 0, scale: 1 });
  }

  // ---------------------------------------------------------------- teleport (pixel dissolve)
  const parts = [], rings = [];
  let tele = null;
  const OUT = 0.8, TRAVEL = 0.4, IN = 0.85;
  function teleportTo(x, y) {
    if (tele) return;
    y = Math.max(horizon + 30, Math.min(H * 0.96, y));
    const s = scaleAt(y);
    x = Math.max(Z.W * s * 0.4, Math.min(W - Z.W * s * 0.4, x));
    tele = { phase: 'out', T: 0, prevT: 0, t: 0, from: { x: her.x, y: her.y }, to: { x, y } };
    rings.push({ x: her.x, y: her.y, age: 0, size: Z.H * scaleAt(her.y) });
    sfx('out');
  }
  function hexRGB(h) { const n = parseInt(h.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  // hides pixels below the threshold, lights up the edge, and throws off particles
  function dissolve(T, Tprev, building, ox, oy, s) {
    const img = og.getImageData(0, 0, Z.W, Z.H), d = img.data;
    const [r, g, b] = hexRGB(Z.PALETTES[pal].line);
    const glow = glowOf();
    for (let i = 0; i < noise.length; i++) {
      const p = i * 4;
      if (d[p + 3] === 0) continue;
      const v = noise[i], px = ox + (i % Z.W) * s, py = oy + Math.floor(i / Z.W) * s;
      if (!building && v >= Tprev && v < T) {
        parts.push({ mode: 'drift', x: px, y: py, vx: (Math.random() - 0.5) * 90, vy: -50 - Math.random() * 150, age: 0, life: 0.6 + Math.random() * 0.7, size: s, color: Math.random() < 0.5 ? glow : Z.PALETTES[pal].line, seed: Math.random() * 9 });
      }
      if (building && v >= T && v < T + (Tprev - T) + 0.001) {
        const from = tele.from, a = Math.atan2(from.y - py, from.x - px) + (Math.random() - 0.5) * 1.4, dist = 50 + Math.random() * 120;
        parts.push({ mode: 'home', sx: px + Math.cos(a) * dist, sy: py + Math.sin(a) * dist, tx: px, ty: py, x: px, y: py, age: 0, life: 0.22 + Math.random() * 0.2, size: s, color: glow });
      }
      if (v < T) d[p + 3] = 0;
      else if (v < T + 0.06) { d[p] = r; d[p + 1] = g; d[p + 2] = b; }
    }
    og.putImageData(img, 0, 0);
  }
  function updateTele(dt) {
    if (!tele) return;
    tele.t += dt;
    if (tele.phase === 'out') {
      tele.T = Math.min(1, tele.t / OUT);
      if (tele.t >= OUT) { tele.phase = 'travel'; tele.t = 0; }
    } else if (tele.phase === 'travel') {
      const f = tele.from, to = tele.to, s = scaleAt(to.y);
      const fy = f.y - Z.H * scaleAt(f.y) * 0.5, ty = to.y - Z.H * s * 0.5;
      for (let i = 0; i < 22; i++) {
        const u = Math.min(1, tele.t / TRAVEL + Math.random() * 0.12);
        const cx = (f.x + to.x) / 2, cy = Math.min(fy, ty) - 70 - Math.abs(f.x - to.x) * 0.15;
        const x = (1 - u) * (1 - u) * f.x + 2 * (1 - u) * u * cx + u * u * to.x;
        const y = (1 - u) * (1 - u) * fy + 2 * (1 - u) * u * cy + u * u * ty;
        parts.push({ mode: 'drift', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 24, vx: 0, vy: 0, age: 0, life: 0.2 + Math.random() * 0.2, size: s, color: glowOf(), seed: 0 });
      }
      if (tele.t >= TRAVEL) { tele.phase = 'in'; tele.t = 0; tele.T = 1; tele.prevT = 1; her.x = to.x; her.y = to.y; sfx('in'); }
    } else {
      tele.prevT = tele.T;
      tele.T = Math.max(0, 1 - tele.t / IN);
      if (tele.t >= IN) { rings.push({ x: her.x, y: her.y, age: 0, size: Z.H * scaleAt(her.y) }); tele = null; }
    }
  }

  // ---------------------------------------------------------------- sound
  let ac = null;
  function sfx(kind) {
    try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume(); } catch { return; }
    const t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square';
    const steps = kind === 'out' ? [880, 660, 520, 390, 300] : [300, 420, 560, 760, 1040];
    steps.forEach((f, i) => o.frequency.setValueAtTime(f, t0 + i * 0.09));
    g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.6);
  }

  // ---------------------------------------------------------------- frame
  let last = performance.now(), time = 0, glitchUntil = 0, nextGlitch = 5;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;
    const a = Z.ANIMS[anim];
    ft += dt;
    if (ft >= 1 / a.fps) { ft = 0; frame = a.loop ? frame + 1 : Math.min(frame + 1, a.frames - 1); }
    updateTele(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(floorBuf, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const s = scaleAt(her.y);
    const glow = glowOf();
    const visible = !tele ? 1 : tele.phase === 'travel' ? 0 : 1 - tele.T;
    if (showBase) {
      const rx = Z.W * s * 0.32, ry = rx * 0.24;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * visible;
      const gr = ctx.createRadialGradient(her.x, her.y, 0, her.x, her.y, rx);
      gr.addColorStop(0, glow + '99'); gr.addColorStop(0.55, glow + '2a'); gr.addColorStop(1, glow + '00');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(her.x, her.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = glow; ctx.lineWidth = 1.2; ctx.shadowColor = glow; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(her.x, her.y, rx * 0.78, ry * 0.78, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (!tele || tele.phase !== 'travel') {
      renderHer();
      const foot = Z.ANIMS[anim].footY;
      const ox = Math.round(her.x - (Z.W / 2) * s), oy = Math.round(her.y - (foot + 0.5) * s);
      if (tele) dissolve(tele.T, tele.prevT, tele.phase === 'in', ox, oy, s);
      if (tele && tele.phase === 'out') tele.prevT = tele.T;
      if (!reduceMotion) { nextGlitch -= dt; if (nextGlitch <= 0) { glitchUntil = time + 0.08; nextGlitch = 4 + Math.random() * 5; } }
      ctx.save();
      ctx.shadowColor = glow; ctx.shadowBlur = 10 * dpr;
      ctx.globalAlpha = time < glitchUntil ? 0.6 : 1;
      const dx = time < glitchUntil ? Math.round((Math.random() - 0.5) * 3) * s : 0;
      ctx.drawImage(oc, ox + dx, oy, Z.W * s, Z.H * s);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      const u = p.age / p.life;
      if (p.mode === 'home') { const e = u * u * u; p.x = p.sx + (p.tx - p.sx) * e; p.y = p.sy + (p.ty - p.sy) * e; ctx.globalAlpha = 0.4 + 0.6 * u; }
      else { p.vy -= 30 * dt; p.x += (p.vx + Math.sin(time * 6 + p.seed) * 20) * dt; p.y += p.vy * dt; ctx.globalAlpha = 1 - u; }
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age > 0.7) { rings.splice(i, 1); continue; }
      const k = r.age / 0.7, rx = r.size * (0.2 + k * 0.6);
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = glow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- every-frame sheet
  function drawSheet() {
    const sc = document.getElementById('sheet');
    const names = Object.keys(Z.ANIMS);
    const cols = 8, s = 1, cw = Z.W * s, chh = Z.H * s, lab = 14;
    sc.width = cols * cw; sc.height = names.length * (chh + lab);
    const g = sc.getContext('2d');
    g.fillStyle = '#07040a'; g.fillRect(0, 0, sc.width, sc.height);
    names.forEach((n, r) => {
      g.fillStyle = '#9a8a96'; g.font = '11px "Share Tech Mono", monospace';
      g.fillText(n.toUpperCase(), 4, r * (chh + lab) + 11);
      for (let f = 0; f < Math.min(cols, Z.ANIMS[n].frames); f++) {
        g.fillStyle = (f + r) % 2 ? '#0e0910' : '#120b14';
        g.fillRect(f * cw, r * (chh + lab) + lab, cw, chh);
        Z.draw(g, { anim: n, frame: f, pal, x: f * cw, y: r * (chh + lab) + lab, scale: s });
      }
    });
  }

  // ---------------------------------------------------------------- controls
  const LABELS = { idle: 'Idle', back: 'Back view', wave: 'Wave', talk: 'Talk', point: 'Point', think: 'Think', cheer: 'Cheer', sit: 'Sit', sleep: 'Sleep', cry: 'Cry', sad: 'Sad', dance: 'Dance', dangle: 'Picked up', fall: 'Fall', land: 'Land', work: 'Working', love: 'Love', angry: 'Angry', dizzy: 'Dizzy' };
  const animRow = document.getElementById('anims');
  Object.keys(Z.ANIMS).forEach((k) => {
    const b = document.createElement('button');
    b.textContent = LABELS[k] || k; b.setAttribute('aria-pressed', k === anim);
    b.addEventListener('click', () => { anim = k; frame = 0; ft = 0; animRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    animRow.append(b);
  });
  const colorRow = document.getElementById('glows');
  Object.entries(Z.PALETTES).forEach(([k, v]) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.setProperty('--c', v.hair[1]); b.title = v.name; b.setAttribute('aria-label', v.name);
    b.setAttribute('aria-pressed', k === pal);
    b.addEventListener('click', () => {
      pal = k; document.documentElement.style.setProperty('--glow', v.hair[1]);
      colorRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      drawFloor(); drawSheet();
    });
    colorRow.append(b);
  });
  document.getElementById('base').addEventListener('click', (e) => { showBase = !showBase; e.currentTarget.setAttribute('aria-pressed', showBase); });
  document.getElementById('tp').addEventListener('click', () => {
    let x, y, n = 0;
    do { x = W * (0.12 + Math.random() * 0.76); y = horizon + 40 + Math.random() * (H * 0.96 - horizon - 40); n++; } while (Math.abs(x - her.x) < W * 0.2 && n < 10);
    teleportTo(x, y);
  });
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), y = e.clientY - r.top;
    if (y > horizon + 10) teleportTo(e.clientX - r.left, y);
  });

  document.documentElement.style.setProperty('--glow', Z.PALETTES[pal].hair[1]);
  addEventListener('resize', layout);
  layout();
  drawSheet();
  requestAnimationFrame(tick);
  window.zinxLab = { teleportTo, her, play: (k) => { anim = k; frame = 0; } };
})();
