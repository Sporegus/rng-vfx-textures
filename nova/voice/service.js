// Runs in its own background process (Electron utilityProcess), so the heavy
// AI work never freezes Nova. Talks to the main process with small messages:
//   in:  setup, audio, listen, say, hush, chat, fix, get, rpc-reply
//   out: status, progress, speaking, heard, audio, said, sentence, replied, rpc, error
const path = require('path');
const models = require('./models');
const { Ears, Mouth, EMOTIONAL } = require('./speech');
const { Mind } = require('./mind');

const port = process.parentPort;
const send = (m) => port.postMessage(m);
let root = null, ears = null, mind = null, listening = false, chatModel = null;
const mouths = {};
let warnedSlow = false; // 'emotional' and/or 'classic', loaded when first needed
// the mood clips ship with Nova; when packaged they sit outside the app archive so the voice engine can read them
const unpacked = (d) => path.join(__dirname, d).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const EMOTIONS = unpacked('emotions'), STYLES = unpacked('styles'), NOVA = unpacked('nova');
const { OrpheusMouth, VOICES: NATURAL, REAL_TIME } = require('./orpheus');
const { ElevenMouth } = require('./eleven');
let elevenCreds = null;
const kindOf = (voice) => (voice === 'nova' ? 'clone' : voice === 'eleven' ? 'eleven' : NATURAL.includes(voice) ? 'natural' : EMOTIONAL.includes(voice) ? 'emotional' : 'classic');
const busy = {};

// ---------------------------------------------------------------- asking the app for things
let rpcId = 0;
const waiting = new Map();
function ask(name, args) {
  const id = ++rpcId;
  send({ type: 'rpc', id, name, args });
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    setTimeout(() => { if (waiting.delete(id)) resolve('That took too long.'); }, 20000);
  });
}
const host = {
  task: (request) => ask('task', { request }),
  weather: (place) => ask('weather', { place }),
  remember: (fact) => ask('remember', { fact }),
  memory: () => ask('memory', {}),
};

// ---------------------------------------------------------------- getting models ready
const progress = (what) => (done, total) => send({ type: 'progress', what, done, total });
async function loadMouth(kind) {
  if (mouths[kind]) return mouths[kind];
  if (kind === 'eleven') {
    if (!elevenCreds) throw new Error('Your ElevenLabs voice isn\'t set up yet');
    mouths[kind] = new ElevenMouth(elevenCreds);
    return mouths[kind];
  }
  if (kind === 'clone') {
    const dir = await models.ensure(root, 'clone', progress('voice'));
    const vocoder = await models.ensure(root, 'vocos', progress('voice'));
    mouths[kind] = new Mouth(dir, 'clone', { clips: NOVA, vocoder });
    return mouths[kind];
  }
  if (kind === 'natural') {
    const { gguf, snac } = await models.ensureOrpheus(root, progress('voice'));
    mouths[kind] = await OrpheusMouth.load(gguf, snac);
    return mouths[kind];
  }
  const dir = await models.ensure(root, kind === 'emotional' ? 'voiceEmo' : 'voice', progress('voice'));
  mouths[kind] = new Mouth(dir, kind, kind === 'emotional' ? EMOTIONS : STYLES);
  return mouths[kind];
}
async function setupVoice(light, voice) {
  if (busy.voice) return busy.voice;
  busy.voice = (async () => {
    const vad = await models.ensure(root, 'vad', progress('listening'));
    const asr = await models.ensure(root, light ? 'earsLight' : 'ears', progress('ears'));
    // if the chosen voice can't load (ElevenLabs not set up, a missing download), start with her own voice
    await loadMouth(kindOf(voice)).catch(async (e) => { send({ type: 'error', what: kindOf(voice) === 'eleven' ? 'eleven' : 'speak', message: e.message }); await loadMouth('clone'); });
    send({ type: 'status', what: 'voice', state: 'loading' });
    ears = new Ears(vad, asr);
    send({ type: 'status', what: 'voice', state: 'ready' });
  })().catch((e) => { busy.voice = null; send({ type: 'error', what: 'voice', message: e.message }); });
  return busy.voice;
}
// the mouth for this voice (switching to a voice of the other kind downloads it the first time)
async function mouthFor(voice) {
  try { return await loadMouth(kindOf(voice)); }
  catch (e) { send({ type: 'error', what: 'voice', message: e.message }); return null; }
}
async function setupMind() {
  if (busy.mind) return busy.mind;
  busy.mind = (async () => {
    mind = new Mind(path.join(root, 'chat'), host, chatModel ? [chatModel] : undefined);
    const info = await mind.load(progress('chat'));
    send({ type: 'status', what: 'chat', state: 'ready', gpu: info.gpu || false });
  })().catch((e) => { busy.mind = null; mind = null; send({ type: 'error', what: 'chat', message: e.message }); });
  return busy.mind;
}

// ---------------------------------------------------------------- talking
async function say(id, text, opts) {
  const mouth = ears && await mouthFor(opts.voice);
  if (!mouth) return send({ type: 'said', id });
  await mouth.say(text, opts, (samples, how) => send({ type: 'audio', id, samples, sampleRate: mouth.sampleRate, ...how }))
    .catch(async (e) => {
      // ElevenLabs can fail (no internet, out of credits): say it in her own voice instead, and tell the page once
      if (mouth instanceof ElevenMouth) {
        send({ type: 'error', what: 'eleven', message: e.message });
        const local = await mouthFor('nova');
        if (local) await local.say(text, { ...opts, voice: 'nova' }, (samples, how) => send({ type: 'audio', id, samples, sampleRate: local.sampleRate, ...how })).catch(() => {});
      } else send({ type: 'error', what: 'speak', message: e.message });
    });
  // the natural voice needs a fast enough graphics card; say so if it can't keep up
  if (mouth.speed && mouth.speed < REAL_TIME * 0.85 && !warnedSlow) { warnedSlow = true; send({ type: 'status', what: 'voice', state: 'slow', speed: Math.round(mouth.speed), need: REAL_TIME }); }
  send({ type: 'said', id });
}
const hushAll = () => { for (const m of Object.values(mouths)) m.hush(); };

let chatAbort = null;
async function chat(id, text, opts) {
  if (!mind || !mind.ready) return send({ type: 'replied', id, text: null });
  if (chatAbort) chatAbort.abort();
  const ac = chatAbort = new AbortController();
  // speak each sentence as it's written, one after another, in the mood the chat brain picked
  const mouth = opts && opts.speak && ears ? await mouthFor(opts.voice) : null;
  let speaking = Promise.resolve();
  try {
    const reply = await mind.chat(text, (s, mood) => {
      if (ac.signal.aborted) return;
      send({ type: 'sentence', id, text: s, mood });
      if (mouth) speaking = speaking.then(() => mouth.say(s, { ...opts, mood }, (samples, how) => send({ type: 'audio', id, samples, sampleRate: mouth.sampleRate, ...how })).catch(() => {}));
    }, ac.signal);
    await speaking;
    send({ type: 'replied', id, text: ac.signal.aborted ? null : reply });
  } catch (e) { send({ type: 'replied', id, text: null, error: e.message }); }
  finally { if (chatAbort === ac) chatAbort = null; }
}

// ---------------------------------------------------------------- messages
port.on('message', async ({ data: m }) => {
  switch (m.type) {
    case 'setup':
      root = m.root; chatModel = m.chatModel || null; elevenCreds = m.eleven || null;
      send({ type: 'status', what: 'models', have: { voice: ((models.have(root, 'clone') && models.have(root, 'vocos')) || models.have(root, 'voiceEmo') || models.have(root, 'voice')) && models.have(root, 'vad') && (models.have(root, 'ears') || models.have(root, 'earsLight')) } });
      if (m.voice) setupVoice(m.light, m.voiceName);
      if (m.chat) setupMind();
      break;
    case 'get':
      if (m.what === 'voice') setupVoice(m.light, m.voiceName);
      if (m.what === 'chat') setupMind();
      break;
    case 'listen': listening = !!m.on; if (ears && !listening) ears.reset(); break;
    case 'audio':
      if (!ears || !listening) break;
      ears.feed(m.samples, {
        onSpeech: (on) => send({ type: 'speaking', on }),
        onText: (text, seconds) => send({ type: 'heard', text, seconds }),
      });
      break;
    case 'say': say(m.id, m.text, m.opts || {}); break;
    case 'eleven': elevenCreds = m.creds || null; delete mouths.eleven; break;
    case 'hush': hushAll(); if (chatAbort) chatAbort.abort(); break;
    case 'chat': chat(m.id, m.text, m.opts); break;
    case 'fix': send({ type: 'fixed', id: m.id, text: mind && mind.ready ? await mind.fixName(m.kind, m.text) : m.text }); break;
    case 'rpc-reply': { const r = waiting.get(m.id); if (r) { waiting.delete(m.id); r(m.result); } break; }
  }
});
