// Run: node voice/polish.test.js
const { polish } = require('./polish');
const RATE = 24000;
const rms = (a, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / (to - from)); };
const db = (x) => 20 * Math.log10(x + 1e-12);
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; console.log('✗', what); } };

// a "voice" (a 220 Hz tone with harmonics, on for 1 s) with quiet hiss all the way through
const n = RATE * 2, x = new Float32Array(n);
let seed = 1; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
for (let i = 0; i < n; i++) {
  const on = i > RATE * 0.5 && i < RATE * 1.5;
  x[i] = (on ? 0.2 * Math.sin(2 * Math.PI * 220 * i / RATE) + 0.08 * Math.sin(2 * Math.PI * 660 * i / RATE) : 0) + 0.003 * noise();
}
const y = polish(x, RATE);
check(y.length === x.length, 'keeps the length');
check(y.every(Number.isFinite), 'no broken samples');
const voiceIn = rms(x, RATE * 0.6, RATE * 1.4), voiceOut = rms(y, RATE * 0.6, RATE * 1.4);
const hissIn = rms(x, 0, RATE * 0.4), hissOut = rms(y, 0, RATE * 0.4);
check(Math.abs(db(voiceOut / voiceIn)) < 6, `voice keeps its loudness (changed ${db(voiceOut / voiceIn).toFixed(1)} dB)`);
check(db(hissOut / hissIn) < -6, `hiss between words is turned down (changed ${db(hissOut / hissIn).toFixed(1)} dB)`);
check(Math.max(...y.map(Math.abs)) <= 1, 'never clips');
check(polish(new Float32Array(100), RATE).length === 100, 'short pieces pass through');
console.log(bad ? `${bad} problems` : 'all good');
process.exitCode = bad ? 1 : 0;
