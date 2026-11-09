// Assistants a job can coordinate. Each is an adapter with the same shape:
//   id, role, kind, live (false for fixtures)
//   available() -> { ok, reason }
//   send(envelope, { signal }) -> { status: 'complete'|'running'|'failed'|'needs_approval'|'limit', output, artifacts, usage }
//        status reflects the assistant's TURN; whether the GOAL is done is decided by the coordinator's own checks
//   lookup(jobId, iteration) -> null | { status, output } : did this handoff already reach it? (for crash recovery)
//
// Routes:
//   fixture        scripted, for tests and the demo (clearly labeled, never "live")
//   claude-cli     the Claude Code CLI on this PC, run headless in the job's project folder (experimental)
//   anthropic-api  a fresh Claude conversation through Anthropic's API (needs a key; NOT your existing chats)
//   openai-api     a fresh ChatGPT-model conversation through OpenAI's API (needs a key; NOT your existing chats)
//   Existing ChatGPT/Claude browser conversations are not supported: neither offers an interface for
//   another program to post into them, and Nova won't scrape sessions or cookies to fake one.
'use strict';
const { execFile } = require('child_process');
const { NovaError } = require('./util');

function envelopeText(env) {
  return [
    `[Nova job ${env.jobId} · iteration ${env.iteration} · from ${env.sender} to ${env.destination}]`,
    `Objective: ${env.objective}`,
    env.context ? `Context:\n${env.context}` : '',
    env.constraints && env.constraints.length ? `Constraints:\n${env.constraints.map(c => '- ' + c).join('\n')}` : '',
    `Expected output: ${env.expectedOutput}`,
    env.evidence && env.evidence.length ? `Evidence:\n${env.evidence.map(e => `- ${e.name}${e.sha256 ? ` (sha256 ${e.sha256.slice(0, 12)})` : ''}: ${e.summary || ''}`).join('\n')}` : '',
    env.unresolved && env.unresolved.length ? `Unresolved:\n${env.unresolved.map(u => '- ' + u).join('\n')}` : '',
    env.attachments && env.attachments.length ? `Attachments (the actual files, as checked by Nova):\n${env.attachments.map(a => `--- ${a.name} (sha256 ${a.sha256.slice(0, 16)}, ${a.bytes} bytes) ---\n${a.content != null ? a.content : '[binary or too large: not included; the hash identifies the exact file]'}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

// scripted participant: script(env, history) -> { status, output, artifacts }
function fixture(id, role, script) {
  const received = new Map();
  return {
    id, role, kind: 'fixture', live: false,
    available: () => ({ ok: true }),
    async send(env) { const r = await script(env, received); received.set(`${env.jobId}:${env.iteration}`, r); return r; },
    async lookup(jobId, iteration) { return received.get(`${jobId}:${iteration}`) || null; },
    received,
  };
}

// Claude Code CLI, headless, in the job's project folder. Its own permission
// settings apply; Nova doesn't add flags that skip them.
function claudeCli(id, role, { cwd, bin = 'claude', timeoutMs = 30 * 60000, execImpl = execFile } = {}) {
  let found = null;
  const check = () => new Promise((res) => execImpl(bin, ['--version'], { timeout: 10000, windowsHide: true }, (e, out) => res(!e && /\d/.test(String(out)))));
  return {
    id, role, kind: 'claude-cli', live: true,
    available: () => found === false ? { ok: false, reason: 'The claude command isn\'t installed on this PC.' } : { ok: true, unchecked: found === null },
    async probe() { found = await check(); return found; },
    async send(env, { signal, workspace } = {}) {
      const dir = workspace || cwd;
      if (!dir) throw new NovaError('invalid', 'No project folder chosen for this job.');
      if (found === null) await this.probe();
      if (!found) throw new NovaError('unavailable', 'The claude command isn\'t installed on this PC.');
      return new Promise((resolve, reject) => {
        const child = execImpl(bin, ['-p', envelopeText(env), '--output-format', 'json'], { cwd: dir, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => {
          if (signal && signal.aborted) return reject(new NovaError('cancelled', 'Stopped.'));
          if (e) return resolve({ status: /usage limit|rate limit/i.test(String(err)) ? 'limit' : 'failed', output: String(err || e.message).slice(0, 4000) });
          let j = null; try { j = JSON.parse(out); } catch {}
          resolve({ status: j && j.is_error ? 'failed' : 'complete', output: j ? String(j.result || '') : String(out), usage: j && j.usage ? { input: j.usage.input_tokens, output: j.usage.output_tokens, costUsd: j.total_cost_usd } : {} });
        });
        try { require('os').setPriority(child.pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL); } catch {}   // a background helper
        if (signal) signal.addEventListener('abort', () => { try { child.kill(); } catch {} }, { once: true });
      });
    },
    // a headless run leaves no conversation to inspect: an interrupted handoff is "unknown"
    async lookup() { return null; },
  };
}

// a model API as a participant (planner/reviewer). Fresh conversation per job.
function apiModel(id, role, provider, kind) {
  return {
    id, role, kind, live: true,
    available: () => provider.available(),
    async send(env, { signal } = {}) {
      const r = await provider.chat({ system: `You are the ${role} in a coordinated software job run by Nova. Reply with exactly what the "Expected output" asks for. Never ask for secrets or for work outside the stated objective.`, messages: [{ role: 'user', content: envelopeText(env) }], signal, timeoutMs: 180000 });
      return { status: 'complete', output: r.text, usage: r.usage };
    },
    async lookup() { return null; },
  };
}

module.exports = { fixture, claudeCli, apiModel, envelopeText };
