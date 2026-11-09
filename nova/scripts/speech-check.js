// Spoken-command check with the REAL speech recognizer (no microphone needed):
// Nova's Kokoro voice says each command, the audio goes through the same VAD +
// recognizer as live listening (voice/speech.js Ears), then the real wake-word
// parser and the real request pipeline (with a fake PC, so nothing opens).
// Usage: node scripts/speech-check.js <models folder>   (needs vad, earsLight, voice models)
'use strict';
const path = require('path');
const { Ears, Mouth } = require('../voice/speech');
const Wake = require('../voice/wake');
const { harness } = require('../core/test/harness');

const root = process.argv[2];
const CASES = [
  { say: 'Nova, open notepad.', expect: { intent: 'app.open' } },
  { say: 'Nova, what is twelve times seven?', expect: { intent: 'math' } },
  { say: 'Nova, set a timer for ten minutes.', expect: { intent: 'timer' } },
  { say: 'Nova, stop.', expect: { stop: true } },
  { say: 'Nova, open Discord. Actually, Spotify.', expect: { opened: 'Spotify' } },
  { say: 'The weather is nice today.', expect: { ignored: true } },   // not talking to her
];
function resample(x, from, to) {
  const n = Math.round(x.length * to / from), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * from / to, k = Math.floor(p), f = p - k; out[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
  return out;
}
(async () => {
  const mouth = new Mouth(path.join(root, 'kokoro-multi-lang-v1_0'), 'classic');
  const ears = new Ears(path.join(root, 'silero_vad.onnx'), path.join(root, 'sherpa-onnx-moonshine-tiny-en-int8'));
  const results = [];
  for (const c of CASES) {
    let audio = [];
    await mouth.say(c.say, { voice: 'heart', mood: 'calm' }, (s) => audio.push(s));
    const a24 = Float32Array.from(audio.flatMap(x => Array.from(x)));
    const a16 = resample(a24, mouth.sampleRate, 16000);
    const pad = new Float32Array(16000);   // a second of silence before and after
    const all = new Float32Array(pad.length * 2 + a16.length); all.set(pad); all.set(a16, pad.length);
    const heard = [];
    const t0 = Date.now();
    ears.reset();
    for (let i = 0; i < all.length; i += 1600) ears.feed(all.subarray(i, i + 1600), { onText: (t) => heard.push(t) });
    await ears.queue;
    const text = heard.join(' ');
    const asrMs = Date.now() - t0;
    const w = Wake.hear(text);
    const h = harness();
    let route = null;
    if (w.wake) { await h.pipeline.input({ text: w.text, source: 'voice', utteranceId: 'u-' + results.length }); route = h.events; }
    const page = h.pageRuns.map(s => s.intent);
    const opened = h.replies().join(' ').match(/Opened (\w+)/);
    const stopped = h.replies().some(r => /stopped/i.test(r));
    const ok = c.expect.ignored ? !w.wake : c.expect.stop ? stopped : c.expect.opened ? (opened && opened[1] === c.expect.opened && !/Discord/.test(h.replies().join(' '))) : c.expect.intent === 'app.open' ? !!opened : page.includes(c.expect.intent);
    results.push({ said: c.say, heard: text, wake: w.wake, command: w.text, ran: page.concat(opened ? ['app.open:' + opened[1]] : []), ok: !!ok, asrMs });
    console.log(`${ok ? 'PASS' : 'FAIL'}  said "${c.say}"  heard "${text}"  -> ${w.wake ? w.text : '(not for Nova)'}  ${asrMs} ms`);
  }
  require('fs').writeFileSync(path.join(__dirname, '..', 'docs', 'speech-check-results.json'), JSON.stringify({ ran: new Date().toISOString(), recognizer: 'moonshine-tiny-en-int8 (Nova\'s "smaller speech model")', voice: 'Kokoro heart (synthetic speech, not a human or a microphone)', results }, null, 2) + '\n');
  console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
