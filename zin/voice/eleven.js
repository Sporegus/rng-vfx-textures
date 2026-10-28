// A voice you made on ElevenLabs. The words Zin says are sent to ElevenLabs and
// the sound streams back as she talks; listening and thinking stay on the PC.
// Uses your ElevenLabs characters (credits).

const API = process.env.ZIN_ELEVEN_API || 'https://api.elevenlabs.io';
const RATE = 24000;

// models: flash is quickest to start talking; v3 is the most expressive
const MODELS = { quick: 'eleven_flash_v2_5', natural: 'eleven_multilingual_v2', expressive: 'eleven_v3' };

// how each mood is delivered: lower stability = livelier, style = more character
const MOOD = {
  cute: { stability: 0.45, style: 0.35 }, happy: { stability: 0.38, style: 0.45 }, excited: { stability: 0.3, style: 0.6 },
  sad: { stability: 0.6, style: 0.3 }, calm: { stability: 0.65, style: 0.2 }, confused: { stability: 0.45, style: 0.35 },
  proud: { stability: 0.4, style: 0.5 }, pouty: { stability: 0.35, style: 0.55 }, shy: { stability: 0.55, style: 0.35 }, love: { stability: 0.5, style: 0.4 },
};
// v3 understands tags in brackets, like [giggles]; the chat brain's <giggle> becomes one
const V3_TAG = { giggle: 'giggles', laugh: 'laughs', chuckle: 'chuckles', sigh: 'sighs', gasp: 'gasps', yawn: 'yawns', groan: 'groans', sniffle: 'sniffles', cough: 'coughs' };
const V3_MOOD = { excited: 'excited', happy: 'cheerfully', sad: 'sadly', calm: 'softly', shy: 'shyly', pouty: 'pouting', confused: 'confused', love: 'warmly' };

function prepare(text, mood, model) {
  if (model === MODELS.expressive) {
    const t = text.replace(/<([a-z]+)>/g, (m, s) => (V3_TAG[s] ? `[${V3_TAG[s]}]` : '')).replace(/\s+/g, ' ').trim();
    return V3_MOOD[mood] && !/^\[/.test(text) ? `[${V3_MOOD[mood]}] ${t}` : t;
  }
  return text.replace(/<[a-z]+>\s*/g, '').replace(/\s+/g, ' ').trim(); // other models would read the tag out loud
}

class ElevenMouth {
  constructor({ key, voiceId, model = 'quick' }) {
    this.key = key; this.voiceId = voiceId;
    this.model = MODELS[model] || MODELS.quick;
    this.sampleRate = RATE;
    this.abort = null;
  }

  // onChunk(samples, { pitch, gain }) as the sound arrives (about every 100 ms)
  async say(text, { mood = 'cute', speed = 1 } = {}, onChunk) {
    this.hush();
    const t = prepare(String(text).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').trim(), mood, this.model);
    if (!t) return;
    const ac = this.abort = new AbortController();
    const m = MOOD[mood] || MOOD.cute;
    const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(this.voiceId)}/stream?output_format=pcm_${RATE}`, {
      method: 'POST', signal: ac.signal,
      headers: { 'xi-api-key': this.key, 'content-type': 'application/json', accept: 'audio/pcm' },
      body: JSON.stringify({
        text: t, model_id: this.model,
        voice_settings: { stability: m.stability, similarity_boost: 0.8, style: m.style, use_speaker_boost: true, speed: Math.max(0.7, Math.min(1.2, speed)) },
      }),
    }).catch((e) => { if (ac.signal.aborted) return null; throw new Error('Can\'t reach ElevenLabs: ' + e.message); });
    if (!res) return;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const why = res.status === 401 ? 'the API key was refused' : res.status === 404 ? 'that voice ID wasn\'t found' : res.status === 429 ? 'too many requests, or out of credits' : /quota/i.test(body) ? 'out of credits' : `error ${res.status}`;
      throw new Error('ElevenLabs: ' + why);
    }
    // 16-bit samples; a byte can be left over between pieces
    let carry = null;
    try {
      for await (const piece of res.body) {
        if (ac.signal.aborted) return;
        let bytes = Buffer.from(piece);
        if (carry) { bytes = Buffer.concat([carry, bytes]); carry = null; }
        if (bytes.length % 2) { carry = bytes.subarray(bytes.length - 1); bytes = bytes.subarray(0, bytes.length - 1); }
        if (!bytes.length) continue;
        const out = new Float32Array(bytes.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = bytes.readInt16LE(i * 2) / 32768;
        if (onChunk) onChunk(out, { pitch: 1, gain: 1 });
      }
    } catch (e) { if (!ac.signal.aborted) throw e; }
  }

  hush() { if (this.abort) { this.abort.abort(); this.abort = null; } }
}

module.exports = { ElevenMouth, MODELS, prepare };
