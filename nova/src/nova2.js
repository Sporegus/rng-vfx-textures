// The new Nova (art/nova2): one drawing, moved live. Her idle motion (breathing, head sway,
// hair, antenna and sleeves; feet fixed) is the same motion as her idle export
// (art/nova2/idle/source/render.cjs), run every frame on the GPU, so it's smooth at any frame
// rate. Blinks and mouth shapes are swapped into the drawing before it's moved, so they
// move with her head. Works in the browser (window.Nova2).
(function (root) {
const INFO = root.Nova2Info;
if (!INFO) return;
const [TW, TH] = INFO.canvas;                     // her drawing: 600 x 800
const U = (INFO.soles - INFO.top) / 74;           // drawing px per sprite unit (she's 74 units tall)
const PAD = { x: 12, top: 12 };                   // her canvas is a little bigger than the pixel sprite's box
const DURATION = 8;                               // the idle loop, seconds

const load = (src) => Object.assign(new Image(), { src });
const IMG = { base: load('nova2/base.png'), blink: load('nova2/blink.png'), mouths: {} };
for (const k of Object.keys(INFO.mouths)) IMG.mouths[k] = load('nova2/mouths/' + k + '.png');
const ready = () => IMG.base.complete && IMG.base.naturalWidth && IMG.blink.complete && IMG.blink.naturalWidth;

// her drawing with the current eyes and mouth
const face = Object.assign(document.createElement('canvas'), { width: TW, height: TH });
const fctx = face.getContext('2d');
let faceKey = '';
function drawFace(blink, mouth) {
  const key = blink + '|' + mouth;
  if (key === faceKey) return false;
  fctx.clearRect(0, 0, TW, TH);
  fctx.drawImage(blink ? IMG.blink : IMG.base, 0, 0);
  const m = mouth && IMG.mouths[mouth];
  if (m && m.complete && m.naturalWidth) fctx.drawImage(m, INFO.mouths[mouth].x, INFO.mouths[mouth].y);
  faceKey = key;
  return true;
}

// ---- the motion, on the GPU: each output pixel samples her drawing at (x, y) - displacement
const VERT = `attribute vec2 p; varying vec2 v; void main() { v = (p + 1.0) * 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform sampler2D tex; uniform float t; varying vec2 v;
const float PI = 3.14159265, D = ${DURATION.toFixed(1)};
float smooth3(float a, float b, float x) { float k = clamp((x - a) / (b - a), 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }
vec2 disp(float x, float y) {
  float p = 2.0 * PI * t / D, breath = sin(2.0 * p), sway = sin(p);
  float above = 1.0 - smooth3(500.0, 730.0, y), head = 1.0 - smooth3(235.0, 310.0, y);
  float angle = 0.012 * sin(p + 0.3) * head, dx = x - 301.0, dy = y - 260.0;
  float u = 2.8 * sway * above - angle * dy, w = -1.8 * breath * above + angle * dx;
  float torso = exp(-pow((y - 340.0) / 90.0, 2.0));
  u += (x - 300.0) * 0.007 * breath * torso; w -= 1.1 * breath * torso;
  float antenna = exp(-pow((x - 275.0) / 60.0, 2.0) - pow((y - 99.0) / 34.0, 2.0));
  u += 3.4 * sin(2.0 * p - 0.5) * antenna;
  float hairL = exp(-pow((x - 204.0) / 32.0, 2.0) - pow((y - 206.0) / 52.0, 2.0));
  float hairR = exp(-pow((x - 391.0) / 28.0, 2.0) - pow((y - 206.0) / 54.0, 2.0));
  u += 1.7 * sin(p - 0.7) * hairL + 1.8 * sin(p - 0.9) * hairR;
  w += 0.8 * sin(2.0 * p - 0.6) * (hairL + hairR);
  float sleeves = exp(-pow((y - 414.0) / 68.0, 2.0)) * (exp(-pow((x - 200.0) / 44.0, 2.0)) + exp(-pow((x - 406.0) / 43.0, 2.0)));
  u += 1.4 * sin(p - 0.45) * sleeves;
  return vec2(u, w);
}
void main() {
  vec2 px = vec2(v.x * ${TW.toFixed(1)}, (1.0 - v.y) * ${TH.toFixed(1)});
  vec2 s = px - disp(px.x, px.y);
  if (s.x < 0.0 || s.y < 0.0 || s.x > ${TW.toFixed(1)} || s.y > ${TH.toFixed(1)}) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texture2D(tex, vec2(s.x / ${TW.toFixed(1)}, s.y / ${TH.toFixed(1)}));
}`;
let gl = null, glCanvas = null, uT = null, tex = null;
function setup() {
  glCanvas = Object.assign(document.createElement('canvas'), { width: TW, height: TH });
  gl = glCanvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  uT = gl.getUniformLocation(prog, 't');
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.viewport(0, 0, TW, TH);
  return true;
}

// draws like NovaSprites.draw: x, y is the top-left of the pixel sprite's box (48 x 80 units),
// her soles on its ground row (78) and her middle on its centre (24). t: seconds.
// (She faces the viewer, so she isn't mirrored when she turns.)
function draw(ctx, { x = 0, y = 0, scale = 3, t = 0, blink = false, mouth = null } = {}) {
  if (!ready()) return;
  let src = face;
  try {
    if (gl === null && !setup()) gl = false;
    if (gl) {
      if (drawFace(blink, mouth)) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face);
      gl.uniform1f(uT, t % DURATION);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      src = glCanvas;
    } else drawFace(blink, mouth);   // (no WebGL: she's shown still)
  } catch (e) { gl = false; drawFace(blink, mouth); console.warn('Nova2: moving her failed, showing her still:', e.message); }
  const k = scale / U;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, Math.round(x + 24 * scale - INFO.centerX * k), Math.round(y + 78 * scale - INFO.soles * k), TW * k, TH * k);
  ctx.restore();
}

// her mouth while she talks: opens with how loud her voice is, changing shape a few times a second
const SHAPES = { 1: ['open_small', 'e', 'i', 'u'], 2: ['open_medium', 'a', 'o', 'e'], 3: ['open_large', 'a', 'o'] };
let mouthNow = null, mouthUntil = 0;
function mouthFor(level, now) {
  const band = level < 0.06 ? 0 : level < 0.25 ? 1 : level < 0.55 ? 2 : 3;
  if (!band) { mouthNow = null; return null; }
  if (now >= mouthUntil || !mouthNow || !SHAPES[band].includes(mouthNow)) {
    const opts = SHAPES[band].filter(m => m !== mouthNow);
    mouthNow = opts[Math.floor(Math.random() * opts.length)];
    mouthUntil = now + 70 + Math.random() * 60;
  }
  return mouthNow;
}

root.Nova2 = { draw, mouthFor, PAD };
})(typeof window !== 'undefined' ? window : globalThis);
