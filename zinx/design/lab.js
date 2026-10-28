// Sprite lab stage: grid floor, Zinx with hologram effects, and the
// digital-dissolve teleport (she breaks into light and rebuilds elsewhere).
(function () {
  const Z = window.ZinxHolo;
  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d');
  const box = document.getElementById('stage-box');
  const poser = new Z.Poser();
  let glow = Z.GLOWS.white;
  let showBase = true;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- layout
  let W = 0, H = 0, dpr = 1, horizon = 0;
  const floorBuf = document.createElement('canvas');
  const her = { x: 0, y: 0 };
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = box.clientWidth;
    H = Math.round(Math.max(420, Math.min(640, window.innerHeight * 0.66)));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    horizon = H * 0.34;
    if (!her.x) { her.x = W / 2; her.y = H * 0.94; }
    her.x = Math.min(W - 40, her.x); her.y = Math.min(H * 0.97, her.y);
    drawFloor();
  }
  const depth = (y) => 0.5 + 0.5 * Math.max(0, Math.min(1, (y - horizon) / (H - horizon)));
  const heightAt = (y) => Math.min(H * 0.8, W * 1.25) * depth(y);

  function drawFloor() {
    floorBuf.width = cv.width; floorBuf.height = cv.height;
    const g = floorBuf.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#02040a'); gr.addColorStop(0.34, '#081120'); gr.addColorStop(0.36, '#03060c'); gr.addColorStop(1, '#010205');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // horizon glow
    gr = g.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, W * 0.6);
    gr.addColorStop(0, 'rgba(150,230,255,0.18)'); gr.addColorStop(1, 'rgba(150,230,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(200,245,255,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, horizon); g.lineTo(W, horizon); g.stroke();
    // perspective grid
    g.strokeStyle = 'rgba(160,225,255,0.16)';
    for (let i = 1; i < 18; i++) {
      const y = horizon + (H - horizon) * Math.pow(i / 18, 1.9);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    for (let i = -20; i <= 20; i++) {
      g.beginPath(); g.moveTo(W / 2 + i * W * 0.03, horizon); g.lineTo(W / 2 + i * W * 0.22, H); g.stroke();
    }
  }

  // ---------------------------------------------------------------- her canvas
  // Zinx is drawn to her own canvas first, so the hologram effects and the
  // dissolve can work on her pixels.
  const oc = document.createElement('canvas');
  const og = oc.getContext('2d', { willReadFrequently: true });
  const UX0 = 215, UY0 = 95, UW = 430, UH = 515; // drawing-unit bounds around her
  let noise = null, noiseKey = '';
  function sizeHer(ch) {
    const s = (ch / Z.GROUND) * dpr;
    const w = Math.ceil(UW * s), h = Math.ceil(UH * s);
    if (oc.width !== w || oc.height !== h) { oc.width = w; oc.height = h; }
    return s;
  }
  function makeNoise() {
    const key = oc.width + 'x' + oc.height;
    if (key === noiseKey) return;
    noiseKey = key;
    noise = new Float32Array(oc.width * oc.height);
    const cell = Math.max(2, Math.round(2.5 * dpr));
    const cols = Math.ceil(oc.width / cell);
    const rnd = new Float32Array(cols * Math.ceil(oc.height / cell)).map(() => Math.random());
    for (let y = 0; y < oc.height; y++) {
      for (let x = 0; x < oc.width; x++) {
        noise[y * oc.width + x] = 0.5 * rnd[Math.floor(y / cell) * cols + Math.floor(x / cell)] + 0.5 * (y / oc.height);
      }
    }
  }
  function renderHer(P, ch, t) {
    const s = sizeHer(ch);
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.globalCompositeOperation = 'source-over';
    og.clearRect(0, 0, oc.width, oc.height);
    Z.draw(og, P, { x: UX0 * s, groundY: (UY0 + Z.GROUND) * s, height: ch * dpr, glow, dpr: 1 });
    // hologram scanlines + a slow bright band
    og.globalCompositeOperation = 'source-atop';
    og.fillStyle = 'rgba(190,240,255,0.06)';
    const step = Math.max(2, Math.round(3 * dpr));
    for (let y = 0; y < oc.height; y += step) og.fillRect(0, y, oc.width, Math.max(1, dpr * 0.8));
    const by = (((t * 0.22) % 1.4) - 0.2) * oc.height;
    const bg = og.createLinearGradient(0, by - 40 * dpr, 0, by + 40 * dpr);
    bg.addColorStop(0, 'rgba(220,250,255,0)'); bg.addColorStop(0.5, 'rgba(220,250,255,0.14)'); bg.addColorStop(1, 'rgba(220,250,255,0)');
    og.fillStyle = bg; og.fillRect(0, by - 40 * dpr, oc.width, 80 * dpr);
    og.globalCompositeOperation = 'source-over';
    return s;
  }

  // ---------------------------------------------------------------- particles
  const parts = [];
  const rings = [];
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

  // ---------------------------------------------------------------- teleport
  let tele = null; // { phase, T, from, to, t }
  const OUT = 0.85, TRAVEL = 0.45, IN = 0.95;
  function teleportTo(x, y) {
    if (tele) return;
    y = Math.max(horizon + 30, Math.min(H * 0.97, y));
    const ch = heightAt(y);
    x = Math.max(ch * 0.22, Math.min(W - ch * 0.22, x));
    tele = { phase: 'out', T: 0, t: 0, from: { x: her.x, y: her.y }, to: { x, y } };
    rings.push({ x: her.x, y: her.y, age: 0, size: heightAt(her.y) });
    poser.play(poser.anim === 'idle' ? 'idle' : poser.anim);
    sfx('out');
  }

  // Applies the dissolve to her pixels and spawns particles where she breaks up.
  function dissolve(T, Tprev, building, ox, oy) {
    makeNoise();
    const img = og.getImageData(0, 0, oc.width, oc.height);
    const d = img.data, n = noise, edge = 0.05;
    const [gr, gg, gb] = hexRGB(glow);
    for (let i = 0, p = 0; i < n.length; i++, p += 4) {
      if (d[p + 3] === 0) continue;
      const v = n[i];
      if (v < T) d[p + 3] = 0;
      else if (v < T + edge) { d[p] = gr; d[p + 1] = gg; d[p + 2] = gb; d[p + 3] = 255; }
    }
    // particles: sample pixels near the moving edge
    const samples = 1400;
    for (let k = 0; k < samples; k++) {
      const i = (Math.random() * n.length) | 0;
      const p = i * 4;
      const src = d[p + 3];
      const v = n[i];
      const x = ox + (i % oc.width) / dpr, y = oy + Math.floor(i / oc.width) / dpr;
      if (!building && v >= Tprev && v < T && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        parts.push({ mode: 'drift', x, y, vx: Math.cos(a) * 40 + (Math.random() - 0.5) * 50, vy: -60 - Math.random() * 160, age: 0, life: 0.7 + Math.random() * 0.8, size: 1 + Math.random() * 2.2, seed: Math.random() * 10 });
      } else if (building && src > 0 && v >= T && v < T + 0.08 && Math.random() < 0.35) {
        const from = tele.from, dx = from.x - x, dy = (from.y - heightAt(from.y) * 0.5) - y;
        const dist = 60 + Math.random() * 140, a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
        parts.push({ mode: 'home', sx: x + Math.cos(a) * dist, sy: y + Math.sin(a) * dist, tx: x, ty: y, x, y, age: 0, life: 0.25 + Math.random() * 0.3, size: 1 + Math.random() * 2 });
      }
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
      // a stream of light flies to the new spot
      const f = tele.from, to = tele.to;
      const fy = f.y - heightAt(f.y) * 0.5, ty = to.y - heightAt(to.y) * 0.5;
      for (let i = 0; i < 26; i++) {
        const u = Math.min(1, tele.t / TRAVEL + Math.random() * 0.15);
        const cx = (f.x + to.x) / 2, cy = Math.min(fy, ty) - 80 - Math.abs(f.x - to.x) * 0.15;
        const x = (1 - u) * (1 - u) * f.x + 2 * (1 - u) * u * cx + u * u * to.x;
        const y = (1 - u) * (1 - u) * fy + 2 * (1 - u) * u * cy + u * u * ty;
        parts.push({ mode: 'drift', x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, age: 0, life: 0.25 + Math.random() * 0.25, size: 1 + Math.random() * 2, seed: 0 });
      }
      if (tele.t >= TRAVEL) {
        tele.phase = 'in'; tele.t = 0;
        her.x = tele.to.x; her.y = tele.to.y;
        sfx('in');
      }
    } else if (tele.phase === 'in') {
      tele.T = Math.max(0, 1 - tele.t / IN);
      if (tele.t >= IN) { rings.push({ x: her.x, y: her.y, age: 0, size: heightAt(her.y) }); tele = null; }
    }
  }

  // ---------------------------------------------------------------- sound
  let ac = null;
  function sfx(kind) {
    try { ac = ac || new AudioContext(); if (ac.state === 'suspended') ac.resume(); } catch { return; }
    const t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth';
    if (kind === 'out') { o.frequency.setValueAtTime(320, t0); o.frequency.exponentialRampToValueAtTime(1800, t0 + 0.8); }
    else { o.frequency.setValueAtTime(1600, t0); o.frequency.exponentialRampToValueAtTime(260, t0 + 0.9); }
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.95);
  }

  // ---------------------------------------------------------------- frame
  let last = performance.now(), time = 0, glitchUntil = 0, nextGlitch = 4;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;
    const P = poser.update(dt);
    updateTele(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(floorBuf, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ch = heightAt(her.y);
    const visible = !tele ? 1 : tele.phase === 'out' ? 1 - tele.T : tele.phase === 'in' ? 1 - tele.T : 0;

    // projector base under her feet
    if (showBase) {
      const rx = ch * 0.17, ry = rx * 0.24;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.75 * visible;
      let gr = ctx.createRadialGradient(her.x, her.y, 0, her.x, her.y, rx);
      gr.addColorStop(0, glow + 'aa'); gr.addColorStop(0.5, glow + '33'); gr.addColorStop(1, glow + '00');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(her.x, her.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = glow; ctx.lineWidth = 1.2; ctx.shadowColor = glow; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(her.x, her.y, rx * 0.8, ry * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= 0.5;
      ctx.beginPath(); ctx.ellipse(her.x, her.y, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2); ctx.stroke();
      // faint light cone
      ctx.shadowBlur = 0;
      gr = ctx.createLinearGradient(0, her.y, 0, her.y - ch);
      gr.addColorStop(0, glow + '22'); gr.addColorStop(1, glow + '00');
      ctx.fillStyle = gr; ctx.globalAlpha = visible;
      ctx.beginPath(); ctx.moveTo(her.x - rx * 0.8, her.y); ctx.lineTo(her.x + rx * 0.8, her.y); ctx.lineTo(her.x + rx * 1.4, her.y - ch); ctx.lineTo(her.x - rx * 1.4, her.y - ch); ctx.fill();
      ctx.restore();
    }

    // her
    if (!tele || tele.phase !== 'travel') {
      const s = renderHer(P, ch, time);
      const ox = her.x - (UX0 * s) / dpr, oy = her.y - ((UY0 + Z.GROUND) * s) / dpr;
      if (tele) {
        const prevT = tele.prevT == null ? tele.T : tele.prevT;
        dissolve(tele.T, prevT, tele.phase === 'in', ox, oy);
        tele.prevT = tele.T;
      }
      // occasional hologram flicker / glitch
      if (!reduceMotion) {
        nextGlitch -= dt;
        if (nextGlitch <= 0) { glitchUntil = time + 0.09; nextGlitch = 3 + Math.random() * 5; }
      }
      const glitching = time < glitchUntil;
      ctx.save();
      ctx.globalAlpha = glitching ? 0.7 : 0.94;
      ctx.shadowColor = glow; ctx.shadowBlur = 14 * dpr;
      const w = oc.width / dpr, h = oc.height / dpr;
      if (glitching) {
        const slices = 5;
        for (let i = 0; i < slices; i++) {
          const sy = (oc.height / slices) * i, sh = oc.height / slices;
          ctx.drawImage(oc, 0, sy, oc.width, sh, ox + (Math.random() - 0.5) * 10, oy + sy / dpr, w, sh / dpr);
        }
      } else ctx.drawImage(oc, ox, oy, w, h);
      ctx.restore();
    }
    if (tele && tele.phase === 'travel') tele.prevT = null;

    // particles + rings (additive light)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      const u = p.age / p.life;
      if (p.mode === 'home') {
        const e = u * u * u;
        p.x = p.sx + (p.tx - p.sx) * e; p.y = p.sy + (p.ty - p.sy) * e;
        ctx.globalAlpha = 0.35 + 0.65 * u;
      } else {
        p.vy -= 40 * dt;
        p.x += (p.vx + Math.sin(time * 6 + p.seed) * 25) * dt; p.y += p.vy * dt;
        ctx.globalAlpha = 1 - u;
      }
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age > 0.7) { rings.splice(i, 1); continue; }
      const k = r.age / 0.7, rx = r.size * (0.12 + k * 0.45);
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = glow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * 0.24, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- controls
  const animRow = document.getElementById('anims');
  const ANIM_LABELS = { idle: 'Idle', wave: 'Wave', talk: 'Talk', point: 'Point', think: 'Think', sass: 'Sass', cheer: 'Cheer' };
  Object.entries(ANIM_LABELS).forEach(([k, label]) => {
    const b = document.createElement('button');
    b.textContent = label; b.setAttribute('aria-pressed', k === 'idle');
    b.addEventListener('click', () => {
      poser.play(k);
      animRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
    animRow.append(b);
  });
  const glowRow = document.getElementById('glows');
  Object.entries(Z.GLOWS).forEach(([k, c]) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.setProperty('--c', c); b.title = k[0].toUpperCase() + k.slice(1);
    b.setAttribute('aria-label', b.title + ' glow'); b.setAttribute('aria-pressed', k === 'white');
    b.addEventListener('click', () => {
      glow = c;
      document.documentElement.style.setProperty('--glow', c);
      glowRow.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
    glowRow.append(b);
  });
  document.getElementById('base').addEventListener('click', (e) => {
    showBase = !showBase; e.currentTarget.setAttribute('aria-pressed', showBase);
  });
  document.getElementById('tp').addEventListener('click', () => {
    let x, y, tries = 0;
    do { x = W * (0.12 + Math.random() * 0.76); y = horizon + 40 + Math.random() * (H * 0.97 - horizon - 40); tries++; }
    while (Math.abs(x - her.x) < W * 0.2 && tries < 10);
    teleportTo(x, y);
  });
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y < horizon + 10) return;
    teleportTo(e.clientX - r.left, y);
  });

  addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);
  window.zinxLab = { poser, teleportTo, her };
})();
