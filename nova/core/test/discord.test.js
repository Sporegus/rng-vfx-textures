// Discord with a MOCK adapter: nothing reaches Discord or your friends.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness');
const { createDiscord } = require('../discord');
const { createPipeline } = require('../pipeline');
const brain = require('../../brain/brain');
const { NovaError, sleep } = require('../util');

const ASK = 'Nova, join Discord Afterparty call and ask the boys what we’re playing';
function setup({ choose = () => 'no', approve = () => ({ allow: true }), bot = true, post } = {}) {
  const h = harness({ chooseWith: choose, approveWith: approve });
  const sent = [], launched = [];
  const adapter = {
    ready: () => bot ? { ok: true } : { ok: false, reason: 'No Nova bot token saved.' },
    postMessage: post || (async (m) => { sent.push(m); return { id: 'm' + sent.length, nonce: m.nonce }; }),
    recentMessages: async () => sent.map((m, i) => ({ id: 'm' + (i + 1), nonce: m.nonce })),
  };
  const discord = createDiscord({ store: h.store, adapter, launch: async (u) => launched.push(u), log: h.log, permissions: h.permissions });
  const pipeline = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, discord });
  return { h, discord, pipeline, sent, launched, adapter };
}
const afterparty = (d, extra = {}) => d.addTarget({ alias: 'Afterparty', guildId: '111111111111', channelId: '222222222222', textChannelId: '333333333333', kind: 'voice', label: 'Afterparty', ...extra });

test('unknown alias is never guessed (test 19)', async () => {
  const s = setup();
  await s.pipeline.input({ text: ASK });
  assert.ok(s.h.replies().some(r => /don't know a Discord place called "Afterparty"/.test(r)));
  assert.equal(s.sent.length, 0);
});

test('joining as you is explained honestly: opens the channel for you, joins nothing (test 19)', async () => {
  const s = setup({ choose: (q) => q.options.find(o => o.value === 'open') ? 'open' : null });
  afterparty(s.discord);
  await s.pipeline.input({ text: ASK });
  const q = s.h.events.find(e => e.type === 'choose');
  assert.match(q.question, /can't join calls as you/);
  assert.match(q.question, /can't say it out loud/);
  assert.deepEqual(s.launched, ['discord://-/channels/111111111111/222222222222']);
  assert.equal(s.sent.length, 0);
  assert.ok(s.h.replies().some(r => /haven't joined or said anything/.test(r)));
});

test('duplicate names: she asks which one', async () => {
  const s = setup({ choose: (q) => /more than one/.test(q.question) ? '1' : 'no' });
  afterparty(s.discord);
  afterparty(s.discord, { guildId: '444444444444', channelId: '555555555555', label: 'Afterparty' });
  await s.pipeline.input({ text: ASK });
  assert.ok(s.h.events.some(e => e.type === 'choose' && /more than one "Afterparty"/.test(e.question)));
});

test('no bot set up: posting is not offered', async () => {
  const s = setup({ bot: false, choose: (q) => (q.options.find(o => o.value === 'post') || {}).value || 'no' });
  afterparty(s.discord);
  await s.pipeline.input({ text: ASK });
  const q = s.h.events.find(e => e.type === 'choose');
  assert.match(q.question, /needs the Nova bot set up/);
  assert.equal(s.sent.length, 0);
});

test('posting shows destination, identity and exact text; cancel sends nothing', async () => {
  const s = setup({ choose: () => 'post', approve: () => ({ allow: false }) });
  afterparty(s.discord);
  await s.pipeline.input({ text: ASK });
  const card = s.h.events.find(e => e.type === 'approve');
  assert.ok(card.lines.some(l => /Nova bot \(not you\)/.test(l)));
  assert.ok(card.lines.some(l => l.includes('"What are we playing?"')));
  assert.equal(s.sent.length, 0);
});

test('approved post goes out once, to the approved channel only', async () => {
  const s = setup({ choose: () => 'post' });
  afterparty(s.discord);
  await s.pipeline.input({ text: ASK });
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].channelId, '333333333333');
  assert.equal(s.sent[0].content, 'What are we playing?');
});

test('a changed message or channel is not covered by the approval (test 11)', async () => {
  const s = setup();
  const scope = { kind: 'task', id: 't-x' };
  s.h.permissions.grant({ scope, categories: ['communicate'], targets: { channel: ['333333333333'] }, effects: { text: 'What are we playing?' } });
  await assert.rejects(s.discord.sendOnce({ iteration: 'a', channelId: '333333333333', content: 'Different text', scope }), (e) => e.category === 'denied');
  await assert.rejects(s.discord.sendOnce({ iteration: 'b', channelId: '999999999999', content: 'What are we playing?', scope }), (e) => e.category === 'denied');
  assert.equal(s.sent.length, 0);
});

test('a send that times out is checked, not resent (test 20)', async () => {
  let calls = 0;
  const s = setup({ post: async () => { calls++; throw new NovaError('timeout', 'slow'); } });
  const scope = { kind: 'task', id: 't-y' };
  s.h.permissions.grant({ scope, categories: ['communicate'], targets: { channel: ['333333333333'] }, effects: { text: 'hi' } });
  await assert.rejects(s.discord.sendOnce({ jobId: 'j', iteration: 'i1', channelId: '333333333333', content: 'hi', scope }), (e) => e.ambiguous);
  // asking again for the same handoff never sends a second copy
  await assert.rejects(s.discord.sendOnce({ jobId: 'j', iteration: 'i1', channelId: '333333333333', content: 'hi', scope }), (e) => e.ambiguous);
  assert.equal(calls, 1);
});

test('a timed-out send that actually arrived is recognized by its nonce', async () => {
  const delivered = [];
  const s = setup({ post: async (m) => { delivered.push(m); throw new NovaError('timeout', 'slow'); } });
  s.adapter.recentMessages = async () => delivered.map((m, i) => ({ id: 'x' + i, nonce: m.nonce }));
  const scope = { kind: 'task', id: 't-z' };
  s.h.permissions.grant({ scope, categories: ['communicate'], targets: { channel: ['333333333333'] }, effects: { text: 'hi' } });
  const r = await s.discord.sendOnce({ jobId: 'j2', iteration: 'i1', channelId: '333333333333', content: 'hi', scope });
  assert.ok(r.reconciled);
  assert.equal(delivered.length, 1);
});

test('"open Afterparty on Discord" just opens it for you', async () => {
  const s = setup();
  afterparty(s.discord);
  await s.pipeline.input({ text: 'open Afterparty on Discord' });
  assert.deepEqual(s.launched, ['discord://-/channels/111111111111/222222222222']);
  assert.ok(s.h.replies().some(r => /Opened Afterparty in Discord/.test(r)));
  assert.equal(s.sent.length, 0);
});
