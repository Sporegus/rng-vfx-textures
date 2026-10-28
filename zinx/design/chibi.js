// Zinx, chibi desktop-pet edition (Shimeji style): pixel art, a hand-pixeled
// twin-tail head on a body that is drawn from poses.
// Frames are drawn from poses, so every animation works in every palette.
// Works in the browser (window.ZinxChibi) and in Node (module.exports).
(function (root) {
  // Poses are written in a 56x56 "logical" grid; frames render at K times
  // that resolution so curves are smooth and the body gets real detail.
  const K = 2;
  const LW = 56, LH = 56;
  const W = LW * K, H = LH * K;
  const GROUND = 55;   // feet touch this logical row
  const CX = 28;       // body center (logical)
  // The body is drawn smaller than its pose grid so it suits the pixel-art head:
  // logical points shrink toward her center line and the ground.
  const BODY_S = 0.75;
  const tx = (x) => CX + (x - CX) * BODY_S, ty = (y) => (GROUND + 1) + (y - GROUND - 1) * BODY_S;
  const itx = (u) => CX + (u - CX) / BODY_S, ity = (v) => (GROUND + 1) + (v - GROUND - 1) / BODY_S;

  // ---------------------------------------------------------------- palettes
  // body: [shine, light, mid, shadow], hair: [shine, light, mid, dark]
  const PALETTES = {
    red:     { name: 'Red', suit: ['#ffd0ce', '#ff7a78', '#e6404f', '#b3213a'], outline: '#3a0712', body: ['#fff1f0', '#ffcbc8', '#f7a09d', '#e06470'],
               skin: ['#fffaf7', '#ffe6de', '#f8c3b8', '#e3968c'], hair: ['#ffb0ac', '#ff4450', '#d81e34', '#9a1028'], hairLine: '#64061a',
               lash: '#2b0610', iris: ['#4a0614', '#a8132b', '#ee3049', '#ffa3ab'], mouth: '#9c2436', mouthIn: '#c63a50', line: '#ffd2d0', tear: '#ffd6e0', cheek: '#ff9aa6', blush: '#f7aaa4', ribbon: ['#ffd0da', '#ff8aa6'], tie: '#2b0a12', tieHi: '#6b2232' },
    cortana: { name: 'Blue + red hair', suit: ['#c4f3ff', '#5fb0ff', '#2f7fe6', '#1d55b8'], outline: '#0b2a7d', body: ['#eaf7ff', '#b4defc', '#7fbdf2', '#4d8fdc'],
               skin: ['#f2fbff', '#cfeaff', '#97c8f4', '#5f98dc'], hair: ['#ffb0ac', '#ff4450', '#d81e34', '#9a1028'], hairLine: '#64061a',
               lash: '#0a1a55', iris: ['#0a1b5e', '#1f55cf', '#4a96ff', '#a6dcff'], mouth: '#2a5ad0', mouthIn: '#4a7ae0', line: '#e2f4ff', tear: '#e2f4ff', cheek: '#ff9ab0', blush: '#a9c8f4', ribbon: ['#ffffff', '#b8dcff'], tie: '#12163a', tieHi: '#3a4180' },
    blue:    { name: 'Blue', suit: ['#c4f3ff', '#5fb0ff', '#2f7fe6', '#1d55b8'], outline: '#0b2a7d', body: ['#eaf7ff', '#b4defc', '#7fbdf2', '#4d8fdc'],
               skin: ['#f2fbff', '#cfeaff', '#97c8f4', '#5f98dc'], hair: ['#b4e6ff', '#3f94ff', '#2363e0', '#163fae'], hairLine: '#0c2470',
               lash: '#0a1a55', iris: ['#0a1b5e', '#1f55cf', '#4a96ff', '#a6dcff'], mouth: '#2a5ad0', mouthIn: '#4a7ae0', line: '#e2f4ff', tear: '#e2f4ff', cheek: '#9fd2ff', blush: '#a9c8f4', ribbon: ['#ffffff', '#b8dcff'], tie: '#0b1f5c', tieHi: '#3355aa' },
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
    const X0 = Math.round(tx(x) * K), X1 = Math.max(X0 + 1, Math.round(tx(x + 1) * K));
    const Y0 = Math.round(ty(y) * K), Y1 = Math.max(Y0 + 1, Math.round(ty(y + 1) * K));
    for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) this.setP(X, Y, c);
  };
  Buf.prototype.rect = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); };
  // fn(x, y) gets the logical position of each real pixel (x + 0.5 is its center)
  Buf.prototype.each = function (x0, y0, x1, y1, fn) {
    for (let Y = Math.floor(ty(y0) * K); Y <= Math.ceil(ty(y1 + 1) * K); Y++) for (let X = Math.floor(tx(x0) * K); X <= Math.ceil(tx(x1 + 1) * K); X++) {
      const c = fn(itx((X + 0.5) / K) - 0.5, ity((Y + 0.5) / K) - 0.5); if (c) this.setP(X, Y, c);
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
    const blended = (X, Y) => blendAt && blendAt.some(([bx, by, r]) => (itx((X + 0.5) / K) - 0.5 - bx) ** 2 + (ity((Y + 0.5) / K) - 0.5 - by) ** 2 < r * r);
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

  // ---- pixel-art head: hand-pixeled twin tails and face, drawn 1:1 in real pixels.
  // O line, H/M/D hair light to dark, E hair shadow, S/p skin, s blush, T/t ribbon,
  // W white, N mouth. Column 31 sits just right of her center line; row 32 is the chin.
  const PX_HEAD = [
    '...............OO........OOOOOOOOOOOO........OO...............',
    '..........OOO..HTO....OOOEDDEEEEEEEEEOOO....OTTO.OOOO.........',
    '........OODEDOOHpOO.OODDDDDDMMMMMMDDDEDDOOOOOppOOEEEEOO.......',
    '.......OEDMMDEEHOppOEEDDMMMMMMMMMMMMMMDEDDOppOpEEEMMMEEO......',
    '......OMMMDMEDEOpTOEDMMMMMMMMMMMMMMMMMMMMMEOTpOEEEDDMMMO......',
    '.....OMMMMMMMEOpTODMMMMMMMMMMMMMMMMMMMMMMMMDOTpOOMMMMMMME.....',
    '....OMMMMHMMMOTTOMMMMMMMMMMMMMMMMMMMMMMMMMMMMOTTOMMMMHMMMO....',
    '....OMMMMHMMMOptOMMMMMMMMMMMMMMMMMMMMMMMMMMMMOtpMMMMMHMMMO....',
    '...OMMHHMMDMOppOMMMMMMMMMDEMMMMMMMMEMMMMMMMMMMOppOMMDMMHMMO...',
    '...OMMHHMMDMpTOMMMMMMMMMMEEMMMMMMMMEMMMMMMMMMMMOTpEDDMMHMMO...',
    '...OMMMMMMMOTTOMMMHMHHHMEEEMMHHHHMMEEEMHMHMHMMMEtTEEMMMMMMO...',
    '...OMMMMMMEDOOEMMMHMMMMMOEEMMMMMMMMEEOMMMMMMMMMDOOEEDMMMMMO...',
    '..OMMHMMMDEEOOEMMMMDMMMMOEEOMMMMMMOEEOMMMMDMMMMDOOEEEMMMHMMO..',
    '..OMMHMMMEEEEEEMMMMDMMMOpEEOMMMMMMOEEpOMMMDMMMMDEEEEEMMMHMMO..',
    '..OMMHMMMEEEOEEMMMDDEEOMDOOOEEEEEEOOMMMOEEEEMMMDEOEEEDMMHMMO..',
    '..OMMHMMEEEEOEEEMMOEDEOppOpOEEEEEEOpOppODEEOMMDEEOEEEEMMHMMO..',
    '..OMMMMMEEEEOEEEMMOEEOpSSSSpOOOOOOsSSSSsOOOOMMDEEOEEEEMMMMMO..',
    '..OMMMMMEEEEOEEEMMOpstSOOSOSppppppSOSOOSsOpOMMDEEOEEEEEMMMMO..',
    '..OMMMMMEEEEOEEEEOsSSpOOOOSSSSSSSSSSOOOOpSSsEEEEEOEEEEEMMMMO..',
    '..OMMMMMEEEOOOEEEEsSsOOOWOOSSSSSSSSOOWOOOsSsEEEEOOOEEEEMMMMO..',
    '..OEMMMMEEOOEOOEMESSOWOOOOSSSSSSSSSSOOOOWOpSEMDOOEEOEEEMMMDO..',
    '..OEMEMMEEOOEOpEMESOSWOOOOSSSSSSSSSSOOOOWWOSEMDsOEEOEEEMDMEO..',
    '..OEMEMMEOOOEOpEMESSSWOOOOSSSSSSSSSSOOOOWWSSEMDsOEEOOEEMDMEO..',
    '..OEEEEEEOOEEOpEMDSSSWOOOOSSSSSSSSSSOOOOWSSEEMDsOEEOOOEEEEEO..',
    '..OEEMEEEEOEEOpEMMDSSSSOOSSSSSSSSSSSSOOSSSSEMMDsOEEEOEEEMEEO..',
    '..OEEMEEEEEEEOOEMMDSSSsSSSSSSSSSSSSSSSSsSSSEMMDOOEEEEEEEMEEO..',
    '..OEEMEEEEEEEO.EMDESSsssSSSSSSSSSSSSSSssssSEEMEEEEEEEEEEMEEO..',
    '..OEEMEEEEEEEO.EEEESSsssSSSNSSSSSSNSSSSssSSEEEE.EEEEEEEEMEEE..',
    '.OEEEEEEEEEEEO.OEEEOsSSSSSSSNSSSSNSSSSSSSSOEEEO.EEEEEEEEEEEEO.',
    'OMEEOEEEEEEEEO.OEEEOOpSSSSSSSSNNNSSSSSSSsOOEEEO.EEEEEEEEEOEEMO',
    'OEEOOEEEEEEEEEO.OEO..OpsSSSSSSSSSSSSSSspOO.OEO.NEEEEEEEEEOOEEO',
    '.OO.OEEEEEEEEEO.OO....OOOppppSSSSppppOOO....OO.EEEEEEEEEEO.OO.',
    '....OEEEEEEEOEE.........OOOOOssssDOOOO..........EOOEEEEEEO....',
    '....OEOOOEO........................................OEEOOEO....',
    '....OEO.OEO........................................EEEEOEO....',
    '.....O...O..........................................OO..O.....',
  ];
  const PX_EYE = { y: 17, x: 19, w: 8, h: 8 };     // her left eye box (viewer's left)
  const PX_MOUTH = { y: 27, x: 26, w: 10, h: 3 };
  const PX_EYES = {
    closed: ['', '', '', '', 'O......O', '.OOOOOO.'],
    happy:  ['', '', '', '...OO...', '.OO..OO.', 'O......O'],
    cry:    ['', '', '', '', 'OOOOOOOO', '.O....O.'],
    x:      ['', '.O....O.', '..O..O..', '...OO...', '...OO...', '..O..O..', '.O....O.'],
  };
  PX_EYES.blink = PX_EYES.closed;
  // smaller mouths that suit this face
  const PX_MOUTHS = { open: ['MMMMMM', '.MIIM.', '..MM..'], wail: ['MMMMMM', 'MIIIIM', 'MITTIM', '.MMMM.'], grin: ['MMMMMM', '.MIIM.', '..MM..'] };
  function drawPixelHead(b, p, pal, hx, hy) {
    // the head is not scaled with the body: it sits 1:1 on top of the scaled neck
    const H4 = pal.hair, F4 = pal.skin || pal.body, rib = pal.ribbon || ['#ffd0da', '#ff8aa6'];
    const col = { O: pal.lash, H: H4[1], M: H4[2], D: H4[3], E: pal.hairLine, S: F4[1], p: F4[2], s: pal.blush || pal.cheek, T: rib[0], t: rib[1], W: '#ffffff', N: pal.mouth };
    const rows = PX_HEAD.map(r => r.split(''));
    const n = rows[0].length;
    // expressions: swap the eyes and mouth
    const eyeKey = p.eyes === 'wink' ? null : p.eyes;
    const paintEye = (glyph, mirror) => {
      const x0 = mirror ? n - PX_EYE.x - PX_EYE.w : PX_EYE.x;
      for (let j = 0; j < PX_EYE.h; j++) for (let i = 0; i < PX_EYE.w; i++) {
        const c = rows[PX_EYE.y + j][x0 + i];
        if ('OWSsp'.includes(c)) rows[PX_EYE.y + j][x0 + i] = 'S';
      }
      glyph.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[mirror ? r.length - 1 - i : i] === 'O') rows[PX_EYE.y + j][x0 + i] = 'O'; });
    };
    if (PX_EYES[eyeKey]) { paintEye(PX_EYES[eyeKey], false); paintEye(PX_EYES[eyeKey], true); }
    if (p.eyes === 'wink') paintEye(PX_EYES.happy, true);
    // a hint of red in the bottom of each eye
    else if (!PX_EYES[eyeKey]) for (const y of [22, 23]) for (let x = 0; x < n; x++) {
      if (rows[y][x] === 'O' && rows[y - 1][x] === 'O' && (Math.abs(x - 22.5) < 3 || Math.abs(x - 38.5) < 3)) rows[y][x] = y === 22 ? 'i' : 'j';
    }
    col.i = pal.iris[1]; col.j = pal.iris[2];
    const mk = p.mouth && p.mouth !== 'smile' ? p.mouth : null;
    let mouth = null;
    if (mk && MOUTHS[mk]) {
      for (let j = 0; j < PX_MOUTH.h; j++) for (let i = 0; i < PX_MOUTH.w; i++) if (rows[PX_MOUTH.y + j][PX_MOUTH.x + i] === 'N') rows[PX_MOUTH.y + j][PX_MOUTH.x + i] = 'S';
      mouth = PX_MOUTHS[mk] || MOUTHS[mk];
    }
    // three-quarter turn toward the viewer's right: slide the eyes, blush and mouth
    // over (the far eye a little less, and one column narrower)
    if (p.turn) {
      const feat = [];
      for (let y = 16; y < 31; y++) for (let x = 17; x < 45; x++) {
        const c = rows[y][x];
        const inEye = y >= PX_EYE.y && y < PX_EYE.y + PX_EYE.h && ((x >= 19 && x <= 26) || (x >= 35 && x <= 42));
        const inMouth = y >= PX_MOUTH.y && y < PX_MOUTH.y + PX_MOUTH.h && x >= 26 && x <= 35;
        if ((inEye && 'OWij'.includes(c)) || (inMouth && c === 'N') || (c === 's' && y >= 24)) {
          feat.push([x, y, c]); rows[y][x] = 'S';
        }
      }
      for (const [x, y, c] of feat) {
        if (x === 42 && y >= PX_EYE.y && y < PX_EYE.y + PX_EYE.h) continue;
        const nx = x + (x > 31 ? 1 : 2);
        if ('Ssp'.includes(rows[y][nx])) rows[y][nx] = c;
      }
    }
    const X0 = Math.round(tx(hx) * K) - 31, Y0 = Math.round(ty(hy + 23.2) * K) - 32;
    rows.forEach((r, j) => r.forEach((c, i) => { if (c !== '.') b.setP(X0 + i, Y0 + j, col[c]); }));
    if (mouth) b.glyphP(X0 + 31 + (p.turn ? 2 : 0) - Math.floor(mouth[0].length / 2), Y0 + PX_MOUTH.y, mouth, { M: pal.mouth, I: pal.mouthIn || pal.mouth, T: pal.cheek, W: '#ffffff' });
  }

  // ---------------------------------------------------------------- skeleton presets
  // arm/leg presets are [elbow|knee, hand|ankle] offsets from the shoulder/hip
  const ARMS = {
    down: [[2.0, 4.3], [3.7, 8.4]], out: [[3, 3], [6, 5]], wave1: [[4, -1.5], [8.4, -4.6]], wave2: [[3.6, -2.6], [5.6, -7.6]],
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

    // shapely leg: thick thigh, slim knee, calf, ankle, small foot
    const drawLeg = (t, [hip, knee, ankle], tones, sgn) => {
      const thigh = [hip[0] + (knee[0] - hip[0]) * 0.45, hip[1] + (knee[1] - hip[1]) * 0.45];
      const calf = [knee[0] + (ankle[0] - knee[0]) * 0.3, knee[1] + (ankle[1] - knee[1]) * 0.3];
      t.limb([hip, thigh, knee, calf, ankle], side ? [2.9, 2.3, 1.35, 1.65, 0.9] : [2.3, 1.85, 1.15, 1.3, 0.8], tones, side ? undefined : [-0.62, 0.62]);
      // foot: a little shoe, wider than the ankle, toes pointing out (forward in side view)
      // mirror-exact pixel for the left foot so both feet match
      const ax = side ? Math.round(ankle[0]) : sgn > 0 ? Math.floor(ankle[0]) : LW - 1 - Math.floor(LW - ankle[0]), ay = Math.round(ankle[1]);
      const shoe = { L: tones[1], M: tones[2], D: tones[3] };
      if (side) t.glyph(ax - 1, ay, ['LMM.', 'MDDD'], shoe);
      else if (sgn > 0) t.glyph(ax - 1, ay, ['LMD.', 'MDDD'], shoe);
      else t.glyph(ax - 2, ay, ['.LMD', 'DDDM'], shoe);
    };
    // front-view standing legs: straight inner edge with a thin gap, outer edge
    // tapering from the hip to a flat rounded foot
    const drawStandLeg = (t, sgn) => {
      const pts = [[1.05, 42.6], [5.1, 42.6], [5.2, 44.4], [4.7, 46.8], [4.05, 49.6], [3.55, 52.2], [3.35, 53.7], [2.95, 55], [1.4, 55], [1.05, 53.8]];
      t.poly(pts.map(([x, y]) => [ox + sgn * x, y + Math.min(0, oy)]), (x, y) => {
        const d = Math.abs(x + 0.5 - ox);         // distance from her center line
        const outer = d > (y < 47 ? 4.1 : 3.0);
        if (y >= 54) return B4[3];                  // sole
        return outer ? (sgn < 0 ? B4[1] : B4[3]) : B4[2];
      });
    };
    const standing = (k) => k === 'stand' || k === 'apart';
    // arms in the suit, bare hands so they stand out against her red hair
    const SK = pal.skin || pal.body, hand = [null, SK[1], SK[1], SK[2]];
    const drawArm = (t, arm, tones) => {
      t.limb(arm, side ? [1.55, 1.1, 0.95] : [1.3, 1.1, 1.0], tones);
      t.limb([arm[2], arm[2]], side ? [1.2, 1.2] : [1.3, 1.3], tones === dark ? [null, SK[2], SK[2], SK[3]] : hand);
    };

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
      if (side) t.rect(ox + 1, 35 + oy, 4, 1, B4[3]);  // shadow under the bust
    });
    if (!side) {
      // legs blend into the hips. Turned (walking), the far leg (B) goes first in
      // shadow and the near leg gets a line where it crosses in front of it.
      const legs = [[legA, p.legA, -1, hipA], [legB, p.legB, 1, hipB]];
      if (p.turn) legs.reverse();
      legs.forEach(([lg, key, sg, hip], i) => part(body, p.turn && i ? pal.outline : null,
        (t) => standing(key) ? drawStandLeg(t, sg) : drawLeg(t, lg, p.turn && !i ? dark : B4, sg), [[hip[0], hip[1], 2.8]]));
    }
    // bust: a soft shadow under each curve, a little shine on top, a cleavage line
    if (!side) {
      for (const sgn of [-1, 1]) {
        const cx = ox + sgn * 2.3, cy = 33.4 + oy;
        body.each(cx - 3, cy - 3, cx + 3, cy + 3, (x, y) => {
          const nx = (x + 0.5 - cx) / 2.6, ny = (y + 0.5 - cy) / 2.2, r = nx * nx + ny * ny;
          if (r > 1) return null;
          if (ny > 0.3 && r > 0.55) return B4[3];
          if (ny < -0.2 && nx * sgn < 0.1 && r < 0.3) return B4[1];
          return null;
        });
      }
      body.each(ox - 1, 31.5 + oy, ox + 1, 34.5 + oy, (x, y) => Math.abs(x + 0.5 - ox) < 0.34 && y > 32 + oy && y < 34.4 + oy ? B4[3] : null);
    } else {
      part(body, pal.outline, (t) => drawLeg(t, legB, B4, 1));
    }
    // neck + head
    body.rect(ox - 1, 27 + oy, 2, 4, (pal.skin || pal.body)[2]);
    part(body, pal.outline, (t) => drawPixelHead(t, p, pal, ox + (side ? -1 : 0), 6 + oy));
    // arms in front
    if (!side) part(body, pal.outline, (t) => drawArm(t, armA, B4), [[shA[0], shA[1], 2.4]]);
    part(body, pal.outline, (t) => drawArm(t, armB, B4), [[shB[0], shB[1], 2.4]]);

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
  // Walking and running, three-quarter view facing right: the lifted foot swings
  // forward, the arms swing against the legs, and she rises as a leg passes under.
  // Offsets are converted to each limb's mirrored preset space (A is the left limb).
  function stride(f, n, run) {
    const ph = (f / n) * Math.PI * 2;
    const reach = run ? 1.1 : 0.6, lift = run ? 3.6 : 2.4, swing = run ? 2.0 : 1.3;
    // u: -1 foot behind, +1 foot ahead; the foot is in the air while it swings forward
    const leg = (s, u, air) => {
      const up = air * lift, ax = u * reach + up * 0.35, kx = ax * 0.5 + up * 0.6;
      return [[0.5 + s * kx, 5.4 - up * 0.5], [0.7 + s * ax, 10.6 - up]];
    };
    const arm = (s, u) => run
      ? [[2.0 + s * u * swing * 0.4, 3.6], [2.4 + s * u * swing, 6.6 - Math.abs(u) * 0.8]]
      : [[2.0 + s * u * swing * 0.35, 4.3], [3.4 + s * u * swing, 8.3 - Math.abs(u) * 0.5]];
    const u = Math.sin(ph), c = Math.cos(ph);
    return {
      turn: 1, sway: run ? -1.2 : -0.6,
      bob: Math.abs(c) > 0.6 ? -1 : 0,                 // highest as a leg passes under her
      legA: leg(-1, u, Math.max(0, c)), legB: leg(1, -u, Math.max(0, -c)),
      armA: arm(-1, -u), armB: arm(1, u),
      mouth: run ? 'grin' : 'smile',
    };
  }
  const ANIMS = {
    idle:  { frames: 4, fps: 3, pose: f => ({ bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open', armA: 'down', armB: 'down', sway: [0, 0.4, 0, -0.4][f] }) },
    walk:  { frames: 8, fps: 10, pose: f => stride(f, 8, false) },
    run:   { frames: 8, fps: 14, pose: f => stride(f, 8, true) },
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
  // Smoother motion: these animations get in-between frames, with limbs, bob and
  // drift blended between key poses (faces and effects come from the nearer key).
  const SMOOTH = { idle: 2, wave: 2, think: 2, cheer: 2, cry: 2, sad: 2, dance: 2, dangle: 2, fall: 2, land: 2, love: 2, angry: 2, dizzy: 2 };
  const resolve = (v, table) => Array.isArray(v) ? v : table[v];
  const mix = (a, b, t) => a.map((pt, i) => pt.map((x, j) => x + (b[i][j] - x) * t));
  function blendPose(p0, p1, t) {
    if (t === 0) return p0;
    const out = Object.assign({}, t < 0.5 ? p0 : p1);
    for (const [k, table, def] of [['armA', ARMS, 'down'], ['armB', ARMS, 'down'], ['legA', LEGS, 'stand'], ['legB', LEGS, 'stand']]) {
      const a = p0[k] || def, b = p1[k] || def;
      if (a !== b) out[k] = mix(resolve(a, table), resolve(b, table), t);
    }
    for (const k of ['bob', 'dx', 'sway']) out[k] = (p0[k] || 0) + ((p1[k] || 0) - (p0[k] || 0)) * t;
    return out;
  }
  for (const [k, sub] of Object.entries(SMOOTH)) {
    const a = ANIMS[k], keys = a.frames, pose = a.pose, loop = a.loop !== false;
    a.frames = keys * sub; a.fps = a.fps * sub;
    a.pose = (g) => {
      const i = Math.floor(g / sub), j = loop ? (i + 1) % keys : Math.min(i + 1, keys - 1);
      return blendPose(pose(i), pose(j), (g % sub) / sub);
    };
  }
  Object.keys(ANIMS).forEach(k => { const a = ANIMS[k]; if (a.loop === undefined) a.loop = true; a.footY = Math.round(ty((a.footY || GROUND) + 1) * K) - 1; });

  // ---------------------------------------------------------------- rendering
  // lying poses are drawn standing, then turned on their side
  function lieDown(buf) {
    // rotate -90deg (head to the left, feet to the right), then slide her down
    // and left so she rests on the ground near the middle of the frame
    const pts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = buf.getP(x, y); if (c) pts.push([y, W - 1 - x, c]); }
    const minX = Math.min(...pts.map(q => q[0])), maxX = Math.max(...pts.map(q => q[0])), maxY = Math.max(...pts.map(q => q[1]));
    const dx = Math.round((W - (maxX - minX + 1)) / 2) - minX, dy = H - 1 - maxY;
    const out = new Buf();
    for (const [x, y, c] of pts) out.setP(x + dx, y + dy, c);
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
