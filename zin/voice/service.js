// Runs in its own background process (Electron utilityProcess), so the heavy
// AI work never freezes Zin. Talks to the main process with small messages:
//   in:  setup, audio, listen, say, hush, chat, fix, get, rpc-reply
//   out: status, progress, speaking, heard, audio, said, sentence, replied, rpc, error
const path = require('path');
const models = require('./models');
const { Ears, Mouth } = require('./speech');
const { Mind } = require('./mind');

const port = process.parentPort;
const send = (m) => port.postMessage(m);
let root = null, ears = null, mouth = null, mind = null, listening = false, chatModel = null;
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
async function setupVoice(light) {
  if (busy.voice) return busy.voice;
  busy.voice = (async () => {
    const vad = await models.ensure(root, 'vad', progress('listening'));
    const asr = await models.ensure(root, light ? 'earsLight' : 'ears', progress('ears'));
    const tts = await models.ensure(root, 'voice', progress('voice'));
    send({ type: 'status', what: 'voice', state: 'loading' });
    mouth = new Mouth(tts);
    ears = new Ears(vad, asr);
    send({ type: 'status', what: 'voice', state: 'ready' });
  })().catch((e) => { busy.voice = null; send({ type: 'error', what: 'voice', message: e.message }); });
  return busy.voice;
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
  if (!mouth) return send({ type: 'said', id });
  await mouth.say(text, opts, (samples) => send({ type: 'audio', id, samples, sampleRate: mouth.sampleRate })).catch(() => {});
  send({ type: 'said', id });
}

let chatAbort = null;
async function chat(id, text, opts) {
  if (!mind || !mind.ready) return send({ type: 'replied', id, text: null });
  if (chatAbort) chatAbort.abort();
  const ac = chatAbort = new AbortController();
  // speak each sentence as it's written, one after another
  let speaking = Promise.resolve();
  try {
    const reply = await mind.chat(text, (s) => {
      if (ac.signal.aborted) return;
      send({ type: 'sentence', id, text: s });
      if (opts && opts.speak && mouth) speaking = speaking.then(() => mouth.say(s, opts, (samples) => send({ type: 'audio', id, samples, sampleRate: mouth.sampleRate })).catch(() => {}));
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
      root = m.root; chatModel = m.chatModel || null;
      send({ type: 'status', what: 'models', have: { voice: models.have(root, 'voice') && models.have(root, 'vad') && (models.have(root, 'ears') || models.have(root, 'earsLight')) } });
      if (m.voice) setupVoice(m.light);
      if (m.chat) setupMind();
      break;
    case 'get':
      if (m.what === 'voice') setupVoice(m.light);
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
    case 'hush': if (mouth) mouth.hush(); if (chatAbort) chatAbort.abort(); break;
    case 'chat': chat(m.id, m.text, m.opts); break;
    case 'fix': send({ type: 'fixed', id: m.id, text: mind && mind.ready ? await mind.fixName(m.kind, m.text) : m.text }); break;
    case 'rpc-reply': { const r = waiting.get(m.id); if (r) { waiting.delete(m.id); r(m.result); } break; }
  }
});
