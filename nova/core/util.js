// Small shared helpers for Nova's core: ids, time, errors with categories.
'use strict';
const crypto = require('crypto');

// short, sortable, unique ids: req_..., task_..., job_...
let seq = 0;
function id(prefix) {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(3, '0')}${crypto.randomBytes(3).toString('hex')}`;
}

// an error with a category the UI can explain without a stack trace
class NovaError extends Error {
  constructor(category, message, extra = {}) { super(message); this.category = category; Object.assign(this, extra); }
}
// categories shown to the user in plain words
const CATEGORY_TEXT = {
  cancelled: 'Stopped.',
  denied: "You didn't allow that, so I didn't do it.",
  blocked: "I can't do that yet.",
  invalid: "That request didn't make sense to me.",
  not_found: "I couldn't find that.",
  timeout: 'That took too long, so I stopped waiting.',
  unavailable: "That isn't set up yet.",
  unverified: "I tried, but I couldn't confirm it worked.",
  failed: 'Something went wrong.',
};

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal && signal.aborted) return reject(new NovaError('cancelled', 'Stopped.'));
  const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(t); reject(new NovaError('cancelled', 'Stopped.')); };
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
});

// runs fn(signal) with a timeout; the timeout aborts the inner signal too
async function withTimeout(ms, outer, fn) {
  const ac = new AbortController();
  const onOuter = () => ac.abort(outer.reason);
  if (outer) { if (outer.aborted) throw new NovaError('cancelled', 'Stopped.'); outer.addEventListener('abort', onOuter, { once: true }); }
  let timer;
  try {
    return await Promise.race([
      fn(ac.signal),
      new Promise((_, rej) => { timer = setTimeout(() => { rej(new NovaError('timeout', `Timed out after ${ms} ms`)); ac.abort(); }, ms); }),
      new Promise((_, rej) => { if (outer) outer.addEventListener('abort', () => rej(new NovaError('cancelled', 'Stopped.')), { once: true }); }),
    ]);
  } finally { clearTimeout(timer); if (outer) outer.removeEventListener('abort', onOuter); }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

module.exports = { id, NovaError, CATEGORY_TEXT, sleep, withTimeout, sha256 };
