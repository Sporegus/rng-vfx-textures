// Checks Orpheus' sound tokens are turned into sound correctly: every frame
// exactly once, in order, for long and very short lines. Run: node voice/orpheus.test.js
const { OrpheusMouth, AUDIO, T, codeOf, toLevels, withSound } = require('./orpheus');
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; console.log('✗', what); } };

// a stand-in model that "says" n frames; frame f's first code is f
function fakeMouth(frames) {
  const tokens = [T.startAi, T.startSpeech];
  for (let f = 0; f < frames; f++) for (let i = 0; i < 7; i++) tokens.push(AUDIO + (i === 0 ? f : (f * 7 + i) % 4096) + i * 4096);
  tokens.push(T.endSpeech, 999, 999);
  const sequence = { clearHistory: async () => {}, evaluate: async function* () { for (const t of tokens) yield t; } };
  const context = { getSequence: () => sequence };
  const model = { tokenize: () => [1, 2, 3] };
  // a stand-in decoder: each frame's sound is 2048 samples of its frame number
  const decode = async ([l0]) => { const out = new Float32Array(l0.length * 2048); l0.forEach((f, k) => out.fill(f, k * 2048, (k + 1) * 2048)); return out; };
  return new OrpheusMouth(model, context, decode);
}

(async () => {
  check(codeOf(AUDIO + 5, 0) === 5 && codeOf(AUDIO + 4096 + 9, 1) === 9 && codeOf(128257, 0) === -1, 'token codes');
  const lv = toLevels([0, 1, 2, 3, 4, 5, 6]);
  check(JSON.stringify(lv) === '[[0],[1,4],[2,3,5,6]]', 'levels ' + JSON.stringify(lv));
  for (const frames of [1, 3, 4, 5, 12, 40]) {
    const m = fakeMouth(frames); const got = [];
    await m.say('hello there', { voice: 'tara' }, (c) => got.push(...c));
    const seq = []; for (let i = 0; i < got.length; i += 2048) seq.push(got[i]);
    const want = Array.from({ length: frames }, (_, f) => f);
    check(got.length === frames * 2048 && JSON.stringify(seq) === JSON.stringify(want), `${frames} frames -> ${JSON.stringify(seq)}`);
  }
  // stopping part way
  const m = fakeMouth(40); let chunks = 0;
  await m.say('hello', {}, () => { chunks++; m.hush(); });
  check(chunks === 1, 'hush stops it: ' + chunks + ' chunks');
  check(withSound('<laugh> haha', 'sad', 1) === '<laugh> haha' && withSound('Aw.', 'sad', 1) === '<sigh> Aw.' && withSound('Hi!', 'cute', 1) === 'Hi!', 'mood sounds');
  console.log(bad ? `${bad} problems` : 'all good');
  process.exitCode = bad ? 1 : 0;
})();
