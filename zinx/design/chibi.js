// Zinx, chibi desktop-pet edition (Shimeji style): pixel art, about two heads
// tall, with a detailed anime face and strand-by-strand hair.
// Frames are drawn from poses, so every animation works in every palette.
// Works in the browser (window.ZinxChibi) and in Node (module.exports).
(function (root) {
  // Poses are written in a 56x56 "logical" grid; frames render at K times
  // that resolution so curves are smooth and the face and hair get real detail.
  const K = 2;
  const LW = 56, LH = 56;
  const W = LW * K, H = LH * K;
  const GROUND = 55;   // feet touch this logical row
  const CX = 28;       // body center (logical)

  // ---------------------------------------------------------------- palettes
  // body: [shine, light, mid, shadow], hair: [shine, light, mid, dark]
  const PALETTES = {
    red:     { name: 'Red', suit: ['#ffd0ce', '#ff7a78', '#e6404f', '#b3213a'], outline: '#5a0614', body: ['#fff1f0', '#ffcbc8', '#f7a09d', '#e06470'], hair: ['#ff9c9c', '#ff3d48', '#d11b2e', '#8c0d23'], eye: ['#5c0716', '#b51a33', '#ff6b7a'], glint: '#ffffff', mouth: '#a5142e', line: '#ffd2d0', tear: '#ffd6e0', cheek: '#ff8f9c', tie: '#2b0a12', tieHi: '#6b2232' },
    cortana: { name: 'Blue + red hair', suit: ['#c4f3ff', '#5fb0ff', '#2f7fe6', '#1d55b8'], outline: '#0b2a7d', body: ['#eaf7ff', '#b4defc', '#7fbdf2', '#4d8fdc'], hair: ['#ff9c9c', '#ff3d48', '#d11b2e', '#8c0d23'], eye: ['#0e2c88', '#2f6fe0', '#7fc4ff'], glint: '#ffffff', mouth: '#2a5ad0', line: '#e2f4ff', tear: '#e2f4ff', cheek: '#ff9ab0', tie: '#12163a', tieHi: '#3a4180' },
    blue:    { name: 'Blue', suit: ['#c4f3ff', '#5fb0ff', '#2f7fe6', '#1d55b8'], outline: '#0b2a7d', body: ['#eaf7ff', '#b4defc', '#7fbdf2', '#4d8fdc'], hair: ['#a8e2ff', '#3f94ff', '#2363e0', '#163fae'], eye: ['#0e2c88', '#2f6fe0', '#7fc4ff'], glint: '#ffffff', mouth: '#2a5ad0', line: '#e2f4ff', tear: '#e2f4ff', cheek: '#9fd2ff', tie: '#0b1f5c', tieHi: '#3355aa' },
  };
  const palOf = (k) => PALETTES[k] || PALETTES.red;

  // ---------------------------------------------------------------- pixel buffer
  // set/get/rect/glyph take logical coordinates (a logical pixel is K x K);
  // each/limb/poly evaluate every real pixel, so their edges are full resolution.
  function Buf() { this.p = new Array(W * H).fill(null); }
  Buf.prototype.setP = function (X, Y, c) { if (X >= 0 && Y >= 0 && X < W && Y < H && c) this.p[Y * W + X] = c; };
  Buf.prototype.getP = function (X, Y) { return (X < 0 || Y < 0 || X >= W || Y >= H) ? null : this.p[Y * W + X]; };
  Buf.prototype.set = function (x, y, c) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) this.setP(x * K + i, y * K + j, c);
  };
  Buf.prototype.get = function (x, y) { return this.getP(Math.round(x) * K, Math.round(y) * K); };
  Buf.prototype.rect = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); };
  // fn(x, y) gets the logical position of each real pixel (x + 0.5 is its center)
  Buf.prototype.each = function (x0, y0, x1, y1, fn) {
    for (let Y = Math.floor(y0 * K); Y <= Math.ceil((y1 + 1) * K); Y++) for (let X = Math.floor(x0 * K); X <= Math.ceil((x1 + 1) * K); X++) {
      const c = fn((X + 0.5) / K - 0.5, (Y + 0.5) / K - 0.5); if (c) this.setP(X, Y, c);
    }
  };
  // physical-pixel glyph (for fine face details)
  Buf.prototype.glyphP = function (X, Y, rows, c, mirror) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[mirror ? row.length - 1 - i : i]; if (ch !== '.' && c[ch]) this.setP(X + i, Y + j, c[ch]); } });
  };
  // tapered limb through pts, 3-tone shading (light on the upper-left)
  Buf.prototype.limb = function (pts, radii, tones, th = [-0.35, 0.35]) {
    const P = pts.map(([x, y]) => [x, y + 0.5]);
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
      return best ? tones[best.v < th[0] ? 1 : best.v > th[1] ? 3 : 2] : null;
    });
  };
  Buf.prototype.poly = function (pts, colorFn) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    this.each(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs), Math.max(...ys), (x, y) => {
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
  const nearP = (b, X, Y) => b.getP(X + 1, Y) || b.getP(X - 1, Y) || b.getP(X, Y + 1) || b.getP(X, Y - 1);
  function outline(src, col) {
    const out = new Buf();
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (!src.getP(X, Y) && nearP(src, X, Y)) out.setP(X, Y, col);
    for (let i = 0; i < src.p.length; i++) if (src.p[i]) out.p[i] = src.p[i];
    return out;
  }
  // draw a part on its own layer and give it an inner outline where it covers the body
  function part(dst, col, fn, blendAt) {
    const b = new Buf(); fn(b);
    const blended = (X, Y) => blendAt && blendAt.some(([bx, by, r]) => ((X + 0.5) / K - 0.5 - bx) ** 2 + ((Y + 0.5) / K - 0.5 - by) ** 2 < r * r);
    if (col) for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (!b.getP(X, Y) && dst.getP(X, Y) && nearP(b, X, Y) && !blended(X, Y)) dst.setP(X, Y, col);
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
  // Kawaii anime faces and strand-by-strand hairstyles, mix and match.
  // Back hair is drawn behind the body by drawBackHair; everything else here.
  // view: 'front' or 'side' (facing right)
  const tonesOf = (H4) => [H4[0], H4[1], H4[2], H4[3]];
  // a tapered hair strand from root to tip (blunt strands keep their width)
  function strand(b, pts, w, tones, blunt) {
    const n = pts.length, radii = pts.map((_, i) => Math.max(blunt ? w * 0.7 : 0.28, w * (1 - (i / (n - 1)) * (blunt ? 0.3 : 0.92))));
    b.limb(pts, radii, tones, [-0.75, 0.55]);   // flat ribbon: mostly mid tone, thin dark edge
  }
  // smooth 3-point curve sampled into a polyline; `wave` adds an S-wiggle
  function curve(a, c, z, steps = 6, wave = 0) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * z[0] + Math.sin(t * Math.PI * 2) * wave * t, u * u * a[1] + 2 * u * t * c[1] + t * t * z[1]]);
    }
    return out;
  }

  // ---- faces. Eye glyphs are real pixels, 9 x 10, right eye (left is mirrored).
  // L lash, D/M/B iris dark/mid/bright, W highlight, S white of the eye, l lower lash
  const EYES_SHARED = {
    closed: ['.........', '.........', '.........', '.........', '.........', '.LLLLLLL.', 'L.......L', '.........', '.........', '.........'],
    happy:  ['.........', '.........', '.........', '.........', '...LLL...', '.LL...LL.', 'L.......L', '.........', '.........', '.........'],
    cry:    ['.........', '.........', '.........', '.........', '.........', 'LLLLLLLLL', '.L.....L.', '.........', '.........', '.........'],
    x:      ['.........', '.........', '.L.....L.', '..L...L..', '...L.L...', '....L....', '...L.L...', '..L...L..', '.L.....L.', '.........'],
  };
  EYES_SHARED.blink = EYES_SHARED.closed;
  const FACES = {
    sparkle: { name: 'Sparkle', mouth: 'cat', blush: 'lines', eye: [
      '..LLLLL..', '.LLLLLLL.', 'LLDDDDDLL', 'LDWWDDDDL', 'SDWWDDWDS', 'SDDDDDDDS', 'SDMMMMMDS', 'SMMBBBMMS', '.SMBWBMS.', '..SSSSS..'] },
    doe:     { name: 'Doe', mouth: 'o', blush: 'oval', eye: [
      '.......L.', '..LLLLLL.', '.LLLLLLLL', 'LLDDDDDLL', 'SDWWDDDDS', 'SDWWDDDDS', 'SDDDMMDDS', 'SMMMBBMMS', '.SMBBBMS.', '..llll...'] },
    smug:    { name: 'Smug', mouth: 'smile', blush: 'oval', eye: [
      '.........', '..LLLLLL.', 'LLLLLLLLL', 'LDDDDDDLL', 'SDWWDDDS.', 'SDWDMMDS.', 'SMMBBBMS.', '.SMMMMS..', '..llll...', '.........'] },
    cat:     { name: 'Cat', mouth: 'fang', blush: 'oval', eye: [
      '.......LL', '..LLLLLL.', '.LLLLLLLL', 'LMMMDMMML', 'SMWMDMMMS', 'SMWMDMMMS', 'SBMMDMMBS', '.SBBDBBS.', '..SSDSS..', '...lll...'] },
    sleepy:  { name: 'Sleepy', mouth: 'smile', blush: 'lines', eye: [
      '.........', '.........', '.........', '..LLLLLL.', 'LLLLLLLLL', 'LDDDDDDDL', 'SDWDMMMDS', 'SMMBBBMMS', '.SMMMMMS.', '..llll...'] },
  };
  const MOUTHS = {
    smile: [[-3, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 0]],
    cat:   [[-4, 0], [-3, 1], [-2, 1], [-1, 0], [0, 0], [1, 1], [2, 1], [3, 0]],
    fang:  [[-3, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 0]],
    open:  [[-2, 0], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2]],
    o:     [[-1, 0], [0, 0], [-2, 1], [1, 1], [-1, 2], [0, 2]],
    grin:  [[-4, 0], [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 0]],
    frown: [[-3, 1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 1]],
    wail:  [[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-3, 1], [2, 1], [-2, 2], [-1, 2], [0, 2], [1, 2]],
    flat:  [[-2, 0], [-1, 0], [0, 0], [1, 0]],
    tongue:[[-2, 0], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1]],
  };

  // ---- hairstyles: which bangs, side locks, back hair and tails to use
  const HAIR_STYLES = {
    layered: { name: 'Layered long', bangs: 'layered', locks: 'long', back: { n: 9, len: 37, spread: 14.4, w: 3.3 }, fly: true },
    hime:    { name: 'Hime cut', bangs: 'blunt', locks: 'hime', back: { n: 11, len: 36, spread: 10.8, w: 2.0, blunt: true } },
    twin:    { name: 'Twin tails', bangs: 'layered', locks: 'short', back: { n: 7, len: 19, spread: 11.4, w: 2.8 }, tails: 'twin', fly: true },
    wavy:    { name: 'Wavy', bangs: 'swept', locks: 'wavy', back: { n: 11, len: 39, spread: 16, w: 3.0, wave: 1.5 }, fly: true },
    bob:     { name: 'Bob', bangs: 'layered', locks: 'bob', back: { n: 9, len: 21, spread: 12.6, w: 3.1, inward: true } },
    pony:    { name: 'Ponytail', bangs: 'swept', locks: 'short', back: { n: 5, len: 15, spread: 10, w: 2.6 }, tails: 'pony' },
  };
  const styleOf = (k) => HAIR_STYLES[k] || HAIR_STYLES.layered;
  const BANGS = {
    // [root x, tip x, tip y, width] relative to the head; tips over the eyes stay above them
    layered: [[-10, -11.3, 15.6, 2.2], [-7.6, -8.4, 12.8, 2.4], [-5.0, -5.3, 10.3, 2.4], [-2.4, -2.6, 10.9, 2.3], [0, 0.3, 13.4, 1.7], [2.4, 2.9, 10.5, 2.4], [5.0, 5.5, 10.1, 2.4], [7.6, 8.8, 13.2, 2.4], [10, 11.5, 15.8, 2.2]],
    blunt:   [-10.4, -8.8, -7.2, -5.6, -4, -2.4, -0.8, 0.8, 2.4, 4, 5.6, 7.2, 8.8, 10.4].map((x, i) => [x * 0.95, x, Math.abs(x) > 8 ? 12.2 : 10.4 + (i % 2) * 0.35, 1.25]),
    swept:   [[-10, -11.4, 14.6, 2.2], [-8, -6.2, 11.2, 2.5], [-5.5, -2.6, 10.6, 2.5], [-3, 1.2, 10.4, 2.5], [-0.5, 4.6, 10.9, 2.4], [2, 7.8, 13.6, 2.3], [4.5, 10.4, 15.8, 2.1], [7.5, 11.8, 17, 1.8]],
  };
  const BANGS_SIDE = [[-3, 0, 10.6, 2.3], [0, 3.5, 10.4, 2.3], [3, 6.5, 10.8, 2.2], [5.5, 9, 13.6, 1.9]];

  function drawHead(b, p, pal, hx, hy) {
    const side = p.view === 'side';
    const H4 = pal.hair, F4 = pal.body, OL = pal.outline, T4 = tonesOf(H4);
    const sway = p.sway || 0;
    const st = styleOf(p.hairStyle), face = FACES[p.face] || FACES.sparkle;
    const hcx = side ? hx - 0.5 : hx, hcy = hy + 10.5, hrx = 12.2, hry = 11.6;
    const fcx = side ? hx + 4 : hx, fcy = hy + 14.2, frx = side ? 7.4 : 9.3, fry = 9.1;
    const S = (pts, w, blunt) => part(b, null, (t) => strand(t, pts, w, T4, blunt));

    // tails tied high on the head sit behind it
    if (st.tails === 'twin') {
      const sides = side ? [-1] : [-1, 1];
      for (const s of sides) {
        const rx = side ? hx - 6 : hx + s * 10.2, dir = side ? -1 : s;
        for (const [o, len, w] of [[0, 33, 2.6], [1.2, 30, 2.2], [-1.2, 31.5, 2.2], [2.4, 27, 1.7]]) {
          S(curve([rx + dir * o * 0.3, hy + 3], [rx + dir * (5.5 + o), hy + 9], [rx + dir * (6.4 + o * 0.8) + sway * 1.6, hy + len], 8, dir * 0.9), w);
        }
        b.glyph(Math.round(rx) - 1 - (dir > 0 ? 0 : 1), hy + 1, ['.TT.', 'TKKT', '.TT.'], { T: pal.tie, K: pal.tieHi });
      }
    }
    if (st.tails === 'pony') {
      const rx = side ? hx - 8 : hx + 6, dir = side ? -1 : 1;
      for (const [o, len, w] of [[0, 31, 3], [1.5, 28, 2.4], [-1.5, 29, 2.4], [2.8, 25, 1.8], [-2.6, 26, 1.8]]) {
        S(curve([rx, hy + 1], [rx + dir * (6 + o), hy + 6], [rx + dir * (7.5 + o * 0.7) + sway * 1.6, hy + len], 8, dir * 0.7), w);
      }
      b.glyph(Math.round(rx) - 1, hy - 1, ['.TT.', 'TKKT', '.TT.'], { T: pal.tie, K: pal.tieHi });
    }

    // cranium with a soft shine ring
    b.each(hx - 13, hy - 2, hx + 13, hy + 22, (x, y) => {
      const nx = (x + 0.5 - hcx) / hrx, ny = (y + 0.5 - hcy) / hry;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) return null;
      const r = Math.sqrt(r2);
      if (ny < -0.1 && nx > -0.75 && nx < 0.55 && r > 0.54 && r < 0.64) return H4[0];
      if (ny < -0.1 && nx > -0.8 && nx < 0.6 && r > 0.48 && r < 0.72) return H4[1];
      if (nx > 0.55 || ny > 0.5) return H4[3];
      return H4[2];
    });
    // face, with a slightly pointed chin
    b.each(fcx - 10, fcy - 10, fcx + 10, fcy + 10, (x, y) => {
      const nx = (x + 0.5 - fcx) / frx, ny = (y + 0.5 - fcy) / fry;
      const r2 = nx * nx + (ny > 0.25 ? ny * ny * 1.28 : ny * ny);
      if (r2 > 1) return null;
      if (Math.abs(nx) > 0.84 || ny > 0.78) return F4[2];
      return F4[1];
    });
    if (side) b.set(fcx + 7, fcy + 1, F4[1]);

    // ---- face details (real pixels)
    const Xp = (x) => Math.round(x * K), Yp = (y) => Math.round(y * K);
    const glyphFor = (k) => k === 'open' || k === 'wide' || k === 'sad' || !EYES_SHARED[k] ? face.eye : EYES_SHARED[k];
    const ec = { L: OL, D: pal.eye[0], M: pal.eye[1], B: pal.eye[2] || pal.eye[1], W: pal.glint, S: '#fff6f6', l: F4[3] };
    const eyeY = Yp(hy + 11.4);
    if (side) {
      b.glyphP(Xp(fcx + 1.2), eyeY, glyphFor(p.eyes === 'wink' ? 'happy' : p.eyes).map(r => r.slice(0, 7)), ec);
    } else {
      const rx = Xp(hx) + 3, lx = W - 1 - (rx + 8);   // mirror-exact
      b.glyphP(rx, eyeY, glyphFor(p.eyes === 'wink' ? 'happy' : p.eyes), ec);
      b.glyphP(lx, eyeY, glyphFor(p.eyes === 'wink' ? 'open' : p.eyes), ec, true);
      const browY = eyeY - 3, angry = p.eyes === 'sad' || p.mouth === 'frown';
      for (const [dx, dy] of [[1, 1], [2, 0], [3, 0], [4, 0], [5, 0], [6, 1]]) {
        const yy = browY + (angry ? (dx < 3 ? 1 : 0) : dy) - (face === FACES.sleepy ? -1 : 0);
        b.setP(rx + dx, yy, H4[3]); b.setP(W - 1 - (rx + dx), yy, H4[3]);
      }
      // blush: soft ovals or kawaii diagonal lines
      const blush = face.blush === 'lines' ? [[0, 1], [1, 0], [3, 1], [4, 0], [6, 1], [7, 0]] : [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [2, 1]];
      if (p.blush || ['open', 'happy', 'wink', undefined].includes(p.eyes)) {
        for (const [dx, dy] of blush) { b.setP(rx + 4 + dx, eyeY + 12 + dy, pal.cheek); b.setP(W - 1 - (rx + 4 + dx), eyeY + 12 + dy, pal.cheek); }
      }
    }
    // mouth (centered on the real-pixel seam at her middle)
    const mY = Yp(hy + 19.6), M = pal.mouth, cxp = Xp(side ? fcx + 5 : hx);
    const mk = (p.mouth === 'smile' || !p.mouth) ? face.mouth : p.mouth;
    for (const [dx, dy] of (MOUTHS[mk] || MOUTHS.smile)) b.setP(cxp + dx, mY + dy, M);
    if (mk === 'fang') { b.setP(cxp + 1, mY + 2, '#ffffff'); b.setP(cxp + 1, mY + 1, '#ffffff'); }
    if (mk === 'open' || mk === 'wail') { b.setP(cxp - 1, mY + 1, pal.cheek); b.setP(cxp, mY + 1, pal.cheek); }

    // ---- bangs
    for (const [r, tx, ty, w] of (side ? BANGS_SIDE : BANGS[st.bangs])) {
      const root = [hx + r * 0.8, hy + 2.6], tip = [hx + tx, hy + ty];
      const ctrl = [hx + (r + tx) / 2 + (tx - r) * 0.4, hy + (2.6 + ty) / 2 - 0.5];
      S(curve(root, ctrl, tip), w, st.bangs === 'blunt');
    }
    // ---- side locks
    if (!side) for (const s of [-1, 1]) {
      if (st.locks === 'long') {
        S(curve([hx + s * 11, hy + 9], [hx + s * 13, hy + 17], [hx + s * 13.4 + sway, hy + 26.5]), 2.0);
        S(curve([hx + s * 9.2, hy + 8], [hx + s * 11.2, hy + 17], [hx + s * 10.2 + sway * 0.6, hy + 29]), 2.3);
      } else if (st.locks === 'hime') {
        for (const [o, w] of [[11.2, 1.5], [9.9, 1.5], [8.7, 1.3]]) S(curve([hx + s * o, hy + 8], [hx + s * (o + 0.2), hy + 15], [hx + s * (o + 0.3), hy + 22.6], 6), w, true);
      } else if (st.locks === 'short') {
        S(curve([hx + s * 9.4, hy + 8], [hx + s * 11, hy + 14], [hx + s * 10.6 + sway * 0.5, hy + 21]), 2.0);
      } else if (st.locks === 'wavy') {
        S(curve([hx + s * 11, hy + 9], [hx + s * 14, hy + 18], [hx + s * 13 + sway, hy + 30], 8, s * 1.2), 2.1);
        S(curve([hx + s * 9.2, hy + 8], [hx + s * 11.5, hy + 17], [hx + s * 10.5 + sway * 0.6, hy + 27], 8, s * 1.0), 2.2);
      } else if (st.locks === 'bob') {
        S(curve([hx + s * 11.4, hy + 8], [hx + s * 13.6, hy + 17], [hx + s * 10.4, hy + 23.4]), 2.4);
        S(curve([hx + s * 9.2, hy + 8], [hx + s * 11.4, hy + 16], [hx + s * 8.6, hy + 22]), 2.0);
      }
    } else {
      for (const [r, ex, ey] of [[1, -11.5, 15], [0, -12.5, 11], [-1.5, -11, 19], [2.5, -9, 6.5]]) {
        S(curve([hx + r, hy + 1], [hx + r - 6, hy + 2 + ey * 0.2], [hx + ex + sway * 0.4, hy + ey]), 2.6);
      }
      S(curve([hx - 2, hy + 7], [hx - 3.5, hy + 16], [hx - 2.5 + sway * 0.6, hy + (st.locks === 'long' || st.locks === 'wavy' ? 25 : 20)]), 2.2);
    }
    // flyaway strand on top
    if (st.fly) {
      const fly = side ? [[hx - 1, hy + 0.5], [hx + 1, hy - 3], [hx + 4, hy - 3.2]] : [[hx - 0.5, hy + 0.8], [hx + 0.8, hy - 2.8], [hx + 3.8, hy - 3]];
      part(b, OL, (t) => strand(t, curve(fly[0], fly[1], fly[2], 5), 0.95, T4));
    }
    // glossy highlight band across the hair, broken into dashes between strands
    const isHair = (c) => c === H4[1] || c === H4[2] || c === H4[3];
    const x0 = Math.round((hx - 10.5) * K), x1 = Math.round((hx + 10.5) * K);
    for (let X = x0; X < x1; X++) {
      const lx = (X + 0.5) / K - hx;
      if (((X - x0) % 9) === 0) continue;
      const yb = Math.round((hy + 4.6 + lx * lx * 0.022) * K);
      for (const [dy, c] of [[0, H4[1]], [1, H4[0]], [2, H4[0]], [3, H4[1]]]) if (isHair(b.getP(X, yb + dy))) b.setP(X, yb + dy, c);
    }
  }

  // Back hair: a fan of strands behind her body, shaped by the hairstyle.
  function drawBackHair(b, p, pal, hx, hy) {
    const side = p.view === 'side', T4 = tonesOf(pal.hair), sway = p.sway || 0;
    const bk = styleOf(p.hairStyle).back;
    const n = side ? Math.max(4, Math.round(bk.n * 0.6)) : bk.n;
    const order = [];
    for (let k = 0; k < n; k++) order.push(k);
    order.sort((a, c) => Math.abs(c - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));   // outer strands first
    for (const k of order) {
      const u = side ? -(k / Math.max(1, n - 1)) : (k / (n - 1)) * 2 - 1;
      const j = Math.min(k, n - 1 - k);
      const len = bk.len - (bk.blunt ? 0 : Math.abs(u) * 4 - (j % 2) * 2.2);
      const sp = bk.spread;
      const root = side ? [hx - 1 + u * 9, hy + 7] : [hx + u * 10.5, hy + 9];
      const mid = side ? [hx - 4 + u * 12 + sway, hy + 7 + (len - 7) * 0.45] : [hx + u * (sp - 0.4) + sway * 0.6, hy + 9 + (len - 9) * 0.45];
      let tipX = side ? hx - 6 + u * 11 + sway * 2 : hx + u * sp + Math.sign(u) * (!bk.blunt && j % 3 === 0 ? 1.6 : 0) + sway * 1.5;
      if (bk.inward && !side) tipX = hx + u * (sp - 3.4);
      part(b, null, (t) => strand(t, curve(root, mid, [tipX, hy + len], 8, bk.wave ? (u < 0 ? -bk.wave : bk.wave) : 0), side ? bk.w * 0.9 : bk.w, T4, bk.blunt));
    }
  }

  // ---------------------------------------------------------------- skeleton presets
  // arm/leg presets are [elbow|knee, hand|ankle] offsets from the shoulder/hip
  const ARMS = {
    down: [[2.0, 4.3], [3.7, 8.4]], out: [[3, 3], [6, 5]], wave1: [[4, -2], [8, -6]], wave2: [[4, -3], [6, -8]],
    up: [[3, -4], [6, -8]], hip: [[4.7, 3.1], [2.3, 7.8]], chin: [[2, 4], [-1, -1]], eyes: [[2, 4], [-2, -4]],
    point: [[4, 1], [9, 0]], hold: [[2, 5], [6, 5]], swingF: [[2, 4], [4, 9]], swingB: [[-2, 4], [-4, 9]],
    flail: [[4, -3], [8, -6]], heart: [[2, 4], [-1, 2]], type: [[2, 5], [6, 4]], back: [[-1, 5], [-3, 9]],
  };
  const LEGS = {
    stand: [[0.5, 5.4], [0.7, 10.6]], apart: [[0.9, 5.4], [1.7, 10.6]],
    stepF: [[2, 5], [4, 10.5]], stepB: [[-1.5, 5], [-4, 10]], pass: [[1.5, 4.5], [0, 9]],
    runF: [[4, 4], [7, 9]], runB: [[-3, 5], [-7, 8]], runUp: [[4, 3], [2, 7]],
    sit: [[0.6, 2.5], [1, 9]], tuck: [[3, 3], [0, 6]], dangle: [[0.5, 5.5], [1, 11]], kneel: [[3, 4], [-2, 6]],
  };

  // ---------------------------------------------------------------- the character
  function drawZinx(pose, palKey) {
    const pal = palOf(palKey);
    const p = Object.assign({ view: 'front', bob: 0, dx: 0, eyes: 'open', mouth: 'smile', armA: 'down', armB: 'down', legA: 'stand', legB: 'stand' }, pose);
    const side = p.view === 'side';
    const ox = CX + p.dx, oy = p.bob;
    const B4 = pal.suit || pal.body;
    const body = new Buf();
    const fx = new Buf();

    const shA = side ? [ox - 0.5, 31.4 + oy] : [ox - 3.9, 31.4 + oy];
    const shB = side ? [ox - 0.5, 31.4 + oy] : [ox + 3.9, 31.4 + oy];
    const hipA = side ? [ox - 1.6, 41.6 + oy] : [ox - 2.5, 42.6 + oy];
    const hipB = side ? [ox - 0.4, 41.6 + oy] : [ox + 2.5, 42.6 + oy];
    const mirror = (o, s) => [o[0] * s, o[1]];
    const joint = (base, preset, table, s, leg) => {
      const v = Array.isArray(preset) ? preset : table[preset] || table.down || table.stand;
      const k = leg ? (side ? 1.03 : 0.95) : 1;
      const e = mirror(v[0], s), h = mirror(v[1], s);
      const end = [base[0] + h[0], base[1] + h[1] * k];
      if (leg && oy > 0) end[1] -= oy; // feet stay planted when she bobs down
      return [base, [base[0] + e[0], base[1] + e[1] * k], end];
    };
    // front view: A is viewer's left (mirrored), B viewer's right. side view: A is the far limb.
    const sA = side ? 1 : -1, sB = 1;
    const armA = joint(shA, p.armA, ARMS, sA), armB = joint(shB, p.armB, ARMS, sB);
    const legA = joint(hipA, p.legA, LEGS, sA, true), legB = joint(hipB, p.legB, LEGS, sB, true);
    const dark = [B4[2], B4[2], B4[3], B4[3]];
    const L = pal.line;

    // shapely leg: thick thigh, slim knee, calf, ankle, small foot
    const drawLeg = (t, [hip, knee, ankle], tones, sgn) => {
      const thigh = [hip[0] + (knee[0] - hip[0]) * 0.45, hip[1] + (knee[1] - hip[1]) * 0.45];
      const calf = [knee[0] + (ankle[0] - knee[0]) * 0.3, knee[1] + (ankle[1] - knee[1]) * 0.3];
      t.limb([hip, thigh, knee, calf, ankle], side ? [2.9, 2.3, 1.35, 1.65, 0.9] : [2.95, 2.0, 1.1, 1.3, 0.75], tones);
      // foot: a little shoe, wider than the ankle, toes pointing out (forward in side view)
      // mirror-exact pixel for the left foot so both feet match
      const ax = side ? Math.round(ankle[0]) : sgn > 0 ? Math.floor(ankle[0]) : LW - 1 - Math.floor(LW - ankle[0]), ay = Math.round(ankle[1]);
      const shoe = { L: tones[1], M: tones[2], D: tones[3] };
      if (side) t.glyph(ax - 1, ay, ['LMM.', 'MDDD'], shoe);
      else if (sgn > 0) t.glyph(ax - 1, ay, ['LMD.', 'MDDD'], shoe);
      else t.glyph(ax - 2, ay, ['.LMD', 'DDDM'], shoe);
    };
    // front-view standing legs: straight inner edge with a thin gap, outer edge
    // tapering from the hip to a flat rounded foot, glowing line down each leg
    const drawStandLeg = (t, sgn) => {
      const pts = [[1.05, 42.6], [5.1, 42.6], [5.2, 44.4], [4.7, 46.8], [4.05, 49.6], [3.55, 52.2], [3.35, 53.7], [2.95, 55], [1.4, 55], [1.05, 53.8]];
      t.poly(pts.map(([x, y]) => [ox + sgn * x, y + Math.min(0, oy)]), (x, y) => {
        const d = Math.abs(x + 0.5 - ox);         // distance from her center line
        const outer = d > (y < 47 ? 4.1 : 3.0);
        if (y >= 54) return B4[3];                  // sole
        if (sgn < 0) return outer ? B4[1] : d < 2.2 ? B4[2] : B4[1];
        return outer ? B4[3] : d < 2.2 ? B4[2] : B4[1];
      });
    };
    const standing = (k) => k === 'stand' || k === 'apart';
    const drawArm = (t, arm, tones) => {
      t.limb(arm, side ? [1.55, 1.1, 0.95] : [1.3, 1.1, 1.0], tones);
      t.limb([arm[2], arm[2]], side ? [1.2, 1.2] : [1.3, 1.3], tones);
    };
    // pixel column for an x position, mirror-exact on the left side
    const colOf = (x, sgn) => sgn > 0 ? Math.floor(x) : LW - 1 - Math.floor(LW - x);

    drawBackHair(body, p, pal, ox + (side ? -1 : 0), 6 + oy);
    // far limbs in side view sit behind the body
    if (side) { drawLeg(body, legA, dark, 1); drawArm(body, armA, dark); }

    // torso: hourglass with a bust and round hips
    const T = (pts) => pts.map(([x, y]) => [x + ox, (side ? 30.4 + (y - 30.4) * 0.86 : y) + oy]);
    const torso = side
      ? T([[-3, 30.5], [1.5, 30.5], [3.4, 32], [5.8, 34.2], [5, 36.6], [2.1, 37.8], [2, 39.5], [2.9, 42], [2.4, 44.6], [-1, 45.6], [-5.6, 45.2], [-7, 42.6], [-5, 39.6], [-3.1, 38.4], [-3.2, 36], [-3.6, 33]])
      : T([[-2.2, 29.6], [2.2, 29.6], [3.8, 30.8], [4.7, 32.4], [5.2, 34.2], [4.4, 36.4], [3.2, 37.9], [2.8, 39.1], [3.4, 40.4], [4.6, 41.7], [5.4, 43], [5.3, 44.1], [1.2, 45], [0, 44.8], [-1.2, 45], [-5.3, 44.1], [-5.4, 43], [-4.6, 41.7], [-3.4, 40.4], [-2.8, 39.1], [-3.2, 37.9], [-4.4, 36.4], [-5.2, 34.2], [-4.7, 32.4], [-3.8, 30.8]]);
    part(body, pal.outline, (t) => {
      t.poly(torso, (x, y) => {
        const rel = (x + 0.5 - ox) / (side ? 4.5 : 6);
        if (side && rel < -0.55 && y > 37 + oy) return B4[2];  // the booty catches a little light
        if (!side) return rel < -0.55 ? B4[1] : rel > 0.55 ? B4[3] : B4[2];
        return rel < -0.42 ? B4[1] : rel > 0.45 ? B4[3] : B4[2];
      });
      if (side) {
        t.set(ox + 3, 33 + oy, B4[1]); t.set(ox + 4, 33 + oy, B4[0]); t.set(ox + 4, 32 + oy, B4[1]); t.rect(ox + 1, 35 + oy, 5, 1, B4[3]);  // bust
        t.set(ox - 6, 39 + oy, B4[1]); t.set(ox - 6, 40 + oy, B4[0]); t.set(ox - 5, 41 + oy, B4[1]);          // booty shine
      } else {
        // (hip highlight now comes from the thigh shading)
      }
    });
    if (!side) {
      // legs blend into the hips; a line only where the two legs meet
      part(body, null, (t) => standing(p.legA) ? drawStandLeg(t, -1) : drawLeg(t, legA, B4, -1));
      part(body, null, (t) => standing(p.legB) ? drawStandLeg(t, 1) : drawLeg(t, legB, B4, 1));
    }
    // hologram lines on the suit
    if (!side) {
      // both sides at once: dx counts columns out from her center line
      const sym = (dx, y, c) => { body.set(ox + dx, y + oy, c); body.set(ox - 1 - dx, y + oy, c); };
      // bust: two soft rounded shapes and a cleavage line
      for (const sgn of [-1, 1]) {
        const cx = ox + sgn * 2.4, cy = 33.6 + oy;
        body.each(cx - 3.5, cy - 3, cx + 3.5, cy + 3, (x, y) => {
          const nx = (x + 0.5 - cx) / 2.75, ny = (y + 0.5 - cy) / 2.3;
          if (nx * nx + ny * ny > 1) return null;
          if (ny > 0.2 && nx * nx + ny * ny > 0.55) return B4[3];
          return B4[2];
        });
      }
      sym(1, 32, B4[1]); sym(2, 32, B4[1]); sym(1, 33, B4[1]);   // the light catches the top of each curve
      sym(0, 31, B4[3]); sym(0, 32, B4[3]); sym(0, 33, B4[3]); sym(0, 34, pal.outline);  // cleavage line
      // glowing hologram lines: shoulders, around the bust, a diamond on the belly, down the legs
      const lines = [[2, 30], [3, 31], [4, 32], [4, 33], [4, 35], [3, 36], [2, 37], [1, 38], [1, 39], [2, 40], [3, 41], [4, 42], [4, 43]];
      if (standing(p.legA) && standing(p.legB)) lines.push([3, 44], [3, 45], [3, 46], [2, 47], [2, 48], [2, 49], [1, 50], [2, 51], [2, 52]);
      for (const [dx, y] of lines) sym(dx, y, B4[0]);
    } else {
      body.set(ox, 31 + oy, L); body.set(ox + 1, 32 + oy, L); body.set(ox - 1, 39 + oy, L); body.set(ox, 40 + oy, L);
      part(body, pal.outline, (t) => drawLeg(t, legB, B4, 1));
    }
    // neck + head
    body.rect(ox - 1, 27 + oy, 2, 4, pal.body[2]);
    part(body, pal.outline, (t) => drawHead(t, p, pal, ox + (side ? -1 : 0), 6 + oy));
    // arms in front
    const armLines = (t, arm, sgn) => {
      for (const u of [0.35, 0.7]) for (const [a, b] of [[arm[0], arm[1]], [arm[1], arm[2]]]) {
        const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
        t.set(colOf(x + sgn * 0.3, sgn), Math.floor(y + 0.5), B4[0]);
      }
    };
    if (!side) part(body, pal.outline, (t) => { drawArm(t, armA, B4); armLines(t, armA, -1); }, [[shA[0], shA[1], 2.4]]);
    part(body, pal.outline, (t) => { drawArm(t, armB, B4); if (!side) armLines(t, armB, 1); }, [[shB[0], shB[1], 2.4]]);

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
  

  // ---------------------------------------------------------------- animations
  const ANIMS = {
    idle:  { frames: 4, fps: 3, pose: f => ({ bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open', armA: 'down', armB: 'down', sway: [0, 0.4, 0, -0.4][f] }) },
    walk:  { frames: 4, fps: 8, pose: f => ({ view: 'side', sway: [-1, -1.4, -1, -0.6][f], bob: f % 2 ? -1 : 0, legA: ['stepB', 'pass', 'stepF', 'stand'][f], legB: ['stepF', 'stand', 'stepB', 'pass'][f], armA: ['swingF', 'down', 'swingB', 'down'][f], armB: ['swingB', 'down', 'swingF', 'down'][f] }) },
    run:   { frames: 4, fps: 12, pose: f => ({ view: 'side', sway: [-2, -2.6, -2, -1.6][f], dx: 1, bob: f % 2 ? -1 : 0, legA: ['runB', 'runUp', 'runF', 'stand'][f], legB: ['runF', 'stand', 'runB', 'runUp'][f], armA: f < 2 ? 'swingF' : 'swingB', armB: f < 2 ? [[-2, 3], [-1, 7]] : [[3, 3], [5, 5]], mouth: 'grin' }) },
    wave:  { frames: 4, fps: 6, pose: f => ({ armB: f % 2 ? 'wave2' : 'wave1', armA: 'hip', eyes: 'happy', mouth: 'open' }) },
    talk:  { frames: 4, fps: 7, pose: f => ({ mouth: ['smile', 'open', 'smile', 'o'][f], armB: f % 2 ? 'hold' : 'down', armA: 'hip' }) },
    point: { frames: 2, fps: 3, pose: f => ({ armB: 'point', armA: 'hip', eyes: f ? 'open' : 'wink', mouth: 'grin' }) },
    think: { frames: 4, fps: 3, pose: f => ({ armB: 'chin', armA: 'heart', eyes: 'open', mouth: 'flat', fx: [['q', 42, 2 + (f % 2), 'line']] }) },
    cheer: { frames: 4, fps: 8, pose: f => ({ bob: [0, -3, -4, -2][f], legA: f ? 'tuck' : 'stand', legB: f ? 'tuck' : 'stand', armA: 'up', armB: 'up', eyes: 'happy', mouth: 'open', fx: f % 2 ? [['spark', 4, 6, 'line'], ['spark2', 46, 10, '#ffffff']] : [['spark2', 6, 10, '#ffffff'], ['spark', 44, 4, 'line']] }) },
    sit:   { frames: 4, fps: 3, footY: 44, pose: f => ({ legA: 'sit', legB: 'sit', armA: [[1, 5], [2, 9]], armB: [[1, 5], [2, 9]], bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open' }) },
    sleep: { frames: 4, fps: 2, lie: true, pose: f => ({ eyes: 'closed', mouth: 'o', armA: 'down', armB: 'down', legB: 'apart', bob: 0, fx: [['z', 14, 27 - f, 'line'], ['zBig', 19, 20 - (f % 2), 'line']].slice(0, 1 + (f % 2)) }) },
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
  Object.keys(ANIMS).forEach(k => { const a = ANIMS[k]; if (a.loop === undefined) a.loop = true; a.footY = ((a.footY || GROUND) + 1) * K - 1; });

  // ---------------------------------------------------------------- rendering
  // lying poses are drawn standing, then turned on their side
  function lieDown(buf) {
    const out = new Buf();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = buf.getP(x, y);
      if (!c) continue;
      // rotate -90deg: head to the left, feet to the right, resting on the ground
      const nx = y, ny = (W - 1 - x) + (GROUND - 40) * K;
      out.setP(nx, ny, c);
    }
    return out;
  }
  const cache = new Map();
  function frameRGBA(anim, frame, pal, hair, face) {
    const a = ANIMS[anim] || ANIMS.idle;
    const f = ((frame % a.frames) + a.frames) % a.frames;
    const key = anim + '|' + f + '|' + pal + '|' + (hair || 'layered') + '|' + (face || 'sparkle');
    let px = cache.get(key);
    if (!px) {
      const pose = Object.assign({ hairStyle: hair || 'layered', face: face || 'sparkle' }, a.pose(f));
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
  function draw(ctx, { anim = 'idle', frame = 0, pal = 'red', hair = 'layered', face = 'sparkle', x = 0, y = 0, scale = 4, flip = false }) {
    if (!scratch) scratch = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const sctx = scratch.getContext('2d');
    const img = sctx.createImageData(W, H);
    img.data.set(frameRGBA(anim, frame, pal, hair, face));
    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(x + W * scale, y); ctx.scale(-1, 1); ctx.drawImage(scratch, 0, 0, W * scale, H * scale); }
    else ctx.drawImage(scratch, x, y, W * scale, H * scale);
    ctx.restore();
  }

  const HAIRS = Object.fromEntries(Object.entries(HAIR_STYLES).map(([k, v]) => [k, v.name]));
  const FACE_NAMES = Object.fromEntries(Object.entries(FACES).map(([k, v]) => [k, v.name]));
  const api = { W, H, GROUND, PALETTES, HAIRS, FACES: FACE_NAMES, ANIMS, frameRGBA, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZinxChibi = api;
})(typeof window !== 'undefined' ? window : globalThis);
