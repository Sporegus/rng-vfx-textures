// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced: what screenshots are)
// and colour-blob finding, so Nova can look at a game frame without a model.
'use strict';
const zlib = require('zlib');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const s = x * bpp, d = (y * w + x) * 4; out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = bpp === 4 ? cur[s + 3] : 255; }
    cur.copy(prev);
  }
  return { width: w, height: h, data: out };
}

// connected regions near a colour: [{ x, y, w, h, cx, cy, n }] (sampled every `step` px)
function blobs(img, rgb, { tol = 40, step = 2, minPixels = 4, region } = {}) {
  const { width: W, height: H, data } = img;
  const x0 = region ? region.x : 0, y0 = region ? region.y : 0, x1 = region ? region.x + region.w : W, y1 = region ? region.y + region.h : H;
  const gw = Math.ceil((x1 - x0) / step), gh = Math.ceil((y1 - y0) / step);
  const hit = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = x0 + gx * step, y = y0 + gy * step, i = (y * W + x) * 4;
    if (Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]) <= tol) hit[gy * gw + gx] = 1;
  }
  const out = [], seen = new Uint8Array(gw * gh);
  for (let s = 0; s < hit.length; s++) {
    if (!hit[s] || seen[s]) continue;
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0, sx = 0, sy = 0;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const k = stack.pop(), gx = k % gw, gy = (k / gw) | 0;
      n++; sx += gx; sy += gy; if (gx < minx) minx = gx; if (gx > maxx) maxx = gx; if (gy < miny) miny = gy; if (gy > maxy) maxy = gy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx, ny = gy + dy, nk = ny * gw + nx;
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && hit[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
      }
    }
    if (n >= minPixels) out.push({ x: x0 + minx * step, y: y0 + miny * step, w: (maxx - minx + 1) * step, h: (maxy - miny + 1) * step, cx: x0 + (sx / n) * step, cy: y0 + (sy / n) * step, n });
  }
  return out.sort((a, b) => b.n - a.n);
}

module.exports = { decode, blobs };
