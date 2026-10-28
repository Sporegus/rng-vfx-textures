// Nova sprite engine: a holographic AI in pixel art.
// Every frame is drawn from a "pose" (a little skeleton: where the hands, elbows,
// knees and feet go, plus face, prop and effects), so one file gives us every
// animation in every skin and accessory.
// Works in the browser (window.NovaSprites) and in Node (module.exports).
(function (root) {
  const W = 48, H = 80;
  const GROUND = 78;  // feet touch this row
  const HEAD_TOP = 4; // top of the hair, for placing speech bubbles

  // ---------------------------------------------------------------- skins
  // Each material has 3 tones: [light, mid, shadow]. glow = the accent lights on
  // the suit. holo: true makes her a see-through hologram.
  // body/light/dark are the UI accent colors the menus use.
  const SKINS = {
    holo:   { name: 'Hologram', holo: true, outline: '#0a1f4d',
      skin: ['#b6e2ff', '#72b9ff', '#3e7fe0'], hair: ['#4f74e0', '#2c47a8', '#192c70'], suit: ['#b6e2ff', '#72b9ff', '#3e7fe0'],
      panel: null, boot: ['#6aa5f2', '#4479d6', '#2a52a3'], glow: '#f0fcff', eye: '#ffffff', iris: '#dff6ff', lips: '#3158c4', cheek: '#c9e8ff',
      body: '#55b8ff', light: '#c9f1ff', dark: '#2b74d1', tip: '#9ff3ff' },
    arctic: { name: 'Arctic', outline: '#1d1a33',
      skin: ['#ffe3c8', '#f2bd94', '#c98c68'], hair: ['#fff7dc', '#efd69a', '#c3a160'], suit: ['#ffffff', '#dde1ee', '#a7acc5'],
      panel: ['#55537d', '#33315a'], boot: ['#9599b4', '#686c8c', '#43465f'], glow: '#3fc4f0', eye: '#ffffff', iris: '#2f74d0', lips: '#d8697a', cheek: '#ffb2a3',
      body: '#3fc4f0', light: '#bff0ff', dark: '#2a7fb0', tip: '#3fc4f0' },
    noir:   { name: 'Noir', outline: '#07070d',
      skin: ['#f7dccb', '#e2b49c', '#b07f6b'], hair: ['#55556b', '#2f2f40', '#17171f'], suit: ['#56566c', '#36364a', '#1f1f2c'],
      panel: ['#1a1a26', '#0d0d15'], boot: ['#36364a', '#222230', '#14141d'], glow: '#ff3355', eye: '#ffffff', iris: '#ff3355', lips: '#b0304a', cheek: '#f29aa4',
      body: '#ff3355', light: '#ffc2cc', dark: '#a3162f', tip: '#ff3355' },
    rose:   { name: 'Rose', outline: '#2e1030',
      skin: ['#ffe6d8', '#f5c3aa', '#cf9179'], hair: ['#ffc8e6', '#ff8cc8', '#cf529c'], suit: ['#ffffff', '#f6dcec', '#d3a6c4'],
      panel: ['#6a2c66', '#441a44'], boot: ['#c58ab4', '#93597f', '#633a56'], glow: '#ff4fb0', eye: '#ffffff', iris: '#c43b8f', lips: '#e0567e', cheek: '#ff9fbf',
      body: '#ff4fb0', light: '#ffd0ea', dark: '#b8287c', tip: '#ff4fb0' },
    matrix: { name: 'Matrix', holo: true, outline: '#03240f',
      skin: ['#c7ffd9', '#5ef095', '#22b45a'], hair: ['#3fd477', '#1d9447', '#0e5c2a'], suit: ['#c7ffd9', '#5ef095', '#22b45a'],
      panel: null, boot: ['#47d17c', '#249c51', '#136634'], glow: '#f2fff6', eye: '#ffffff', iris: '#eafff1', lips: '#137a3b', cheek: '#c7ffd9',
      body: '#4ee88a', light: '#d6ffe5', dark: '#1a9e52', tip: '#b5ffd0' },
    gold:   { name: 'Gold', outline: '#2b1700',
      skin: ['#f6d2b4', '#dda57f', '#a8714f'], hair: ['#d8743a', '#a8481e', '#6e2b10'], suit: ['#fff6dc', '#ead9a8', '#bfa36a'],
      panel: ['#6b4a1a', '#45300f'], boot: ['#b78d45', '#8a6528', '#5c4318'], glow: '#ffb300', eye: '#ffffff', iris: '#2f6f3a', lips: '#c04a3a', cheek: '#f0a080',
      body: '#ffb300', light: '#fff0c2', dark: '#b37800', tip: '#ffd23f' },
  };
  const skinOf = (k) => (typeof k === 'object' && k) ? k : (SKINS[k] || SKINS.holo);

  const HATS = ['none', 'headset', 'tiara', 'halo', 'cap', 'witch'];

  // Prop colors stay the same in every skin.
  const P = {
    wood: '#9a5b2e', woodDark: '#6b3b1a', straw: '#f2c14e', strawDark: '#c28a1e',
    glass: '#bff4ff', metal: '#c9ced8', metalDark: '#7d8494',
    box: '#d39b5a', boxDark: '#a36b33', tape: '#f3d9a6',
    white: '#ffffff', red: '#ff3355', paint: ['#ff3d8b', '#39f5ff', '#ffe14d', '#7cf29e'],
    cap: '#ff3355', capDark: '#b01c3a', gold: '#ffd23f', goldDark: '#c28a1e', gem: '#ff3d8b',
    witch: '#3a1f8f', witchDark: '#1f0f55', star: '#ffe14d', set: '#2b2b3a', setLight: '#39f5ff',
    dust: '#b9b3c9', zz: '#c8d0ff', note: '#ffe14d', heart: '#ff3d8b',
  };

  // ---------------------------------------------------------------- pixel buffer
  function Buf() { this.p = new Array(W * H).fill(null); }
  Buf.prototype.set = function (x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H && c) this.p[y * W + x] = c;
  };
  Buf.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return this.p[y * W + x];
  };
  Buf.prototype.rect = function (x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  Buf.prototype.line = function (x0, y0, x1, y1, c, t) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (t > 1) this.rect(x0, y0, t, t, c); else this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  Buf.prototype.ellipse = function (cx, cy, rx, ry, colorFn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, typeof colorFn === 'function' ? colorFn(nx, ny) : colorFn);
      }
    }
  };
  Buf.prototype.disc = function (x, y, r, c) {
    const cx = x + 0.5, cy = y + 0.5;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++)
        if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r) this.set(xx, yy, c);
  };
  // A tapered limb through points pts with matching radii.
  Buf.prototype.limb = function (pts, radii, c) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radii[i] + (radii[i + 1] - radii[i]) * t, c);
      }
    }
  };
  // A tapered limb through pts with 3-tone shading (light on the left/top side).
  Buf.prototype.shadedLimb = function (pts, radii, tones) {
    const P = pts.map(([x, y]) => [x + 0.5, y + 0.5]);
    const R = Math.max(...radii) + 1;
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys) - R); y <= Math.ceil(Math.max(...ys) + R); y++) {
      for (let x = Math.floor(Math.min(...xs) - R); x <= Math.ceil(Math.max(...xs) + R); x++) {
        const px = x + 0.5, py = y + 0.5;
        let best = null;
        for (let i = 0; i < P.length - 1; i++) {
          const [ax, ay] = P[i], [bx, by] = P[i + 1];
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
          const qx = ax + dx * t, qy = ay + dy * t, r = radii[i] + (radii[i + 1] - radii[i]) * t;
          const d = Math.hypot(px - qx, py - qy);
          if (d <= r && (!best || d / r < best.k)) best = { k: d / r, v: ((px - qx) + (py - qy) * 0.5) / r };
        }
        if (best) this.set(x, y, tones[best.v < -0.45 ? 0 : best.v > 0.4 ? 2 : 1]);
      }
    }
  };
  // A short glowing band across a limb at point a (pointing toward b).
  Buf.prototype.band = function (a, b, r, c) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    for (let k = -r; k <= r; k += 0.5) this.set(a[0] + nx * k, a[1] + ny * k, c);
  };
  Buf.prototype.poly = function (pts, c) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, c);
      }
    }
  };
  // Pixel glyph from rows of text; `c` is a color or a {char: color} map.
  Buf.prototype.glyph = function (x, y, rows, c) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        this.set(x + i, y + j, typeof c === 'object' ? c[ch] : c);
      }
    });
  };
  const near = (b, x, y) => b.get(x + 1, y) || b.get(x - 1, y) || b.get(x, y + 1) || b.get(x, y - 1);
  function outlineInto(src, dst, col) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!src.get(x, y) && near(src, x, y)) dst.set(x, y, col);
  }
  function stamp(src, dst) { for (let i = 0; i < src.p.length; i++) if (src.p[i]) dst.p[i] = src.p[i]; }
  // Hologram shading: pixels on the edge of a shape glow brighter (rim light),
  // the inside is slightly see-through.
  function fresnel(b, map) {
    const edge = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = b.get(x, y);
      if (c && map[c] && (!b.get(x + 1, y) || !b.get(x - 1, y) || !b.get(x, y + 1) || !b.get(x, y - 1))) edge.push([x, y, map[c][0]]);
    }
    for (let i = 0; i < b.p.length; i++) if (b.p[i] && map[b.p[i]]) b.p[i] = map[b.p[i]][1];
    edge.forEach(([x, y, c]) => b.set(x, y, c));
  }
  // Draw a part on its own layer, shade it, outline it where it overlaps the
  // body (so a front arm reads in front of the torso), then lay it over `dst`.
  function part(dst, inner, fn, shade) {
    const b = new Buf();
    fn(b);
    if (shade) fresnel(b, shade);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!b.get(x, y) && dst.get(x, y) && near(b, x, y)) dst.set(x, y, inner);
    stamp(b, dst);
  }

  // ---------------------------------------------------------------- glyphs
  const G = {
    q:     ['.XXX.', 'X...X', '...X.', '..X..', '.....', '..X..'],
    bang:  ['X', 'X', 'X', '.', 'X'],
    z:     ['XXX', '..X', '.X.', 'XXX'],
    zBig:  ['XXXX', '...X', '..X.', '.X..', 'XXXX'],
    heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    note:  ['..XX', '..X.', '..X.', 'XXX.', 'XX..'],
    spark: ['..X..', '..X..', 'XXXXX', '..X..', '..X..'],
    spark2:['X.X', '.X.', 'X.X'],
    dot:   ['X'],
    star:  ['.X.', 'XXX', '.X.'],
  };

  // Head, 3/4 view facing right, side-swept bob.
  // h/H/d = hair mid/light/dark, s/S = skin mid/shadow.
  const HEAD = [
    '....hhhhhh....',
    '..hhHHHHhhhh..',
    '.hhHHHhhhhhhh.',
    '.hHHhhhhhhhhhh',
    'hhHhhhhhhhhhhh',
    'hhhhhhhhhsshhh',
    'hhhhhhsssssshh',
    'hhhhssssssssdh',
    'hhhsssssssssdh',
    'hhdsssssssssd.',
    'hhdssssssssSd.',
    '.hdsssssssSS..',
    '.dd.sssssSS...',
    '.....ssSSS....',
    '......sSS.....',
  ];
  const HEAD_X = 18, HEAD_Y = 4;
  const TORSO = [[18, 25], [20, 22.5], [23, 21.5], [27.5, 21.5], [30, 22.5], [31.5, 25], [31.5, 27], [32.5, 29], [31, 31.5], [29, 33], [28.5, 35.5], [30, 38.5], [32, 41.5], [31.5, 44.5], [28, 46.5], [21, 46.5], [17.5, 44.5], [17, 41.5], [18.5, 38.5], [20.5, 35.5], [20, 32.5], [18.5, 29], [18, 27]];

  // ---------------------------------------------------------------- skeleton presets
  // Arms: [elbow, hand] offsets from the shoulder. Front shoulder (30,24), back (19,24).
  const ARMS = {
    down:   [[1, 10], [1, 19]],    hip:    [[5, 8], [2, 15]],
    wave1:  [[5, -2], [7, -10]],   wave2:  [[5, -3], [4, -11]],
    point:  [[5, 1], [12, 0]],     up:     [[2, -8], [3, -16]],
    chin:   [[4, 7], [-1, -5]],    hold:   [[3, 9], [8, 9]],
    out:    [[6, 5], [10, 0]],     swingF: [[2, 10], [5, 18]],
    swingB: [[-1, 10], [-4, 17]],  cross:  [[1, 9], [-6, 11]],
    chest:  [[3, 9], [-2, 5]],     raise:  [[4, -4], [7, -11]],
    type1:  [[3, 9], [9, 7]],      type2:  [[3, 9], [9, 9]],
    flail1: [[4, -6], [8, -11]],   flail2: [[6, -3], [11, -6]],
    lift:   [[3, 8], [7, 4]],
  };
  const BACK_ARMS = {
    down:   [[-1, 10], [-1, 19]],  hip:    [[-5, 8], [-2, 15]],
    up:     [[-2, -8], [-2, -16]], out:    [[-6, 5], [-10, 0]],
    swingF: [[2, 10], [4, 17]],    swingB: [[-2, 10], [-5, 17]],
    hold:   [[3, 9], [11, 9]],     cross:  [[2, 9], [9, 11]],
    chest:  [[3, 9], [8, 5]],      flail:  [[-4, -6], [-8, -11]],
    behind: [[-3, 9], [1, 17]],    lift:   [[2, 8], [8, 4]],
  };
  // Legs: [knee, ankle] offsets from the hip (y is scaled to the leg length).
  // Front hip (27,44), back (21,44). Planted legs keep their feet on the ground while the body bobs.
  const LEGS = {
    stand:  { F: [[1, 17], [1, 33]],  B: [[0, 17], [-1, 33]], planted: true },
    pose:   { F: [[0, 17], [-2, 33]], B: [[0, 17], [0, 33]], planted: true },
    walk0:  { F: [[3, 16], [6, 32]],  B: [[-2, 16], [-5, 31]], footB: [2, 2] },
    walk1:  { F: [[1, 17], [0, 33]],  B: [[4, 14], [0, 29]], footB: [2, 2] },
    walk2:  { F: [[-2, 16], [-5, 31]], B: [[3, 16], [6, 32]], footF: [2, 2] },
    walk3:  { F: [[4, 14], [0, 29]],  B: [[1, 17], [0, 33]], footF: [2, 2] },
    run0:   { F: [[5, 14], [9, 29]],  B: [[-4, 15], [-9, 27]], footB: [2, 1] },
    run1:   { F: [[1, 17], [0, 32]],  B: [[6, 11], [1, 22]], footB: [2, 2] },
    run2:   { F: [[-4, 15], [-9, 27]], B: [[5, 14], [9, 29]], footF: [2, 1] },
    run3:   { F: [[6, 11], [1, 22]],  B: [[1, 17], [0, 32]], footF: [2, 2] },
    sit:    { F: [[11, 1], [12, 17]], B: [[9, 2], [9, 17]], foot: [2, 2] },
    tuck:   { F: [[6, 9], [1, 17]],   B: [[4, 10], [-1, 18]], foot: [1, 3] },
    dangle: { F: [[1, 16], [2, 31]],  B: [[-1, 16], [-1, 31]], foot: [1, 3] },
    squat:  { F: [[5, 14], [1, 30]],  B: [[3, 14], [-2, 30]], planted: true },
    kick:   { F: [[6, 13], [9, 27]],  B: [[0, 17], [-1, 33]], footF: [3, 0] },
  };
  const LEG_Y = 30 / 33;

  // ---------------------------------------------------------------- the character
  // Pose fields (all optional):
  //   bob, dx      body offset (+bob = down)      legs  a LEGS key
  //   front, back  ARMS / BACK_ARMS key, or [[ex,ey],[hx,hy]]
  //   eyes   'open' | 'blink' | 'happy' | 'closed' | 'wide' | 'angry' | 'up' | 'down' | 'x' | 'wink'
  //   mouth  'smile' | 'open' | 'o' | 'grin' | 'flat' | 'tongue' | 'smirk'
  //   prop   'broom' | 'magnifier' | 'brush' | 'box' | 'folder' | 'panel'
  //   fx     array of [glyphName, x, y, color]
  function skeleton(p) {
    const ox = p.dx, oy = p.bob;
    const legs = LEGS[p.legs] || LEGS.stand;
    const sh = { F: [29 + ox, 24 + oy], B: [20 + ox, 24 + oy] };
    const hip = { F: [27 + ox, 44 + oy], B: [21 + ox, 44 + oy] };
    const arm = (side) => {
      const v = side === 'F' ? p.front : p.back;
      const a = Array.isArray(v) ? v : (side === 'F' ? ARMS[v] || ARMS.down : BACK_ARMS[v] || BACK_ARMS.down);
      return [sh[side], [sh[side][0] + a[0][0], sh[side][1] + a[0][1]], [sh[side][0] + a[1][0], sh[side][1] + a[1][1]]];
    };
    const leg = (side) => {
      const [k, a] = legs[side];
      const baseY = legs.planted ? 44 : hip[side][1];
      const ky = k[1] * LEG_Y, ay = a[1] * LEG_Y;
      const knee = [hip[side][0] + k[0], legs.planted ? (hip[side][1] + baseY + 2 * ky) / 2 : hip[side][1] + ky];
      const ankle = [hip[side][0] + a[0], baseY + ay];
      const fd = (side === 'F' ? legs.footF : legs.footB) || legs.foot || [3, 2];
      return [hip[side], knee, ankle, [ankle[0] + fd[0], ankle[1] + fd[1]]];
    };
    return { armF: arm('F'), armB: arm('B'), legF: leg('F'), legB: leg('B') };
  }

  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dim = (t) => [t[1], t[2], t[2]]; // far limbs sit in shadow

  function drawLeg(b, [hip, knee, ankle, toe], s, far) {
    const suit = far ? dim(s.suit) : s.suit, boot = far ? dim(s.boot) : s.boot;
    b.shadedLimb([hip, knee, ankle], far ? [3.0, 2.1, 1.7] : [3.3, 2.3, 1.8], suit);
    const top = lerp(knee, ankle, 0.42);
    b.shadedLimb([top, ankle], [2.1, 1.9], boot);
    b.shadedLimb([ankle, toe], [1.9, 1.2], boot);
    b.band(top, ankle, 2, s.glow);
    b.band(knee, ankle, 1.5, far ? dim(s.suit)[2] : s.suit[2]);
  }
  function drawArm(b, [sh, el, hd], s, far, finger) {
    const suit = far ? dim(s.suit) : s.suit;
    b.shadedLimb([sh, el, hd], [2.3, 1.7, 1.4], suit);
    b.band(lerp(el, hd, 0.78), hd, 1.5, s.glow);
    b.disc(hd[0], hd[1], 1.5, far ? s.skin[2] : s.skin[1]);
    if (finger) b.line(hd[0], hd[1], hd[0] + 3, hd[1], s.skin[1], 1);
  }
  function drawTorso(b, s, ox, oy) {
    const T = (pts) => pts.map(([x, y]) => [x + ox, y + oy]);
    b.poly(T(TORSO), '#000001');
    // shade each row: light on the left, shadow on the right
    for (let y = 0; y < H; y++) {
      let x0 = -1, x1 = -1;
      for (let x = 0; x < W; x++) if (b.get(x, y) === '#000001') { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 < 0) continue;
      for (let x = x0; x <= x1; x++) {
        const t = (x - x0) / Math.max(1, x1 - x0);
        b.set(x, y, s.suit[t < 0.22 ? 0 : t > 0.8 ? 2 : 1]);
      }
    }
    const at = (x, y, c) => { if (b.get(x + ox, y + oy)) b.set(x + ox, y + oy, c); };
    // bust: highlight and the shadow underneath
    at(28, 26, s.suit[0]); at(29, 26, s.suit[0]); at(28, 27, s.suit[0]);
    for (let x = 25; x <= 32; x++) at(x, 31, s.suit[2]);
    if (s.panel) {
      // dark front panel down the middle of the suit
      b.poly(T([[22.5, 21.5], [28.5, 21.5], [27.5, 25], [26.8, 31], [26.4, 35], [26.6, 46.5], [23.6, 46.5], [23.6, 35], [23.2, 31], [22.6, 25]]), s.panel[1]);
      for (let y = 22; y <= 46; y++) at(y < 31 ? 23 : 24, y, s.panel[0]);
      at(25, 26, s.glow); at(25, 27, s.glow); at(25, 28, s.glow);
    } else {
      // hologram: bright circuit traces instead of a panel
      const tr = (pts) => { for (let i = 0; i < pts.length - 1; i++) b.line(pts[i][0] + ox, pts[i][1] + oy, pts[i + 1][0] + ox, pts[i + 1][1] + oy, s.glow, 1); };
      tr([[21, 23], [21, 26], [23, 28], [23, 33]]); tr([[29, 24], [27, 26]]); tr([[21, 37], [23, 40], [23, 44]]); tr([[28, 37], [27, 40]]);
    }
    // collar, belt and seam lights
    for (let x = 22; x <= 28; x++) at(x, 21, s.glow);
    for (let x = 19; x <= 30; x++) { at(x, 35, s.panel ? s.panel[1] : s.suit[2]); at(x, 36, s.panel ? s.panel[0] : s.suit[2]); }
    at(25, 35, s.glow); at(26, 35, s.glow);
    at(19, 26, s.glow); at(30, 26, s.glow); at(18, 41, s.glow); at(31, 41, s.glow);
  }

  function drawNova(pose, skinKey, hat) {
    const s = skinOf(skinKey);
    const p = Object.assign({ bob: 0, dx: 0, legs: 'pose', front: 'hip', back: 'down', eyes: 'open', mouth: 'smile' }, pose);
    const sk = skeleton(p);
    const ox = p.dx, oy = p.bob;
    const OL = s.outline;
    const body = new Buf();
    const fx = new Buf();

    drawLeg(body, sk.legB, s, true);
    drawArm(body, sk.armB, s, true);
    part(body, OL, (b) => drawTorso(b, s, ox, oy));
    // neck
    body.rect(23 + ox, 18 + oy, 4, 4, s.skin[1]); body.rect(26 + ox, 18 + oy, 1, 4, s.skin[2]);
    for (let x = 22; x <= 28; x++) body.set(x + ox, 21 + oy, s.glow);

    // head and face
    const hx = HEAD_X + ox, hy = HEAD_Y + oy;
    part(body, OL, (b) => b.glyph(hx, hy, HEAD, { h: s.hair[1], H: s.hair[0], d: s.hair[2], s: s.skin[1], S: s.skin[2] }));
    body.set(hx + 4, hy + 9, s.skin[0]); body.set(hx + 4, hy + 10, s.skin[0]); // cheek light
    body.set(hx + 8, hy + 10, s.skin[2]); // nose
    const e1 = hx + 5, e2 = hx + 9, ey = hy + 8, lash = OL;
    if (p.eyes !== 'angry') { body.rect(e1, ey - 2, 2, 1, s.hair[2]); body.rect(e2, ey - 2, 3, 1, s.hair[2]); }
    const eye = (x, near) => {
      const w = near ? 3 : 2;
      switch (p.eyes) {
        case 'blink': case 'closed': body.rect(x, ey + 1, w, 1, lash); break;
        case 'happy': body.set(x, ey + 1, lash); body.set(x + 1, ey, lash); if (near) body.set(x + 2, ey + 1, lash); break;
        case 'wink': if (near) { body.set(x, ey + 1, lash); body.set(x + 1, ey, lash); body.set(x + 2, ey + 1, lash); break; } // fall through
        // eslint-disable-next-line no-fallthrough
        case 'open': default:
          body.rect(x, ey - 1, w, 1, lash);
          body.set(x, ey, s.iris); body.set(x + 1, ey, s.eye); body.rect(x, ey + 1, 2, 1, s.iris);
          break;
        case 'wide': body.rect(x, ey - 1, w, 1, lash); body.rect(x, ey, 2, 3, s.eye); body.set(x + 1, ey + 1, s.iris); break;
        case 'up': body.rect(x, ey - 1, w, 1, lash); body.rect(x, ey, 2, 1, s.iris); break;
        case 'down': body.rect(x, ey, w, 1, lash); body.rect(x, ey + 1, 2, 1, s.iris); break;
        case 'angry': body.set(x + (near ? 2 : 0), ey - 2, lash); body.set(x + 1, ey - 1, lash); body.rect(x, ey, 2, 1, s.iris); body.rect(x, ey + 1, 2, 1, s.iris); break;
        case 'x': body.set(x, ey, lash); body.set(x + 1, ey + 1, lash); body.set(x + 1, ey, lash); body.set(x, ey + 1, lash); break;
      }
    };
    eye(e1, false); eye(e2, true);
    if (p.eyes === 'happy' || p.blush) { body.set(e1 - 1, ey + 2, s.cheek); body.rect(e2 + 1, ey + 2, 2, 1, s.cheek); }
    const mx = hx + 6, my = hy + 11;
    switch (p.mouth) {
      case 'open': body.rect(mx, my, 3, 2, s.lips); body.rect(mx + 1, my, 1, 1, OL); break;
      case 'o': body.rect(mx + 1, my, 1, 2, s.lips); break;
      case 'grin': body.rect(mx, my, 3, 1, '#ffffff'); body.set(mx - 1, my - 1, s.lips); body.set(mx + 3, my - 1, s.lips); break;
      case 'flat': body.rect(mx, my, 3, 1, s.lips); break;
      case 'tongue': body.rect(mx, my, 3, 1, s.lips); body.set(mx + 1, my + 1, s.cheek); break;
      case 'smirk': body.rect(mx, my, 2, 1, s.lips); body.set(mx + 2, my - 1, s.lips); break;
      default: body.rect(mx, my, 3, 1, s.lips); body.set(mx + 3, my - 1, s.lips);
    }

    // accessories
    if (hat === 'headset') part(body, OL, b => {
      b.rect(hx + 1, hy + 7, 2, 4, P.set); b.set(hx + 1, hy + 8, P.setLight);
      b.line(hx + 2, hy + 11, hx + 5, hy + 12, P.set, 1); b.set(hx + 5, hy + 12, P.setLight);
    });
    if (hat === 'tiara') part(body, OL, b => {
      b.glyph(hx + 3, hy - 1, ['..X..X..X.', 'XXXXXXXXXX'], P.gold);
      b.set(hx + 6, hy - 2, P.gem); b.set(hx + 6, hy - 1, P.gem);
    });
    if (hat === 'cap') part(body, OL, b => {
      b.ellipse(hx + 7, hy + 4, 7.5, 4.5, (nx, ny) => ny < 0.25 ? P.cap : null);
      b.rect(hx + 9, hy + 4, 8, 2, P.capDark);
      b.rect(hx + 4, hy + 1, 3, 1, '#ffffff');
    });
    if (hat === 'witch') part(body, OL, b => {
      for (let j = 0; j < 11; j++) { const w = Math.round(1 + j * 0.8), lean = Math.round((10 - j) * -0.4); b.rect(hx + 7 - w + lean, hy - 8 + j, w * 2, 1, j === 9 ? P.star : P.witch); }
      b.rect(hx - 1, hy + 3, 17, 2, P.witchDark);
    });
    if (hat === 'halo') for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; fx.set(hx + 7 + Math.cos(t) * 6, hy - 1.5 + Math.sin(t) * 1.6, '#fff6a8'); }

    // front leg, props, front arm
    part(body, OL, (b) => drawLeg(b, sk.legF, s, false));
    const hand = sk.armF[2];
    const propFn = PROPS[p.prop];
    if (propFn && propFn.behind) part(body, OL, b => propFn(b, hand, p, s, fx));
    part(body, OL, (b) => drawArm(b, sk.armF, s, false, p.finger));
    if (propFn && !propFn.behind) part(body, OL, b => propFn(b, hand, p, s, fx));
    if (p.prop === 'panel') drawPanel(fx, hand, p, s);

    // final silhouette outline
    const out = new Buf();
    outlineInto(body, out, OL);
    stamp(body, out);
    if (s.holo) for (let i = 0; i < out.p.length; i++) { const c = out.p[i]; if (c && c !== OL && c !== s.glow && c !== s.eye && c.length === 7) out.p[i] = c + 'e2'; }
    (p.fx || []).forEach(([g, x, y, c]) => fx.glyph(x, y, G[g], c === 'tip' ? s.tip : c));
    stamp(fx, out);
    return out;
  }

  // a floating holographic screen (for "working" / scanning)
  function drawPanel(fx, hand, p, s) {
    const x = hand[0] + 2, y = hand[1] - 13;
    const c = s.body + '80', line = s.light + 'ee';
    fx.rect(x, y, 13, 10, c);
    fx.rect(x, y, 13, 1, line); fx.rect(x, y + 9, 13, 1, line);
    for (let i = 0; i < 3; i++) fx.rect(x + 2, y + 2 + i * 2, [8, 5, 7][(i + (p.scan || 0)) % 3], 1, line);
  }

  const PROPS = {
    broom(b, h, p) {
      const tipX = h[0] + 7 + (p.sweep || 0), tipY = GROUND - 2;
      b.line(h[0] - 5, h[1] - 10, tipX, tipY - 3, P.wood, 1);
      b.line(h[0] - 4, h[1] - 10, tipX + 1, tipY - 3, P.woodDark, 1);
      for (let i = 0; i < 7; i++) b.line(tipX - 2 + i, tipY - 4, tipX - 4 + i * 1.6, tipY + 1, i % 2 ? P.strawDark : P.straw, 1);
    },
    magnifier(b, h, p) {
      const c = [h[0] + 3, h[1] - 6 + (p.lens || 0)];
      b.line(h[0], h[1], c[0] - 2, c[1] + 2, P.woodDark, 2);
      b.ellipse(c[0] + 1, c[1] - 1, 4.5, 4.5, (nx, ny) => (nx * nx + ny * ny > 0.45 ? P.metal : (nx < -0.1 && ny < -0.1 ? P.white : P.glass)));
    },
    brush(b, h, p) {
      const a = p.stroke || 0;
      b.line(h[0], h[1], h[0] + 3, h[1] - 7 + a, P.wood, 1);
      b.rect(h[0] + 2, h[1] - 10 + a, 3, 3, P.metalDark);
      b.rect(h[0] + 2, h[1] - 13 + a, 3, 3, P.paint[p.paintIdx || 0]);
    },
    box(b, h) {
      const x = h[0] - 9, y = h[1] - 9;
      b.rect(x, y, 13, 10, P.box);
      b.rect(x, y + 7, 13, 3, P.boxDark);
      b.rect(x + 5, y, 3, 10, P.tape);
      b.rect(x, y, 13, 1, P.tape);
    },
    folder(b, h) {
      const x = h[0] - 5, y = h[1] - 7;
      b.rect(x, y, 4, 1, P.strawDark);
      b.rect(x, y + 1, 10, 8, P.strawDark);
      b.rect(x + 1, y + 3, 8, 6, P.straw);
      b.rect(x + 2, y + 2, 5, 1, P.white);
    },
  };

  // ---------------------------------------------------------------- animations
  // Each animation: frames, fps, loop, pose(frame) -> pose object.
  // footY says which row of the frame sits on the "ground" (or the ledge, for sit).
  const sin = (f, n) => Math.sin((f / n) * Math.PI * 2);
  const ANIMS = {
    idle:  { frames: 8, fps: 5, pose: f => ({ bob: [0, 0, 0, 1, 1, 1, 0, 0][f] }) },
    walk:  { frames: 4, fps: 8, pose: f => ({ bob: [0, -1, 0, -1][f], legs: 'walk' + f, front: ['swingB', 'down', 'swingF', 'down'][f], back: ['swingF', 'down', 'swingB', 'down'][f] }) },
    run:   { frames: 4, fps: 13, pose: f => ({ bob: [0, -1, 0, -1][f], dx: 1, legs: 'run' + f, front: f % 2 ? 'hold' : (f ? 'swingF' : 'swingB'), back: f === 2 ? 'swingB' : 'swingF', mouth: 'grin' }) },
    wave:  { frames: 4, fps: 6, pose: f => ({ front: f % 2 ? 'wave2' : 'wave1', back: 'hip', eyes: 'happy', mouth: 'open' }) },
    talk:  { frames: 4, fps: 8, pose: f => ({ mouth: ['smile', 'open', 'smirk', 'o'][f], front: f % 2 ? 'lift' : 'hip', back: 'down' }) },
    point: { frames: 2, fps: 3, pose: f => ({ front: 'point', finger: true, back: 'hip', eyes: f ? 'open' : 'wink', mouth: 'smirk' }) },
    think: { frames: 4, fps: 4, pose: f => ({ front: 'chin', back: 'cross', eyes: 'up', mouth: 'flat', fx: [['q', 38, 2 + (f % 2), '#ffffff']] }) },
    search:{ frames: 6, fps: 6, pose: f => ({ prop: 'magnifier', front: [[5, 2], [9, -3]], back: 'hip', lens: [0, -1, -2, -1, 0, 1][f], mouth: 'o', legs: f % 2 ? 'walk1' : 'walk3' }) },
    sweep: { frames: 4, fps: 8, pose: f => ({ prop: 'broom', front: [[3, 9], [6, 12]], back: 'hold', sweep: [-2, 0, 2, 0][f], bob: f % 2, eyes: 'happy', mouth: 'grin', fx: f % 2 ? [['dot', 40, 74, P.dust], ['dot', 43, 72, P.dust], ['spark2', 44, 68, P.dust]] : [['dot', 42, 75, P.dust], ['dot', 45, 73, P.dust]] }) },
    paint: { frames: 4, fps: 8, pose: f => ({ prop: 'brush', front: 'raise', back: 'hip', stroke: [0, 3, 0, -2][f], paintIdx: f, eyes: 'happy', mouth: 'tongue', fx: [['dot', 40 + f, 8 + f * 3, P.paint[f]], ['dot', 44 - f, 16 + f, P.paint[(f + 2) % 4]]] }) },
    carry: { frames: 4, fps: 8, pose: f => ({ prop: 'box', front: 'hold', back: 'hold', bob: [0, -1, 0, -1][f], legs: 'walk' + f, mouth: 'flat' }) },
    cheer: { frames: 4, fps: 8, pose: f => ({ bob: [0, -3, -4, -2][f], legs: f ? 'tuck' : 'stand', front: 'up', back: 'up', eyes: 'happy', mouth: 'open', fx: f % 2 ? [['spark', 4, 8, 'tip'], ['spark2', 40, 14, '#ffffff']] : [['spark2', 6, 12, '#ffffff'], ['spark', 38, 6, 'tip']] }) },
    sleep: { frames: 4, fps: 2, pose: f => ({ bob: f < 2 ? 0 : 1, legs: 'stand', front: 'cross', back: 'cross', eyes: 'closed', mouth: 'flat', fx: [['z', 36, 6 - f, P.zz], ['zBig', 40, 0 + (f % 2), P.zz]].slice(0, 1 + (f % 2)) }) },
    dance: { frames: 8, fps: 8, pose: f => ({ dx: [0, 1, 2, 1, 0, -1, -2, -1][f], bob: f % 2, front: f < 4 ? 'up' : 'hip', back: f < 4 ? 'hip' : 'up', legs: f % 4 === 1 ? 'kick' : f % 4 === 3 ? 'pose' : 'stand', eyes: f % 4 === 2 ? 'wink' : 'happy', mouth: f % 2 ? 'open' : 'smile', fx: [['note', f < 4 ? 2 : 40, 10 + (f % 4), P.note]] }) },
    dangle:{ frames: 2, fps: 5, pose: f => ({ legs: 'dangle', front: 'up', back: 'up', eyes: 'wide', mouth: 'o', dx: f ? 1 : 0 }) },
    fall:  { frames: 2, fps: 10, pose: f => ({ legs: 'tuck', front: f ? 'flail1' : 'flail2', back: 'flail', eyes: 'wide', mouth: 'o' }) },
    land:  { frames: 2, fps: 8, loop: false, pose: f => ({ legs: f ? 'stand' : 'squat', bob: f ? 0 : 3, front: f ? 'down' : 'out', back: f ? 'down' : 'out', eyes: f ? 'open' : 'closed', mouth: 'flat' }) },
    sit:   { frames: 4, fps: 3, footY: 46, pose: f => ({ legs: 'sit', bob: f === 2 ? 1 : 0, front: [[1, 10], [4, 18]], back: [[-1, 10], [0, 18]], eyes: f === 3 ? 'blink' : 'open' }) },
    work:  { frames: 4, fps: 8, pose: f => ({ prop: 'panel', front: f % 2 ? 'type1' : 'type2', back: 'hold', eyes: 'down', mouth: 'flat', scan: f }) },
    shrug: { frames: 2, fps: 3, pose: f => ({ front: 'out', back: 'out', eyes: 'blink', mouth: 'smirk', bob: f }) },
    love:  { frames: 4, fps: 6, pose: f => ({ front: 'chest', back: 'chest', eyes: 'happy', blush: true, mouth: 'smile', bob: f % 2, fx: [['heart', 36 + (f % 2), 6 - f, P.heart], ['heart', 6, 10 - ((f + 2) % 4), P.heart]] }) },
    angry: { frames: 2, fps: 6, pose: f => ({ front: 'hip', back: 'hip', eyes: 'angry', mouth: 'flat', dx: f ? 1 : 0, fx: [['bang', 38, 4, P.red]] }) },
    dizzy: { frames: 4, fps: 6, pose: f => ({ eyes: 'x', mouth: 'tongue', dx: [-1, 0, 1, 0][f], front: 'out', back: 'down', fx: [['spark2', 16 + f * 3, 1, '#ffe14d'], ['star', 30 - f * 3, 0, '#ffe14d']] }) },
    folder:{ frames: 4, fps: 8, pose: f => ({ prop: 'folder', front: 'hold', back: 'swingF', bob: [0, -1, 0, -1][f], legs: 'walk' + f, eyes: 'happy', mouth: 'smile' }) },
  };
  Object.keys(ANIMS).forEach(k => { const a = ANIMS[k]; if (a.loop === undefined) a.loop = true; if (!a.footY) a.footY = GROUND; });

  // Where the front hand is in a given frame (for drawing pointer arrows).
  function handOf(anim, frame) {
    const a = ANIMS[anim] || ANIMS.idle;
    const p = Object.assign({ bob: 0, dx: 0, legs: 'pose', front: 'hip', back: 'down' }, a.pose(((frame % a.frames) + a.frames) % a.frames));
    const h = skeleton(p).armF[2];
    return [h[0] + (p.finger ? 3 : 0), h[1]];
  }

  // ---------------------------------------------------------------- rendering
  const cache = new Map();
  function frameRGBA(anim, frame, skin, hat, overrides) {
    const a = ANIMS[anim] || ANIMS.idle;
    const f = ((frame % a.frames) + a.frames) % a.frames;
    const key = anim + '|' + f + '|' + skin + '|' + hat + '|' + (overrides ? JSON.stringify(overrides) : '');
    let px = cache.get(key);
    if (!px) {
      const pose = Object.assign(a.pose(f), overrides || {});
      const buf = drawNova(pose, skin, hat);
      px = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const c = buf.p[i];
        if (!c) continue;
        const n = parseInt(c.slice(1, 7), 16);
        px[i * 4] = n >> 16; px[i * 4 + 1] = (n >> 8) & 255; px[i * 4 + 2] = n & 255;
        px[i * 4 + 3] = c.length === 9 ? parseInt(c.slice(7), 16) : 255;
      }
      if (cache.size > 4000) cache.clear();
      cache.set(key, px);
    }
    return px;
  }

  // Draws a frame onto a 2D canvas context, scaled up with crisp pixels.
  let scratch = null;
  function draw(ctx, opts) {
    const { anim = 'idle', frame = 0, skin = 'holo', hat = 'none', x = 0, y = 0, scale = 3, flip = false, overrides } = opts;
    if (!scratch) {
      scratch = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    }
    const sctx = scratch.getContext('2d');
    const img = sctx.createImageData(W, H);
    img.data.set(frameRGBA(anim, frame, skin, hat, overrides));
    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(x + W * scale, y); ctx.scale(-1, 1); ctx.drawImage(scratch, 0, 0, W * scale, H * scale); }
    else ctx.drawImage(scratch, x, y, W * scale, H * scale);
    ctx.restore();
  }

  const api = { W, H, GROUND, HEAD_TOP, SKINS, HATS, ANIMS, skinOf, handOf, frameRGBA, draw, drawNova };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NovaSprites = api;
})(typeof window !== 'undefined' ? window : globalThis);
