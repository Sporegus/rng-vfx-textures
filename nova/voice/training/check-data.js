// Checks Nova's training recordings before training: every word said right (heard
// back with her speech recognizer), not too long, silence trimmed off the ends.
// Writes the good ones to "clean" plus the lists training reads (train.tsv, dev.tsv).
//   npm run voice-check-data            (looks in Documents\Nova voice training)
//   npm run voice-check-data -- <folder>
const fs = require('fs');
const os = require('os');
const path = require('path');
const so = require('sherpa-onnx-node');

const dir = process.argv[2] || path.join(os.homedir(), 'Documents', 'Nova voice training');
const appData = process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Nova') : path.join(os.homedir(), '.config', 'Nova');
const ears = path.join(appData, 'models', 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8');

const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = ' ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const num = (n) => (n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '') : n < 1000 ? ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + num(n % 100) : '') : String(n));
const SAME = { okay: 'ok', woah: 'whoa', alright: 'all right', hmph: 'hmm', hm: 'hmm', mm: 'hmm', huh: 'hmm', aww: 'aw', oh: 'oh', ooh: 'oh', ta: 'tada', da: '', woohoo: 'woo', yay: 'yay' };
const words = (t) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/(\d+)/g, (d) => ' ' + num(+d) + ' ').replace(/[^a-z' ]+/g, ' ')
  .split(/\s+/).filter(Boolean).map(w => (w in SAME ? SAME[w] : w)).filter(Boolean);
// how many of the script's words weren't heard
function missed(said, heard) {
  const a = words(said), b = words(heard), d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return { errors: d[a.length][b.length], of: a.length };
}
// cut the silence before and after (keeping a short pause)
function trim(x, rate) {
  const hop = Math.round(rate * 0.01), e = [];
  for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += x[i + j] * x[i + j]; e.push(Math.sqrt(s / hop)); }
  const peak = Math.max(...e), on = e.map(v => v > peak * 0.03);
  const first = on.indexOf(true), last = on.lastIndexOf(true);
  if (first < 0) return x;
  return x.slice(Math.max(0, (first - 15) * hop), Math.min(x.length, (last + 16) * hop));
}

if (!fs.existsSync(path.join(dir, 'recordings.tsv'))) { console.error(`No recordings found in ${dir}. Run "npm run voice-record -- --go" first.`); process.exit(1); }
if (!fs.existsSync(ears)) { console.error('Nova\'s ears aren\'t downloaded yet. Turn on her voice in Nova once, then run this again.'); process.exit(1); }
const rec = new so.OfflineRecognizer({ featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig: { transducer: { encoder: path.join(ears, 'encoder.int8.onnx'), decoder: path.join(ears, 'decoder.int8.onnx'), joiner: path.join(ears, 'joiner.int8.onnx') }, modelType: 'nemo_transducer', tokens: path.join(ears, 'tokens.txt'), numThreads: Math.max(1, Math.min(8, os.cpus().length - 1)), debug: 0 } });

const items = fs.readFileSync(path.join(dir, 'recordings.tsv'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => { const [id, mood, text] = l.split('\t'); return { id, mood, text }; });
fs.mkdirSync(path.join(dir, 'clean'), { recursive: true });
const good = [], bad = [];
let seconds = 0;
console.log(`Checking ${items.length} recordings in ${dir}\n`);
items.forEach((it, n) => {
  const file = path.join(dir, 'wavs', it.id + '.wav');
  if (!fs.existsSync(file)) { bad.push({ ...it, why: 'not recorded' }); return; }
  const w = so.readWave(file, false);
  const x = trim(w.samples, w.sampleRate), secs = x.length / w.sampleRate;
  const st = rec.createStream(); st.acceptWaveform({ samples: x, sampleRate: w.sampleRate }); rec.decode(st);
  const heard = rec.getResult(st).text.trim();
  const m = missed(it.text, heard);
  // a word or two can be the recognizer's mistake; more than that is a bad take
  if (m.errors > Math.max(1, Math.round(m.of * 0.08))) bad.push({ ...it, why: `heard "${heard}"` });
  else if (secs > 20 || secs < 1) bad.push({ ...it, why: `${secs.toFixed(1)} seconds long` });
  else {
    so.writeWave(path.join(dir, 'clean', it.id + '.wav'), { samples: x, sampleRate: w.sampleRate });
    good.push(it); seconds += secs;
  }
  process.stdout.write(`\r  ${n + 1} of ${items.length} checked, ${bad.length} not usable   `);
});
// one in 25 is kept aside to check training on sentences it didn't learn from
const line = (it) => `${it.id}\t${it.text}\tclean/${it.id}.wav`;
fs.writeFileSync(path.join(dir, 'train.tsv'), good.filter((_, i) => i % 25 !== 12).map(line).join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'dev.tsv'), good.filter((_, i) => i % 25 === 12).map(line).join('\n') + '\n');
console.log(`\n\n${good.length} recordings are good: ${(seconds / 60).toFixed(1)} minutes of her voice.`);
const byMood = {}; for (const it of good) byMood[it.mood] = (byMood[it.mood] || 0) + 1;
console.log('  by mood: ' + Object.entries(byMood).map(([m, c]) => `${m} ${c}`).join(', '));
if (bad.length) {
  console.log(`\n${bad.length} can't be used (left out of training):`);
  for (const b of bad) console.log(`  ${b.id}: "${b.text}" -> ${b.why}`);
  console.log('\nTo redo them: delete those files from the "wavs" folder and run "npm run voice-record -- --go" again.');
}
console.log('\nNext: training (see voice/training/README.md, step 4).');
