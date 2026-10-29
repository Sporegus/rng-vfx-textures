// Nova's ears and mouth, both running on your PC (sherpa-onnx).
//   Ears: notices when someone talks (silero VAD), then writes down what was said.
//   Mouth: turns text into her voice (her own clone voice, ZipVoice; or Kokoro or
//   Pocket TTS), a sentence at a time so she can start talking before the whole
//   reply is ready.
const os = require('os');
const path = require('path');
const so = require('sherpa-onnx-node');

const RATE = 16000;
const threads = () => Math.max(1, Math.min(4, os.cpus().length - 1));
// making speech gains from more of the processor (half the threads on big PCs: one per core)
const ttsThreads = () => { const n = os.cpus().length; return Math.max(1, Math.min(8, n >= 8 ? Math.floor(n / 2) : n - 1)); };

// ---------------------------------------------------------------- ears
class Ears {
  // vadFile: silero_vad.onnx; asrDir: a Parakeet or Moonshine folder
  constructor(vadFile, asrDir) {
    this.vad = new so.Vad({
      sileroVad: { model: vadFile, threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.6, maxSpeechDuration: 15, windowSize: 512 },
      sampleRate: RATE, numThreads: 1, debug: 0,
    }, 30);
    const f = (n) => path.join(asrDir, n);
    const model = /moonshine/.test(asrDir)
      ? { moonshine: { preprocessor: f('preprocess.onnx'), encoder: f('encode.int8.onnx'), uncachedDecoder: f('uncached_decode.int8.onnx'), cachedDecoder: f('cached_decode.int8.onnx') } }
      : { transducer: { encoder: f('encoder.int8.onnx'), decoder: f('decoder.int8.onnx'), joiner: f('joiner.int8.onnx') }, modelType: 'nemo_transducer' };
    this.rec = new so.OfflineRecognizer({ featConfig: { sampleRate: RATE, featureDim: 80 }, modelConfig: { ...model, tokens: f('tokens.txt'), numThreads: threads(), debug: 0 } });
    this.pending = new Float32Array(0);
    this.talking = false;
    this.queue = Promise.resolve();
    // the last 20 s of sound, so each bit of speech can start a little early:
    // talking is only noticed a moment after it begins, which clips "Nova" to "in"
    this.hist = new Float32Array(RATE * 20);
    this.fed = 0;
  }

  // feed 16 kHz mono audio; calls onSpeech(true/false) as talking starts and
  // stops, and onText(text, seconds) for each thing that was said
  feed(samples, { onSpeech, onText }) {
    const all = new Float32Array(this.pending.length + samples.length);
    all.set(this.pending); all.set(samples, this.pending.length);
    let i = 0;
    for (; i + 512 <= all.length; i += 512) {
      const chunk = all.subarray(i, i + 512);
      this.vad.acceptWaveform(chunk);
      for (let k = 0; k < 512; k++) this.hist[(this.fed + k) % this.hist.length] = chunk[k];
      this.fed += 512;
    }
    this.pending = all.slice(i);
    const now = this.vad.isDetected();
    if (now !== this.talking) { this.talking = now; if (onSpeech) onSpeech(now); }
    while (!this.vad.isEmpty()) {
      const seg = this.vad.front(false);
      this.vad.pop();
      const pre = Math.max(0, Math.min(Math.round(RATE * 0.4), seg.start, this.hist.length - (this.fed - seg.start)));
      const audio = new Float32Array(pre + seg.samples.length);
      for (let k = 0; k < pre; k++) audio[k] = this.hist[(seg.start - pre + k) % this.hist.length];
      audio.set(seg.samples, pre);
      this.queue = this.queue.then(() => this.transcribe(audio)).then((t) => { if (t && onText) onText(t, audio.length / RATE); }).catch(() => {});
    }
  }

  async transcribe(samples) {
    const st = this.rec.createStream();
    st.acceptWaveform({ samples, sampleRate: RATE });
    await this.rec.decodeAsync(st);
    return this.rec.getResult(st).text.trim();
  }

  reset() { this.vad.reset(); this.pending = new Float32Array(0); this.talking = false; this.fed = 0; }
}

// ---------------------------------------------------------------- mouth
// Two kinds of voice:
//   steady (Kokoro): one consistent voice, quick to start. Moods change how she
//     says things (pace, pitch, loudness), so she never sounds like someone else.
//     Includes Nova's own voices, made to sound like a real person (voice/styles)
//   expressive (Pocket TTS): copies the voice and mood of a short clip (voice/emotions);
//     more feeling, but the voice drifts a little from sentence to sentence
const fs = require('fs');
// expressive voices and the clip folder each one uses
const EXPRESSIVE = { mochi: 'mochi', sparkle: 'pixie', luna: 'luna' };
const EMOTIONAL = Object.keys(EXPRESSIVE);
const MOODS = ['cute', 'happy', 'excited', 'sad', 'calm', 'confused', 'proud', 'pouty', 'shy', 'love'];
// the Kokoro voices that suit her (speaker numbers in the model); Nova's own
// voices take over unused slots at the end (see customVoices)
const VOICES = { heart: 3, bella: 2, nicole: 6, sky: 10, aoede: 1, nova: 7, jessica: 4, kore: 5 };
const CUSTOM_SLOTS = [53, 52, 51, 50];
// Nova's own voices were tuned at a livelier pace than Kokoro's default
const BASE_SPEED = { pixie: 1.1 };
// how each mood is delivered by a steady voice: pace, pitch (played back higher or
// lower) and loudness. Small changes, so it stays the same voice.
const DELIVERY = {
  cute: { speed: 1, pitch: 1, gain: 1 }, happy: { speed: 1.04, pitch: 1.03, gain: 1.05 }, excited: { speed: 1.08, pitch: 1.06, gain: 1.12 },
  sad: { speed: 0.9, pitch: 0.96, gain: 0.8 }, calm: { speed: 0.93, pitch: 0.98, gain: 0.85 }, confused: { speed: 0.96, pitch: 1.02, gain: 0.95 },
  proud: { speed: 1.02, pitch: 1.02, gain: 1.08 }, pouty: { speed: 1.05, pitch: 1.04, gain: 1.1 }, shy: { speed: 0.95, pitch: 1.03, gain: 0.78 },
  love: { speed: 0.95, pitch: 1.02, gain: 0.9 },
};
// a mood also changes how fast she talks
const PACE = { excited: 1.06, happy: 1.03, sad: 0.92, calm: 0.92, shy: 0.96 };

// words written for reading that sound wrong spoken (and words the voice
// mispronounces, like "resume" and "Roblox": see pronounce.js)
const { pronounce } = require('./pronounce');
const { polish } = require('./polish');
const { LineCache } = require('./linecache');
function speakable(text) {
  return pronounce(String(text))
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[›»→←↩⏱⏰…•·×]/g, (c) => (c === '…' ? '...' : c === '›' || c === '»' ? ', ' : ' '))
    .replace(/(\d)\s?°F/g, '$1 degrees').replace(/(\d)\s?°C?/g, '$1 degrees')
    .replace(/(\d)%/g, '$1 percent')
    .replace(/\bPC\b/g, 'P C').replace(/\bA to Z\b/g, 'A to Z')
    .replace(/\s+/g, ' ').trim();
}
// stretched words read badly ("Hiii" comes out as "P"); keep one or two letters
const unstretch = (t) => t.replace(/\b[Hh]i{2,}\b/g, (m) => m[0] + 'i').replace(/\b([Aa])w{2,}\b/g, '$1w').replace(/([a-z])\1{2,}/gi, '$1$1');

// split into sentences, so she can start talking after the first one
const sentences = (t) => (t.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) || [t]).map(x => x.trim()).filter(Boolean);

// Her clone voice: sentences, with tiny ones ("Okay!") joined to the next, and a long
// first sentence said in two parts (at a comma) so she starts sooner
function clonePieces(t) {
  const parts = sentences(t);
  for (let i = 0; i < parts.length - 1; i++) if (parts[i].length < 10) { parts.splice(i, 2, parts[i] + ' ' + parts[i + 1]); i--; }
  const comma = parts[0] && parts[0].length > 60 ? parts[0].indexOf(', ', 15) : -1;
  if (comma > 0 && parts[0].length - comma > 15) parts.splice(0, 1, parts[0].slice(0, comma + 1), parts[0].slice(comma + 2));
  return parts;
}
// Words her clone voice says more clearly when respelled (checked with speech
// recognition): it reads "a" on its own like the letter ("rolled a 17" sounded like
// "rolled I 17"), "one" like "on" and "tick" like "take"
const CLONE_SAY = [
  [/\b(?:a|A(?! to [A-Z]))(?= [a-z])/g, (m) => (m === 'A' ? 'Uh' : 'uh')],
  [/\bone\b/gi, (m) => (m[0] === 'O' ? 'Wun' : 'wun')],
  [/\btick\b/gi, (m) => (m[0] === 'T' ? 'Tik' : 'tik')],
];
const cloneText = (t) => CLONE_SAY.reduce((s, [re, to]) => s.replace(re, to), t);
// refining steps for the clone voice (more is clearer and slower), and how long she
// may take to start talking
const MIN_STEPS = 4, MAX_STEPS = 8, FIRST_WAIT = 2;
// how closely the clone follows her mood clip. 2 copies the mood best (tested against
// her clips: pitch follows them 0.94, liveliness 0.87, pace 0.64; at 1: 0.77, 0.82,
// 0.48) and sounds just as much like her; more than 2 is worse again
const CLONE_GUIDANCE = 2;
// change when something changes how her clone voice sounds, so saved lines are made again
const CLONE_VERSION = 3;

// Kokoro reads all its voices from one file (54 voices of 510 x 256 numbers).
// Nova's own voices (voice/styles/<name>.bin, one voice each) are written over
// unused slots in a copy of that file, kept next to the model.
function customVoices(dir, stylesDir) {
  const names = stylesDir && fs.existsSync(stylesDir) ? fs.readdirSync(stylesDir).filter(f => f.endsWith('.bin')).sort().slice(0, CUSTOM_SLOTS.length) : [];
  if (!names.length) return path.join(dir, 'voices.bin');
  const out = path.join(dir, 'nova-voices.bin');
  const buf = fs.readFileSync(path.join(dir, 'voices.bin'));
  const size = 510 * 256 * 4;
  names.forEach((n, i) => {
    const v = fs.readFileSync(path.join(stylesDir, n));
    if (v.length === size) v.copy(buf, CUSTOM_SLOTS[i] * size);
    VOICES[n.replace(/\.bin$/, '')] = CUSTOM_SLOTS[i];
  });
  if (!fs.existsSync(out) || !fs.readFileSync(out).equals(buf)) fs.writeFileSync(out, buf);
  return out;
}

class Mouth {
  // dir: the Kokoro folder (steady), the Pocket TTS folder (expressive) or the
  // ZipVoice folder (clone); extra: the expressive clips folder, the folder of Nova's
  // own steady voices, or for a clone { clips: her clips folder, vocoder: vocos file }
  constructor(dir, kind = 'classic', extra = null) {
    const f = (n) => path.join(dir, n);
    this.kind = kind;
    if (kind === 'clone') {
      // extra: { clips: her clips folder, vocoder: the vocos file, hq: the full-size
      // model's folder (clearer) or null for the small one, cache: a folder for lines she's said }
      const hq = extra.hq ? (n) => path.join(extra.hq, n) : null;
      // her own trained voice (voice/training) comes as a full-size and a smaller copy, with its own word list
      const enc = extra.small ? 'text_encoder_int8.onnx' : 'text_encoder.onnx', dec = extra.small ? 'fm_decoder_int8.onnx' : 'fm_decoder.onnx';
      const tokens = hq && fs.existsSync(hq('tokens.txt')) ? hq('tokens.txt') : f('tokens.txt');
      this.tts = new so.OfflineTts({ model: { zipvoice: { tokens, encoder: hq ? hq(enc) : f('encoder.int8.onnx'), decoder: hq ? hq(dec) : f('decoder.int8.onnx'), vocoder: extra.vocoder, lexicon: f('lexicon.txt'), dataDir: f('espeak-ng-data'), guidanceScale: CLONE_GUIDANCE }, numThreads: ttsThreads(), debug: 0 }, maxNumSentences: 1 });
      this.hq = !!hq; this.small = !!extra.small;
      this.sampleRate = this.tts.sampleRate;
      this.cloneDir = extra.clips;
      this.lines = JSON.parse(fs.readFileSync(path.join(extra.clips, 'lines.json'), 'utf8'));
      this.clips = {};
      this.token = 0;
      // how long making speech takes here (seconds of work per second of speech, per
      // step) and how long a letter takes to say; guesses until she has talked a bit
      this.pace = { perStep: hq ? 0.25 : 0.15, perChar: 0.065 };
      this.cache = extra.cache ? new LineCache(extra.cache, [CLONE_VERSION, hq ? extra.hq + (extra.small ? ':small' : '') : 'int8', this.lines]) : null;
      this.fixedSteps = null; // always use this many steps (for testing)
      this.todo = new Map(); // cached lines made in a hurry, to make again at full quality when she's idle
      this.lock = Promise.resolve();
      return;
    }
    const voicesFile = kind === 'emotional' ? null : customVoices(dir, extra);
    this.tts = new so.OfflineTts(kind === 'emotional'
      ? { model: { pocket: { lmFlow: f('lm_flow.int8.onnx'), lmMain: f('lm_main.int8.onnx'), encoder: f('encoder.onnx'), decoder: f('decoder.int8.onnx'), textConditioner: f('text_conditioner.onnx'), vocabJson: f('vocab.json'), tokenScoresJson: f('token_scores.json'), voiceEmbeddingCacheCapacity: 40 }, numThreads: threads(), debug: 0 }, maxNumSentences: 1 }
      : { model: { kokoro: { model: f('model.onnx'), voices: voicesFile, tokens: f('tokens.txt'), dataDir: f('espeak-ng-data'), lexicon: f('lexicon-us-en.txt') }, numThreads: threads(), debug: 0 }, maxNumSentences: 1 });
    this.sampleRate = this.tts.sampleRate;
    this.emotionsDir = kind === 'emotional' ? extra : null;
    this.clips = {};
    this.token = 0;
  }

  // a clone's clip for this mood (and the words said in it)
  cloneClip(mood) {
    const m = this.lines[mood] ? mood : 'cute';
    // (its words are read the same way as what she says, so they match how the voice hears them)
    if (!this.clips[m]) this.clips[m] = { wave: so.readWave(path.join(this.cloneDir, m + '.wav'), false), text: cloneText(speakable(this.lines[m])) };
    return this.clips[m];
  }

  clip(voice, mood) {
    const v = EXPRESSIVE[voice] || EXPRESSIVE[EMOTIONAL[0]];
    const m = MOODS.includes(mood) ? mood : 'cute';
    const key = v + '/' + m;
    if (!this.clips[key]) {
      const file = path.join(this.emotionsDir, v, m + '.wav');
      // (false: plain copies of the sound; Electron doesn't allow the library's shared memory)
      this.clips[key] = so.readWave(fs.existsSync(file) ? file : path.join(this.emotionsDir, v, 'cute.wav'), false);
    }
    return this.clips[key];
  }

  // onChunk(samples, { pitch, gain }) is called for each sentence as soon as it's
  // ready; the player applies pitch and gain. speed below 1 is slower.
  // Resolves when done (or when hush() is called).
  async say(text, { voice = 'heart', mood = 'cute', speed = 1, cache = false } = {}, onChunk) {
    const my = ++this.token;
    const t = speakable(text).replace(/<[a-z]+>\s*/g, ''); // sound tags like <giggle> are for the natural voice
    if (!t) return;
    const d = this.kind !== 'classic' ? { speed: 1, pitch: 1, gain: 1 } : DELIVERY[mood] || DELIVERY.cute;
    const go = (samples) => { if (my !== this.token) return 0; if (onChunk && samples.length) onChunk(Float32Array.from(samples), { pitch: d.pitch, gain: d.gain }); return 1; };
    if (this.kind === 'clone') return this.sayClone(cloneText(unstretch(t)), mood, speed, !!cache, go, my);
    if (this.kind !== 'emotional') {
      // played back d.pitch times faster, so say it that much slower to keep the pace
      await this.tts.generateAsync({ text: t, sid: VOICES[voice] ?? VOICES.heart, speed: speed * (BASE_SPEED[voice] || 1) * d.speed / d.pitch, enableExternalBuffer: false, onProgress: ({ samples }) => go(samples) });
      return;
    }
    const ref = this.clip(voice, mood);
    // each piece is fully made before it plays, so a long first sentence is said in
    // two parts (at a comma) to start sooner; the rest is made while she talks
    const parts = sentences(unstretch(t));
    const comma = parts[0].length > 45 ? parts[0].indexOf(', ', 12) : -1;
    if (comma > 0 && parts[0].length - comma > 12) parts.splice(0, 1, parts[0].slice(0, comma + 1), parts[0].slice(comma + 2));
    for (let s of parts) {
      if (my !== this.token) return; // something newer was said
      // one-word sentences ("Okay!") can make the model ramble; a trailing pause stops it
      if (!/\s/.test(s.replace(/[.!?…"')\]]+$/, ''))) s += ' ...';
      // and cap the length to about twice what the sentence needs (12.5 frames a second)
      const maxFrames = Math.round(12.5 * Math.min(25, 2 + s.length * 0.11));
      const gc = new so.GenerationConfig({
        speed: speed * (PACE[mood] || 1), referenceAudio: ref.samples, referenceSampleRate: ref.sampleRate, numSteps: 5,
        extra: { max_reference_audio_len: 10, max_frames: maxFrames, seed: Math.floor(Math.random() * 1e6) },
      });
      const a = await this.tts.generateAsync({ text: s, generationConfig: gc, enableExternalBuffer: false });
      if (go(a.samples) === 0) return;
    }
  }

  // one piece of speech from her clone voice, cleaned up; the work is measured to plan the next
  async makeClone(text, mood, speed, steps) {
    const c = this.cloneClip(mood);
    const run = async () => {
      const t0 = Date.now();
      const a = await this.tts.generateAsync({
        text, enableExternalBuffer: false,
        generationConfig: new so.GenerationConfig({ speed, referenceAudio: c.wave.samples, referenceSampleRate: c.wave.sampleRate, referenceText: c.text, numSteps: steps, extra: { min_char_in_sentence: 10 } }),
      });
      const secs = a.samples.length / a.sampleRate;
      if (secs > 0.3) {
        this.pace.perStep = 0.6 * this.pace.perStep + 0.4 * ((Date.now() - t0) / 1000 / secs / steps);
        this.pace.perChar = 0.8 * this.pace.perChar + 0.2 * (secs / text.length);
      }
      return polish(a.samples, a.sampleRate);
    };
    const p = this.lock.then(run);
    this.lock = p.catch(() => {});
    return p;
  }

  // Says each sentence as soon as it's made, making the next while she talks. Each
  // one gets as many refining steps (4 to 8; more is clearer) as there's time for:
  // the first so she starts within about 2 seconds, the rest before she gets to them.
  async sayClone(text, mood, speed, useCache, go, my) {
    clearTimeout(this.idleTimer);
    const pieces = clonePieces(text);
    let playEnd = Date.now(); // when what she's been given so far finishes playing
    for (let i = 0; i < pieces.length; i++) {
      if (my !== this.token) return;
      const s = pieces[i];
      const key = useCache && this.cache ? this.cache.key(s, mood, speed) : null;
      let samples = null, steps = MAX_STEPS;
      const hit = key && this.cache.get(key);
      if (hit) {
        samples = hit.samples;
        if (hit.steps < MAX_STEPS && s.length < 120) this.todo.set(key, { s, mood, speed });
      } else {
        const budget = i === 0 ? FIRST_WAIT : (playEnd - Date.now()) / 1000 - 0.2;
        steps = this.fixedSteps || Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.floor(budget / (this.pace.perStep * s.length * this.pace.perChar))));
        samples = await this.makeClone(s, mood, speed, steps);
        if (key) { this.cache.put(key, samples, steps); if (steps < MAX_STEPS && s.length < 120) this.todo.set(key, { s, mood, speed }); }
      }
      if (!go(samples)) return;
      playEnd = Math.max(playEnd, Date.now()) + 1000 * samples.length / this.sampleRate;
    }
    this.idleLater();
  }

  // when she's been quiet for a while, remake one hurried line at full quality
  idleLater() {
    clearTimeout(this.idleTimer);
    if (!this.todo.size) return;
    this.idleTimer = setTimeout(async () => {
      const [key, job] = this.todo.entries().next().value;
      this.todo.delete(key);
      const busy = this.token;
      const samples = await this.makeClone(job.s, job.mood, job.speed, MAX_STEPS).catch(() => null);
      if (samples) this.cache.put(key, samples, MAX_STEPS);
      if (busy === this.token) this.idleLater();
    }, 20000);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  // a short line to get the voice going (the first one is always slow) and measure this PC
  async warmUp() {
    if (this.kind === 'clone') await this.makeClone('Okay, I am ready to help.', 'cute', 1, MIN_STEPS).catch(() => {});
  }

  // true when even the quickest setting can't keep up (her voice would keep pausing)
  get tooSlow() { return this.kind === 'clone' && this.pace.perStep * MIN_STEPS > 1.15; }

  hush() { this.token++; }
}

module.exports = { Ears, Mouth, VOICES, EMOTIONAL, MOODS, DELIVERY, RATE, speakable, sentences, clonePieces, cloneText };
