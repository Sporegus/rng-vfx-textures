// Zinx, hologram edition: a smooth (non-pixel) character drawn with Canvas 2D.
// She's built on a small skeleton (shoulders, elbows, hips, knees, head) and
// every animation is just a pose over time, blended smoothly.
// Drawing units: 0 = top of her head, 410 = the ground, x = 0 is her center.
(function (root) {
  const DEG = Math.PI / 180;
  const GROUND = 410;

  const PALETTE = {
    suit: ['#040509', '#141821', '#272d3a', '#3d4559'],
    skin: ['#ffffff', '#eef2fa', '#d3dbea', '#a9b5cc'],
    hair: ['#3a4256', '#141824', '#06070b'],
    lips: ['#d2738f', '#a8506d', '#7a3450'],
    eyeWhite: '#f3f7ff', pupil: '#0a0f1d', lash: '#07080d', brow: '#151924',
  };
  const GLOWS = { white: '#e6fdff', cyan: '#36e6ff', orange: '#ff8a1c', magenta: '#ff3df2' };

  // ------------------------------------------------------------------ helpers
  // Smooth curve through points (Catmull-Rom as Bezier).
  function smooth(g, pts, closed, move = true) {
    const n = pts.length;
    const at = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    if (move) g.moveTo(pts[0][0], pts[0][1]); else g.lineTo(pts[0][0], pts[0][1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) g.closePath();
  }
  // A limb pointing down +y: half-widths on the outer (+x) and inner (-x) side.
  function limbPath(g, len, outW, inW) {
    const k = outW.length - 1, pts = [];
    for (let i = 0; i <= k; i++) pts.push([outW[i], (len * i) / k]);
    pts.push([(outW[k] - inW[k]) / 2, len + outW[k] * 0.6]);
    for (let i = k; i >= 0; i--) pts.push([-inW[i], (len * i) / k]);
    pts.push([(outW[0] - inW[0]) / 2, -outW[0] * 0.5]);
    g.beginPath(); smooth(g, pts, true);
  }
  // Glossy black suit fill across a limb (sheen strip off-center).
  function suitAcross(g, w) {
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0, PALETTE.suit[0]); gr.addColorStop(0.22, PALETTE.suit[1]);
    gr.addColorStop(0.42, PALETTE.suit[3]); gr.addColorStop(0.55, PALETTE.suit[2]);
    gr.addColorStop(0.8, PALETTE.suit[1]); gr.addColorStop(1, PALETTE.suit[0]);
    return gr;
  }
  // Tron light-line: soft wide glow + bright core.
  function light(g, st, draw, w = 1.05) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = st.glow; g.shadowBlur = 10 * st.px;
    g.strokeStyle = st.glow; g.globalAlpha = 0.35; g.lineWidth = w * 2.4;
    g.beginPath(); draw(); g.stroke();
    g.globalAlpha = 1; g.shadowBlur = 4 * st.px; g.strokeStyle = '#ffffff'; g.lineWidth = w;
    g.beginPath(); draw(); g.stroke();
    g.restore();
  }

  // ------------------------------------------------------------------ poses
  const BASE = {
    x: 0, lift: 0, bob: 0, hip: 0, tilt: 0, turn: 0, lookX: 0, lookY: 0,
    aSh: 9, aEl: -5, aWrist: 0, bSh: 9, bEl: -5, bWrist: 0,
    aThigh: 2, aKnee: -1, bThigh: 2, bKnee: -1,
    blink: 0, happy: 0, wink: 0, smile: 0.35, open: 0, brow: 0, hair: 0,
  };
  const HANDS = { aHand: 'relaxed', bHand: 'relaxed' };
  const ANIMS = {
    idle: (t) => ({ bob: Math.sin(t * 1.7) * 0.9, tilt: Math.sin(t * 0.6) * 0.8, hair: Math.sin(t * 1.3), lookX: Math.sin(t * 0.4) * 0.25 }),
    wave: (t) => ({ bSh: 128, bEl: 28 + Math.sin(t * 9) * 22, bWrist: Math.sin(t * 9) * 12, bHand: 'open', smile: 1, brow: 1, tilt: -4, hip: -5, aSh: 9, hair: Math.sin(t * 3) }),
    talk: (t) => ({ aSh: 18, aEl: -62 + Math.sin(t * 3) * 16, aWrist: -40, aHand: 'open', open: Math.max(0, Math.sin(t * 13) * 0.55 + Math.sin(t * 7.1) * 0.35), smile: 0.45, brow: Math.max(0, Math.sin(t * 2.1)), tilt: 3 + Math.sin(t * 2) * 3, bob: Math.sin(t * 1.7) * 0.9 }),
    point: (t) => ({ bSh: 86, bEl: 4, bWrist: 0, bHand: 'point', lookX: 1, turn: 0.2, smile: 0.75, wink: 1, tilt: -3, hip: -6 }),
    think: (t) => ({ aSh: -22, aEl: -150, aWrist: -40, aHand: 'relaxed', bSh: 10, bEl: -112, bWrist: -10, bHand: 'relaxed', lookX: -0.6, lookY: -1, tilt: 8, smile: 0.1, brow: 0.6, hip: -3 }),
    cheer: (t) => ({ aSh: 158, aEl: 12, aHand: 'fist', bSh: 158, bEl: 12, bHand: 'fist', smile: 1, happy: 1, open: 0.6, lift: -Math.abs(Math.sin(t * 5.5)) * 16, hip: 0, bThigh: -1, bKnee: 2 + Math.abs(Math.sin(t * 5.5)) * 10, aKnee: Math.abs(Math.sin(t * 5.5)) * 8, hair: Math.sin(t * 11) * 2 }),
    sass: (t) => ({ aSh: 40, aEl: -80, aWrist: -35, aHand: 'hip', bSh: 40, bEl: -80, bWrist: -35, bHand: 'hip', hip: -6, aThigh: 1, aKnee: 0, bThigh: -3, bKnee: 9, tilt: 6, smile: 0.6, lookX: 0.5, bob: Math.sin(t * 1.7) * 0.9 }),
  };

  // Keeps a smoothly blended pose that eases toward the current animation.
  function Poser() {
    this.p = Object.assign({}, BASE, HANDS);
    this.anim = 'idle'; this.t = 0; this.nextBlink = 2; this.blinkT = 0;
  }
  Poser.prototype.play = function (name) { if (ANIMS[name]) { this.anim = name; this.t = 0; } };
  Poser.prototype.update = function (dt) {
    this.t += dt;
    const target = Object.assign({}, BASE, HANDS, ANIMS[this.anim](this.t));
    const k = 1 - Math.exp(-dt * 11);
    for (const key in target) {
      if (typeof target[key] === 'number') this.p[key] += (target[key] - this.p[key]) * k;
      else this.p[key] = target[key];
    }
    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blinkT = 0.14; this.nextBlink = 2 + Math.random() * 3.5; }
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.p.blink = this.blinkT > 0 ? 1 : 0;
    return this.p;
  };

  // ------------------------------------------------------------------ body parts
  const TORSO_R = [[8.5, 76], [19, 80], [31.5, 85], [35.5, 94], [33.5, 106], [38, 121], [32.5, 139], [26, 151], [22, 164], [26.5, 183], [39.5, 203], [40, 224]];

  function torsoPoints(P) {
    const sh = (y) => P.hip * Math.max(0, Math.min(1, (y - 148) / 56));
    const right = TORSO_R.map(([x, y]) => [x + sh(y) + (y > 180 && P.hip < 0 ? P.hip * -0.25 : 0), y]);
    const left = TORSO_R.map(([x, y]) => [-x + sh(y) + (y > 180 && P.hip < 0 ? P.hip * 0.35 : 0), y]).reverse();
    return [...right, [P.hip * 0.9, 234], ...left];
  }

  function drawTorso(g, P, st) {
    const pts = torsoPoints(P);
    g.save();
    g.beginPath(); smooth(g, pts, true);
    g.fillStyle = suitAcross(g, 42); g.fill();
    g.restore();
  }
  function drawTorsoDetails(g, P, st) {
    const pts = torsoPoints(P);
    g.save();
    g.beginPath(); smooth(g, pts, true);
    g.clip();
    // soft shading: darker under the bust and toward the hips
    let gr = g.createLinearGradient(0, 130, 0, 175);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(-50, 130, 100, 45);
    gr = g.createRadialGradient(-6 + P.hip, 198, 2, -6 + P.hip, 198, 30);
    gr.addColorStop(0, 'rgba(90,100,125,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(-50, 165, 100, 70);
    g.restore();

    // bust
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 15, 121.5);
      g.scale(s * 1.12, 1.12);
      g.rotate(0.2);
      const shape = [[-1, -14.5], [10, -11], [16.5, -1], [14.5, 9.5], [6, 15.5], [-6, 14], [-13, 5], [-11.5, -7]];
      g.beginPath(); smooth(g, shape, true);
      const bg = g.createRadialGradient(5, -6, 1, 2, 0, 19);
      bg.addColorStop(0, PALETTE.suit[3]); bg.addColorStop(0.35, PALETTE.suit[2]);
      bg.addColorStop(0.75, PALETTE.suit[1]); bg.addColorStop(1, PALETTE.suit[0]);
      g.fillStyle = bg; g.fill();
      // sheen
      g.beginPath(); g.ellipse(6, -5, 4.5, 2.4, -0.5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(180,195,225,0.22)'; g.fill();
      g.restore();
    }
    // valley shadow
    g.save();
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, 109); g.quadraticCurveTo(-0.6, 121, 0, 133); g.stroke();
    g.restore();

    // high collar
    g.beginPath(); smooth(g, [[-10.5, 72], [0, 70.5], [10.5, 72], [12.5, 82], [0, 84], [-12.5, 82]], true);
    g.fillStyle = suitAcross(g, 12); g.fill();

    // light-lines
    const h = (y) => P.hip * Math.max(0, Math.min(1, (y - 148) / 56));
    light(g, st, () => { g.moveTo(-10.5, 72.5); g.quadraticCurveTo(0, 69.5, 10.5, 72.5); });
    light(g, st, () => { for (const s of [-1, 1]) { g.moveTo(s * 12, 81); g.quadraticCurveTo(s * 24, 82, s * 32, 88); } }, 0.9);
    light(g, st, () => { for (const s of [-1, 1]) { g.moveTo(s * 11.5, 82.5); g.quadraticCurveTo(s * 7, 96, 0, 106); } });
    light(g, st, () => { for (const s of [-1, 1]) { g.moveTo(s * 1.5, 139); g.bezierCurveTo(s * 9, 145, s * 24, 143.5, s * 31, 134); } }, 1);
    light(g, st, () => { g.moveTo(h(141), 141); g.lineTo(h(160), 160); });
    // belt + emblem
    light(g, st, () => { g.moveTo(-24 + h(166), 165.5); g.quadraticCurveTo(h(166), 169, 24 + h(166), 165.5); });
    light(g, st, () => { g.arc(h(167), 167.5, 4.2, 0, Math.PI * 2); }, 1.1);
    light(g, st, () => { for (const s of [-1, 1]) { g.moveTo(s * 18 + h(171), 170); g.quadraticCurveTo(s * 13 + h(200), 200, s * 5 + h(229), 229); } });
  }

  function drawNeck(g, P) {
    g.beginPath(); smooth(g, [[-7, 56], [7, 56], [8.5, 80], [-8.5, 80]], true);
    const gr = g.createLinearGradient(-9, 0, 9, 0);
    gr.addColorStop(0, PALETTE.skin[3]); gr.addColorStop(0.35, PALETTE.skin[1]); gr.addColorStop(0.7, PALETTE.skin[2]); gr.addColorStop(1, PALETTE.skin[3]);
    g.fillStyle = gr; g.fill();
    const sh = g.createLinearGradient(0, 58, 0, 70);
    sh.addColorStop(0, 'rgba(70,85,115,0.55)'); sh.addColorStop(1, 'rgba(70,85,115,0)');
    g.fillStyle = sh; g.fill();
  }

  // Legs. s = -1 (viewer's left) or +1 (viewer's right).
  function drawLeg(g, P, s, st) {
    const thigh = s < 0 ? P.aThigh : P.bThigh, knee = s < 0 ? P.aKnee : P.bKnee;
    g.save();
    g.translate(s * 18.5 + P.hip * 0.9, 216);
    g.scale(s, 1);
    g.rotate(-thigh * DEG);
    const tOut = [22, 19.5, 16.5, 13, 10.2], tIn = [15.5, 14.5, 12, 9.5, 8.3];
    limbPath(g, 90, tOut, tIn); g.fillStyle = suitAcross(g, 22); g.fill();
    light(g, st, () => { g.moveTo(17, 16); g.quadraticCurveTo(15, 52, 9, 86); }, 0.9);
    g.translate(0, 89);
    g.rotate(-knee * DEG);
    const sOut = [10.5, 12.2, 10.6, 8, 6], sIn = [9.5, 10.6, 9, 6.6, 5.4];
    limbPath(g, 90, sOut, sIn); g.fillStyle = suitAcross(g, 12); g.fill();
    // boot (glossier, from mid-shin down)
    g.save();
    g.beginPath(); smooth(g, [[11.6, 40], [9.2, 62], [6.6, 84], [6.2, 92], [-5.6, 92], [-6, 84], [-8.6, 62], [-10.4, 40]], true);
    const bg = g.createLinearGradient(-11, 0, 11, 0);
    bg.addColorStop(0, '#020205'); bg.addColorStop(0.4, '#4a5368'); bg.addColorStop(0.55, '#1d222d'); bg.addColorStop(1, '#020205');
    g.fillStyle = bg; g.fill();
    g.restore();
    light(g, st, () => { g.moveTo(-10.4, 40); g.quadraticCurveTo(0.6, 44, 11.6, 40); });
    light(g, st, () => { g.moveTo(8.6, 6); g.quadraticCurveTo(10, 22, 9.4, 38); }, 0.9);
    // foot: undo the leg rotation so it stands upright
    g.translate(0, 90);
    g.rotate((thigh + knee) * DEG);
    g.beginPath(); smooth(g, [[-5.6, -2], [6.4, -2], [7.4, 6], [5.4, 13], [1.4, 15.5], [-3.6, 13.5], [-6.4, 6]], true);
    g.fillStyle = bg; g.fill();
    light(g, st, () => { g.moveTo(-5, 13.4); g.quadraticCurveTo(1.2, 16.6, 6, 12.8); }, 1);
    g.restore();
  }

  function drawHand(g, kind, st) {
    g.fillStyle = suitAcross(g, 6);
    if (kind === 'open') {
      g.beginPath(); smooth(g, [[-4.6, 0], [4.6, 0], [5.6, 6], [4.8, 10.5], [-4.8, 10.5], [-5.6, 6]], true); g.fill();
      [-13, -4, 5, 14].forEach((a, i) => {
        g.save(); g.translate(-3.3 + i * 2.2, 9); g.rotate(-a * DEG);
        g.beginPath(); g.roundRect(-1.05, 0, 2.1, [10, 12, 11.5, 9][i], 1.05); g.fill(); g.restore();
      });
      g.save(); g.translate(-4.8, 3.5); g.rotate(35 * DEG); g.beginPath(); g.roundRect(-1.2, 0, 2.4, 8.5, 1.2); g.fill(); g.restore();
    } else if (kind === 'point') {
      g.beginPath(); smooth(g, [[-4.6, 0], [4.6, 0], [5.6, 6.5], [4.6, 12], [-4.6, 12], [-5.6, 6.5]], true); g.fill();
      g.beginPath(); g.roundRect(-3.6, 9, 2.3, 15, 1.15); g.fill();
      light(g, st, () => { g.moveTo(-2.4, 23); g.lineTo(-2.4, 24.5); }, 1.4);
    } else if (kind === 'fist') {
      g.beginPath(); smooth(g, [[-4.8, 0], [4.8, 0], [6, 7], [4.8, 13], [-4.8, 13], [-6, 7]], true); g.fill();
    } else {
      g.beginPath(); smooth(g, [[-4.4, 0], [4.4, 0], [5.3, 8], [4.6, 15], [2.6, 20.5], [0, 22], [-2.4, 20.5], [-4.4, 13.5], [-5, 6]], true); g.fill();
      g.beginPath(); smooth(g, [[-4.4, 3.5], [-7, 8.5], [-6.8, 13.5], [-5.2, 14], [-4.6, 9]], true); g.fill();
    }
  }

  function drawArm(g, P, s, st) {
    const sh = s < 0 ? P.aSh : P.bSh, el = s < 0 ? P.aEl : P.bEl, wr = s < 0 ? P.aWrist : P.bWrist, hand = s < 0 ? P.aHand : P.bHand;
    g.save();
    g.translate(s * 34.5, 93 + P.bob);
    g.scale(s, 1);
    g.rotate(-sh * DEG);
    limbPath(g, 68, [8.6, 8.4, 7.6, 6.4, 5.8], [6.8, 6.6, 6, 5.4, 5.2]); g.fillStyle = suitAcross(g, 9); g.fill();
    light(g, st, () => { g.moveTo(5.6, 8); g.quadraticCurveTo(6.2, 34, 4, 62); }, 0.85);
    g.translate(0, 66);
    g.rotate(-el * DEG);
    limbPath(g, 60, [6.2, 6.9, 6.1, 5, 4.2], [5.6, 6, 5, 4.4, 3.9]); g.fillStyle = suitAcross(g, 7); g.fill();
    light(g, st, () => { g.moveTo(4.2, 6); g.quadraticCurveTo(4.6, 30, 2.8, 52); }, 0.85);
    light(g, st, () => { g.moveTo(-4.2, 55); g.quadraticCurveTo(0, 56.6, 4.4, 55); }, 1.1);
    g.translate(0, 59);
    g.rotate(-wr * DEG);
    drawHand(g, hand === 'hip' ? 'relaxed' : hand, st);
    g.restore();
  }

  // ------------------------------------------------------------------ head
  const HEAD_SCALE = 1.14;
  const FACE = [[0, 11], [11.5, 13], [18, 23], [19.2, 35], [18.3, 45], [15, 54.5], [8.6, 61.5], [0, 65], [-8.6, 61.5], [-15, 54.5], [-18.3, 45], [-19.2, 35], [-18, 23], [-11.5, 13]];

  function drawBackHair(g, P) {
    const sw = P.hair;
    g.beginPath();
    smooth(g, [[-1, 3], [14, 4.5], [25, 13], [29, 29], [28.5, 47], [26 + sw * 0.4, 61], [21 + sw * 0.6, 70], [13, 66], [6, 60], [-6, 60], [-14, 65], [-20 + sw * 0.5, 68], [-25 + sw * 0.4, 58], [-28, 44], [-28, 27], [-23, 12], [-13, 4.5]], true);
    const gr = g.createLinearGradient(0, 0, 0, 70);
    gr.addColorStop(0, PALETTE.hair[0]); gr.addColorStop(0.4, PALETTE.hair[1]); gr.addColorStop(1, PALETTE.hair[2]);
    g.fillStyle = gr; g.fill();
  }

  function drawEye(g, cx, s, P, st, closed, happy) {
    g.save();
    g.translate(cx, 40.5);
    g.scale(s, 1);
    // soft eyeshadow
    const es = g.createRadialGradient(0.5, -2.5, 0.5, 0.5, -2.5, 7.5);
    es.addColorStop(0, 'rgba(40,48,70,0.42)'); es.addColorStop(1, 'rgba(40,48,70,0)');
    g.fillStyle = es; g.beginPath(); g.ellipse(0.5, -2.5, 7.5, 5, 0, 0, Math.PI * 2); g.fill();
    g.lineCap = 'round';
    if (happy) {
      g.strokeStyle = PALETTE.lash; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-4.4, 0.8); g.quadraticCurveTo(0, -3.8, 4.8, 0.2); g.stroke();
      g.beginPath(); g.moveTo(4.6, 0.2); g.lineTo(6.6, -1.3); g.stroke();
    } else if (closed) {
      g.strokeStyle = PALETTE.lash; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(-4.6, 0.3); g.quadraticCurveTo(0, 2.4, 4.8, -0.2); g.stroke();
      g.beginPath(); g.moveTo(4.6, -0.2); g.lineTo(6.4, -1.4); g.stroke();
    } else {
      const lid = () => { g.moveTo(-4.6, 0.6); g.bezierCurveTo(-2.6, -3.5, 2.4, -3.9, 4.9, -0.7); g.bezierCurveTo(2.6, 2.6, -2, 2.8, -4.6, 0.6); };
      g.beginPath(); lid(); g.fillStyle = PALETTE.eyeWhite; g.fill();
      g.save(); g.beginPath(); lid(); g.clip();
      const ix = P.lookX * 1.3 * s + 0.2, iy = P.lookY * 0.7 - 0.4;
      const ir = g.createRadialGradient(ix, iy, 0.2, ix, iy, 2.9);
      ir.addColorStop(0, '#ffffff'); ir.addColorStop(0.35, st.glow); ir.addColorStop(1, '#2a3550');
      g.fillStyle = ir; g.beginPath(); g.arc(ix, iy, 2.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = PALETTE.pupil; g.beginPath(); g.arc(ix, iy, 1.15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ix - 0.9, iy - 1, 0.65, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(30,40,70,0.35)'; g.fillRect(-6, -4, 12, 1.8); // lid shadow on the eyeball
      g.restore();
      // lashes and liner wing
      g.strokeStyle = PALETTE.lash; g.lineWidth = 1.35;
      g.beginPath(); g.moveTo(-4.6, 0.6); g.bezierCurveTo(-2.6, -3.5, 2.4, -3.9, 4.9, -0.7); g.stroke();
      g.lineWidth = 1.1; g.beginPath(); g.moveTo(4.6, -0.6); g.quadraticCurveTo(5.9, -1.6, 7, -2.9); g.stroke();
      g.strokeStyle = 'rgba(20,24,36,0.45)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(-3.6, 1.6); g.quadraticCurveTo(0.5, 2.9, 4.4, 0.2); g.stroke();
    }
    // brow
    const bu = P.brow * 1.3;
    g.strokeStyle = PALETTE.brow; g.lineWidth = 1.25;
    g.beginPath(); g.moveTo(-5, -6.6 - bu * 0.6); g.quadraticCurveTo(1, -9.6 - bu, 6.4, -7.4 - bu * 0.7); g.stroke();
    g.restore();
  }

  function drawLips(g, P, fx) {
    const sm = P.smile, o = P.open, c = -sm * 1.4;
    g.save();
    g.translate(fx, 55.5);
    if (o > 0.05) {
      g.fillStyle = '#2a0f1c';
      g.beginPath(); g.ellipse(0, 0.9 + o * 1.3, 4.3, 0.5 + o * 2.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f4f7ff'; g.fillRect(-2.8, 0.2, 5.6, Math.min(1.1, o * 1.6));
    }
    const lg = g.createLinearGradient(0, -2, 0, 4 + o * 2.6);
    lg.addColorStop(0, PALETTE.lips[1]); lg.addColorStop(0.5, PALETTE.lips[0]); lg.addColorStop(1, PALETTE.lips[2]);
    g.fillStyle = lg;
    g.beginPath();
    smooth(g, [[-5.6, c], [-2.5, -1.8], [-0.8, -1.2], [0, -1.0], [0.8, -1.2], [2.5, -1.8], [5.6, c]], false);
    smooth(g, [[5.6, c], [2.2, 0.3 - o * 0.4], [0, 0.4 - o * 0.4], [-2.2, 0.3 - o * 0.4], [-5.6, c]], false, false);
    g.closePath(); g.fill();
    g.beginPath();
    smooth(g, [[-5.4, c + 0.2], [-2.2, 0.6 + o * 2.4], [2.2, 0.6 + o * 2.4], [5.4, c + 0.2]], false);
    smooth(g, [[5.4, c + 0.2], [3, 2.6 + o * 2.6], [0, 3.5 + o * 2.6], [-3, 2.6 + o * 2.6], [-5.4, c + 0.2]], false, false);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,230,240,0.55)';
    g.beginPath(); g.ellipse(-0.6, 2 + o * 2.6, 1.8, 0.55, -0.1, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawFrontHair(g, P, st) {
    const sw = P.hair;
    g.beginPath();
    smooth(g, [
      [-19.5, 46], [-20.5, 32], [-17, 16], [-9, 7], [2, 4.5], [13, 6.5], [22, 14], [26, 27], [25.5, 41], [23 + sw * 0.5, 52 + sw * 0.4],
      [19.5 + sw * 0.6, 48], [18.2, 36], [14.5, 27.5], [8, 22.5], [0, 21], [-7, 23], [-12.5, 27], [-16, 34], [-17.2, 44],
    ], true);
    const gr = g.createLinearGradient(-20, 0, 26, 40);
    gr.addColorStop(0, PALETTE.hair[1]); gr.addColorStop(0.45, PALETTE.hair[0]); gr.addColorStop(1, PALETTE.hair[2]);
    g.fillStyle = gr; g.fill();
    // strands catching the light
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(160,175,205,0.55)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-8, 8.5); g.quadraticCurveTo(8, 9, 20, 22 + sw * 0.3); g.stroke();
    g.beginPath(); g.moveTo(-12, 13); g.quadraticCurveTo(4, 13, 18, 30 + sw * 0.4); g.stroke();
    g.strokeStyle = st.glow; g.globalAlpha = 0.55; g.lineWidth = 0.7; g.shadowColor = st.glow; g.shadowBlur = 5 * st.px;
    g.beginPath(); g.moveTo(-2, 6); g.quadraticCurveTo(12, 8, 23, 20); g.stroke();
    g.restore();
  }

  function drawHead(g, P, st) {
    g.save();
    g.translate(0, 70 + P.bob); g.rotate(P.tilt * DEG); g.scale(HEAD_SCALE, HEAD_SCALE); g.translate(0, -70);
    g.beginPath(); smooth(g, FACE, true);
    const fg = g.createRadialGradient(-4, 32, 2, 0, 38, 34);
    fg.addColorStop(0, PALETTE.skin[0]); fg.addColorStop(0.45, PALETTE.skin[1]); fg.addColorStop(0.82, PALETTE.skin[2]); fg.addColorStop(1, PALETTE.skin[3]);
    g.fillStyle = fg; g.fill();
    const fx = P.turn * 2.6;
    // cheek blush and contour
    for (const s of [-1, 1]) {
      const bl = g.createRadialGradient(s * 11.5 + fx, 48, 0.5, s * 11.5 + fx, 48, 6);
      bl.addColorStop(0, 'rgba(230,140,170,0.28)'); bl.addColorStop(1, 'rgba(230,140,170,0)');
      g.fillStyle = bl; g.beginPath(); g.arc(s * 11.5 + fx, 48, 6, 0, Math.PI * 2); g.fill();
    }
    // nose
    g.save();
    g.strokeStyle = 'rgba(110,125,160,0.6)'; g.lineWidth = 0.8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(1.6 + fx, 42.5); g.quadraticCurveTo(2.6 + fx, 47, 2 + fx, 49.6); g.stroke();
    g.beginPath(); g.moveTo(-2.4 + fx, 50.4); g.quadraticCurveTo(0 + fx, 51.8, 2.6 + fx, 50.2); g.stroke();
    g.restore();
    drawEye(g, -8.4 + fx, -1, P, st, P.blink > 0.5 || P.wink > 0.5, P.happy > 0.5);
    drawEye(g, 8.4 + fx, 1, P, st, P.blink > 0.5, P.happy > 0.5 || P.wink > 0.5);
    drawLips(g, P, fx * 0.9);
    drawFrontHair(g, P, st);
    g.restore();
  }

  // ------------------------------------------------------------------ whole figure
  // Draws Zinx so that her feet sit at (x, groundY) on ctx, `height` px tall.
  function draw(ctx, P, { x, groundY, height, glow = GLOWS.white, dpr = 1 }) {
    const scale = height / GROUND;
    const st = { glow, px: scale * dpr * 0.5 + 0.5 };
    ctx.save();
    ctx.translate(x, groundY - GROUND * scale);
    ctx.scale(scale, scale);
    ctx.translate(P.x, P.lift);
    g_draw(ctx, P, st);
    ctx.restore();
  }
  function g_draw(g, P, st) {
    // back hair goes behind the neck
    g.save(); g.translate(0, 70 + P.bob); g.rotate(P.tilt * DEG); g.scale(HEAD_SCALE, HEAD_SCALE); g.translate(0, -70); drawBackHair(g, P); g.restore();
    g.save(); g.translate(0, P.bob); drawNeck(g, P); g.restore();
    g.save(); g.translate(0, P.bob); drawTorso(g, P, st); g.restore();
    drawLeg(g, P, -1, st);
    drawLeg(g, P, 1, st);
    g.save(); g.translate(0, P.bob); drawTorsoDetails(g, P, st); g.restore();
    drawArm(g, P, -1, st);
    drawArm(g, P, 1, st);
    drawHead(g, P, st);
  }

  const api = { GROUND, GLOWS, PALETTE, ANIMS, Poser, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZinxHolo = api;
})(typeof window !== 'undefined' ? window : globalThis);
