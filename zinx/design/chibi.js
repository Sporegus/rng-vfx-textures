// Zinx, chibi desktop-pet edition (Shimeji style): pixel art, about two heads
// tall, a big glossy bob, and a monochrome hologram body.
// Frames are drawn from poses, so every animation works in every palette.
// Works in the browser (window.ZinxChibi) and in Node (module.exports).
(function (root) {
  const W = 56, H = 56;
  const GROUND = 55;   // feet touch this row
  const CX = 28;       // body center

  // ---------------------------------------------------------------- palettes
  // body: [shine, light, mid, shadow], hair: [shine, light, mid, dark]
  const PALETTES = {
    red:  { name: 'Red', outline: '#5a0614', body: ['#ffe3e3', '#ffaaa8', '#ff6f6d', '#d93a46'], hair: ['#ffb3b0', '#ff4a52', '#d81f33', '#99102a'], eye: ['#3d0010', '#b0142e'], glint: '#ffffff', mouth: '#b3122e', line: '#ffd2d0', tear: '#ffd6e0' },
    blue: { name: 'Blue', outline: '#0b2a7d', body: ['#e2f4ff', '#a8dcff', '#6fb8ff', '#3f86e8'], hair: ['#a8e2ff', '#3f94ff', '#2363e0', '#163fae'], eye: ['#0e2c88', '#2f6fe0'], glint: '#ffffff', mouth: '#2a5ad0', line: '#e2f4ff', tear: '#e2f4ff' },
  };
  const palOf = (k) => PALETTES[k] || PALETTES.red;

  // ---------------------------------------------------------------- pixel buffer
  function Buf() { this.p = new Array(W * H).fill(null); }
  Buf.prototype.set = function (x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H && c) this.p[y * W + x] = c;
  };
  Buf.prototype.get = function (x, y) { return (x < 0 || y < 0 || x >= W || y >= H) ? null : this.p[y * W + x]; };
  Buf.prototype.rect = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); };
  Buf.prototype.each = function (x0, y0, x1, y1, fn) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) { const c = fn(x, y); if (c) this.set(x, y, c); }
  };
  // tapered limb through pts, 3-tone shading (light on the upper-left)
  Buf.prototype.limb = function (pts, radii, tones) {
    const P = pts.map(([x, y]) => [x + 0.5, y + 0.5]);
    const R = Math.max(...radii) + 1;
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    this.each(Math.min(...xs) - R, Math.min(...ys) - R, Math.max(...xs) + R, Math.max(...ys) + R, (x, y) => {
      const px = x + 0.5, py = y + 0.5;
      let best = null;
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, ay] = P[i], [bx, by] = P[i + 1];
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
        const qx = ax + dx * t, qy = ay + dy * t, r = radii[i] + (radii[i + 1] - radii[i]) * t;
        const d = Math.hypot(px - qx, py - qy);
        if (d <= r && (!best || d / r < best.k)) best = { k: d / r, v: ((px - qx) + (py - qy) * 0.4) / r };
      }
      return best ? tones[best.v < -0.35 ? 1 : best.v > 0.35 ? 3 : 2] : null;
    });
  };
  Buf.prototype.poly = function (pts, colorFn) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    this.each(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
      let inside = false;
      const px = x + 0.5, py = y + 0.5;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside ? colorFn(x, y) : null;
    });
  };
  Buf.prototype.glyph = function (x, y, rows, c) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') this.set(x + i, y + j, typeof c === 'object' ? c[row[i]] : c); });
  };
  const near = (b, x, y) => b.get(x + 1, y) || b.get(x - 1, y) || b.get(x, y + 1) || b.get(x, y - 1);
  function outline(src, col) {
    const out = new Buf();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!src.get(x, y) && near(src, x, y)) out.set(x, y, col);
    for (let i = 0; i < src.p.length; i++) if (src.p[i]) out.p[i] = src.p[i];
    return out;
  }
  // draw a part on its own layer and give it an inner outline where it covers the body
  function part(dst, col, fn) {
    const b = new Buf(); fn(b);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!b.get(x, y) && dst.get(x, y) && near(b, x, y)) dst.set(x, y, col);
    for (let i = 0; i < b.p.length; i++) if (b.p[i]) dst.p[i] = b.p[i];
  }

  const G = {
    heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    note:  ['..XX', '..X.', '..X.', 'XXX.', 'XX..'],
    spark: ['..X..', '..X..', 'XXXXX', '..X..', '..X..'],
    spark2:['X.X', '.X.', 'X.X'],
    z:     ['XXX', '..X', '.X.', 'XXX'],
    zBig:  ['XXXX', '...X', '..X.', '.X..', 'XXXX'],
    q:     ['.XXX.', 'X...X', '...X.', '..X..', '.....', '..X..'],
    bang:  ['X', 'X', 'X', '.', 'X'],
    drop:  ['.X.', 'XXX', 'XXX', '.X.'],
    dot:   ['X'],
  };

  // ---------------------------------------------------------------- head
  // view: 'front' or 'side' (facing right)
  function drawHead(b, p, pal, hx, hy) {
    const side = p.view === 'side';
    const H4 = pal.hair, B4 = pal.body;
    const hcx = side ? hx - 0.5 : hx, hcy = hy + 10.5, hrx = 12.2, hry = 11.5;
    const fcx = side ? hx + 4 : hx, fcy = hy + 14, frx = side ? 7.2 : 8.8, fry = 8.6;
    // fringe edge: bangs swept toward her left (viewer's right), with strand tips
    const fringe = (x) => {
      const t = (x - (hx - 10)) / 20;
      let y = hy + 7.2 + t * 2.4;
      const rel = Math.round(x - hx);
      if (!side && (rel === -6 || rel === -5)) y += 1.5;
      if (!side && (rel === 3 || rel === 4)) y += 2.5;
      if (!side && rel === 5) y += 1.5;
      if (side && (rel === 7 || rel === 8)) y += 2.5;
      return y;
    };
    const inHair = (x, y) => {
      const nx = (x + 0.5 - hcx) / hrx, ny = (y + 0.5 - hcy) / hry;
      if (nx * nx + ny * ny <= 1) return { nx, ny, lock: false };
      // side locks of the bob, ending around the chin
      const locks = side ? [[hx - 9.5, 3]] : [[hx - 9.8, 2.6], [hx + 9.8, 2.6]];
      for (const [lx, lw] of locks) {
        const dx = x + 0.5 - lx, inward = Math.sign(hx - lx) * dx;
        const bottom = hy + 23.5 + inward * 0.9 - dx * dx * 0.25;
        if (Math.abs(dx) <= lw && y + 0.5 >= hcy && y + 0.5 <= bottom) return { nx: dx / lw * Math.sign(lx - hx), ny: (y + 0.5 - hcy) / 13, lock: true };
      }
      return null;
    };
    const inFace = (x, y) => {
      const nx = (x + 0.5 - fcx) / frx, ny = (y + 0.5 - fcy) / fry;
      if (nx * nx + ny * ny > 1) return null;
      if (y + 0.5 < fringe(x)) return null;
      return { nx, ny };
    };
    // hair
    b.each(hx - 17, hy - 2, hx + 17, hy + 30, (x, y) => {
      const h = inHair(x, y);
      if (!h) return null;
      const { nx, ny } = h;
      if (h.lock) return nx > 0.3 ? H4[3] : (ny > 0.55 ? H4[3] : H4[2]);
      const r = Math.sqrt(nx * nx + ny * ny);
      // glossy shine ring across the top
      if (ny < -0.08 && nx > -0.8 && nx < 0.6) {
        if (r > 0.52 && r < 0.66) return H4[0];
        if ((r > 0.46 && r <= 0.52) || (r >= 0.66 && r < 0.74)) return H4[1];
      }
      if (ny > 0.45 || nx > 0.6) return H4[3];
      if (nx < -0.55 && ny < 0.2) return H4[1];
      return H4[2];
    });
    // face
    b.each(fcx - 10, fcy - 10, fcx + 10, fcy + 10, (x, y) => {
      const f = inFace(x, y);
      if (!f) return null;
      if (y + 0.5 < fringe(x) + 1.1) return B4[2];             // shadow under the bangs
      if (f.nx > 0.7 || f.ny > 0.78) return B4[2];
      if (f.nx < -0.55 && f.ny > 0 && f.ny < 0.3) return B4[0];
      return B4[1];
    });
    // side view: hair falls over the back of the face; little nose bump
    if (side) {
      b.each(fcx - 8, hy, fcx, hy + 26, (x, y) => (inHair(x, y) && x + 0.5 < fcx - 3.2 + (y - fcy) * 0.25) ? H4[y > fcy + 4 ? 3 : 2] : null);
      b.set(fcx + 7, fcy + 1, B4[1]); b.set(fcx + 7, fcy + 2, B4[2]);
    }

    // eyes
    const OL = pal.outline, I = pal.eye;
    const eyes = side ? [[fcx + 2, 'near']] : [[hx - 5, 'L'], [hx + 3, 'R']];
    const ey = hy + 14;
    for (const [ex, which] of eyes) {
      const w = side ? 2 : 3;
      switch (p.eyes) {
        case 'blink': case 'closed': b.rect(ex, ey + 1, w, 1, OL); break;
        case 'happy': b.set(ex, ey + 1, OL); b.set(ex + 1, ey, OL); if (w === 3) b.set(ex + 2, ey + 1, OL); break;
        case 'sad':
          b.rect(ex, ey, w, 1, OL); b.rect(ex, ey + 1, w, 2, I[0]); b.set(ex + (which === 'R' ? 0 : w - 1), ey - 1, OL);
          b.set(ex + 1, ey + 1, pal.glint);
          break;
        case 'cry': b.rect(ex, ey + 1, w, 1, OL); b.set(ex + (which === 'R' ? 0 : w - 1), ey, OL); break;
        case 'wide': b.rect(ex, ey - 1, w, 1, OL); b.rect(ex, ey, w, 4, I[0]); b.rect(ex, ey + 3, w, 1, I[1]); b.set(ex, ey, pal.glint); b.set(ex + 1, ey + 1, pal.glint); break;
        case 'x': b.set(ex, ey, OL); b.set(ex + w - 1, ey + 2, OL); b.set(ex + w - 1, ey, OL); b.set(ex, ey + 2, OL); b.set(ex + 1, ey + 1, OL); break;
        case 'wink': if (which === 'R' || which === 'near') { b.set(ex, ey + 1, OL); b.set(ex + 1, ey, OL); if (w === 3) b.set(ex + 2, ey + 1, OL); break; } // fall through
        // eslint-disable-next-line no-fallthrough
        default:
          b.rect(ex, ey - 1, w, 1, OL);
          b.rect(ex, ey, w, 3, I[0]);
          b.rect(ex, ey + 2, w, 1, I[1]);
          b.set(ex, ey, pal.glint);
          if (which === 'L') b.set(ex - 1, ey - 1, OL); else b.set(ex + w, ey - 1, OL); // lash flick
      }
    }
    // mouth
    const mx = side ? fcx + 5 : hx - 1, my = hy + 19;
    const M = pal.mouth;
    switch (p.mouth) {
      case 'open': b.rect(mx, my, 2, 2, M); break;
      case 'o': b.set(mx, my, M); b.set(mx, my + 1, M); break;
      case 'grin': b.rect(mx - 1, my, 4, 1, M); b.rect(mx, my + 1, 2, 1, M); break;
      case 'frown': b.set(mx - 1, my + 1, M); b.rect(mx, my, 2, 1, M); b.set(mx + 2, my + 1, M); break;
      case 'wail': b.rect(mx - 1, my, 4, 2, M); b.rect(mx, my + 2, 2, 1, M); break;
      case 'flat': b.rect(mx, my, 2, 1, M); break;
      default: b.set(mx - 1, my, M); b.rect(mx, my + 1, 2, 1, M); b.set(mx + 2, my, M);
    }
    if (p.blush) { b.rect(hx - 7, ey + 4, 2, 1, pal.mouth); b.rect(hx + 5, ey + 4, 2, 1, pal.mouth); }
  }

  // ---------------------------------------------------------------- skeleton presets
  // arm/leg presets are [elbow|knee, hand|ankle] offsets from the shoulder/hip
  const ARMS = {
    down: [[0, 5], [0.5, 10]], out: [[3, 3], [6, 5]], wave1: [[4, -2], [8, -6]], wave2: [[4, -3], [6, -8]],
    up: [[3, -4], [6, -8]], hip: [[3, 4], [1, 8]], chin: [[2, 4], [-1, -1]], eyes: [[2, 4], [-2, -4]],
    point: [[4, 1], [9, 0]], hold: [[2, 5], [6, 5]], swingF: [[2, 4], [4, 9]], swingB: [[-2, 4], [-4, 9]],
    flail: [[4, -3], [8, -6]], heart: [[2, 4], [-1, 2]], type: [[2, 5], [6, 4]], back: [[-1, 5], [-3, 9]],
  };
  const LEGS = {
    stand: [[0, 5.5], [0, 11]], apart: [[1, 5.5], [1.5, 11]],
    stepF: [[2, 5], [4, 10.5]], stepB: [[-1.5, 5], [-4, 10]], pass: [[1.5, 4.5], [0, 9]],
    runF: [[4, 4], [7, 9]], runB: [[-3, 5], [-7, 8]], runUp: [[4, 3], [2, 7]],
    sit: [[5, 0.5], [6, 6]], tuck: [[3, 3], [0, 6]], dangle: [[0.5, 5.5], [1, 11]], kneel: [[3, 4], [-2, 6]],
  };

  // ---------------------------------------------------------------- the character
  function drawZinx(pose, palKey) {
    const pal = palOf(palKey);
    const p = Object.assign({ view: 'front', bob: 0, dx: 0, eyes: 'open', mouth: 'smile', armA: 'down', armB: 'down', legA: 'stand', legB: 'stand' }, pose);
    const side = p.view === 'side';
    const ox = CX + p.dx, oy = p.bob;
    const B4 = pal.body;
    const body = new Buf();
    const fx = new Buf();

    const shA = side ? [ox - 0.5, 32 + oy] : [ox - 4.5, 32 + oy];
    const shB = side ? [ox - 0.5, 32 + oy] : [ox + 4.5, 32 + oy];
    const hipA = side ? [ox - 0.5, 42 + oy] : [ox - 2.2, 42 + oy];
    const hipB = side ? [ox - 0.5, 42 + oy] : [ox + 2.2, 42 + oy];
    const mirror = (o, s) => [o[0] * s, o[1]];
    const joint = (base, preset, table, s) => {
      const v = Array.isArray(preset) ? preset : table[preset] || table.down || table.stand;
      const e = mirror(v[0], s), h = mirror(v[1], s);
      return [base, [base[0] + e[0], base[1] + e[1]], [base[0] + h[0], base[1] + h[1]]];
    };
    // front view: A is viewer's left (mirrored), B viewer's right. side view: A is the far limb.
    const sA = side ? 1 : -1, sB = 1;
    const armA = joint(shA, p.armA, ARMS, sA), armB = joint(shB, p.armB, ARMS, sB);
    const legA = joint(hipA, p.legA, LEGS, sA), legB = joint(hipB, p.legB, LEGS, sB);

    const dark = [B4[2], B4[2], B4[3], B4[3]];
    // far limbs (darker)
    body.limb(legA, [1.9, 1.4, 1.1], dark);
    footOf(body, legA, side ? 1 : sA, B4[3]);
    body.limb(armA, [1.2, 1.0, 0.9], dark);
    // torso
    const T = (pts) => pts.map(([x, y]) => [x + ox, y + oy]);
    const torso = side
      ? T([[-3, 30.5], [2, 30.5], [3, 33.5], [2.2, 36.5], [2, 38.5], [3, 42.5], [-3.5, 43.5], [-4, 40], [-3, 37], [-3.8, 33.5]])
      : T([[-4.6, 30.5], [4.6, 30.5], [5, 33.5], [3.6, 36.5], [3.4, 38.5], [5.4, 42], [4, 44], [-4, 44], [-5.4, 42], [-3.4, 38.5], [-3.6, 36.5], [-5, 33.5]]);
    part(body, pal.outline, (t) => t.poly(torso, (x, y) => {
      const rel = (x + 0.5 - ox) / (side ? 4 : 5);
      return rel < -0.45 ? B4[1] : rel > 0.5 ? B4[3] : B4[2];
    }));
    // hologram lines on the suit
    const L = pal.line;
    if (!side) { body.set(ox - 2, 33 + oy, L); body.set(ox - 2, 34 + oy, L); body.set(ox - 1, 35 + oy, L); body.rect(ox - 3, 38 + oy, 6, 1, B4[3]); body.set(ox, 38 + oy, L); body.set(ox + 2, 40 + oy, L); body.set(ox + 3, 41 + oy, L); }
    else { body.set(ox + 1, 34 + oy, L); body.set(ox + 1, 35 + oy, L); body.rect(ox - 3, 38 + oy, 5, 1, B4[3]); body.set(ox, 40 + oy, L); }
    // near leg and foot
    part(body, pal.outline, (t) => { t.limb(legB, [2.0, 1.5, 1.2], B4); footOf(t, legB, 1, B4[2]); t.set(legB[1][0], legB[1][1], L); });
    // neck + head
    body.rect(ox - 1, 27 + oy, 3, 4, B4[3]);
    part(body, pal.outline, (t) => drawHead(t, p, pal, ox + (side ? -1 : 0), 6 + oy));
    // near arm
    part(body, pal.outline, (t) => { t.limb(armB, [1.3, 1.1, 1.0], B4); t.rect(armB[2][0] - 0.5, armB[2][1] - 0.5, 2, 2, B4[1]); });

    // props / effects
    if (p.panel) {
      const x = armB[2][0] + 2, y = armB[2][1] - 9;
      fx.rect(x, y, 10, 7, B4[0] + '70'); fx.rect(x, y, 10, 1, B4[0]); fx.rect(x + 2, y + 2, 5 + (p.panel % 2) * 2, 1, B4[0]); fx.rect(x + 2, y + 4, 4, 1, B4[0]);
    }
    if (p.tears) p.tears.forEach(([x, y]) => fx.glyph(ox + x, y + oy, G.drop, pal.tear));
    const out = outline(body, pal.outline);
    for (let i = 0; i < fx.p.length; i++) if (fx.p[i]) out.p[i] = fx.p[i];
    return out;
  }
  // floating effects (sparkles, hearts, zzz) are added after any rotation
  function addFx(out, pose, palKey) {
    const pal = palOf(palKey);
    (pose.fx || []).forEach(([g, x, y, c]) => out.glyph(x, y, G[g], c === 'hair' ? pal.hair[1] : c === 'line' ? pal.line : c));
  }
  function footOf(b, leg, s, c) {
    const [x, y] = leg[2];
    b.rect(Math.round(x) - (s > 0 ? 0 : 1), Math.round(y), 2, 1, c);
  }

  // ---------------------------------------------------------------- animations
  const ANIMS = {
    idle:  { frames: 4, fps: 3, pose: f => ({ bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open', armA: 'down', armB: 'down' }) },
    walk:  { frames: 4, fps: 8, pose: f => ({ view: 'side', bob: f % 2 ? -1 : 0, legA: ['stepB', 'pass', 'stepF', 'stand'][f], legB: ['stepF', 'stand', 'stepB', 'pass'][f], armA: ['swingF', 'down', 'swingB', 'down'][f], armB: ['swingB', 'down', 'swingF', 'down'][f] }) },
    run:   { frames: 4, fps: 12, pose: f => ({ view: 'side', dx: 1, bob: f % 2 ? -1 : 0, legA: ['runB', 'runUp', 'runF', 'stand'][f], legB: ['runF', 'stand', 'runB', 'runUp'][f], armA: f < 2 ? 'swingF' : 'swingB', armB: f < 2 ? [[-2, 3], [-1, 7]] : [[3, 3], [5, 5]], mouth: 'grin' }) },
    wave:  { frames: 4, fps: 6, pose: f => ({ armB: f % 2 ? 'wave2' : 'wave1', armA: 'hip', eyes: 'happy', mouth: 'open' }) },
    talk:  { frames: 4, fps: 7, pose: f => ({ mouth: ['smile', 'open', 'smile', 'o'][f], armB: f % 2 ? 'hold' : 'down', armA: 'hip' }) },
    point: { frames: 2, fps: 3, pose: f => ({ armB: 'point', armA: 'hip', eyes: f ? 'open' : 'wink', mouth: 'grin' }) },
    think: { frames: 4, fps: 3, pose: f => ({ armB: 'chin', armA: 'heart', eyes: 'open', mouth: 'flat', fx: [['q', 42, 2 + (f % 2), 'line']] }) },
    cheer: { frames: 4, fps: 8, pose: f => ({ bob: [0, -3, -4, -2][f], legA: f ? 'tuck' : 'stand', legB: f ? 'tuck' : 'stand', armA: 'up', armB: 'up', eyes: 'happy', mouth: 'open', fx: f % 2 ? [['spark', 4, 6, 'line'], ['spark2', 46, 10, '#ffffff']] : [['spark2', 6, 10, '#ffffff'], ['spark', 44, 4, 'line']] }) },
    sit:   { frames: 4, fps: 3, footY: 45, pose: f => ({ legA: 'sit', legB: 'sit', armA: [[1, 5], [2, 9]], armB: [[1, 5], [2, 9]], bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open' }) },
    sleep: { frames: 4, fps: 2, lie: true, pose: f => ({ eyes: 'closed', mouth: 'o', armA: 'down', armB: 'down', legB: 'apart', bob: 0, fx: [['z', 20, 34 - f, 'line'], ['zBig', 25, 27 - (f % 2), 'line']].slice(0, 1 + (f % 2)) }) },
    cry:   { frames: 4, fps: 5, pose: f => ({ armA: 'eyes', armB: 'eyes', eyes: 'cry', mouth: 'wail', bob: f % 2, tears: [[-9, 25 + (f % 2) * 3], [7, 26 + ((f + 1) % 2) * 3]] }) },
    sad:   { frames: 2, fps: 2, pose: f => ({ armA: 'down', armB: 'back', eyes: 'sad', mouth: 'frown', bob: 1, tears: f ? [[-8, 27]] : [] }) },
    dance: { frames: 8, fps: 8, pose: f => ({ dx: [0, 1, 2, 1, 0, -1, -2, -1][f], bob: f % 2, armA: f < 4 ? 'up' : 'hip', armB: f < 4 ? 'hip' : 'up', legB: f % 4 === 1 ? 'stepF' : 'stand', eyes: 'happy', mouth: f % 2 ? 'open' : 'smile', fx: [['note', f < 4 ? 3 : 46, 8 + (f % 4), 'line']] }) },
    dangle:{ frames: 2, fps: 5, pose: f => ({ armA: 'up', armB: 'up', legA: 'dangle', legB: 'dangle', eyes: 'wide', mouth: 'o', dx: f ? 1 : 0 }) },
    fall:  { frames: 2, fps: 10, pose: f => ({ armA: 'flail', armB: f ? 'up' : 'flail', legA: 'tuck', legB: f ? 'pass' : 'tuck', eyes: 'wide', mouth: 'wail' }) },
    land:  { frames: 2, fps: 8, loop: false, pose: f => ({ bob: f ? 0 : 2, legA: f ? 'stand' : 'kneel', legB: f ? 'stand' : 'kneel', armA: f ? 'down' : 'out', armB: f ? 'down' : 'out', eyes: f ? 'open' : 'closed', mouth: 'flat' }) },
    work:  { frames: 4, fps: 6, pose: f => ({ armB: 'type', armA: 'hold', eyes: 'open', mouth: 'flat', panel: f + 1 }) },
    love:  { frames: 4, fps: 5, pose: f => ({ armA: 'heart', armB: 'heart', eyes: 'happy', blush: true, bob: f % 2, fx: [['heart', 40 + (f % 2), 6 - f, '#ff8fb0'], ['heart', 8, 10 - ((f + 2) % 4), '#ff8fb0']] }) },
    angry: { frames: 2, fps: 6, pose: f => ({ armA: 'hip', armB: 'hip', eyes: 'sad', mouth: 'frown', dx: f ? 1 : 0, fx: [['bang', 44, 6, '#ffffff']] }) },
    dizzy: { frames: 4, fps: 6, pose: f => ({ eyes: 'x', mouth: 'wail', dx: [-1, 0, 1, 0][f], armA: 'out', armB: 'out', fx: [['spark2', 18 + f * 3, 2, '#ffe14d'], ['spark2', 34 - f * 3, 3, '#ffe14d']] }) },
  };
  Object.keys(ANIMS).forEach(k => { const a = ANIMS[k]; if (a.loop === undefined) a.loop = true; if (!a.footY) a.footY = GROUND; });

  // ---------------------------------------------------------------- rendering
  // lying poses are drawn standing, then turned on their side
  function lieDown(buf) {
    const out = new Buf();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = buf.get(x, y);
      if (!c) continue;
      // rotate -90deg: head to the left, feet to the right, resting on the ground
      const nx = y, ny = (W - 1 - x) + (GROUND - 40);
      out.set(nx, ny, c);
    }
    return out;
  }
  const cache = new Map();
  function frameRGBA(anim, frame, pal) {
    const a = ANIMS[anim] || ANIMS.idle;
    const f = ((frame % a.frames) + a.frames) % a.frames;
    const key = anim + '|' + f + '|' + pal;
    let px = cache.get(key);
    if (!px) {
      const pose = a.pose(f);
      let buf = drawZinx(pose, pal);
      if (a.lie) buf = lieDown(buf);
      addFx(buf, pose, pal);
      px = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const c = buf.p[i];
        if (!c) continue;
        const n = parseInt(c.slice(1, 7), 16);
        px[i * 4] = n >> 16; px[i * 4 + 1] = (n >> 8) & 255; px[i * 4 + 2] = n & 255;
        px[i * 4 + 3] = c.length === 9 ? parseInt(c.slice(7), 16) : 255;
      }
      cache.set(key, px);
    }
    return px;
  }
  let scratch = null;
  function draw(ctx, { anim = 'idle', frame = 0, pal = 'red', x = 0, y = 0, scale = 4, flip = false }) {
    if (!scratch) scratch = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const sctx = scratch.getContext('2d');
    const img = sctx.createImageData(W, H);
    img.data.set(frameRGBA(anim, frame, pal));
    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(x + W * scale, y); ctx.scale(-1, 1); ctx.drawImage(scratch, 0, 0, W * scale, H * scale); }
    else ctx.drawImage(scratch, x, y, W * scale, H * scale);
    ctx.restore();
  }

  const api = { W, H, GROUND, PALETTES, ANIMS, frameRGBA, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZinxChibi = api;
})(typeof window !== 'undefined' ? window : globalThis);
