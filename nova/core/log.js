// Structured event log: one JSON line per event, with request/task ids,
// durations and error categories. Secrets are redacted before anything is
// written or kept in memory. Bounded: the file rotates, memory keeps the latest.
'use strict';
const fs = require('fs');
const path = require('path');

// anything that looks like a credential is replaced before logging
const SECRET_KEYS = /^(key|apikey|api_key|token|password|passwd|secret|authorization|auth|cookie|session|credential|bottoken)$/i;
const SECRET_VALUES = [
  /\b(sk-[A-Za-z0-9_-]{16,})/g,                 // OpenAI / Anthropic style keys
  /\b(xox[abpr]-[A-Za-z0-9-]{10,})/g,           // Slack
  /\b([MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,})/g, // Discord bot tokens
  /\b(gh[pousr]_[A-Za-z0-9]{30,})/g,            // GitHub
  /\b(Bearer\s+[A-Za-z0-9._~+\/-]{12,}=*)/gi,
  /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, // JWTs
];
function redactString(s) {
  let out = String(s);
  for (const re of SECRET_VALUES) out = out.replace(re, '[redacted]');
  return out;
}
function redact(v, depth = 0) {
  if (v == null || depth > 6) return v;
  if (typeof v === 'string') return redactString(v).slice(0, 2000);
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redact(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(x, depth + 1);
    return o;
  }
  return v;
}

function createLog({ dir = null, keep = 500, maxBytes = 2_000_000 } = {}) {
  const recent = [];
  const listeners = new Set();
  const file = dir ? path.join(dir, 'nova-events.jsonl') : null;
  if (dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
  function write(line) {
    if (!file) return;
    try {
      const st = fs.existsSync(file) ? fs.statSync(file) : null;
      if (st && st.size > maxBytes) fs.renameSync(file, file + '.1');
      fs.appendFileSync(file, line + '\n');
    } catch {}
  }
  function event(type, data = {}) {
    const e = { t: new Date().toISOString(), type, ...redact(data) };
    recent.push(e);
    if (recent.length > keep) recent.shift();
    write(JSON.stringify(e));
    for (const l of listeners) { try { l(e); } catch {} }
    return e;
  }
  return {
    event,
    recent: (n = 100, filter) => recent.filter(e => !filter || filter(e)).slice(-n),
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    // a sanitized copy for "export diagnostics"
    export: () => recent.map(e => JSON.stringify(e)).join('\n'),
    file,
  };
}

module.exports = { createLog, redact, redactString };
