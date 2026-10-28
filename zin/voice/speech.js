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
// the Kokoro voices that suit her (speaker numbers in the model)
const VOICES = { heart: 3, bella: 2, nicole: 6, sky: 10, aoede: 1, nova: 7, jessica: 4, kore: 5 };

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

class Mouth {
  constructor(dir) {
    const f = (n) => path.join(dir, n);
    this.tts = new so.OfflineTts({
      model: { kokoro: { model: f('model.onnx'), voices: f('voices.bin'), tokens: f('tokens.txt'), dataDir: f('espeak-ng-data'), lexicon: f('lexicon-us-en.txt') }, numThreads: threads(), debug: 0 },
      maxNumSentences: 1,
    });
    this.sampleRate = this.tts.sampleRate;
    this.token = 0;
  }

  // onChunk(samples) is called for each sentence as soon as it's ready.
  // speed below 1 is slower. Resolves when done (or when hush() is called).
  async say(text, { voice = 'heart', speed = 1 } = {}, onChunk) {
    const my = ++this.token;
    const t = speakable(text);
    if (!t) return;
    await this.tts.generateAsync({
      text: t, sid: VOICES[voice] ?? VOICES.heart, speed,
      onProgress: ({ samples }) => {
        if (my !== this.token) return 0; // stop: something newer was said
        if (onChunk) onChunk(Float32Array.from(samples));
        return 1;
      },
    });
  }

  hush() { this.token++; }
}

module.exports = { Ears, Mouth, VOICES, RATE, speakable };
