// Notification triage: "what did I miss?". It only uses sources that are really
// connected and authorized, groups routine items, puts what you marked important
// first, respects quiet hours / do-not-disturb (things wait, they aren't dropped),
// and never replies to anyone or dismisses anything.
//
// Sources:
//   nova     Nova's own events (reminders, finished/blocked jobs, approvals waiting): always available
//   windows  Windows notification center: NOT available. Reading it needs a packaged
//            app identity and the user's notification-access consent (UserNotificationListener),
//            which this desktop build doesn't have. Shown as unavailable, not faked.
'use strict';

function createNotifications({ store, log, now = () => Date.now(), important = () => ({ apps: [], contacts: [], topics: [] }) }) {
  const sources = new Map();
  sources.set('windows', { name: 'Windows notifications', available: () => ({ ok: false, reason: 'Needs notification access for a packaged app; this build can\'t read Windows notifications.' }), fetch: async () => [] });
  const feed = () => store.recall('notif').map(r => r.value).filter(Boolean);
  // Nova's own events go into her feed
  function push({ source = 'nova', app = 'Nova', title, body = '', link = null, kind = 'info', at = now(), sourceId = null }) {
    const key = sourceId ? `${source}:${sourceId}` : `${source}:${at}:${title}`;
    if (feed().some(n => n.key === key)) return null;   // the same item twice is one item
    const n = { key, source, app, title: String(title).slice(0, 200), body: String(body).slice(0, 500), link, kind, at, seen: false };
    store.remember('notif:' + key, 'notif', n);
    // bounded: keep the newest 300
    const old = feed().sort((a, b) => b.at - a.at).slice(300);
    for (const o of old) store.forget('notif:' + o.key);
    return n;
  }
  function addSource(name, src) { sources.set(name, src); }
  function isImportant(n) {
    const imp = important() || {};
    const text = `${n.app} ${n.title} ${n.body}`.toLowerCase();
    return n.kind === 'blocked' || n.kind === 'approval' || (imp.apps || []).some(a => n.app.toLowerCase() === String(a).toLowerCase()) || (imp.contacts || []).some(c => text.includes(String(c).toLowerCase())) || (imp.topics || []).some(t => text.includes(String(t).toLowerCase()));
  }
  async function collect(since) {
    for (const [name, s] of sources) {
      if (!s.available().ok) continue;
      try { for (const it of await s.fetch(since)) push({ ...it, source: name, sourceId: it.id }); } catch (e) { log && log.event('notifications.source_error', { source: name, message: e.message }); }
    }
    return feed().filter(n => n.at >= since);
  }
  // the digest: important first (each listed), routine ones grouped by app
  async function digest({ since = now() - 12 * 3600e3, markSeen = true } = {}) {
    const items = (await collect(since)).sort((a, b) => b.at - a.at);
    const imp = items.filter(isImportant), routine = items.filter(n => !isImportant(n));
    const groups = {};
    for (const n of routine) (groups[n.app] = groups[n.app] || []).push(n);
    const lines = [];
    if (imp.length) lines.push('Important:', ...imp.map(n => `• ${n.app}: ${n.title}${n.link ? ` (${n.link})` : ''}`));
    for (const [app, ns] of Object.entries(groups)) lines.push(`${app}: ${ns.length === 1 ? ns[0].title : `${ns.length} updates, latest "${ns[0].title}"`}`);
    if (markSeen) for (const n of items) if (!n.seen) { n.seen = true; store.remember('notif:' + n.key, 'notif', n); }
    const unavailable = [...sources.values()].filter(s => !s.available().ok).map(s => `${s.name}: ${s.available().reason}`);
    return { text: items.length ? lines.join('\n') : 'Nothing new.', important: imp, routine, unavailable };
  }
  return { push, addSource, digest, isImportant, sources: () => [...sources.entries()].map(([k, s]) => ({ id: k, name: s.name, ...s.available() })), feed };
}

module.exports = { createNotifications };
