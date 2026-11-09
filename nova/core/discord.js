// Discord, within what Discord allows:
//   - YOUR account can't be automated (Discord forbids self-bots and token use),
//     so for "join the call" Nova opens the channel in Discord and you click Join.
//   - A Nova BOT (one you create and add to your server) can post text through
//     Discord's official API. Joining voice and speaking need a voice connection
//     and a TTS voice, which aren't set up, so those are reported as unavailable.
//   - Targets ("Afterparty") are only ever ones you confirmed, stored with their
//     server and channel IDs. Several matches: she asks. None: she says how to add it.
//   - Every send records its intent first, carries a nonce, and is never resent
//     after an unclear timeout: she checks the channel for it instead.
'use strict';
const { NovaError, id } = require('./util');

// Discord's official REST API with a bot token
function botAdapter({ token, fetchImpl = fetch, timeoutMs = 10000 }) {
  const api = async (path, opts = {}) => {
    const t = token();
    if (!t) throw new NovaError('unavailable', 'No Nova bot is set up for Discord.');
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl('https://discord.com/api/v10' + path, { ...opts, signal: opts.signal || ac.signal,
        headers: { authorization: 'Bot ' + t, 'content-type': 'application/json', 'user-agent': 'NovaDesktop (local, 0.1)' } });
      if (res.status === 403) throw new NovaError('blocked', "The Nova bot isn't allowed to post in that channel.");
      if (res.status === 404) throw new NovaError('not_found', "The Nova bot can't see that channel. Is it in that server?");
      if (res.status === 429) throw new NovaError('unavailable', 'Discord asked us to slow down; try again in a moment.');
      if (!res.ok) throw new NovaError('failed', `Discord said ${res.status}.`);
      return res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new NovaError('timeout', 'Discord didn\'t answer in time.');
      throw e;
    } finally { clearTimeout(timer); }
  };
  return {
    name: 'nova-bot',
    ready: () => token() ? { ok: true } : { ok: false, reason: 'No Nova bot token saved (Settings > Discord).' },
    canJoinVoice: false,
    postMessage: ({ channelId, content, nonce }) => api(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ content, nonce, enforce_nonce: true, allowed_mentions: { parse: [] } }) }),
    recentMessages: (channelId) => api(`/channels/${channelId}/messages?limit=20`),
  };
}

function createDiscord({ store, adapter, launch, log, permissions }) {
  // targets you confirmed: { alias, guildId, channelId, textChannelId, kind, label }
  const targets = () => store.recall('discord_target').map(r => r.value).filter(t => t && t.confirmed);
  function addTarget(t) {
    if (!/^\d{5,25}$/.test(String(t.guildId)) || !/^\d{5,25}$/.test(String(t.channelId))) throw new NovaError('invalid', 'Server and channel IDs are long numbers (Discord: right-click > Copy ID).');
    const v = { alias: String(t.alias).trim(), guildId: String(t.guildId), channelId: String(t.channelId), textChannelId: t.textChannelId ? String(t.textChannelId) : null, kind: t.kind === 'text' ? 'text' : 'voice', label: t.label || t.alias, confirmed: true };
    store.remember('discord:' + v.alias.toLowerCase() + ':' + v.channelId, 'discord_target', v);
    return v;
  }
  function resolve(alias) {
    const a = String(alias || '').toLowerCase();
    return targets().filter(t => t.alias.toLowerCase() === a || t.label.toLowerCase() === a);
  }

  // send once: intent -> send -> confirm; an unclear outcome is checked, never resent
  async function sendOnce({ jobId = 'discord', iteration, channelId, content, signal, scope }) {
    // the send itself re-checks the grant: this channel, this exact text
    if (permissions) {
      const v = permissions.check({ category: 'communicate', scope, target: { kind: 'channel', value: channelId }, effects: { text: content } });
      if (!v.ok) throw new NovaError('denied', "You haven't approved sending that message there.");
    }
    if (!adapter || !adapter.ready().ok) throw new NovaError('unavailable', (adapter && adapter.ready().reason) || 'No Discord bot is set up.');
    const nonce = String(Date.now()) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const outId = id('out');
    const rec = store.outboxIntent({ id: outId, jobId, iteration, destination: 'discord:' + channelId, payloadHash: require('./util').sha256(content) });
    if (!rec.created) {
      const prev = rec.existing;
      if (prev.state === 'sent') return { sent: true, duplicateAvoided: true, messageId: prev.detail && prev.detail.messageId };
      throw new NovaError('unverified', 'I may already have sent that, so I won\'t send it again. Check the channel.', { ambiguous: true });
    }
    store.outboxSet(outId, 'sending', { nonce });
    try {
      const m = await adapter.postMessage({ channelId, content, nonce, signal });
      store.outboxSet(outId, 'sent', { nonce, messageId: m.id });
      log && log.event('discord.sent', { channel: channelId, message: m.id });
      return { sent: true, messageId: m.id };
    } catch (e) {
      if (e.category !== 'timeout') { store.outboxSet(outId, 'failed', { nonce, error: e.message }); throw e; }
      // unclear: look for our nonce before saying anything
      store.outboxSet(outId, 'unknown', { nonce });
      const recent = await adapter.recentMessages(channelId).catch(() => null);
      const hit = recent && recent.find(m => m.nonce === nonce);
      if (hit) { store.outboxSet(outId, 'sent', { nonce, messageId: hit.id }); return { sent: true, messageId: hit.id, reconciled: true }; }
      throw new NovaError('unverified', "Discord didn't confirm the message and I can't see it in the channel yet. I won't resend it automatically; check the channel.", { ambiguous: true });
    }
  }

  async function handle(task, r, { ui, approve, reply }) {
    const means = [];
    if (r.join || r.call) means.push(r.call ? 'join the voice call' : 'join the channel');
    if (r.question) means.push(`ask "${r.question}"`);
    // 1. which server/channel?
    if (!r.alias) return reply(task, 'Which Discord server or channel do you mean? Say its name, like "Afterparty".');
    let matches = resolve(r.alias);
    if (!matches.length) {
      return reply(task, `I don't know a Discord place called "${r.alias}" yet, and I won't guess. Add it once in Settings > Discord (server and channel IDs: in Discord, Settings > Advanced > Developer Mode, then right-click > Copy ID). Then ask me again.`, { action: 'settings:discord' });
    }
    if (matches.length > 1) {
      const v = await ui.choose({ taskId: task.id, question: `There's more than one "${r.alias}". Which one?`, options: matches.map((m, i) => ({ label: `${m.label} (${m.kind})`, value: String(i) })) });
      if (v == null) throw new NovaError('cancelled', 'Okay, never mind.');
      matches = [matches[Number(v)]];
    }
    const t = matches[0];
    // 2. what's possible, said plainly
    const lines = [`You asked me to ${means.join(' and ') || 'go to Discord'} in ${t.label}.`];
    const opts = [];
    if (r.join || r.call) {
      lines.push("I can't join calls as you: Discord doesn't allow automating your account. I can open the channel so you can click Join.");
      opts.push({ label: `Open ${t.label} in Discord`, value: 'open' });
    }
    if (r.question) {
      lines.push("I can't say it out loud in the call: I don't have a voice connected yet, and my speech bubble only shows on your screen.");
      const textChannel = t.kind === 'text' ? t.channelId : t.textChannelId;
      const bot = adapter && adapter.ready();
      if (textChannel && bot && bot.ok) { lines.push(`Instead, the Nova bot could post the question as a text message in ${t.label}'s text chat.`); opts.push({ label: 'Post it as text instead (Nova bot)', value: 'post' }); }
      else if (textChannel) lines.push('Posting it as text needs the Nova bot set up first (Settings > Discord).');
      else lines.push("That place has no text channel saved, so I can't post there either.");
    }
    opts.push({ label: 'Never mind', value: 'no' });
    const v = await ui.choose({ taskId: task.id, question: lines.join('\n'), options: opts });
    if (!v || v === 'no') return reply(task, 'Okay, I did nothing in Discord.');
    if (v === 'open') {
      await launch(`discord://-/channels/${t.guildId}/${t.channelId}`);
      return reply(task, `Opened ${t.label} in Discord. Click Join when you're ready. I haven't joined or said anything.`, { verified: false });
    }
    // 3. posting: an exact, reviewed message, approved for this channel and text only
    const textChannel = t.kind === 'text' ? t.channelId : t.textChannelId;
    await approve(task, {
      title: `Post in Discord as the Nova bot?`,
      lines: [`Where: ${t.label} (text chat, channel ${textChannel})`, `Who: the Nova bot (not you)`, `Message: "${r.question}"`],
      categories: ['communicate'], targets: { channel: [textChannel] }, effects: { text: r.question },
    });
    const res = await sendOnce({ jobId: task.id, iteration: 'post', channelId: textChannel, content: r.question, signal: task.ac.signal, scope: { kind: 'task', id: task.id } });
    return reply(task, `Posted "${r.question}" in ${t.label} as the Nova bot. ✅`, { verified: !!res.messageId });
  }

  return { handle, addTarget, targets, resolve, sendOnce };
}

module.exports = { createDiscord, botAdapter };
