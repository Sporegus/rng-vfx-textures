// Orpheus TTS: a 3B voice model that sounds much more natural than the small
// ones, and can giggle, laugh, sigh and gasp. It runs on the graphics card through
// llama.cpp (the same engine as the chat brain): it writes "sound tokens", 7 for
// every 85 ms of speech, and the small SNAC decoder turns them into sound.
// Needs a graphics card to keep up with real time (an RTX 2070 or better).
const os = require('os');
const { speakable } = require('./speech');

// the Orpheus voices (the female ones suit Nova best)
const VOICES = ['tara', 'leah', 'jess', 'mia', 'zoe', 'leo', 'dan', 'zac'];
// sounds Orpheus can make when they're written in the text
const SOUNDS = ['laugh', 'chuckle', 'giggle', 'sigh', 'gasp', 'groan', 'yawn', 'sniffle', 'cough'];

// special tokens in Orpheus' vocabulary
const T = { start: 128259, endText: 128009, endHuman: 128260, startAi: 128261, startSpeech: 128257, endSpeech: 128258 };
const AUDIO = 128266;      // the first sound token ("<custom_token_10>")
const PER_FRAME = 7;       // sound tokens per 85 ms frame
const WINDOW = 4 * PER_FRAME; // the decoder looks at 4 frames, and the middle part is kept
const STEP_SAMPLES = 2048; // new samples per frame (24 kHz)

// a sound token's code for its place in the frame, or -1 if it isn't one
function codeOf(token, index) {
  const c = token - AUDIO - (index % PER_FRAME) * 4096;
  return c >= 0 && c < 4096 ? c : -1;
}

// one frame of 7 codes feeds SNAC's three levels: 1, 2 and 4 codes
function toLevels(codes) {
  const n = Math.floor(codes.length / PER_FRAME), l0 = [], l1 = [], l2 = [];
  for (let f = 0; f < n; f++) {
    const c = codes.slice(f * PER_FRAME, f * PER_FRAME + PER_FRAME);
    l0.push(c[0]); l1.push(c[1], c[4]); l2.push(c[2], c[3], c[5], c[6]);
  }
  return [l0, l1, l2];
}

// The mood a sentence is said in can add a little sound now and then
// ("happy" sometimes giggles). Tags the chat brain wrote stay as they are.
const MOOD_SOUND = { happy: 'giggle', excited: 'gasp', sad: 'sigh', calm: 'sigh', shy: 'giggle', love: 'giggle', pouty: 'groan' };
function withSound(text, mood, chance = 0.3) {
  if (/<(laugh|chuckle|giggle|sigh|gasp|groan|yawn|sniffle|cough)>/.test(text)) return text;
  const s = MOOD_SOUND[mood];
  return s && Math.random() < chance ? `<${s}> ${text}` : text;
}

class OrpheusMouth {
  // decode(levels) -> Float32Array of sound for those frames; tests pass a stand-in
  constructor(model, context, decode) {
    this.model = model; this.context = context; this.decode = decode;
    this.sequence = context.getSequence();
    this.sampleRate = 24000;
    this.token = 0;
    this.speed = null; // tokens a second, measured as she talks
  }

  // ggufFile: the Orpheus model; snacFile: the SNAC decoder (ONNX); llama: an
  // engine to share (e.g. the chat brain's), or one is started
  static async load(ggufFile, snacFile, llama = null) {
    const ort = require('onnxruntime-node');
    if (!llama) llama = await (await import('node-llama-cpp')).getLlama();
    const model = await llama.loadModel({ modelPath: ggufFile, gpuLayers: 'max' });
    const context = await model.createContext({ contextSize: 4096 });
    const snac = await ort.InferenceSession.create(snacFile, { intraOpNumThreads: Math.max(1, Math.min(4, os.cpus().length - 1)) });
    // the decoder takes the three levels of codes; its inputs are named in level order
    const names = [...snac.inputNames].sort();
    const decode = async (levels) => {
      const feeds = {};
      names.forEach((n, i) => { feeds[n] = new ort.Tensor('int64', BigInt64Array.from(levels[i].map(BigInt)), [1, levels[i].length]); });
      const out = await snac.run(feeds);
      return Float32Array.from(out[snac.outputNames[0]].data);
    };
    return new OrpheusMouth(model, context, decode);
  }

  // onChunk(samples, { pitch, gain }) is called about every 340 ms of speech.
  async say(text, { voice = 'tara', mood = 'cute', speed = 1 } = {}, onChunk) {
    const my = ++this.token;
    const v = VOICES.includes(voice) ? voice : 'tara';
    const t = withSound(speakable(text), mood);
    if (!t) return;
    await this.sequence.clearHistory();
    const prompt = [T.start, ...this.model.tokenize(`${v}: ${t}`, false), T.endText, T.endHuman];
    // a cap on length: about twice what the text needs
    const maxTokens = Math.round(PER_FRAME * 12 * Math.min(30, 3 + t.length * 0.12));
    const codes = [], recent = [];
    let pending = [], count = 0, last = null;
    const t0 = Date.now();
    // Each frame is decoded together with its neighbours (4 frames at a time) so
    // the joins are smooth. A window of frames f..f+3 gives the sound of frame f+1;
    // the first window also gives frame 0, and the last one frames n-2 and n-1.
    const send = (all) => {
      const size = pending.reduce((a, p) => a + p.length, 0);
      if (!size || (!all && size < 4 * STEP_SAMPLES) || my !== this.token) return;
      const out = new Float32Array(size); let o = 0;
      for (const p of pending) { out.set(p, o); o += p.length; }
      pending = [];
      if (onChunk) onChunk(out, { pitch: 1, gain: 1 });
    };
    const frame = async () => {
      const frames = codes.length / PER_FRAME;
      if (frames < 4) return;
      last = await this.decode(toLevels(codes.slice(-WINDOW)));
      pending.push(frames === 4 ? last.subarray(0, 2 * STEP_SAMPLES) : last.subarray(STEP_SAMPLES, 2 * STEP_SAMPLES));
      send(false);
    };
    const finish = async () => {
      const whole = Math.floor(codes.length / PER_FRAME) * PER_FRAME;
      if (whole < WINDOW) { if (whole) pending.push(await this.decode(toLevels(codes.slice(0, whole)))); }
      else if (last) pending.push(last.subarray(2 * STEP_SAMPLES));
      send(true);
    };
    for await (const tok of this.sequence.evaluate(prompt, {
      temperature: 0.6, topP: 0.8,
      repeatPenalty: { punishTokens: () => recent, penalty: 1.1, maxPunishTokens: 64 },
    })) {
      if (my !== this.token) break; // something newer was said
      if (tok === T.endSpeech || tok === T.endText || ++count > maxTokens) break;
      recent.push(tok); if (recent.length > 64) recent.shift();
      const c = codeOf(tok, codes.length);
      if (c < 0) continue; // the start-of-speech markers, or a stray token
      codes.push(c);
      if (codes.length % PER_FRAME === 0) await frame();
    }
    this.speed = count / Math.max(0.001, (Date.now() - t0) / 1000);
    if (my === this.token) await finish();
  }

  hush() { this.token++; }
}

// Orpheus needs about 84 sound tokens a second to talk without pausing
const REAL_TIME = PER_FRAME * 12;

module.exports = { OrpheusMouth, VOICES, SOUNDS, codeOf, toLevels, withSound, REAL_TIME, AUDIO, T };
