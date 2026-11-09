// Tasks: one per request. Each has a state, a cancellation signal, and only the
// state changes listed in NEXT are allowed, so a task can't be "thinking" forever
// after an error or come back to life after it was stopped.
'use strict';
const { id, NovaError } = require('./util');

const STATES = ['listening', 'transcribing', 'understanding', 'awaiting_permission', 'executing', 'verifying',
  'completed', 'cancelled', 'failed', 'blocked'];
const FINAL = new Set(['completed', 'cancelled', 'failed', 'blocked']);
const NEXT = {
  listening: ['transcribing', 'understanding', 'cancelled', 'failed'],
  transcribing: ['understanding', 'cancelled', 'failed'],
  understanding: ['awaiting_permission', 'executing', 'completed', 'blocked', 'cancelled', 'failed'],
  awaiting_permission: ['executing', 'cancelled', 'blocked', 'failed'],
  executing: ['verifying', 'awaiting_permission', 'completed', 'cancelled', 'failed', 'blocked'],
  verifying: ['completed', 'failed', 'executing', 'cancelled'],
};

function createTasks({ store, log } = {}) {
  const live = new Map();          // id -> task, while not final
  const listeners = new Set();
  const emit = (t) => { for (const l of listeners) { try { l(view(t)); } catch {} } };
  const view = (t) => ({ id: t.id, requestId: t.requestId, source: t.source, text: t.text, kind: t.kind, intent: t.intent, state: t.state,
    step: t.step, created: t.created, result: t.result, error: t.error, errorCategory: t.errorCategory });

  function create({ requestId, source = 'typed', text = '', kind = 'request', state = 'understanding' }) {
    const t = { id: id('task'), requestId: requestId || id('req'), source, text, kind, state, created: Date.now(), ac: new AbortController(), step: null, cleanups: [] };
    live.set(t.id, t);
    persist(t);
    log && log.event('task.created', { task: t.id, request: t.requestId, source, kind, state });
    emit(t);
    return t;
  }
  function move(t, state, extra = {}) {
    if (FINAL.has(t.state)) {
      // already finished: a late result from a stopped task is ignored, never revives it
      if (state === t.state) return false;
      log && log.event('task.late_transition_ignored', { task: t.id, from: t.state, to: state });
      return false;
    }
    if (state === t.state) return false;   // already there: nothing to do
    if (!(NEXT[t.state] || []).includes(state)) throw new NovaError('invalid', `Task can't go from ${t.state} to ${state}`);
    const from = t.state;
    t.state = state;
    Object.assign(t, extra);
    log && log.event('task.state', { task: t.id, request: t.requestId, from, to: state, ms: Date.now() - t.created, ...(extra.errorCategory ? { category: extra.errorCategory } : {}) });
    if (FINAL.has(state)) { live.delete(t.id); for (const c of t.cleanups.splice(0)) { try { c(); } catch {} } }
    persist(t);
    emit(t);
    return true;
  }
  function cancel(t, reason = 'Stopped.') {
    if (!t || FINAL.has(t.state)) return false;
    t.ac.abort(new NovaError('cancelled', reason));
    return move(t, 'cancelled', { error: reason, errorCategory: 'cancelled' });
  }
  function fail(t, err) {
    const category = (err && err.category) || 'failed';
    if (category === 'cancelled') return cancel(t, err.message);
    const state = category === 'blocked' || category === 'unavailable' || category === 'denied' ? 'blocked' : 'failed';
    return move(t, state, { error: (err && err.message) || String(err), errorCategory: category });
  }
  function persist(t) { if (store) { try { store.putTask({ ...view(t), result: t.result }); } catch (e) { log && log.event('store.error', { what: 'task', message: e.message }); } } }

  return {
    create, move, cancel, fail, FINAL,
    active: () => [...live.values()].map(view),
    get: (id) => live.get(id) || null,
    cancelAll(reason) { let n = 0; for (const t of [...live.values()]) if (cancel(t, reason)) n++; return n; },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    view,
  };
}

module.exports = { createTasks, STATES, NEXT, FINAL };
