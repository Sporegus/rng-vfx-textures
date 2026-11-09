// Language-model providers behind one interface, so the brain doesn't care
// which one answers:
//   local      the free model already on your PC (the voice service's chat brain)
//   anthropic  Claude through Anthropic's API (needs your API key)
//   openai     ChatGPT models through OpenAI's API (needs your API key)
//   mock       scripted replies, for tests only
// Keys come from a getter backed by Windows' encrypted storage; they're never
// put in prompts, settings.json or logs. Each call has a timeout, a token cap and
// a cancellation signal, and usage is counted where the API reports it.
'use strict';
const { NovaError, withTimeout } = require('./util');

// reads a server-sent-events stream, calling onEvent(json) per data line
async function readSSE(res, onEvent, signal) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    if (signal && signal.aborted) { try { reader.cancel(); } catch {} throw new NovaError('cancelled', 'Stopped.'); }
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      try { onEvent(JSON.parse(d)); } catch {}
    }
  }
}
function httpError(provider, status, body) {
  if (status === 401 || status === 403) return new NovaError('unavailable', `${provider} didn't accept the API key.`);
  if (status === 429) return new NovaError('unavailable', `${provider} is rate-limiting us right now; try again in a bit.`, { retryAfter: true });
  if (status >= 500) return new NovaError('unavailable', `${provider} is having trouble right now (${status}).`);
  return new NovaError('failed', `${provider} refused the request (${status}): ${String(body).slice(0, 200)}`);
}

function anthropic({ key, model = 'claude-sonnet-5-5', maxTokens = 1024, fetchImpl = fetch } = {}) {
  return {
    name: 'anthropic', model, vision: true,
    available: () => key() ? { ok: true } : { ok: false, reason: 'No Anthropic API key saved (Settings > Brain).' },
    async chat({ system, messages, onText, signal, timeoutMs = 60000, maxTokens: perCall }) {
      const k = key();
      if (!k) throw new NovaError('unavailable', 'No Anthropic API key saved.');
      return withTimeout(timeoutMs, signal, async (sig) => {
        const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: sig,
          headers: { 'content-type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: perCall || maxTokens, system, messages: messages.map(toAnthropic), stream: true }),
        });
        if (!res.ok) throw httpError('Anthropic', res.status, await res.text().catch(() => ''));
        let text = '', usage = {};
        await readSSE(res, (e) => {
          if (e.type === 'content_block_delta' && e.delta && e.delta.text) { text += e.delta.text; onText && onText(e.delta.text); }
          if (e.type === 'message_start' && e.message && e.message.usage) usage.input = e.message.usage.input_tokens;
          if (e.type === 'message_delta' && e.usage) usage.output = e.usage.output_tokens;
        }, sig);
        return { text, usage };
      });
    },
  };
}
function toAnthropic(m) {
  if (!m.image) return { role: m.role, content: m.content };
  return { role: m.role, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image } }, { type: 'text', text: m.content }] };
}

function openai({ key, model = 'gpt-5-mini', maxTokens = 1024, fetchImpl = fetch } = {}) {
  return {
    name: 'openai', model, vision: true,
    available: () => key() ? { ok: true } : { ok: false, reason: 'No OpenAI API key saved (Settings > Brain).' },
    async chat({ system, messages, onText, signal, timeoutMs = 60000, maxTokens: perCall }) {
      const k = key();
      if (!k) throw new NovaError('unavailable', 'No OpenAI API key saved.');
      return withTimeout(timeoutMs, signal, async (sig) => {
        const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: sig,
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k },
          body: JSON.stringify({ model, max_completion_tokens: perCall || maxTokens, stream: true, stream_options: { include_usage: true },
            messages: [{ role: 'system', content: system }, ...messages.map(toOpenAI)] }),
        });
        if (!res.ok) throw httpError('OpenAI', res.status, await res.text().catch(() => ''));
        let text = '', usage = {};
        await readSSE(res, (e) => {
          const d = e.choices && e.choices[0] && e.choices[0].delta;
          if (d && d.content) { text += d.content; onText && onText(d.content); }
          if (e.usage) usage = { input: e.usage.prompt_tokens, output: e.usage.completion_tokens };
        }, sig);
        return { text, usage };
      });
    },
  };
}
function toOpenAI(m) {
  if (!m.image) return { role: m.role, content: m.content };
  return { role: m.role, content: [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + m.image } }] };
}

// the voice service's local model: ask(text, onText, signal) -> text
function local({ ask, ready }) {
  return {
    name: 'local', model: 'on-device', vision: false,
    available: () => ready() ? { ok: true } : { ok: false, reason: 'The free on-device chat brain is off or still loading (tray > Voice > Chat brain).' },
    async chat({ messages, onText, signal, timeoutMs = 90000 }) {
      const last = [...messages].reverse().find(m => m.role === 'user');
      return withTimeout(timeoutMs, signal, async (sig) => ({ text: await ask(last ? last.content : '', onText, sig), usage: {} }));
    },
  };
}

// scripted replies for tests: replies = [string | (req) => string]
function mock(replies = [], { delayMs = 0 } = {}) {
  const calls = [];
  return {
    name: 'mock', model: 'mock', vision: true, calls,
    available: () => ({ ok: true }),
    async chat(req) {
      calls.push(req);
      const r = replies.length ? replies.shift() : 'OK.';
      const text = typeof r === 'function' ? r(req) : r;
      if (delayMs) await new Promise((res, rej) => { const t = setTimeout(res, delayMs); req.signal && req.signal.addEventListener('abort', () => { clearTimeout(t); rej(new NovaError('cancelled', 'Stopped.')); }); });
      if (req.onText) req.onText(text);
      return { text, usage: { input: 1, output: 1 } };
    },
  };
}

// picks the first available provider in the user's preferred order
function chooser(providers, order = ['anthropic', 'openai', 'local']) {
  return {
    pick(need = {}) {
      for (const n of order) {
        const p = providers[n];
        if (!p) continue;
        if (need.vision && !p.vision) continue;
        if (p.available().ok) return p;
      }
      return null;
    },
    status: () => Object.fromEntries(Object.entries(providers).map(([n, p]) => [n, { ...p.available(), model: p.model }])),
  };
}

module.exports = { anthropic, openai, local, mock, chooser, readSSE };
