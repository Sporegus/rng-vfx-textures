// Zinx, chibi desktop-pet edition (Shimeji style): pixel art, about two heads
// tall, with a big kawaii anime face and clumped, glossy anime hair.
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
    red:     { name: 'Red', suit: ['#ffd0ce', '#ff7a78', '#e6404f', '#b3213a'], outline: '#5a0614', body: ['#fff1f0', '#ffcbc8', '#f7a09d', '#e06470'],
               skin: ['#fffaf7', '#ffe6de', '#f8c3b8', '#e3968c'], hair: ['#ffb0ac', '#ff4450', '#d81e34', '#9a1028'], hairLine: '#64061a',
               lash: '#2b0610', iris: ['#4a0614', '#a8132b', '#ee3049', '#ffa3ab'], mouth: '#9c2436', mouthIn: '#c63a50', line: '#ffd2d0', tear: '#ffd6e0', cheek: '#ff9aa6', tie: '#2b0a12', tieHi: '#6b2232' },
    cortana: { name: 'Blue + red hair', suit: ['#c4f3ff', '#5fb0ff', '#2f7fe6', '#1d55b8'], outline: '#0b2a7d', body: ['#eaf7ff', '#b4defc', '#7fbdf2', '#4d8fdc'],
               skin: ['#f2fbff', '#cfeaff', '#97c8f4', '#5f98dc'], hair: ['#ffb0ac', '#ff4450', '#d81e34', '#9a1028'], hairLine: '#64061a',
               lash: '#0a1a55', iris: ['#0a1b5e', '#1f55cf', '#4a96ff', '#a6dcff'], mouth: '#2a5ad0', mouthIn: '#4a7ae0', line: '#e2f4ff', tear: '#e2f4ff', cheek: '#ff9ab0', tie: '#12163a', tieHi: '#3a4180' },
    blue:    { name: 'Blue', suit: ['#c4f3ff', '#5fb0ff', '#2f7fe6', '#1d55b8'], outline: '#0b2a7d', body: ['#eaf7ff', '#b4defc', '#7fbdf2', '#4d8fdc'],
               skin: ['#f2fbff', '#cfeaff', '#97c8f4', '#5f98dc'], hair: ['#b4e6ff', '#3f94ff', '#2363e0', '#163fae'], hairLine: '#0c2470',
               lash: '#0a1a55', iris: ['#0a1b5e', '#1f55cf', '#4a96ff', '#a6dcff'], mouth: '#2a5ad0', mouthIn: '#4a7ae0', line: '#e2f4ff', tear: '#e2f4ff', cheek: '#9fd2ff', tie: '#0b1f5c', tieHi: '#3355aa' },
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
  // Anime chibi head: big clumps of hair with dark lines between them and a
  // glossy ring, and large kawaii eyes. Back hair is drawn behind the body by
  // drawBackHair; everything else here. view: 'front' or 'side' (facing right)

  // a clump of hair: wide at the root, sweeping to a sharp point
  function clump(b, pts, w, H4, opt) {
    opt = opt || {};
    const n = pts.length;
    const radii = pts.map((_, i) => { const t = i / (n - 1); return Math.max(0.3, w * (opt.blunt ? 1 - t * 0.12 : Math.pow(1 - t, 0.8))); });
    b.limb(pts, radii, [null, H4[1], H4[2], H4[3]], opt.shade || [-0.7, 0.55]);
  }
  // smooth 3-point curve sampled into a polyline; `wave` adds an S-wiggle
  function curve(a, c, z, steps = 10, wave = 0) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * z[0] + Math.sin(t * Math.PI * 2) * wave * t, u * u * a[1] + 2 * u * t * c[1] + t * t * z[1]]);
    }
    return out;
  }
  // draw on its own layer; a dark line forms where it lies over other hair
  // (and an `edge` line where it lies over anything else)
  function layer(dst, fn, hairCols, line, edge) {
    const b = new Buf(); fn(b);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      if (b.getP(X, Y) || !nearP(b, X, Y)) continue;
      const c = dst.getP(X, Y);
      if (c && hairCols.has(c)) dst.setP(X, Y, line); else if (c && edge) dst.setP(X, Y, edge);
    }
    for (let i = 0; i < b.p.length; i++) if (b.p[i]) dst.p[i] = b.p[i];
  }

  // ---- faces. Eye glyphs are real pixels, 11 x 12, the eye on her left
  // (the viewer's right); the other eye is mirrored. Outer corner on the right.
  // K lash, P/D/M/B iris from dark to bright, W shine, S white of the eye, k lower lash
  const EW = 11;
  const EYES_SHARED = {
    closed: ['', '', '', '', '', '', 'K.........K', '.KKKKKKKKK.', '...........'],
    happy:  ['', '', '', '', '', '....KKK....', '..KK...KK..', '.K.......K.', 'K.........K'],
    cry:    ['', '', '', '', '', '', 'KKKKKKKKKKK', '.KK.....KK.', '...........'],
    x:      ['', '', '', '..K.....K..', '...K...K...', '....K.K....', '.....K.....', '....K.K....', '...K...K...', '..K.....K..'],
  };
  EYES_SHARED.blink = EYES_SHARED.closed;
  const FACES = {
    sparkle: { name: 'Sparkle', mouth: 'cat', blush: 'oval', brow: 'soft', eye: [
      '........KK.',
      '..KKKKKKKK.',
      '.KKKKKKKKKK',
      'KKPPPPPPPKK',
      'KPWWWPPPDPK',
      'SDWWWDDDDDS',
      'SDWWDDDDDDS',
      'SMDDDDDDDMS',
      'SMMMMMMMMMS',
      'SMMMMMMWWMS',
      '.SMBBBBBMS.',
      '..SBBBBBS..',
      '...kkkkk...'] },
    gentle: { name: 'Gentle', mouth: 'smile', blush: 'lines', brow: 'soft', eye: [
      '...........',
      '...........',
      '...KKKKKK..',
      '.KKKKKKKKK.',
      'KKKDDDDDKKK',
      'KDWWDDDDDDK',
      'SDWWDDDDDDS',
      'SMDDDDDDDMS',
      'SMMMMMMMWMS',
      'SMMBBBBBMMS',
      '.SMBBBBBMS.',
      '..SSSSSSkk.',
      '.........k.'] },
    cheeky: { name: 'Cheeky', mouth: 'smirk', blush: 'oval', brow: 'soft', eye: [
      '..........K',
      '.........K.',
      '....KKKKKKK',
      '..KKKKKKKKK',
      'KKKDDDDDDKK',
      'SDWWDDDDDDS',
      'SDWWDDDDDDS',
      'SMDDDDDDDMS',
      'SMMMMMMMWMS',
      'SMMBBBBBMMS',
      '.SMBBBBBMS.',
      '..SSBBBSS..',
      '.....kkk...'] },
    tsun: { name: 'Tsundere', mouth: 'o', blush: 'lines', brow: 'angry', eye: [
      '...........',
      '.......KKKK',
      '....KKKKKKK',
      '.KKKKKKKKKK',
      'KKKDDDDDDKK',
      'SDWWDDDDDDS',
      'SDWWDDDDDDS',
      'SMDDDDDDDMS',
      'SMMMMMMMWMS',
      'SMMBBBBBMMS',
      '.SMBBBBBMS.',
      '..SSBBBSS..',
      '...........'] },
  };
  // brows: [dx, dy] pixels from the eye's left edge, 3 rows above the eye
  const BROWS = {
    soft:    [[1, 1], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 1]],
    angry:   [[1, 2], [2, 2], [3, 1], [4, 1], [5, 0], [6, 0], [7, 0]],
    worried: [[1, 0], [2, 0], [3, 1], [4, 1], [5, 1], [6, 2], [7, 2]],
  };
  // mouths are pixel glyphs centered on her middle: M line, I inside, T tongue, W fang
  const MOUTHS = {
    smile: ['M....M', '.MMMM.'],
    cat:   ['M..MM..M', '.MM..MM.'],
    smirk: ['......M', 'MMMMMM.'],
    fang:  ['M....M', '.MMMM.', '.W....'],
    open:  ['.MMMM.', 'MIIIIM', 'MITTIM', '.MMMM.'],
    o:     ['.MM.', 'MIIM', '.MM.'],
    grin:  ['MMMMMMMM', '.MIIIIM.', '..MMMM..'],
    frown: ['.MMMM.', 'M....M'],
    wail:  ['MMMMMMMM', 'MIIIIIIM', 'MITTTTIM', '.MMMMMM.'],
    flat:  ['MMMM'],
    tongue:['.MMMM.', 'MIITIM', '.MTTM.'],
  };

  // ---- hairstyles. Clumps are [rootX, rootY, bendX, bendY, tipX, tipY, width]
  // relative to the top of her head; clumps off-center are mirrored unless `asym`.
  const LONG_BANGS = [[10.2, 4, 12.8, 10, 10.6, 19, 2.5], [7.2, 1, 10.4, 6, 8.2, 14.2, 2.9], [3.8, -0.4, 6.2, 4.5, 4.2, 10.4, 3.0], [0, -0.8, 0, 5, 0, 10.8, 2.6]];
  const SWEPT_BANGS = [[-10.2, 4, -12.8, 10, -10.6, 17, 2.5], [10.2, 4, 12.8, 10, 10.8, 18, 2.5], [-7.2, 1, -9.4, 6, -7.6, 12.4, 2.8], [7.8, 1.2, 11, 6.5, 9.6, 14.2, 2.8], [-3.8, -0.4, -2.6, 5, -1.2, 10.4, 3.0], [-0.6, -0.8, 3.4, 3.6, 6.6, 10.8, 3.1]];
  const HAIR_STYLES = {
    long:  { name: 'Long', bangs: LONG_BANGS, locks: [[10, 7, 13.8, 16, 11.4, 30, 2.8]], back: { n: 6, len: 39, spread: 14.6, w: 4.2 }, fly: true },
    twin:  { name: 'Twin tails', bangs: LONG_BANGS.slice(1).concat(), outer: [10.4, 4, 12, 9.5, 11.4, 16.5, 2.2], locks: [[10.2, 7, 12, 13, 11.2, 21, 2.2]], back: { n: 5, len: 20, spread: 12, w: 3.8 }, tails: true, fly: true },
    bob:   { name: 'Bob', bangs: SWEPT_BANGS, asym: true, locks: [[11.2, 5.5, 15, 14, 10.6, 23.5, 3.4]], back: { n: 5, len: 22, spread: 13, w: 4.2, inward: true } },
    wavy:  { name: 'Wavy', bangs: SWEPT_BANGS, asym: true, locks: [[10, 7, 14.2, 17, 12, 31, 2.8, 1.3]], back: { n: 6, len: 40, spread: 15.2, w: 4.1, wave: 1.6 }, fly: true },
  };
  HAIR_STYLES.twin.bangs = [HAIR_STYLES.twin.outer].concat(LONG_BANGS.slice(1));
  const styleOf = (k) => HAIR_STYLES[k] || HAIR_STYLES.long;
  // side view (facing right): front bangs, then the crown sweeping back
  const SIDE_BANGS = [[-3, 0.5, 1, 5, 2.5, 11, 2.6], [0, -0.2, 4, 4, 5.5, 10.6, 2.6], [3, 0.8, 6.6, 5, 7.8, 11.4, 2.4], [5.5, 2.5, 8.6, 8, 8.4, 14, 2.0]];
  const SIDE_CROWN = [[2.5, 0.5, -4, 1, -9, 6.5, 2.4], [0, 1, -7, 6, -12.5, 11.5, 2.8], [1, 0, -6, 3, -11.5, 15.5, 2.8], [-1.5, 1, -8, 10, -11, 19.5, 2.6]];

  function drawHead(b, p, pal, hx, hy) {
    const side = p.view === 'side';
    const H4 = pal.hair, F4 = pal.skin || pal.body, OL = pal.outline, sway = p.sway || 0;
    const st = styleOf(p.hairStyle), face = FACES[p.face] || FACES.sparkle;
    const hairCols = new Set([...H4, pal.hairLine]);
    const C = (pts, w, opt, edge) => layer(b, (t) => clump(t, pts, w, H4, opt), hairCols, pal.hairLine, edge);
    // draw a clump list, mirroring off-center clumps unless asym
    const clumps = (list, asym, edge, tipSway = 0) => {
      for (const [rx, ry, cx, cy, tx, ty, w, wave = 0] of list) {
        const sides = asym || rx === 0 ? [1] : [-1, 1];
        for (const s of sides) C(curve([hx + s * rx, hy + ry], [hx + s * cx, hy + cy], [hx + s * tx + tipSway, hy + ty], 10, s * wave), w, null, edge);
      }
    };
    const hcx = side ? hx - 0.5 : hx, hcy = hy + 10.5, hrx = 12.4, hry = 11.8;
    const fcx = side ? hx + 4 : hx, fcy = hy + 14.2, frx = side ? 7.4 : 9.3, fry = 9.1;

    // twin tails tied high on the head sit behind it
    if (st.tails) {
      for (const s of side ? [-1] : [-1, 1]) {
        const tx = side ? hx - 6 : hx + s * 10.2, d = side ? -1 : s;
        const tail = (a, c, z, w, wave) => C(curve([tx + d * a[0], hy + a[1]], [tx + d * c[0], hy + c[1]], [tx + d * z[0] + sway * 1.6, hy + z[1]], 12, d * wave), w);
        tail([1.4, 1.6], [10, 4], [10.6, 21], 2.6, 0.6);        // outer flick
        tail([0.4, 2.2], [9.4, 9], [7, 35], 4.2, 1.2);          // main tail
        tail([0, 2.6], [6, 12], [3.6, 29], 3.0, 0.8);           // inner lock
      }
    }
    // cranium, lit from the upper left
    b.each(hx - 14, hy - 2, hx + 14, hy + 23, (x, y) => {
      const nx = (x + 0.5 - hcx) / hrx, ny = (y + 0.5 - hcy) / hry;
      if (nx * nx + ny * ny > 1) return null;
      const v = nx * 0.6 + ny * 0.8;
      return v < -0.45 ? H4[1] : v > 0.5 ? H4[3] : H4[2];
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
    const glyphFor = (k) => EYES_SHARED[k] || face.eye;
    const I4 = pal.iris;
    const ec = { K: pal.lash, P: I4[0], D: I4[1], M: I4[2], B: I4[3], W: '#ffffff', S: '#ffffff', k: F4[3] };
    const eyeY = Yp(hy + 11.5);
    const browKind = p.eyes === 'angry' ? 'angry' : p.eyes === 'sad' ? 'worried' : face.brow;
    if (side) {
      b.glyphP(Xp(fcx + 0.6), eyeY, glyphFor(p.eyes === 'wink' ? 'happy' : p.eyes).map(r => r.slice(2, 10)), ec);
    } else {
      const rx = Xp(hx) + 3, lx = W - 1 - (rx + EW - 1);   // mirror-exact
      b.glyphP(rx, eyeY, glyphFor(p.eyes === 'wink' ? 'happy' : p.eyes), ec);
      b.glyphP(lx, eyeY, glyphFor(p.eyes === 'wink' ? 'open' : p.eyes), ec, true);
      for (const [dx, dy] of BROWS[browKind]) {
        b.setP(rx + dx, eyeY - 4 + dy, H4[3]); b.setP(W - 1 - (rx + dx), eyeY - 4 + dy, H4[3]);
      }
      // blush: soft ovals or kawaii diagonal lines
      if (p.blush || ['open', 'happy', 'wink', 'angry', undefined].includes(p.eyes)) {
        const dots = face.blush === 'lines'
          ? [[1, 1], [2, 0], [4, 1], [5, 0], [7, 1], [8, 0]]
          : [[2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]];
        for (const [dx, dy] of dots) { b.setP(rx + 4 + dx, eyeY + 14 + dy, pal.cheek); b.setP(W - 1 - (rx + 4 + dx), eyeY + 14 + dy, pal.cheek); }
      }
    }
    // mouth, centered on the real-pixel seam at her middle
    const mk = (p.mouth === 'smile' || !p.mouth) ? face.mouth : p.mouth;
    const mg = MOUTHS[mk] || MOUTHS.smile;
    const mx = side ? Xp(fcx + 5) - 2 : Xp(hx) - Math.floor(mg[0].length / 2), my = Yp(hy + 20);
    b.glyphP(mx, my, mg, { M: pal.mouth, I: pal.mouthIn || pal.mouth, T: pal.cheek, W: '#ffffff' });

    // ---- bangs, side locks
    if (side) {
      clumps(SIDE_CROWN, true, null, sway * 0.4);
      clumps(SIDE_BANGS, true, OL);
      const long = st.back.len > 30;
      C(curve([hx - 2, hy + 7], [hx - 3.5, hy + 16], [hx - 2.5 + sway * 0.6, hy + (long ? 25 : 20)]), 2.4);
    } else {
      clumps(st.bangs, st.asym, OL);
      for (const s of [-1, 1]) for (const [rx, ry, cx, cy, tx, ty, w, wave = 0] of st.locks) {
        C(curve([hx + s * rx, hy + ry], [hx + s * cx, hy + cy], [hx + s * tx + sway * (ty > 24 ? 1 : 0.5), hy + ty], 10, s * wave), w, null, OL);
      }
    }
    // a little antenna strand on top
    if (st.fly) {
      const fly = side ? [[hx - 1, hy - 0.4], [hx + 0.5, hy - 4.5], [hx + 4, hy - 4.2]] : [[hx - 0.5, hy - 0.4], [hx + 0.2, hy - 4.6], [hx + 3.8, hy - 4.4]];
      part(b, OL, (t) => clump(t, curve(fly[0], fly[1], fly[2], 8), 0.8, H4));
    }
    // hair ties for the twin tails
    if (st.tails) {
      const bow = ['.TTT....TTT.', 'TTKTT..TTKTT', 'TKKTTTTTTKKT', 'TKTTTKKTTTKT', 'TTTTTKKTTTTT', '.TTT.TT.TTT.', '....TT.TT...', '...TT...TT..'];
      const bc = { T: pal.tie, K: pal.tieHi };
      if (side) b.glyphP(Math.round((hx - 7) * K) - 6, (hy + 0.5) * K, bow, bc);
      else { const bx = Math.round((hx + 10.2) * K) - 6; b.glyphP(bx, (hy + 0.5) * K, bow, bc); b.glyphP(W - 12 - bx, (hy + 0.5) * K, bow, bc, true); }
    }
    // glossy ring of shine: lens-shaped glints across the clumps
    const ringY = (lx) => hy + 4.6 + lx * lx * 0.024;
    const per = 7;
    for (let X = Math.round((hx - 11.5) * K); X < Math.round((hx + 11.5) * K); X++) {
      const lx = (X + 0.5) / K - hx;
      const ph = ((side ? X : Math.abs(X + 0.5 - hx * K)) % per) / per;
      const th = 1.9 * K * Math.sin(Math.PI * ph);
      const yc = ringY(lx) * K;
      for (let Y = Math.floor(yc - th / 2); Y <= Math.ceil(yc + th / 2); Y++) {
        const c = b.getP(X, Y);
        if (Math.abs(Y + 0.5 - yc) > th / 2 || (c !== H4[1] && c !== H4[2])) continue;
        b.setP(X, Y, Math.abs(Y + 0.5 - yc) < th / 4 ? H4[0] : H4[1]);
      }
    }
  }

  // Back hair: big clumps behind her body, shaped by the hairstyle.
  function drawBackHair(b, p, pal, hx, hy) {
    const side = p.view === 'side', H4 = pal.hair, sway = p.sway || 0;
    const hairCols = new Set([...H4, pal.hairLine]);
    const bk = styleOf(p.hairStyle).back;
    const n = side ? Math.max(4, Math.round(bk.n * 0.6)) : bk.n;
    const order = [];
    for (let k = 0; k < n; k++) order.push(k);
    order.sort((a, c) => Math.abs(a - (n - 1) / 2) - Math.abs(c - (n - 1) / 2));   // inner clumps first
    if (!side && bk.len > 24) {
      const top = hy + 9, bot = hy + bk.len - 5, sp = bk.spread - 2.2;
      b.poly([[hx - 9, top], [hx + 9, top], [hx + sp, bot - 6], [hx + sp - 1.5, bot], [hx - sp + 1.5, bot], [hx - sp, bot - 6]], () => H4[3]);
    }
    for (const k of order) {
      const u = side ? -(k / Math.max(1, n - 1)) : (k / (n - 1)) * 2 - 1;
      const j = Math.min(k, n - 1 - k);
      const len = bk.len - Math.abs(u) * 3 - (j % 2) * 2.4;
      const sp = bk.spread;
      const root = side ? [hx - 1 + u * 8, hy + 6] : [hx + u * 6.5, hy + 8];
      const mid = side ? [hx - 4 + u * 12 + sway, hy + 6 + (len - 6) * 0.45] : [hx + u * (sp + 0.8) + sway * 0.6, hy + 8 + (len - 8) * 0.5];
      let tipX = side ? hx - 6 + u * 11 + sway * 2 : hx + u * sp + Math.sign(u) * (j % 3 === 0 ? 1.4 : 0) + sway * 1.5;
      if (bk.inward && !side) tipX = hx + u * (sp - 3.6);
      const wave = bk.wave ? (u < 0 ? -bk.wave : bk.wave) : 0;
      layer(b, (t) => clump(t, curve(root, mid, [tipX, hy + len], 12, wave), side ? bk.w * 0.9 : bk.w, H4, { shade: [-0.85, 0.35] }), hairCols, pal.hairLine);
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
    body.rect(ox - 1, 27 + oy, 2, 4, (pal.skin || pal.body)[2]);
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
    angry: { frames: 2, fps: 6, pose: f => ({ armA: 'hip', armB: 'hip', eyes: 'angry', mouth: 'frown', dx: f ? 1 : 0, fx: [['bang', 44, 6, '#ffffff']] }) },
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
    const key = anim + '|' + f + '|' + pal + '|' + (hair || 'long') + '|' + (face || 'sparkle');
    let px = cache.get(key);
    if (!px) {
      const pose = Object.assign({ hairStyle: hair || 'long', face: face || 'sparkle' }, a.pose(f));
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
  function draw(ctx, { anim = 'idle', frame = 0, pal = 'red', hair = 'long', face = 'sparkle', x = 0, y = 0, scale = 4, flip = false }) {
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
