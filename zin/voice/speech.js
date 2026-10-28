// Zin's ears and mouth, both running on your PC (sherpa-onnx).
//   Ears: notices when someone talks (silero VAD), then writes down what was said.
//   Mouth: turns text into her voice (Kokoro), a sentence at a time so she can
//   start talking before the whole reply is ready.
const os = require('os');
const path = require('path');
const so = require('sherpa-onnx-node');

const RATE = 16000;
const threads = () => Math.max(1, Math.min(4, os.cpus().length - 1));

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
    // talking is only noticed a moment after it begins, which clips "Zin" to "in"
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
//   emotional (Pocket TTS): copies the voice and mood of a short clip, so she
//     can sound happy, excited, sad, shy... (clips in voice/emotions)
//   classic (Kokoro): quicker and steady, no moods
const fs = require('fs');
const EMOTIONAL = ['mochi', 'pixie', 'luna'];
const MOODS = ['cute', 'happy', 'excited', 'sad', 'calm', 'confused', 'proud', 'pouty', 'shy', 'love'];
// the Kokoro voices that suit her (speaker numbers in the model)
const VOICES = { heart: 3, bella: 2, nicole: 6, sky: 10, aoede: 1, nova: 7, jessica: 4, kore: 5 };
// a mood also changes how fast she talks
const PACE = { excited: 1.06, happy: 1.03, sad: 0.92, calm: 0.92, shy: 0.96 };

// words written for reading that sound wrong spoken
function speakable(text) {
  return String(text)
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

class Mouth {
  // dir: the Kokoro folder (classic) or the Pocket TTS folder (emotional)
  constructor(dir, kind = 'classic', emotionsDir = null) {
    const f = (n) => path.join(dir, n);
    this.kind = kind;
    this.tts = new so.OfflineTts(kind === 'emotional'
      ? { model: { pocket: { lmFlow: f('lm_flow.int8.onnx'), lmMain: f('lm_main.int8.onnx'), encoder: f('encoder.onnx'), decoder: f('decoder.int8.onnx'), textConditioner: f('text_conditioner.onnx'), vocabJson: f('vocab.json'), tokenScoresJson: f('token_scores.json'), voiceEmbeddingCacheCapacity: 40 }, numThreads: threads(), debug: 0 }, maxNumSentences: 1 }
      : { model: { kokoro: { model: f('model.onnx'), voices: f('voices.bin'), tokens: f('tokens.txt'), dataDir: f('espeak-ng-data'), lexicon: f('lexicon-us-en.txt') }, numThreads: threads(), debug: 0 }, maxNumSentences: 1 });
    this.sampleRate = this.tts.sampleRate;
    this.emotionsDir = emotionsDir;
    this.clips = {};
    this.token = 0;
  }

  clip(voice, mood) {
    const v = EMOTIONAL.includes(voice) ? voice : EMOTIONAL[0];
    const m = MOODS.includes(mood) ? mood : 'cute';
    const key = v + '/' + m;
    if (!this.clips[key]) {
      const file = path.join(this.emotionsDir, v, m + '.wav');
      // (false: plain copies of the sound; Electron doesn't allow the library's shared memory)
      this.clips[key] = so.readWave(fs.existsSync(file) ? file : path.join(this.emotionsDir, v, 'cute.wav'), false);
    }
    return this.clips[key];
  }

  // onChunk(samples) is called for each sentence as soon as it's ready.
  // speed below 1 is slower. Resolves when done (or when hush() is called).
  async say(text, { voice = 'heart', mood = 'cute', speed = 1 } = {}, onChunk) {
    const my = ++this.token;
    const t = speakable(text);
    if (!t) return;
    const go = (samples) => { if (my !== this.token) return 0; if (onChunk && samples.length) onChunk(Float32Array.from(samples)); return 1; };
    if (this.kind !== 'emotional') {
      await this.tts.generateAsync({ text: t, sid: VOICES[voice] ?? VOICES.heart, speed, enableExternalBuffer: false, onProgress: ({ samples }) => go(samples) });
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

  hush() { this.token++; }
}

module.exports = { Ears, Mouth, VOICES, EMOTIONAL, MOODS, RATE, speakable, sentences };
