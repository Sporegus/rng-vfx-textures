// Permissions: what you allowed, bound to one task or job, checked in app code.
// The model never sees or sets these; a plan from the model is only a proposal
// that has to pass check() before any tool runs.
//
// A grant says: for THIS task/job (scope), these categories of action, on these
// targets (apps, windows, conversations, channels...), with these effects, until
// this time. It ends when the task ends, when you press Stop, or when it expires.
'use strict';
const { id, NovaError } = require('./util');

// what each category of action means, for the approval card
const CATEGORIES = {
  read: 'Look up information (no changes)',
  launch: 'Open an app, folder or website',
  window: 'Move, focus or arrange windows',
  screen: 'Look at your screen',
  control: 'Use your mouse and keyboard',
  files_write: 'Change, move or organize files',
  files_delete: 'Send files to the Recycle Bin',
  communicate: 'Send a message or post as someone',
  call: 'Join or leave a call',
  audio_out: 'Play audio into a call',
  relay: 'Pass messages between assistant conversations',
  game: 'Play or control a game',
  system: 'Change system settings (sleep, volume, theme)',
  install: 'Install software',
  purchase: 'Buy something',
  security: 'Change security or account settings',
};
// low-impact actions a direct request already authorizes (you asked for exactly this)
const DIRECT_OK = new Set(['read', 'launch', 'window', 'system']);
// never allowed through Nova at all
const NEVER = new Set(['install', 'purchase', 'security']);

function createPermissions({ store, log, now = () => Date.now() } = {}) {
  const grants = new Map();
  if (store) for (const g of store.grants()) if (!g.revoked && (!g.expires || g.expires > now())) grants.set(g.id, g);

  // a grant for one task or job. targets: { apps: [...], conversations: [...], channels: [...] }
  // effects: free-form specifics that must match exactly (recipient, message text, account, objective)
  function grant({ scope, categories, targets = {}, effects = {}, details = {}, ttlMs = 30 * 60000, persistent = false }) {
    if (!scope || !scope.kind || !scope.id) throw new NovaError('invalid', 'A grant needs a task or job scope');
    for (const c of categories) {
      if (!CATEGORIES[c]) throw new NovaError('invalid', 'Unknown permission category: ' + c);
      if (NEVER.has(c)) throw new NovaError('blocked', `Nova doesn't do "${CATEGORIES[c]}".`);
    }
    const g = { id: id('grant'), scope, categories: [...categories], targets: normTargets(targets), effects, details, created: now(),
      expires: ttlMs ? now() + ttlMs : null, revoked: false, persistent: !!persistent };
    grants.set(g.id, g);
    if (store) store.putGrant(g);
    log && log.event('permission.granted', { grant: g.id, scope, categories, targets: g.targets, ttlMs });
    return g;
  }
  function normTargets(t) {
    const o = {};
    for (const [k, v] of Object.entries(t || {})) o[k] = (Array.isArray(v) ? v : [v]).map(x => String(x).toLowerCase());
    return o;
  }
  function revoke(g, why = 'revoked') {
    if (!g || g.revoked) return;
    g.revoked = true;
    if (store) store.putGrant(g);
    log && log.event('permission.revoked', { grant: g.id, scope: g.scope, why });
  }
  // everything bound to a task or job ends with it
  function endScope(kind, sid, why = 'ended') { for (const g of grants.values()) if (g.scope.kind === kind && g.scope.id === sid) revoke(g, why); }
  function revokeAll(why = 'stop') { for (const g of grants.values()) if (!g.persistent) revoke(g, why); }

  // is this exact action allowed? action: { category, scope:{kind,id}, target:{kind,value}, effects:{...} }
  // Returns { ok, reason, needs, grant }. Silence, time passing or a denied request are never approval.
  function check(action) {
    const { category, scope, target, effects = {} } = action;
    if (!CATEGORIES[category]) return { ok: false, reason: 'unknown category ' + category };
    if (NEVER.has(category)) return { ok: false, reason: `Nova doesn't do "${CATEGORIES[category]}".`, never: true };
    if (action.direct && DIRECT_OK.has(category)) return { ok: true, reason: 'direct request' };
    for (const g of grants.values()) {
      if (g.revoked) continue;
      if (g.expires && g.expires <= now()) { revoke(g, 'expired'); continue; }
      if (!scope || g.scope.kind !== scope.kind || g.scope.id !== scope.id) continue;   // never reuse another task's approval
      if (!g.categories.includes(category)) continue;
      if (target) {
        const allowed = g.targets[target.kind];
        if (!allowed || !allowed.includes(String(target.value).toLowerCase())) continue;   // changed recipient/app/conversation
      }
      // every effect the grant pinned must match exactly (message text, account, objective...)
      let same = true;
      for (const [k, v] of Object.entries(g.effects || {})) if (k in effects && JSON.stringify(effects[k]) !== JSON.stringify(v)) same = false;
      if (!same) continue;
      return { ok: true, grant: g, reason: 'granted' };
    }
    return { ok: false, needs: { category, target, effects }, reason: 'needs approval' };
  }
  function list() { return [...grants.values()].map(g => ({ ...g, active: !g.revoked && (!g.expires || g.expires > now()) })); }

  return { grant, revoke, revokeAll, endScope, check, list, CATEGORIES, DIRECT_OK, NEVER };
}

module.exports = { createPermissions, CATEGORIES, DIRECT_OK, NEVER };
