// Voice timing with the REAL listening code: Nova's synthetic voice (Kokoro) says each
// request, the audio is fed in real time (32 ms chunks) through the same silence detector
// and recognizer as live listening (voice/speech.js Ears, Parakeet), then the real wake
// word parser and the real request pipeline (fake PC: nothing opens). Measures, per request:
//   end of speech -> final transcript, final transcript -> dispatch, dispatch -> done.
// Synthetic speech, not a person or a microphone. Usage:
//   node scripts/voice-timing.js <models folder> [silence seconds, default 0.6]
'use strict';
const path = require('path');
const { Ears, Mouth } = require('../voice/speech');
const Wake = require('../voice/wake');
const { harness } = require('../core/test/harness');

const root = process.argv[2];
const silence = Number(process.argv[3] || Ears.SILENCE);
const chunk = Number(process.argv[4] || 512);   // microphone piece size in samples (the app sends 512 = 32 ms; it used to send 1600 = 100 ms)
const CASES = [
  ['Nova, open Discord.', { launch: 'Discord' }],
  ['Nova, could you pull up Spotify for me?', { launch: 'Spotify' }],
  ['Nova, would you mind opening Notepad?', { launch: 'Notepad' }],
  ["Nova, don't open Discord.", { none: true }],
  ['Nova, why is Discord so slow today?', { none: true }],
  ['Nova, I love Spotify.', { none: true }],
  ["Nova, I'm so tired. Turn the volume down.", { page: 'volume' }],
  ['Nova, thanks! Now open Discord.', { launch: 'Discord' }],
  ['Nova, open Discord. Actually, Spotify.', { launch: 'Spotify' }],
  ['Nova, set a timer for ten minutes.', { page: 'timer' }],
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function resample(x, from, to) {
  const n = Math.round(x.length * to / from), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * from / to, k = Math.floor(p), f = p - k; out[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; }
  return out;
}
// test speech: Nova's Kokoro voice if it's there, otherwise a small Piper voice
function voiceFor(root) {
  const fs = require('fs');
  if (fs.existsSync(path.join(root, 'kokoro-multi-lang-v1_0', 'model.onnx'))) {
    const mouth = new Mouth(path.join(root, 'kokoro-multi-lang-v1_0'), 'classic');
    return { name: 'Kokoro', say: async (t) => { const a = []; await mouth.say(t, { voice: 'heart', mood: 'calm' }, (s) => a.push(s)); return resample(Float32Array.from(a.flatMap(x => Array.from(x))), mouth.sampleRate, 16000); } };
  }
  const dir = fs.readdirSync(root).find(d => /^vits-piper-/.test(d));
  const so = require('sherpa-onnx-node');
  const tts = new so.OfflineTts({ model: { vits: { model: path.join(root, dir, fs.readdirSync(path.join(root, dir)).find(f => f.endsWith('.onnx'))), tokens: path.join(root, dir, 'tokens.txt'), dataDir: path.join(root, dir, 'espeak-ng-data') }, numThreads: 2 }, maxNumSentences: 1 });
  return { name: dir, say: async (t) => { const g = tts.generate({ text: t, sid: 0, speed: 1 }); return resample(g.samples, g.sampleRate, 16000); } };
}
(async () => {
  const voice = voiceFor(root);
  const asr = ['sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8', 'sherpa-onnx-moonshine-tiny-en-int8'].map(d => path.join(root, d)).find(d => require('fs').existsSync(d));
  const ears = new Ears(path.join(root, 'silero_vad.onnx'), asr, { silence });
  const rows = [];
  for (const [say, exp] of CASES) {
    const a16 = await voice.say(say);
    const all = new Float32Array(16000 * 2 + a16.length); all.set(a16, 8000);   // half a second before, 1.5 s after
    const heard = [];
    const h = harness();   // (ready before you speak, like the running app)
    await h.pipeline.input({ text: 'what time is it', source: 'typed' });   // (warm, like the running app)
    const runsBefore = h.pageRuns.length, repliesBefore = h.replies().length;
    ears.reset();
    // like the app: each phrase goes to her the moment it's written down
    const pending = [];
    const onText = (text, sec, timing) => {
      heard.push({ text, ...timing });
      const w = Wake.hear(text);
      if (w.wake) pending.push(h.pipeline.input({ text: w.text, source: 'voice', utteranceId: 'u' + rows.length + '-' + heard.length, timing }));
    };
    for (let i = 0; i < all.length; i += chunk) {   // in real time, like the microphone
      const t = Date.now();
      await sleep(Math.max(0, chunk / 16 - (Date.now() - t)));   // (a piece arrives only once it has been recorded)
      ears.feed(all.subarray(i, i + chunk), { onText });
    }
    await ears.queue; await Promise.all(pending);
    const text = heard.map(h => h.text).join(' ');
    const trace = pending.length ? h.pipeline.traces().slice(-1)[0] : null;
    const launched = h.replies().slice(repliesBefore).map(r => (r.match(/^Opened (.+?)\. ✅/) || [])[1]).filter(Boolean);
    const page = h.pageRuns.slice(runsBefore).map(s => s.intent).filter(i => !/^chat\./.test(i));
    const ok = exp.launch ? launched.join() === exp.launch && !page.length : exp.page ? page.join() === exp.page && !launched.length : !launched.length && !page.length;
    rows.push({ said: say, heard: text, phrases: heard.length, ok, speechMs: trace && trace.speechMs, toDispatchMs: trace && trace.toDispatchMs, toDoneMs: trace && trace.toDoneMs, totalMs: trace && trace.totalMs, path: trace && trace.path });
    console.log(`${ok ? 'PASS' : 'FAIL'} "${say}" -> heard "${text}" (${heard.length} phrase${heard.length === 1 ? '' : 's'})  speech end->text ${trace ? trace.speechMs : '-'} ms, text->dispatch ${trace ? trace.toDispatchMs : '-'} ms, total ${trace ? trace.totalMs : '-'} ms`);
  }
  const med = (k) => { const v = rows.map(r => r[k]).filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  console.log(`voice: ${voice.name}; recognizer: ${path.basename(asr)}`);
  console.log(`silence ${silence}s, mic pieces ${Math.round(chunk / 16)} ms: ${rows.filter(r => r.ok).length}/${rows.length} right; split into several phrases: ${rows.filter(r => r.phrases > 1).length}; median speech end->text ${med('speechMs')} ms, text->dispatch ${med('toDispatchMs')} ms, total ${med('totalMs')} ms`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
