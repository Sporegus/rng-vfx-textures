// The future-voice interface: off by default (no fake speech), and when a provider
// exists, interruption and Stop work and lip-sync events come only from real audio.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSpeechOut } = require('../speech-out');
const { harness } = require('./harness');

const fakeProvider = (n = 5) => ({
  name: 'fake', live: false, available: () => ({ ok: true }),
  async *synthesize(text, { signal }) { for (let i = 0; i < n; i++) { if (signal.aborted) return; yield { samples: new Float32Array(2400), sampleRate: 24000, visemes: [{ t: i * 0.1, shape: 'A' }] }; } },
});
const player = (ms = 20) => { const p = { played: 0, stopped: 0, play: () => new Promise(r => setTimeout(() => { p.played++; r(); }, ms)), stop: () => { p.stopped++; } }; return p; };

test('no voice set up: nothing is spoken and no mouth events happen', async () => {
  const out = createSpeechOut({ player: player() });
  const ev = []; out.on(e => ev.push(e));
  const r = await out.say('Hello!');
  assert.equal(r.spoken, false);
  assert.match(r.reason, /no voice yet/);
  assert.deepEqual(ev, []);
  assert.equal(out.status().live, false);
});

test('a provider speaks in order with lip-sync events from its audio', async () => {
  const pl = player(5);
  const out = createSpeechOut({ provider: fakeProvider(3), player: pl });
  const ev = []; out.on(e => ev.push(e.type));
  assert.equal((await out.say('Hi there')).spoken, true);
  assert.deepEqual(ev, ['start', 'viseme', 'chunk', 'viseme', 'chunk', 'viseme', 'chunk', 'end']);
  assert.equal(pl.played, 3);
});

test('stop and a newer reply interrupt at once; nothing plays after', async () => {
  const pl = player(30);
  const out = createSpeechOut({ provider: fakeProvider(10), player: pl });
  const ev = []; out.on(e => ev.push(e));
  const first = out.say('A long reply');
  await new Promise(r => setTimeout(r, 45));
  const second = out.say('Newer reply');
  assert.equal((await first).interrupted, true);
  await new Promise(r => setTimeout(r, 40));
  out.stop('you pressed Stop');
  assert.equal((await second).interrupted, true);
  const played = pl.played;
  await new Promise(r => setTimeout(r, 80));
  assert.equal(pl.played <= played + 1, true, 'at most the chunk in flight finishes');
  assert.ok(ev.some(e => e.type === 'interrupted' && e.why === 'replaced'));
  assert.ok(ev.some(e => e.type === 'interrupted' && e.why === 'you pressed Stop'));
  assert.ok(pl.stopped >= 2);
});

test('Nova\'s Stop also silences her', async () => {
  const h = harness();
  const out = createSpeechOut({ provider: fakeProvider(20), player: player(20) });
  h.pipeline.onStop(() => out.stop('stop'));
  const p = out.say('talking for a while');
  await new Promise(r => setTimeout(r, 30));
  h.pipeline.stopAll('test');
  assert.equal((await p).interrupted, true);
  assert.equal(out.status().speaking, false);
});
