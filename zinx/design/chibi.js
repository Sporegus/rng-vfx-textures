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
  // Wider than tall, so she's chunky and chibi under the big head.
  const BODY_SX = 0.9, BODY_SY = 0.68;
  const tx = (x) => CX + (x - CX) * BODY_SX, ty = (y) => (GROUND + 1) + (y - GROUND - 1) * BODY_SY;
  const itx = (u) => CX + (u - CX) / BODY_SX, ity = (v) => (GROUND + 1) + (v - GROUND - 1) / BODY_SY;

  // ---------------------------------------------------------------- palettes
  // body: [shine, light, mid, shadow], hair: [shine, light, mid, dark]
  const PALETTES = {
    red:     { name: 'Red', suit: ['#ffe0dc', '#f2505c', '#c92a40', '#8f1631'], outline: '#3a0712', body: ['#fff1f0', '#ffcbc8', '#f7a09d', '#e06470'],
               skin: ['#ffd9d8', '#ffa8aa', '#f27e86', '#d4566a'], hair: ['#ffb0ac', '#ff4450', '#d81e34', '#9a1028'], hairLine: '#64061a',
               lash: '#2b0610', iris: ['#4a0614', '#a8132b', '#ee3049', '#ffa3ab'], mouth: '#9c2436', mouthIn: '#c63a50', line: '#ffd2d0', tear: '#ffd6e0', cheek: '#ff9aa6', blush: '#f0606e', ribbon: ['#ffd0da', '#ff8aa6'], tie: '#2b0a12', tieHi: '#6b2232' },
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
    star:  ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'],
    heartS:['X.X', 'XXX', '.X.'],
    vein:  ['XX.XX', 'X...X', '.....', 'X...X', 'XX.XX'],
    sweat: ['.X', 'XX', 'XX'],
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
  // back of the head: same outline, the face turned to hair with a center part
  const PX_HEAD_BACK = [
    '...............OO........OOOOOOOOOOOO........OO...............',
    '..........OOO..HTO....OOOEDDEEEEEEEEEOOO....OTTO.OOOO.........',
    '........OODEDOOHpOO.OODDDDDDMMDMMMDDDEDDOOOOOppOOEEEEOO.......',
    '.......OEDMMDEEHOppOEEDDMMMMMMDMMMMMMMDEDDOppOpEEEMMMEEO......',
    '......OMMMDMEDEOpTOMMMMMMMMMMMMDMMMMMMMMMMMOTpOEEEDDMMMO......',
    '.....OMMMMMMMEOpTODMMMMMMMMMMMMDMMMMMMMMMMMDOTpOOMMMMMMME.....',
    '....OMMMMHMMMOTTOMMMMMMMMMMMMMMDMMMMMMMMMMMMMOTTOMMMMHMMMO....',
    '....OMMMMHMMMOptOMMMMMMMMMMMMMMDMMMMMMMMMMMMMOtpMMMMMHMMMO....',
    '...OMMHHMMDMOppOMMMMMMMMMMMMMMDMMMMMMMMMMMMMMMOppOMMDMMHMMO...',
    '...OMMHHMMDMpTOMMMMMMMMMHHMMHHDHHMMHHHMMMMMMMMMOTpEDDMMHMMO...',
    '...OMMMMMMMOTTOMMMHMHHHHMMMMMHDHHMMMMMHHMHMHMMMEtTEEMMMMMMO...',
    '...OMMMMMMEDOOEMMMHMMMMMMMMMMMDMMMMMMMMMMMMMMMMDOOEEDMMMMMO...',
    '..OMMHMMMDEEOOEMMMMMMMMMMMDMMMMDMMMDMMMMMMMMMMMDOOEEEMMMHMMO..',
    '..OMMHMMMEEEEEEMMMMMMMMMMMDMMMMDMMMDMMMMMMMMMMMDEEEEEMMMHMMO..',
    '..OMMHMMMEEEOEEMMMDMMMDMMMDMMMMDMMMDMMMDMMMEMMMDEOEEEDMMHMMO..',
    '..OMMHMMEEEEOEEEMMEMMMDMMDMMMMMDMMMMDMMDMMMEMMDEEOEEEEMMHMMO..',
    '..OMMMMMEEEEOEEEMMEMMMDMMDMMMMDMMMMMDMMDMMMEMMDEEOEEEEMMMMMO..',
    '..OMMMMMEEEEOEEEMMEMMDMMMDMMMMDMMMMMDMMMDMMEMMDEEOEEEEEMMMMO..',
    '..OMMMMMEEEEOEEEEEMMMDMMMDMMMMDMMMMMDMMMDMMMEEEEEOEEEEEMMMMO..',
    '..OMMMMMEEEOOOEEEEMMMDMMMDMMMMDMMMMMDMMMDMMMEEEEOOOEEEEMMMMO..',
    '..OEMMMMEEOOEOOEMEMMMDMMDMMMMMMDMMMMMDMMDMMMEMDOOEEOEEEMMMDO..',
    '..OEMEMMEEOOEOpEMEMMMDMMDMMMMMMDMMMMMDMMDMMMEMDsOEEOEEEMDMEO..',
    '..OEMEMMEOOOEOpEMEMMMDMMDMMMMMMDMMMMMDMMDMMMEMDsOEEOOEEMDMEO..',
    '..OEEEEEEOOEEOpEMDMMDMMMDMMMMMMDMMMMMDMMMDMEEMDsOEEOOOEEEEEO..',
    '..OEEMEEEEOEEOpEMMDDDDDMDMMMMMDMMMMMMDMDDDDEMMDsOEEEOEEEMEEO..',
    '..OEEMEEEEEEEOOEMMDDDDDDMMMMMMDMMMMMMMDDDDDEMMDOOEEEEEEEMEEO..',
    '..OEEMEEEEEEEO.EMDEDDDDDMMMMMMEMMMMMMMDDDDDEEMEEEEEEEEEEMEEO..',
    '..OEEMEEEEEEEO.EEEEDDDDDDDDDDDEDDDDDDDDDDDDEEEE.EEEEEEEEMEEE..',
    '.OEEEEEEEEEEEO.OEEEEDDDDDDDDDDDEDDDDDDDDDDEEEEO.EEEEEEEEEEEEO.',
    'OMEEOEEEEEEEEO.OEEEOEEEEEEEEEEEEEEEEEEEEEEOEEEO.EEEEEEEEEOEEMO',
    'OEEOOEEEEEEEEEO.OEO..OEEEEEEEEEEEEEEEEEEOO.OEO.NEEEEEEEEEOOEEO',
    '.OO.OEEEEEEEEEO.OO....OOOEEEEEEEEEEEEOOO....OO.EEEEEEEEEEO.OO.',
    '....OEEEEEEEOEE.........OOOOOEEEEDOOOO..........EOOEEEEEEO....',
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
  // Twin tails swing: shear the tail pixels sideways, more toward the tips.
  // ts is the shift at the tips in pixels; tails stay put where they are tied.
  function swayTails(rows, ts) {
    if (!ts) return rows;
    const n = rows[0].length, top = 6, len = 35 - top;
    const inTail = (x, y) => y >= top && (x <= 13 || x >= n - 14);
    const out = rows.map(r => r.slice()), moved = [];
    rows.forEach((r, y) => r.forEach((c, x) => { if (c !== '.' && inTail(x, y)) { moved.push([x, y, c]); out[y][x] = '.'; } }));
    for (const [x, y, c] of moved) {
      const nx = x + Math.round(ts * (y - top) / len);
      if (nx >= 0 && nx < n && out[y][nx] === '.') out[y][nx] = c;
    }
    return out;
  }
  function drawPixelHead(b, p, pal, hx, hy) {
    // the head is not scaled with the body: it sits 1:1 on top of the scaled neck
    const lag = Math.round(p.hdy || 0);                    // the head trails the body a little
    const H4 = pal.hair, F4 = pal.skin || pal.body, rib = pal.ribbon || ['#ffd0da', '#ff8aa6'];
    const col = { O: pal.lash, H: H4[1], M: H4[2], D: H4[3], E: pal.hairLine, S: F4[1], p: F4[2], s: pal.blush || pal.cheek, T: rib[0], t: rib[1], W: '#ffffff', N: pal.mouth };
    if (p.view === 'back') {
      const X0 = Math.round(tx(hx) * K) - 31, Y0 = Math.round(ty(hy + 23.2) * K) - 32 + lag;
      swayTails(PX_HEAD_BACK.map(r => r.split('')), p.tails).forEach((r, j) => r.forEach((c, i) => { if (c !== '.') b.setP(X0 + i, Y0 + j, col[c]); }));
      return;
    }
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
    const X0 = Math.round(tx(hx) * K) - 31, Y0 = Math.round(ty(hy + 23.2) * K) - 32 + lag;
    swayTails(rows, p.tails).forEach((r, j) => r.forEach((c, i) => { if (c !== '.') b.setP(X0 + i, Y0 + j, col[c]); }));
    if (mouth) b.glyphP(X0 + 31 - Math.floor(mouth[0].length / 2), Y0 + PX_MOUTH.y, mouth, { M: pal.mouth, I: pal.mouthIn || pal.mouth, T: pal.cheek, W: '#ffffff' });
  }

  // ---------------------------------------------------------------- skeleton presets
  // arm/leg presets are [elbow|knee, hand|ankle] offsets from the shoulder/hip
  const ARMS = {
    down: [[1.5, 4.2], [2.3, 8.1]], out: [[3, 3], [6, 5]], wave1: [[4, -1.5], [8.4, -4.6]], wave2: [[3.6, -2.6], [5.6, -7.6]],
    up: [[3, -4], [6, -8]], hip: [[4.7, 3.1], [2.3, 7.8]], chin: [[2, 4], [-1, -1]], eyes: [[2, 4], [-2, -4]],
    point: [[4, 1], [9, 0]], hold: [[2, 5], [6, 5]], swingF: [[2, 4], [4, 9]], swingB: [[-2, 4], [-4, 9]],
    flail: [[4, -3], [8, -6]], heart: [[2, 4], [-1, 2]], type: [[2, 5], [6, 4]], back: [[-1, 5], [-3, 9]],
    tap: [[2, 4], [-0.6, -0.4]], gesture: [[2, 4], [5, 3]], low: [[2.4, 3.6], [3.6, 7.2]], type2: [[2, 5], [5.4, 4.4]],
  };
  const LEGS = {
    stand: [[0.5, 5.4], [0.7, 10.6]], apart: [[0.9, 5.4], [1.7, 10.6]],
    stepF: [[2, 5], [4, 10.5]], stepB: [[-1.5, 5], [-4, 10]], pass: [[1.5, 4.5], [0, 9]],
    runF: [[4, 4], [7, 9]], runB: [[-3, 5], [-7, 8]], runUp: [[4, 3], [2, 7]],
    sit: [[0.6, 2.5], [1, 9]], sitA: [[0.9, 2.0], [1.1, 7.6]], sitB: [[0.9, 2.0], [1.6, 6.2]], squat: [[1.6, 4.0], [1.0, 8.4]], lift: [[1.3, 3.4], [1.0, 7.6]], kick: [[0.5, 5.0], [1.6, 9.6]], tuck: [[3, 3], [0, 6]], dangle: [[0.5, 5.5], [1, 11]], kneel: [[3, 4], [-2, 6]],
  };

  // ---------------------------------------------------------------- the character
  function drawZinx(pose, palKey) {
    const pal = palOf(palKey);
    const p = Object.assign({ view: 'front', bob: 0, dx: 0, eyes: 'open', mouth: 'smile', armA: 'down', armB: 'down', legA: 'stand', legB: 'stand' }, pose);
    const back = p.view === 'back';
    const ox = CX + p.dx, oy = p.bob;
    const B4 = pal.suit || pal.body;
    const body = new Buf();
    const fx = new Buf();

    const shA = [ox - 4.2, 32.0 + oy], shB = [ox + 4.2, 32.0 + oy];
    const hipA = [ox - 2.5, 42.6 + oy], hipB = [ox + 2.5, 42.6 + oy];
    const mirror = (o, s) => [o[0] * s, o[1]];
    const joint = (base, preset, table, s, leg) => {
      const v = Array.isArray(preset) ? preset : table[preset] || table.down || table.stand;
      const k = leg ? 0.95 : 1;
      const e = mirror(v[0], s), h = mirror(v[1], s);
      const end = [base[0] + h[0], base[1] + h[1] * k];
      if (leg && oy > 0) end[1] -= oy; // feet stay planted when she bobs down
      return [base, [base[0] + e[0], base[1] + e[1] * k], end];
    };
    // A is the viewer's left (mirrored), B the viewer's right
    const armA = joint(shA, p.armA, ARMS, -1), armB = joint(shB, p.armB, ARMS, 1);
    const legA = joint(hipA, p.legA, LEGS, -1, true), legB = joint(hipB, p.legB, LEGS, 1, true);

    // shapely leg: thick thigh, slim knee, calf, ankle, small foot
    const drawLeg = (t, [hip, knee, ankle], tones, sgn) => {
      const thigh = [hip[0] + (knee[0] - hip[0]) * 0.45, hip[1] + (knee[1] - hip[1]) * 0.45];
      const calf = [knee[0] + (ankle[0] - knee[0]) * 0.3, knee[1] + (ankle[1] - knee[1]) * 0.3];
      t.limb([hip, thigh, knee, calf, ankle], [2.4, 2.2, 1.65, 1.7, 1.15], tones, [-0.62, 0.62]);
      // foot: a little shoe, wider than the ankle, toes pointing out
      // mirror-exact pixel for the left foot so both feet match
      const ax = sgn > 0 ? Math.floor(ankle[0]) : LW - 1 - Math.floor(LW - ankle[0]), ay = Math.round(ankle[1]);
      const shoe = { L: tones[1], M: tones[2], D: tones[3] };
      if (sgn > 0) t.glyph(ax - 1, ay, ['LMD.', 'MDDD'], shoe);
      else t.glyph(ax - 2, ay, ['.LMD', 'DDDM'], shoe);
    };
    // front-view standing legs: straight inner edge with a thin gap, outer edge
    // tapering from the hip to a flat rounded foot
    const drawStandLeg = (t, sgn) => {
      const pts = [[0.3, 43.4], [4.9, 42.6], [5.05, 44.4], [4.8, 46.8], [4.3, 49.6], [3.9, 52.2], [3.7, 53.7], [3.4, 55], [0.3, 55], [0.3, 53.8]];
      t.poly(pts.map(([x, y]) => [ox + sgn * x, y + Math.min(0, oy)]), (x, y) => {
        const d = Math.abs(x + 0.5 - ox);         // distance from her center line
        const outer = d > (y < 47 ? 4.4 : 3.2);
        if (y >= 54) return B4[3];                  // sole
        return outer && sgn > 0 ? B4[3] : B4[2];
      });
    };
    const standing = (k) => k === 'stand' || k === 'apart';
    // arms in the suit, bare hands so they stand out against her red hair
    const SK = pal.skin || pal.body, hand = [null, SK[1], SK[1], SK[2]];
    const drawArm = (t, arm, tones) => {
      t.limb(arm, [1.5, 1.4, 1.3], tones);
      t.limb([arm[2], arm[2]], [1.5, 1.5], hand);
    };

    // Glowing circuit lines: 2-pixel lines in the shine color, only drawn over the
    // suit. Points are logical [dx from her center, y]; `mirror` repeats the line
    // on her other side, mirror-exact around her center ('only' draws just that copy).
    const suit = new Set(B4.slice(1));
    const midX = Math.round(tx(ox) * K);
    const glow = (buf, pts, mirror, c = B4[0], thin = false) => {
      const P = pts.map(([x, y]) => [Math.round(tx(ox + x) * K), Math.round(ty(y + oy) * K)]);
      const dot = (X, Y) => { if (suit.has(buf.getP(X, Y))) buf.setP(X, Y, c); };
      for (let i = 0; i < P.length - 1; i++) {
        const [x0, y0] = P[i], [x1, y1] = P[i + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let k = 0; k <= n; k++) {
          const X = Math.round(x0 + (x1 - x0) * k / n), Y = Math.round(y0 + (y1 - y0) * k / n);
          // two pixels thick: widen across the line's direction
          const [ex, ey] = thin ? [0, 0] : Math.abs(x1 - x0) > Math.abs(y1 - y0) ? [0, 1] : [1, 0];
          if (mirror !== 'only') { dot(X, Y); dot(X + ex, Y + ey); }
          if (mirror) { dot(2 * midX - 1 - X, Y); dot(2 * midX - 1 - X - ex, Y + ey); }
        }
      }
    };
    // a line along a limb, nudged to one side of its bones
    const limbGlow = (buf, joints, off, c) => {
      const pts = [];
      for (let i = 0; i < joints.length; i++) {
        const a = joints[Math.max(0, i - 1)], b = joints[Math.min(joints.length - 1, i + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        pts.push([joints[i][0] - ox - dy / L * off, joints[i][1] - oy + dx / L * off]);
      }
      glow(buf, i0(pts), false, c);
    };
    const i0 = (pts) => pts.slice(0, -1).concat([pts[pts.length - 1]]);
    // her front silhouette: half-width at each height, smoothed into an hourglass
    const WAIST = [[29.6, 1.8], [30.4, 3.3], [31.4, 4.4], [32.6, 4.8], [34.2, 5.1], [35.8, 4.3], [37.2, 3.1], [38.6, 2.5], [40.2, 3.2], [41.8, 4.5], [43.2, 5.15], [44.4, 5.15], [45.0, 4.95]];
    // Catmull-Rom through [y, x] knots
    const profile = (k) => (y) => {
      const n = k.length;
      if (y <= k[0][0]) return k[0][1];
      if (y >= k[n - 1][0]) return k[n - 1][1];
      let i = 0; while (k[i + 1][0] < y) i++;
      const p0 = k[Math.max(0, i - 1)][1], p1 = k[i][1], p2 = k[i + 1][1], p3 = k[Math.min(n - 1, i + 2)][1];
      const t = (y - k[i][0]) / (k[i + 1][0] - k[i][0]);
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    };
    const halfW = profile(WAIST);
    const span = (y0, y1, f) => { const out = []; for (let y = y0; y <= y1 + 1e-6; y += 0.5) out.push([f(y), y]); return out; };
    const sideCurve = span(35.6, 40.6, (y) => halfW(y) - 1.2);          // thin, from the bust to the waist
    // glow lines down a standing leg (right-leg coordinates; sgn -1 mirrors to the left)
    const STAND_LEG_LINES = [[[3.4, 46.4], [3.1, 48.2], [2.7, 50.4], [2.4, 52.6], [2.3, 53.6]], [[1.9, 45.6], [2.1, 48.2], [1.9, 51], [1.8, 53.6]]];
    const FRONT_LINES = [
      [[1.2, 30.2], [2.6, 30.7], [3.6, 31.6]],                            // collar to shoulder
    ];
    // suit detail under the bust: two curved glow lines on each side of her tummy, ( ( ) )
    const TUMMY = [
      [[1.2, 37.5], [1.8, 38.6], [1.9, 40.0], [1.5, 41.4], [1.2, 42.2]],
      [[0.5, 37.8], [0.9, 38.8], [0.95, 40.0], [0.6, 41.0]],
    ];
    const BACK_LINES = [
      [[1.2, 30.2], [2.6, 30.7], [3.6, 31.6]],
      [[0.6, 31.8], [2.0, 32.8], [3.4, 32.2]],                            // shoulder blades
      [[0.5, 36.2], [1.2, 38.6], [0.6, 41.0]],                            // small of the back
    ];
    // torso: hourglass with a bust and round hips
    const T = (pts) => pts.map(([x, y]) => [x + ox, y + oy]);
    const torso = T(span(29.6, 45, halfW).concat([[1.2, 45], [0, 44.8], [-1.2, 45]], span(29.6, 45, halfW).reverse().map(([x, y]) => [-x, y])));
    part(body, pal.outline, (t) => t.poly(torso, (x, y) => {
      const rel = (x + 0.5 - ox) / 6;
      return rel < -0.72 ? B4[1] : rel > 0.72 ? B4[3] : B4[2];
    }));
    // legs blend into the hips
    // (a natural gap opens between her thighs when they part; where one bent leg
    // crosses the other, the second gets an outline so they don't merge)
    for (const [lg, key, sg, hip, i] of [[legA, p.legA, -1, hipA, 0], [legB, p.legB, 1, hipB, 1]])
      part(body, i && p.legA !== p.legB ? pal.outline : null,
        (t) => standing(key) ? drawStandLeg(t, sg) : drawLeg(t, lg, B4, sg), [[hip[0], hip[1], 2.8], [ox, 43.2 + oy, 2.2]]);
    // from the back, a soft line where the legs meet
    if (back) body.each(ox - 1, 42 + oy, ox + 1, 45 + oy, (x, y) => Math.abs(x + 0.5 - ox) < 0.34 && y > 42.8 + oy ? B4[3] : null);
    for (const l of back ? BACK_LINES : FRONT_LINES) glow(body, l, true);
    glow(body, sideCurve, true, B4[0], true);
    if (!back) for (const l of TUMMY) glow(body, l, true, B4[0], true);
    for (const [lg, key, sg] of [[legA, p.legA, -1], [legB, p.legB, 1]]) {
      // on a bent leg the line runs down its outer side, starting below the hip
      if (!standing(key)) {
        const [h, k, a] = lg, from = [h[0] + (k[0] - h[0]) * 0.45, h[1] + (k[1] - h[1]) * 0.45];
        limbGlow(body, [from, k, a], sg * -0.75);
      }
      else for (const l of STAND_LEG_LINES) glow(body, l, sg < 0 ? 'only' : false);
    }
    // neck + head
    body.rect(ox - 1, 27 + oy, 2, 4, (pal.skin || pal.body)[2]);
    part(body, pal.outline, (t) => drawPixelHead(t, p, pal, ox, 6 + oy));
    // arms in front
    part(body, pal.outline, (t) => { drawArm(t, armA, B4); limbGlow(t, armA, 0.5); }, [[shA[0], shA[1], 2.4]]);
    part(body, pal.outline, (t) => { drawArm(t, armB, B4); limbGlow(t, armB, -0.5); }, [[shB[0], shB[1], 2.4]]);

    // the bust sits in front of her upper arms
    if (!back) {
      // two full, round breasts drawn in real pixels (mirror-exact): mid tone with a
      // shine up top, shadow underneath, and a dark outline round the bottom
      // each breast is a little narrower than it is tall, so the pair sit close together
      const R = 4.1, RX = 3.6, cyP = Math.round(ty(34.6 + oy) * K) + 0.5;
      const inB = (i, Y) => Math.hypot((i + 0.5 - RX) / RX, (Y + 0.5 - cyP) / R) <= 1;
      const bottom = [], under = new Map();
      for (let Y = Math.floor(cyP - R); Y <= Math.ceil(cyP + R); Y++) for (let i = 0; i < 2 * RX + 1; i++) {
        if (!inB(i, Y)) continue;
        const X = midX + i, nx = (i + 0.5 - RX) / RX, ny = (Y + 0.5 - cyP) / R, r = Math.hypot(nx, ny);
        // the lowest pixel of each column, and the outermost pixels below the middle, are outline
        const c = (ny > 0.05 && (!inB(i, Y + 1) || !inB(i - 1, Y) || !inB(i + 1, Y))) ? pal.outline
          : ny > 0.35 && r > 0.55 ? B4[3]
          : ny < -0.1 && r < 0.6 && nx < 0.25 ? B4[1]
          : B4[2];
        if (!under.has(X + ',' + Y)) under.set(X + ',' + Y, [body.getP(X, Y), body.getP(2 * midX - 1 - X, Y)]);
        body.setP(X, Y, c); body.setP(2 * midX - 1 - X, Y, c);
        bottom[i] = Y;
      }
      // a column that dips one pixel below both neighbours pokes out of the curve:
      // lift its outline a pixel and give the suit back underneath
      bottom.forEach((Y, i) => {
        if (!(Y > (bottom[i - 1] ?? Infinity) && Y > (bottom[i + 1] ?? Infinity))) return;
        const X = midX + i, [a, b] = under.get(X + ',' + Y);
        body.setP(X, Y, a); body.setP(2 * midX - 1 - X, Y, b);
        body.setP(X, Y - 1, pal.outline); body.setP(2 * midX - 1 - X, Y - 1, pal.outline);
      });
      // suit lines carry on over the chest: an arc over the top of each breast and a
      // V neckline running down to the cleavage
      const glowP = (X, Y) => { if (suit.has(body.getP(X, Y))) { body.setP(X, Y, B4[0]); body.setP(2 * midX - 1 - X, Y, B4[0]); } };
      for (let a = 200; a <= 335; a += 4) {
        const t = a * Math.PI / 180, r = R - 1.6;
        glowP(Math.round(midX + RX + Math.cos(t) * (RX - 1.4) - 0.5), Math.round(cyP + Math.sin(t) * r * 0.95 - 0.5));
      }
      const neckTop = Math.round(cyP - R) - 3;
      for (let k = 0; k <= 3; k++) glowP(midX + 3 - k, neckTop + k);
    }
    // props / effects
    if (p.panel) {
      const x = armB[2][0] + 2, y = armB[2][1] - 9;
      fx.rect(x, y, 10, 7, B4[0] + '70'); fx.rect(x, y, 10, 1, B4[0]); fx.rect(x + 2, y + 2, 5 + (p.panel % 2) * 2, 1, B4[0]); fx.rect(x + 2, y + 4, 4, 1, B4[0]);
    }
    // tears: [dx, dy] in real pixels from her center line and the top of her head
    if (p.tears) {
      const headY = Math.round(ty(6 + oy + 23.2) * K) - 32 + Math.round(p.hdy || 0);
      p.tears.forEach(([x, y]) => fx.glyphP(midX + x, headY + y, ['.X.', 'XXX', 'XXX', '.X.'], { X: '#bfe9ff' }));
    }
    const out = outline(body, pal.outline);
    // standing, the legs touch with a thin line between them
    if (standing(p.legA) && standing(p.legB)) {
      for (let Y = Math.round(ty(44.8 + Math.min(0, oy)) * K); Y < H; Y++) if (out.p[Y * W + midX]) out.p[Y * W + midX] = pal.outline;
    }
    for (let i = 0; i < fx.p.length; i++) if (fx.p[i]) out.p[i] = fx.p[i];
    return out;
  }
  // floating effects (sparkles, hearts, zzz) are added after any rotation
  function addFx(out, pose, palKey) {
    const pal = palOf(palKey);
    // positions are in the unscaled 56 x 56 grid, so effects keep their size
    (pose.fx || []).forEach(([g, x, y, c]) => {
      const col = c === 'hair' ? pal.hair[1] : c === 'line' ? pal.line : c;
      G[g].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) out.setP(Math.round((x + i) * K) + u, Math.round((y + j) * K) + v, col); });
    });
  }
  

  // ---------------------------------------------------------------- animations
  // Effects ([glyph, x, y, color]) use the unscaled 56 x 56 grid: her head spans
  // about x 13..43, y 22..40 there, so the space above it is free for effects.
  const SIN = (f, n, ph = 0) => Math.sin((f / n) * Math.PI * 2 + ph), COS = (f, n, ph = 0) => Math.cos((f / n) * Math.PI * 2 + ph);
  const ANIMS = {
    // breathing: the body rises, the head follows a beat later, the tails sway, a blink
    idle:  { frames: 6, fps: 4, pose: f => ({ bob: [0, 0.5, 1, 1, 0.5, 0][f], hdy: [0, 0, 0, 1, 1, 0][f], tails: [0, 0.5, 1, 0.5, 0, -0.5][f], eyes: f === 5 ? 'blink' : 'open', armA: 'down', armB: 'down' }) },
    back:  { frames: 6, fps: 4, pose: f => ({ view: 'back', bob: [0, 0.5, 1, 1, 0.5, 0][f], hdy: [0, 0, 0, 1, 1, 0][f], tails: [0, 0.5, 1, 0.5, 0, -0.5][f], armA: 'down', armB: 'down' }) },
    // a big friendly wave: the hand swings, the tails swing the other way, sparkles
    wave:  { frames: 4, fps: 5, pose: f => ({ armB: f % 2 ? 'wave2' : 'wave1', armA: 'hip', eyes: 'happy', mouth: 'open', bob: f % 2 ? 0.5 : 0, tails: f % 2 ? -1.5 : 1.5, fx: [['spark2', 46, 23 + (f % 2) * 2, '#ffffff']].concat(f % 2 ? [] : [['star', 49, 27, 'line']]) }) },
    // chatting: mouth flaps, little hand gestures, a bounce
    talk:  { frames: 4, fps: 7, pose: f => ({ mouth: ['smile', 'open', 'o', 'open'][f], armB: f % 2 ? 'gesture' : 'hold', armA: 'hip', bob: f % 2 ? 0.5 : 0, tails: [0, 0.5, 0, -0.5][f] }) },
    // "over there!": point, wink, a twinkle at the fingertip
    point: { frames: 4, fps: 4, pose: f => ({ armB: 'point', armA: 'hip', eyes: f < 2 ? 'wink' : 'open', mouth: 'grin', bob: f === 1 ? -0.5 : 0, tails: [0, 1, 0.5, 0][f], fx: f % 2 ? [['spark2', 47, 37, '#ffffff']] : [['star', 46, 36, 'line']] }) },
    // tapping her chin, a question mark and thought dots floating up
    think: { frames: 4, fps: 3, pose: f => ({ armB: f % 2 ? 'tap' : 'chin', armA: 'heart', eyes: 'open', mouth: 'flat', tails: [0, 0.5, 0, -0.5][f], fx: [['q', 44, 14 + (f % 2), 'line'], ['dot', 41, 21 - f, 'line'], ['dot', 39, 24 - f, 'line']] }) },
    // crouch, jump, tuck at the top, land in a squash, pop up, with sparkles
    cheer: { frames: 6, fps: 6, pose: f => [
      { bob: 2, hdy: 1, legA: 'squat', legB: 'squat', armA: 'low', armB: 'low', eyes: 'happy', mouth: 'smile' },
      { bob: -3, legA: 'stand', legB: 'stand', armA: 'up', armB: 'up', eyes: 'happy', mouth: 'open', tails: 1, fx: [['spark2', 8, 30, '#ffffff']] },
      { bob: -6, hdy: -1, legA: 'tuck', legB: 'tuck', armA: 'up', armB: 'up', eyes: 'happy', mouth: 'open', tails: -1, fx: [['star', 6, 22, 'line'], ['star', 46, 18, 'line'], ['spark2', 26, 14, '#ffffff']] },
      { bob: -3, legA: 'kick', legB: 'kick', armA: 'up', armB: 'up', eyes: 'happy', mouth: 'open', tails: 1, fx: [['spark2', 47, 26, '#ffffff'], ['spark2', 6, 18, '#ffffff']] },
      { bob: 2, hdy: 1, legA: 'squat', legB: 'squat', armA: 'low', armB: 'low', eyes: 'happy', mouth: 'grin', tails: -0.5 },
      { bob: 0, legA: 'stand', legB: 'stand', armA: 'down', armB: 'down', eyes: 'happy', mouth: 'smile' },
    ][f] },
    // perched on an edge, swinging her legs
    sit:   { frames: 4, fps: 3, footY: 44, pose: f => ({ legA: f % 2 ? 'sitB' : 'sitA', legB: f % 2 ? 'sitA' : 'sitB', armA: [[1, 5], [2, 9]], armB: [[1, 5], [2, 9]], bob: f === 2 ? 0.5 : 0, tails: [0, 0.5, 0, -0.5][f], eyes: f === 3 ? 'blink' : 'open' }) },
    sleep: { frames: 4, fps: 2, lie: true, pose: f => ({ eyes: 'closed', mouth: 'o', armA: 'down', armB: 'down', legB: 'apart', bob: 0, fx: [['z', 16, 22 - f, 'line'], ['zBig', 21, 15 - (f % 2), 'line']].slice(0, 1 + (f % 2)) }) },
    // sobbing: shoulders shake and tears stream down
    cry:   { frames: 4, fps: 6, pose: f => ({ armA: 'eyes', armB: 'eyes', eyes: 'cry', mouth: 'wail', dx: f % 2 ? 0.4 : -0.4, bob: f % 2 ? 0.5 : 0, tails: f % 2 ? 1 : -1, tears: [[-11, 24 + (f * 3) % 9], [8, 24 + ((f + 2) * 3) % 9]] }) },
    // slumped, one tear rolling down
    sad:   { frames: 4, fps: 2, pose: f => ({ armA: 'down', armB: 'back', eyes: 'sad', mouth: 'frown', bob: [1, 1.5, 1.5, 1][f], hdy: 1, tears: f ? [[-11, 23 + f * 2]] : [] }) },
    // hips swing, arms trade places, a knee pops on the beat, notes float up
    dance: { frames: 8, fps: 6, pose: f => ({ dx: SIN(f, 8) * 1.6, bob: f % 2 ? 1 : 0, tails: -SIN(f, 8) * 2, armA: f < 4 ? 'up' : 'hip', armB: f < 4 ? 'hip' : 'up', legA: f === 5 ? 'lift' : 'stand', legB: f === 1 ? 'lift' : 'stand', eyes: 'happy', mouth: f % 2 ? 'open' : 'smile', fx: [['note', f < 4 ? 6 : 46, 32 - (f % 4) * 3, 'line'], ['note', f < 4 ? 46 : 6, 22 - (f % 4) * 2, 'line']] }) },
    // picked up: legs kick, a nervous sweat drop
    dangle:{ frames: 4, fps: 6, pose: f => ({ armA: 'up', armB: 'up', legA: f % 2 ? 'kick' : 'dangle', legB: f % 2 ? 'dangle' : 'kick', eyes: 'wide', mouth: 'o', dx: SIN(f, 4) * 0.6, tails: -SIN(f, 4) * 1.5, fx: [['sweat', 44, 24 + (f % 2), '#cfefff']] }) },
    fall:  { frames: 4, fps: 10, pose: f => ({ armA: f % 2 ? 'up' : 'flail', armB: f % 2 ? 'flail' : 'up', legA: f % 2 ? 'pass' : 'tuck', legB: f % 2 ? 'tuck' : 'pass', eyes: 'wide', mouth: 'wail', tails: f % 2 ? 2 : -2, fx: [['sweat', 45, 22, '#cfefff'], ['sweat', 9, 25, '#cfefff']] }) },
    // landing: squash, then spring back up
    land:  { frames: 3, fps: 8, loop: false, pose: f => [
      { bob: 3, hdy: 1, legA: 'squat', legB: 'squat', armA: 'out', armB: 'out', eyes: 'closed', mouth: 'flat', tails: -1 },
      { bob: 1, legA: 'squat', legB: 'squat', armA: 'low', armB: 'low', eyes: 'open', mouth: 'flat', tails: 0.5 },
      { bob: 0, legA: 'stand', legB: 'stand', armA: 'down', armB: 'down', eyes: 'open', mouth: 'smile' },
    ][f] },
    work:  { frames: 4, fps: 6, pose: f => ({ armB: f % 2 ? 'type2' : 'type', armA: f % 2 ? 'hold' : 'type2', eyes: f === 3 ? 'blink' : 'open', mouth: 'flat', panel: f + 1, hdy: f % 2 }) },
    // swaying with her hands on her heart while hearts float up
    love:  { frames: 6, fps: 5, pose: f => ({ armA: 'heart', armB: 'heart', eyes: 'happy', blush: true, dx: SIN(f, 6) * 0.5, bob: [0, 0.5, 1, 0.5, 0, 0][f], tails: -SIN(f, 6) * 1.2, fx: [['heart', 40, 28 - f * 2, '#ff8fb0'], ['heartS', 12, 30 - ((f + 3) % 6) * 2, '#ff8fb0'], ['heartS', 27, 18 - (f % 3), '#ffb3c8']] }) },
    // stomping, with a throbbing anger mark
    angry: { frames: 4, fps: 8, pose: f => ({ armA: 'hip', armB: 'hip', eyes: 'angry', mouth: 'frown', bob: f % 2 ? 1 : 0, dx: [0, 0.5, 0, -0.5][f], tails: f % 2 ? 1 : -1, fx: [f % 2 ? ['vein', 39, 22, '#ff3b4f'] : ['spark2', 40, 23, '#ff3b4f'], ['bang', 46, 18, '#ffffff']] }) },
    // wobbling in a circle while stars orbit her head
    dizzy: { frames: 8, fps: 8, pose: f => ({ eyes: 'x', mouth: 'wail', dx: SIN(f, 8), bob: COS(f, 8) * 0.5, tails: -SIN(f, 8) * 1.5, armA: 'out', armB: 'out',
      fx: [0, 1, 2].map(k => { const a = (f / 8 + k / 3) * Math.PI * 2; return [Math.sin(a) > 0 ? 'star' : 'spark2', Math.round(26 + Math.cos(a) * 14), Math.round(19 + Math.sin(a) * 2.5), '#ffe14d']; }) }) },
  };
  // Smoother motion: these animations get in-between frames, with limbs, bob and
  // drift blended between key poses (faces and effects come from the nearer key).
  const SMOOTH = { idle: 2, back: 2, wave: 2, point: 2, think: 2, cheer: 2, sit: 2, cry: 2, sad: 2, dance: 2, dangle: 2, land: 2, love: 2 };
  const resolve = (v, table) => Array.isArray(v) ? v : table[v];
  const mix = (a, b, t) => a.map((pt, i) => pt.map((x, j) => x + (b[i][j] - x) * t));
  function blendPose(p0, p1, t) {
    if (t === 0) return p0;
    const out = Object.assign({}, t < 0.5 ? p0 : p1);
    for (const [k, table, def] of [['armA', ARMS, 'down'], ['armB', ARMS, 'down'], ['legA', LEGS, 'stand'], ['legB', LEGS, 'stand']]) {
      const a = p0[k] || def, b = p1[k] || def;
      if (a !== b) out[k] = mix(resolve(a, table), resolve(b, table), t);
    }
    for (const k of ['bob', 'dx', 'sway', 'tails', 'hdy']) out[k] = (p0[k] || 0) + ((p1[k] || 0) - (p0[k] || 0)) * t;
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
