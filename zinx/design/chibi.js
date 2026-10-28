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
  // side view facing right; the skull's center is column 22
  const PX_HEAD_SIDE = [
    '...............OOOOMMMMMMMOOO.................',
    '..........OOO.OHTMMMMMMMMMMMMOO...............',
    '........OODEDOMMpMMDMMMMMDMMMMMO..............',
    '.......OEDMMDMMMMpMDMMMMMDMMMMMMO.............',
    '......OMMMDMMMDMpTMDMMMMMDMMMMMMMO............',
    '.....OMMMMMDMMDpTMDMMMMMMDMMMMMMMMO...........',
    '....OMMMMHDDMDTTMMDMMMMMDMMMMMMMMMMO..........',
    '....OMMMMDDDMDptMMHHHHMHHHHHMMMMMMMMO.........',
    '...OMMHHMDDDMppHMHHHMMMMHHMMMHHHMMMMO.........',
    '...OMMHHDDDDpTMMMMDMMMMMDMMMMMHHHMMMMO........',
    '...OMMMMDDDDTTMMMMDMMMMMDMMMMMMMMMMMMO........',
    '...OMMMMDDDDDMMMMMDMMMMMOOMMMMMMMMMMMO........',
    '..OMMHMMDDDDDMMMMDMMMMMOSSOMMMMMMMMMMOO.......',
    '..OMMHMDDDDDDMMMMDMMMMMOSSOMMMMMMMMMMMMO......',
    '..OMMHMDDDDEMMMMMDMMMMMOSSOMMMMMMMMMMMMO......',
    '..OMMHMDDDDEMMMMMDMOMMMOSSOMMMOMMMMMMMMO......',
    '..OMMMMDDDDEMMMMMDOSOMMOSSSOMOSOMMMOMMMO......',
    '..OMMMMDDDEDMMMMDMOSOMMOSSSSOSSOOMOSOMMO......',
    '..OMMMMMEEEDMMMMDMOSOMMOSSSSSSOOOOSSSOO.......',
    '..OMMMMMEEEDMMMMDMOSOMMOSSSSSOOOWOSSSO........',
    '..OEMMMMEEEDMMMMDMOSOMMOSSSSSWOOOOSSSO........',
    '..OEMEMMEEDDMMMMDMOSSOMMOSSSSWOOOOSSSO........',
    '..OEMEMMEEDDDDDDEDOSSOMMOSSSSWOOOOSSSO........',
    '..OEEEEEEODDDDDDEDOSSOMMOSSSSWOOOOSSSO........',
    '..OEEMEEEEDDDDDEDDOSSOMOSSSSSSSOOSSSSO........',
    '..OEEMEEEEEDDDDEDDOSSOOSSSSSSSSSSSSSO.........',
    '..OEEMEEEEEEEEEEEEEOSOSSSSSSSsssSSSSO.........',
    '..OEEMEEEEEEEOEEEEEOSOSSSSSSSSsSSSNO..........',
    '.OEEEEEEEEEEEOOEEEEEOOSSSSSSSSSSNNO...........',
    'OMEEOEEEEEEEEO.OEEEEEOSSSSSSSSSSSO............',
    'OEEOOEEEEEEEEEO.OEOOO.OOSSSSSSSOO.............',
    '.OO.OEEEEEEEEEO.OO......OOOOOOO...............',
    '....OEEEEEEEOEEO..............................',
    '....OEOOOEOO.OO...............................',
    '....OEO.OEO...................................',
    '.....O...O....................................',
  ];
  const PX_SIDE_EYE = { x: 29, y: 16, w: 6, h: 9 };
  const PX_SIDE_EYES = { closed: ['', '', '', '', '', 'O....O', '.OOOO.'], happy: ['', '', '', '', '..OO..', '.O..O.', 'O....O'] };
  PX_SIDE_EYES.blink = PX_SIDE_EYES.cry = PX_SIDE_EYES.closed;
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
    if (p.view === 'back' || p.view === 'side') {
      const back = p.view === 'back', rows = (back ? PX_HEAD_BACK : PX_HEAD_SIDE).map(r => r.split(''));
      if (!back) {
        const g = PX_SIDE_EYES[p.eyes === 'wink' ? 'happy' : p.eyes], E = PX_SIDE_EYE;
        if (g) {
          for (let j = 0; j < E.h; j++) for (let i = 0; i < E.w; i++) if ('OWij'.includes(rows[E.y + j][E.x + i])) rows[E.y + j][E.x + i] = 'S';
          g.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'O') rows[E.y + j][E.x + i] = 'O'; });
        }
        if (['open', 'grin', 'wail', 'o', 'tongue'].includes(p.mouth)) for (const [x, y] of [[32, 28], [33, 28], [32, 29]]) rows[y][x] = 'N';
      }
      col.i = pal.iris[1]; col.j = pal.iris[2];
      const X0 = Math.round(tx(hx) * K) - (back ? 31 : 22), Y0 = Math.round(ty(hy + 23.2) * K) - 32;
      rows.forEach((r, j) => r.forEach((c, i) => { if (c !== '.') b.setP(X0 + i, Y0 + j, col[c]); }));
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
    const X0 = Math.round(tx(hx) * K) - 31, Y0 = Math.round(ty(hy + 23.2) * K) - 32;
    rows.forEach((r, j) => r.forEach((c, i) => { if (c !== '.') b.setP(X0 + i, Y0 + j, col[c]); }));
    if (mouth) b.glyphP(X0 + 31 - Math.floor(mouth[0].length / 2), Y0 + PX_MOUTH.y, mouth, { M: pal.mouth, I: pal.mouthIn || pal.mouth, T: pal.cheek, W: '#ffffff' });
  }

  // ---------------------------------------------------------------- skeleton presets
  // arm/leg presets are [elbow|knee, hand|ankle] offsets from the shoulder/hip
  const ARMS = {
    down: [[2.4, 4.0], [4.0, 7.9]], out: [[3, 3], [6, 5]], wave1: [[4, -1.5], [8.4, -4.6]], wave2: [[3.6, -2.6], [5.6, -7.6]],
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
    const side = p.view === 'side', back = p.view === 'back';
    const ox = CX + p.dx, oy = p.bob;
    const B4 = pal.suit || pal.body;
    const body = new Buf();
    const fx = new Buf();

    const shA = side ? [ox - 0.5, 31.6 + oy] : [ox - 3.7, 32.0 + oy];
    const shB = side ? [ox - 0.5, 31.6 + oy] : [ox + 3.7, 32.0 + oy];
    const hipA = side ? [ox - 1.4, 42.6 + oy] : [ox - 2.5, 42.6 + oy];
    const hipB = side ? [ox - 0.4, 42.6 + oy] : [ox + 2.5, 42.6 + oy];
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
      t.limb(arm, side ? [1.55, 1.35, 1.25] : [1.5, 1.4, 1.3], tones);
      t.limb([arm[2], arm[2]], [1.5, 1.5], tones === dark ? [null, SK[2], SK[2], SK[3]] : hand);
    };

    // far limbs in side view sit behind the body
    if (side) { drawLeg(body, legA, dark, 1); drawArm(body, armA, dark); }

    // Glowing circuit lines: 2-pixel lines in the shine color, only drawn over the
    // suit. Points are logical [dx from her center, y]; `mirror` repeats the line
    // on her other side, mirror-exact around her center.
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
          dot(X, Y); dot(X + ex, Y + ey);
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
    const WAIST = [[29.6, 1.8], [30.4, 3.3], [31.4, 4.4], [32.6, 4.8], [34.0, 5.0], [35.6, 4.3], [37.2, 3.1], [38.6, 2.5], [40.2, 3.2], [41.8, 4.5], [43.2, 5.15], [44.4, 5.15], [45.0, 4.95]];
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
    // her side silhouette, facing right: chest, bust, tummy, hip and thigh in
    // front; shoulder blades, small of the back and a round bum behind
    const sideFront = profile([[29.8, 1.6], [31.2, 3.0], [33.2, 4.5], [35.0, 4.1], [36.4, 2.2], [38.2, 1.3], [40.4, 2.2], [42.6, 2.7], [44.8, 2.0], [45.6, 1.4]]);
    const sideBack = profile([[29.8, -3.0], [32.0, -3.4], [35.0, -3.0], [37.6, -2.5], [39.4, -3.4], [41.2, -4.5], [42.8, -4.8], [44.2, -4.3], [45.2, -3.2], [45.6, -2.4]]);
    const span = (y0, y1, f) => { const out = []; for (let y = y0; y <= y1 + 1e-6; y += 0.5) out.push([f(y), y]); return out; };
    const bothLegsStand = standing(p.legA) && standing(p.legB);
    const sideCurve = span(35.6, 40.6, (y) => halfW(y) - 1.2);          // thin, from the bust to the waist
    const legOuter = bothLegsStand ? [[[3.4, 46.4], [3.1, 48.2], [2.7, 50.4], [2.4, 52.6], [2.3, 53.6]]] : [];
    const legInner = bothLegsStand ? [[[1.9, 45.6], [2.1, 48.2], [1.9, 51], [1.8, 53.6]]] : [];
    const FRONT_LINES = [
      [[1.2, 30.2], [2.6, 30.7], [3.6, 31.6]],                            // collar to shoulder
      [[0.6, 37.6], [0.7, 39.0], [1.5, 40.8], [1.9, 42.8]],              // belly
    ].concat(legInner, legOuter);
    const BACK_LINES = [
      [[1.2, 30.2], [2.6, 30.7], [3.6, 31.6]],
      [[0.6, 31.8], [2.0, 32.8], [3.4, 32.2]],                            // shoulder blades
      [[0.5, 36.2], [1.2, 38.6], [0.6, 41.0]],                            // small of the back
    ].concat(legInner, legOuter);
    const SIDE_LINES = [
      [[1.2, 30.2], [2.2, 31.4], [2.6, 32.6]],                            // collar
      [[1.4, 36.6], [1.0, 38.4], [1.6, 40.4], [1.6, 42.6]],              // belly
    ];
    // torso: hourglass with a bust and round hips
    const T = (pts) => pts.map(([x, y]) => [x + ox, y + oy]);
    const torso = side
      ? T(span(29.8, 45.6, sideFront).concat(span(29.8, 45.6, sideBack).reverse()))
      : T(span(29.6, 45, halfW).concat([[1.2, 45], [0, 44.8], [-1.2, 45]], span(29.6, 45, halfW).reverse().map(([x, y]) => [-x, y])));
    part(body, pal.outline, (t) => {
      t.poly(torso, (x, y) => {
        const rel = (x + 0.5 - ox) / (side ? 4.5 : 6);
        if (!side) return rel < -0.72 ? B4[1] : rel > 0.72 ? B4[3] : B4[2];
        return rel < -0.8 ? B4[1] : rel > 0.62 ? B4[3] : B4[2];
      });
      if (side) {   // bust in profile: shine on top, an outline under it
        const cx = ox + 2.3, cy = 33.5 + oy;
        t.each(cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5, (x, y) => {
          const nx = (x + 0.5 - cx) / 1.9, ny = (y + 0.5 - cy) / 2.0, r = Math.hypot(nx, ny);
          if (r > 1 || t.getP(Math.round(tx(x + 0.5) * K - 0.5), Math.round(ty(y + 0.5) * K - 0.5)) == null) return null;
          if (ny > 0.3 && r > 0.72 && nx > -0.5) return pal.outline;
          if (ny < -0.2 && r < 0.55) return B4[1];
          return null;
        });
      }
    });
    if (!side) {
      // legs blend into the hips
      for (const [lg, key, sg, hip] of [[legA, p.legA, -1, hipA], [legB, p.legB, 1, hipB]])
        part(body, null, (t) => standing(key) ? drawStandLeg(t, sg) : drawLeg(t, lg, B4, sg), [[hip[0], hip[1], 2.8]]);
    }
    // bust: a soft shadow under each curve, a little shine on top, a cleavage line
    if (back) {
      body.each(ox - 1, 42 + oy, ox + 1, 45 + oy, (x, y) => Math.abs(x + 0.5 - ox) < 0.34 && y > 42.8 + oy ? B4[3] : null);
    } else if (!side) {
      for (const sgn of [-1, 1]) {
        const cx = ox + sgn * 2.4, cy = 34.0 + oy;
        body.each(cx - 3.5, cy - 4, cx + 3.5, cy + 4, (x, y) => {
          const nx = (x + 0.5 - cx) / 2.5, ny = (y + 0.5 - cy) / 2.9, r = Math.hypot(nx, ny);
          if (r > 1) return null;
          if (ny > 0.2 && r > 0.82) return pal.outline;                  // the outline under each breast
          if (ny > 0.15 && r > 0.55) return B4[3];
          if (ny < -0.15 && r < 0.55 && nx * sgn < 0.35) return B4[1];    // shine
          return B4[2];
        });
      }
      body.each(ox - 1, 31.8 + oy, ox + 1, 35 + oy, (x, y) => Math.abs(x + 0.5 - ox) < 0.34 && y > 32.4 + oy && y < 34.6 + oy ? B4[3] : null);
    } else {
      part(body, pal.outline, (t) => drawLeg(t, legB, B4, 1), [[hipB[0] - 0.6, hipB[1] - 0.6, 3.4]]);
    }
    if (side) {
      for (const l of SIDE_LINES) glow(body, l, false);
      glow(body, span(31.2, 41.4, (y) => sideBack(y) + 1.1), false, B4[0], true);         // down her back
      // bum in profile: a round cheek with an outline along its underside and a shine on top
      {
        const cx = ox - 2.7 * 1.0, cy = 42.5 + oy;
        body.each(cx - 3, cy - 3.5, cx + 3, cy + 3.5, (x, y) => {
          const nx = (x + 0.5 - cx) / 2.1, ny = (y + 0.5 - cy) / 2.6, r = Math.hypot(nx, ny);
          if (r > 1 || !suit.has(body.getP(Math.round(tx(x + 0.5) * K - 0.5), Math.round(ty(y + 0.5) * K - 0.5)))) return null;
          if (r > 0.8 && ny > -0.1 && nx > -0.7) return pal.outline;
          if (ny < -0.25 && r < 0.5) return B4[1];
          return null;
        });
      }
      limbGlow(body, legB, 0.5);
    } else {
      for (const l of back ? BACK_LINES : FRONT_LINES) glow(body, l, true);
      glow(body, sideCurve, true, B4[0], true);
      for (const [lg, key] of [[legA, p.legA], [legB, p.legB]]) if (!standing(key)) limbGlow(body, lg, 0.4);
    }
    // neck + head
    body.rect(ox - 1, 27 + oy, 2, 4, (pal.skin || pal.body)[2]);
    part(body, pal.outline, (t) => drawPixelHead(t, p, pal, ox + (side ? -1 : 0), 6 + oy));
    // arms in front
    if (!side) part(body, pal.outline, (t) => { drawArm(t, armA, B4); limbGlow(t, armA, 0.5); }, [[shA[0], shA[1], 2.4]]);
    part(body, pal.outline, (t) => { drawArm(t, armB, B4); limbGlow(t, armB, -0.5); }, [[shB[0], shB[1], 2.4]]);

    // props / effects
    if (p.panel) {
      const x = armB[2][0] + 2, y = armB[2][1] - 9;
      fx.rect(x, y, 10, 7, B4[0] + '70'); fx.rect(x, y, 10, 1, B4[0]); fx.rect(x + 2, y + 2, 5 + (p.panel % 2) * 2, 1, B4[0]); fx.rect(x + 2, y + 4, 4, 1, B4[0]);
    }
    if (p.tears) p.tears.forEach(([x, y]) => fx.glyph(ox + x, y + oy, G.drop, pal.tear));
    const out = outline(body, pal.outline);
    // standing, the legs touch with a thin line between them
    if (!side && standing(p.legA) && standing(p.legB)) {
      for (let Y = Math.round(ty(44.8 + Math.min(0, oy)) * K); Y < H; Y++) if (out.p[Y * W + midX]) out.p[Y * W + midX] = pal.outline;
    }
    for (let i = 0; i < fx.p.length; i++) if (fx.p[i]) out.p[i] = fx.p[i];
    return out;
  }
  // floating effects (sparkles, hearts, zzz) are added after any rotation
  function addFx(out, pose, palKey) {
    const pal = palOf(palKey);
    (pose.fx || []).forEach(([g, x, y, c]) => out.glyph(x, y, G[g], c === 'hair' ? pal.hair[1] : c === 'line' ? pal.line : c));
  }
  

  // ---------------------------------------------------------------- animations
  // Walking and running, side view facing right (flip the frame to face left).
  // A is the far leg and arm. The foot is off the ground while it swings forward,
  // the arms swing against the legs, and she rises as a leg passes under her.
  function stride(f, n, run) {
    const ph = (f / n) * Math.PI * 2, u = Math.sin(ph), c = Math.cos(ph);
    const reach = run ? 4.6 : 3.4, lift = run ? 3.2 : 2.0, swing = run ? 2.8 : 2.2;
    const leg = (u, air) => {
      const up = air * lift, ax = u * reach + air * 0.6;
      return [[ax * 0.5 + up * (run ? 1.4 : 0.9), 5.2 - up * 0.5], [ax, 10.6 - up]];
    };
    const arm = (u) => run
      ? [[u * swing * 0.5, 3.6], [u * swing + 1.6, 5.6 - Math.abs(u)]]
      : [[u * swing * 0.4, 4.4], [u * swing, 8.4 - Math.abs(u) * 0.6]];
    return {
      view: 'side', sway: run ? -1.2 : -0.6, dx: 1,
      bob: Math.abs(c) > 0.6 ? -1 : 0,
      legA: leg(u, Math.max(0, c)), legB: leg(-u, Math.max(0, -c)),
      armA: arm(-u), armB: arm(u),
      mouth: run ? 'grin' : 'smile',
    };
  }
  const ANIMS = {
    idle:  { frames: 4, fps: 3, pose: f => ({ bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open', armA: 'down', armB: 'down', sway: [0, 0.4, 0, -0.4][f] }) },
    walk:  { frames: 8, fps: 10, pose: f => stride(f, 8, false) },
    side:  { frames: 4, fps: 3, pose: f => ({ view: 'side', bob: f === 2 ? 1 : 0, eyes: f === 3 ? 'blink' : 'open', armA: [[0.4, 4.3], [0.6, 8.4]], armB: [[0.4, 4.3], [0.6, 8.4]], legA: [[0.2, 5.4], [0.2, 10.6]], legB: [[0.2, 5.4], [0.2, 10.6]] }) },
    back:  { frames: 4, fps: 3, pose: f => ({ view: 'back', bob: f === 2 ? 1 : 0, armA: 'down', armB: 'down' }) },
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
  const SMOOTH = { idle: 2, side: 2, back: 2, wave: 2, think: 2, cheer: 2, cry: 2, sad: 2, dance: 2, dangle: 2, fall: 2, land: 2, love: 2, angry: 2, dizzy: 2 };
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
