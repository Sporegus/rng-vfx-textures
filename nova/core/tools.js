// Tools: every action Nova's brain can take, each declaring what it needs and
// how to check it worked. The executor validates arguments, asks the permission
// layer, holds the desktop lock for input, applies the timeout, retries only
// when that's safe, and verifies the result. A tool that ran but whose
// postcondition failed is reported as unverified, never as done.
//
// A tool:
//   name, purpose
//   args        a small JSON-schema (object/properties/required/type/enum/maxLength/pattern/items)
//   category    permission category (see permissions.js)
//   effect      'none' (read only) | 'local' (changes this PC) | 'external' (reaches other people/services)
//   retrySafe   may it run again after a failure without doing something twice?
//   timeoutMs
//   target(args)            what it acts on, for permission binding: { kind, value }
//   run(args, ctx)          does it; ctx: { signal, task, log, observe }
//   verify(args, result, ctx) -> { ok, evidence }   checks the requested state actually holds
'use strict';
const { NovaError, withTimeout, sleep } = require('./util');

function validate(schema, value, at = 'args') {
  const errs = [];
  const t = schema.type;
  const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v;
  const is = (v, ty) => ty === 'number' ? typeof v === 'number' && isFinite(v) : ty === 'integer' ? Number.isInteger(v) : typeOf(v) === ty;
  if (t && !(Array.isArray(t) ? t.some(x => is(value, x)) : is(value, t))) return [`${at} should be ${t}`];
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at} should be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.maxLength && value.length > schema.maxLength) errs.push(`${at} is too long`);
    if (schema.minLength && value.length < schema.minLength) errs.push(`${at} is too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${at} has an unexpected format`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${at} is too small`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${at} is too large`);
  }
  if (t === 'array' && schema.items) {
    if (schema.maxItems && value.length > schema.maxItems) errs.push(`${at} has too many items`);
    value.forEach((v, i) => errs.push(...validate(schema.items, v, `${at}[${i}]`)));
  }
  if (t === 'object') {
    for (const r of schema.required || []) if (value[r] === undefined) errs.push(`${at}.${r} is required`);
    for (const [k, v] of Object.entries(value)) {
      const p = (schema.properties || {})[k];
      if (!p) { if (schema.additionalProperties === false) errs.push(`${at}.${k} is not allowed`); continue; }
      if (v !== undefined) errs.push(...validate(p, v, `${at}.${k}`));
    }
  }
  return errs;
}

function createTools({ permissions, log, store, locks }) {
  const tools = new Map();
  function register(tool) {
    for (const k of ['name', 'args', 'category', 'effect', 'run']) if (!tool[k]) throw new Error(`tool ${tool.name || '?'} is missing ${k}`);
    tools.set(tool.name, { retrySafe: false, timeoutMs: 20000, retries: 0, ...tool });
  }

  // runs one tool call for a task. call: { tool, args, direct }
  // direct = you asked for exactly this, so low-impact categories need no extra approval
  async function run(task, call, extra = {}) {
    const tool = tools.get(call.tool);
    if (!tool) throw new NovaError('invalid', `I don't have a tool called "${call.tool}".`);
    const args = call.args || {};
    const errs = validate(tool.args, args);
    if (errs.length) throw new NovaError('invalid', 'Bad request for ' + tool.name + ': ' + errs.join('; '));
    const target = tool.target ? tool.target(args) : null;
    const scope = extra.scope || { kind: 'task', id: task.id };
    const verdict = permissions.check({ category: tool.category, scope, target, effects: tool.effects ? tool.effects(args) : {}, direct: !!call.direct });
    log && log.event('permission.check', { task: task.id, tool: tool.name, category: tool.category, target, ok: verdict.ok, reason: verdict.reason });
    if (!verdict.ok) throw new NovaError(verdict.never ? 'blocked' : 'denied', verdict.never ? verdict.reason : `I need your OK to ${permissions.CATEGORIES[tool.category].toLowerCase()} for this.`, { needs: verdict.needs, tool: tool.name });

    // desktop input is serialized: one task types at a time
    const lockName = tool.category === 'control' || tool.category === 'game' ? 'desktop-input' : null;
    if (lockName && locks && !locks.acquire(lockName, task.id, tool.timeoutMs + 5000)) throw new NovaError('blocked', 'Another task is using the mouse and keyboard right now.');
    const started = Date.now();
    try {
      let attempt = 0, lastErr;
      while (attempt <= (tool.retrySafe ? tool.retries : 0)) {
        if (task.ac.signal.aborted) throw new NovaError('cancelled', 'Stopped.');
        try {
          const result = await withTimeout(tool.timeoutMs, task.ac.signal, (signal) => tool.run(args, { signal, task, log, ...extra }));
          let check = { ok: true, evidence: 'no postcondition for this tool' };
          // the action already ran: a slow or broken check makes it unconfirmed, never an error (and never a repeat)
          if (tool.verify) check = await withTimeout(Math.min(tool.timeoutMs, 15000), task.ac.signal, (signal) => tool.verify(args, result, { signal, task, log, ...extra }))
            .catch((e) => { if (e.category === 'cancelled') throw e; return { ok: false, evidence: e.category === 'timeout' ? 'the check took too long' : 'the check failed: ' + e.message }; });
          log && log.event('tool.result', { task: task.id, tool: tool.name, ms: Date.now() - started, verified: check.ok, evidence: check.evidence, attempt });
          return { tool: tool.name, result, verified: !!check.ok, evidence: check.evidence };
        } catch (e) {
          lastErr = e;
          if (e.category === 'cancelled' || e.category === 'denied' || e.category === 'invalid' || e.category === 'blocked') throw e;
          if (tool.effect === 'external' && e.category === 'timeout') {
            // an external action that timed out may have happened: never blindly retry it
            throw new NovaError('unverified', `${tool.name} timed out and may or may not have happened, so I won't repeat it.`, { ambiguous: true });
          }
          log && log.event('tool.error', { task: task.id, tool: tool.name, attempt, category: e.category || 'failed', message: e.message });
          attempt++;
          if (attempt <= (tool.retrySafe ? tool.retries : 0)) await sleep(400 * 2 ** attempt, task.ac.signal);
        }
      }
      throw lastErr;
    } finally {
      if (lockName && locks) locks.release(lockName, task.id);
    }
  }

  return {
    register, run, validate,
    get: (n) => tools.get(n),
    list: () => [...tools.values()].map(t => ({ name: t.name, purpose: t.purpose, category: t.category, effect: t.effect, retrySafe: t.retrySafe, timeoutMs: t.timeoutMs, available: t.available ? t.available() : true, args: t.args })),
  };
}

module.exports = { createTools, validate };
