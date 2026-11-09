// Speech output, for when Nova gets her voice. Until a real provider is set up
// this is OFF: replies show in the bubble only, and no mouth/lip-sync events are
// ever produced (no fake talking).
//
// Provider contract:
//   { name, live, available() -> { ok, reason },
//     synthesize(text, { voice, signal }) -> async iterable of
//       { samples: Float32Array, sampleRate, visemes?: [{ t: seconds, shape: 'A'|'E'|'O'|'M'|'rest' }] } }
// Player contract (the page's audio output):
//   { play(chunk) -> Promise (resolves when it has played), stop() }
//
// Events (on): start {id, text} · chunk {id, seconds} · viseme {id, t, shape} · end {id} · interrupted {id, why}
// A new say() interrupts the previous one; stop() (and Nova's Stop) interrupt at once.
'use strict';
const { id, NovaError } = require('./util');

// the honest default: no voice
const none = () => ({ name: 'none', live: false, available: () => ({ ok: false, reason: 'Nova has no voice yet, so replies show in the bubble.' }), async *synthesize() {} });

function createSpeechOut({ provider = none(), player = null, log } = {}) {
  const listeners = new Set();
  const emit = (e) => { for (const l of listeners) { try { l(e); } catch {} } };
  let current = null;

  function stop(why = 'stopped') {
    if (!current) return false;
    const c = current; current = null;
    c.ac.abort(new NovaError('cancelled', why));
    try { player && player.stop(); } catch {}
    emit({ type: 'interrupted', id: c.id, why });
    log && log.event('speech.interrupted', { id: c.id, why });
    return true;
  }
  async function say(text, { voice, signal } = {}) {
    const a = provider.available();
    if (!a.ok || !player) return { spoken: false, reason: a.ok ? 'No audio output connected.' : a.reason };
    stop('replaced');                                   // one voice at a time: the newest reply wins
    const me = { id: id('say'), ac: new AbortController() };
    current = me;
    if (signal) signal.addEventListener('abort', () => { if (current === me) stop('task cancelled'); }, { once: true });
    emit({ type: 'start', id: me.id, text });
    try {
      for await (const chunk of provider.synthesize(String(text), { voice, signal: me.ac.signal })) {
        if (me.ac.signal.aborted) break;
        for (const v of chunk.visemes || []) emit({ type: 'viseme', id: me.id, ...v });
        emit({ type: 'chunk', id: me.id, seconds: chunk.samples.length / chunk.sampleRate });
        await player.play(chunk);
        if (me.ac.signal.aborted) break;
      }
    } catch (e) {
      if (!me.ac.signal.aborted) { if (current === me) current = null; log && log.event('speech.error', { message: e.message }); return { spoken: false, reason: e.message }; }
    }
    if (me.ac.signal.aborted) return { spoken: false, interrupted: true };
    if (current === me) current = null;
    emit({ type: 'end', id: me.id });
    return { spoken: true };
  }
  return {
    say, stop, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    status: () => ({ provider: provider.name, live: !!provider.live, ...provider.available(), speaking: !!current }),
  };
}

module.exports = { createSpeechOut, none };
