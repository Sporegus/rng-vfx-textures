// Cleans up each sentence of Nova's voice before she says it. The voice model
// leaves a little hiss and fizz between and under the words; this takes it out,
// softens harsh "s" sounds, tames the brittle top end and evens out the loudness.
// It's the same chain as the "everything max" sample (setting I), done in
// JavaScript so it works without any other program:
//   denoise (-12 dB at most), de-ess (-12 dB at most), -4 dB around 7 kHz, cut above 10.5 kHz,
//   gentle 2:1 compression above -20 dB, then +3.5 dB.
// polish(samples, sampleRate) -> new Float32Array, same length.

const N = 1024, HOP = 256;
const WIN = new Float32Array(N).map((_, i) => Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N))); // sqrt-Hann, in and out

// in-place radix-2 FFT (re, im of length N); inverse when inv
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// how loud a biquad leaves each frequency (RBJ cookbook), for the fixed EQ
function biquadGain(type, f0, rate, { q = Math.SQRT1_2, db = 0, bw = 0 } = {}) {
  const w0 = 2 * Math.PI * f0 / rate, cw = Math.cos(w0), sw = Math.sin(w0);
  const A = Math.pow(10, db / 40);
  const alpha = sw / (2 * (type === 'peak' ? f0 / bw : q));
  const [b0, b1, b2, a0, a1, a2] = type === 'peak'
    ? [1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A]
    : [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
  return (f) => {
    const w = 2 * Math.PI * f / rate, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  };
}

const eqCache = {};
function eqCurve(rate) {
  if (eqCache[rate]) return eqCache[rate];
  const peak = biquadGain('peak', 7000, rate, { db: -4, bw: 4000 }), low = biquadGain('low', Math.min(10500, rate * 0.45), rate);
  const c = new Float32Array(N / 2 + 1);
  for (let k = 0; k <= N / 2; k++) { const f = k * rate / N; c[k] = peak(f) * low(f); }
  return (eqCache[rate] = c);
}

function spectral(x, rate, o = {}) {
  const D = { th: 0.1, slope: 8, min: 0.25, ...o };
  const bins = N / 2 + 1, frames = Math.max(1, Math.ceil((x.length + N) / HOP));
  const pad = new Float32Array(frames * HOP + N); pad.set(x, N / 2);
  const RE = [], IM = [], P = [];
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = pad[f * HOP + i] * WIN[i];
    fft(re, im, false);
    const p = new Float32Array(bins);
    for (let k = 0; k < bins; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    RE.push(re); IM.push(im); P.push(p);
  }
  // the noise in each band: its average over the quietest fifth of the frames (the
  // gaps between words), kept between a floor (-65 dB) and a cap (-48 dB) so a
  // sentence with no gaps isn't taken for noise
  const unit = N / 2; // the power per bin of full-scale white noise, for this window
  const lo = unit * Math.pow(10, -65 / 10), hi = unit * Math.pow(10, -48 / 10);
  const energy = P.map((p) => p.reduce((a, v) => a + v, 0));
  const cut = [...energy].sort((a, b) => a - b)[Math.floor((frames - 1) * 0.2)];
  const quiet = P.filter((p, f) => energy[f] <= cut);
  const noise = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    let m = 0; for (const p of quiet) m += p[k];
    noise[k] = Math.min(hi, Math.max(lo, m / quiet.length));
  }
  const eq = eqCurve(rate), GMIN = Math.pow(10, -12 / 20);
  const sib = Math.floor(4500 * N / rate), top = Math.min(bins, Math.floor(10000 * N / rate));
  let prev = new Float32Array(bins).fill(1);
  const out = new Float32Array(pad.length);
  for (let f = 0; f < frames; f++) {
    const p = P[f], re = RE[f], im = IM[f], g = new Float32Array(bins);
    // denoise: keep what stands above the noise, smoothed over neighbours and time
    for (let k = 0; k < bins; k++) g[k] = Math.max(GMIN, 1 - 2 * noise[k] / Math.max(1e-12, p[k]));
    for (let k = 1; k < bins - 1; k++) g[k] = (g[k - 1] + 2 * g[k] + g[k + 1]) / 4;
    for (let k = 0; k < bins; k++) { g[k] = Math.max(g[k], 0.6 * prev[k] + 0.4 * g[k]); }
    prev = g;
    // de-ess: the more of the sound is "s" energy (4.5 to 10 kHz), the more that band is turned down (to -12 dB)
    let all = 0, hiss = 0;
    for (let k = 1; k < top; k++) { all += p[k]; if (k >= sib) hiss += p[k]; }
    const ratio = all > 0 ? hiss / all : 0, duck = ratio > D.th ? Math.max(D.min, 1 - (ratio - D.th) * D.slope) : 1;
    for (let k = 0; k < bins; k++) {
      const m = g[k] * eq[k] * (k >= sib ? duck : 1);
      re[k] *= m; im[k] *= m;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    im[0] = 0; im[N / 2] = 0;
    fft(re, im, true);
    for (let i = 0; i < N; i++) out[f * HOP + i] += re[i] * WIN[i];
  }
  // sqrt-Hann in and out at a quarter-frame hop adds up to 2
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = out[i + N / 2] / 2;
  return y;
}

// 2:1 above -20 dB with a soft knee; reacts in 10 ms, lets go over 120 ms; then +3.5 dB
function compress(x, rate) {
  const at = Math.exp(-1 / (0.010 * rate)), rel = Math.exp(-1 / (0.120 * rate));
  const T = -20, R = 2, KNEE = 2.8, MAKEUP = 1.5;
  let env = 0;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const s = x[i] * x[i];
    env = s > env ? at * env + (1 - at) * s : rel * env + (1 - rel) * s;
    const db = 10 * Math.log10(env + 1e-12);
    let over = db - T, cut = 0;
    if (over > KNEE / 2) cut = over * (1 - 1 / R);
    else if (over > -KNEE / 2) cut = (1 - 1 / R) * Math.pow(over + KNEE / 2, 2) / (2 * KNEE);
    const v = x[i] * Math.pow(10, -cut / 20) * MAKEUP;
    y[i] = v > 0.95 ? 0.95 + 0.05 * Math.tanh((v - 0.95) / 0.05) : v < -0.95 ? -0.95 - 0.05 * Math.tanh((-v - 0.95) / 0.05) : v;
  }
  return y;
}

function polish(samples, rate, o) {
  if (!samples || samples.length < N) return Float32Array.from(samples || []);
  return compress(spectral(samples, rate, o), rate);
}

module.exports = { polish, fft };
