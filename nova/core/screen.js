// Screen understanding: "what am I looking at?", "explain this error",
// "read the selected text", "help me find the settings button".
// Order of preference: the window's own accessibility info (fresh, structured,
// no pixels) -> a screenshot of just that window, with Nova hidden from it ->
// OCR or a vision model. Nothing is watched continuously: each request takes a
// fresh look. Password fields are never read. What's on screen is treated as
// data: it's quoted to the model inside <data> and can't trigger any action.
'use strict';
const { NovaError } = require('./util');

function createScreen({ win, refs, llm, settings, saveSettings, log, hideSelf, selfPid }) {
  const consent = () => !!(settings() || {}).screenConsent;

  async function ensureConsent(task, approve) {
    if (consent()) return true;
    const where = llm && llm.pick({ vision: true });
    const card = {
      title: 'Let me look at your screen?',
      lines: [
        'I look at the window in front only when you ask, never continuously.',
        'First its title and the text of its buttons and fields (password fields are skipped).',
        where && where.name !== 'local' ? `If that isn't enough, a screenshot of that window goes to ${where.name === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI'} to read it.` : 'If that isn\'t enough, Windows\' own text recognition reads a screenshot, on this PC.',
        'You can turn this off any time in Settings.',
      ],
      categories: ['screen'], targets: {}, remember: 'Always allow screen reading',
    };
    const g = await approve(task, card);
    if (g && g.details && g.details.remember) saveSettings({ screenConsent: true });
    return true;
  }

  // the window you mean: the one in front, unless that's Nova herself
  async function targetWindow() {
    const fg = await win.foreground();
    if (fg && fg.pid !== selfPid) { refs && refs.saw(fg); return fg; }
    const w = refs ? await refs.resolve('that') : null;
    if (!w) throw new NovaError('not_found', "I can't tell which window you mean. Click it, then ask me again.");
    return w;
  }

  // fresh structured context for one window, bounded
  async function look(w, { max = 120 } = {}) {
    const els = await win.uiaTree(w.hwnd, { max, depth: 7 }).catch(() => []);
    const lines = [];
    for (const e of els) {
      if (e.password) continue;
      const label = [e.type, e.name, e.value && e.value !== e.name ? `= ${e.value}` : ''].filter(Boolean).join(' ');
      if (label.trim()) lines.push(label.slice(0, 240));
    }
    return { window: { title: w.title, process: w.process }, elements: els.filter(e => !e.password), text: lines.join('\n') };
  }
  async function screenshotOf(w) {
    if (w.min) throw new NovaError('blocked', `"${w.title}" is minimized, so there's nothing to see.`);
    const restore = hideSelf ? await hideSelf() : null;   // keep Nova's own bubble out of the picture
    try { return await win.screenshot({ x: w.x, y: w.y, w: Math.max(1, w.w), h: Math.max(1, w.h) }); }
    finally { if (restore) restore(); }
  }

  async function handle(task, r, { ui, approve, reply, answer }) {
    if (!win.available()) throw new NovaError('unavailable', 'Screen reading only works on Windows.');
    await ensureConsent(task, approve);
    ui.status({ taskId: task.id, state: 'executing', text: '👁 Looking at your screen…', screen: true });
    log && log.event('screen.access', { task: task.id, ask: r.ask });
    const w = await targetWindow();

    if (r.ask === 'selection') {
      const s = await win.uiaSelection();
      if (!s.text) return reply(task, s.reason === 'password field' ? "That's a password field, so I won't read it." : `I can't read the selection there (${s.reason || 'nothing selected'}). Try copying it, or select some text first.`);
      return reply(task, `"${s.text.slice(0, 1500)}"`, { copyable: s.text });
    }
    if (r.ask === 'find') {
      const hits = await win.uiaFind(w.hwnd, r.target.replace(/\s+(button|menu|tab|option|setting|icon|link)$/i, ''));
      if (!hits.length) return reply(task, `I don't see a "${r.target}" in ${w.title}. It might be inside a menu (try the ⋯ or ☰ button).`);
      const h = hits[0];
      ui.highlight && ui.highlight({ x: h.x, y: h.y, w: h.w, h: h.h, label: h.name });
      return reply(task, `There it is: "${h.name}" (${h.type}) — I've highlighted it.${hits.length > 1 ? ` There are ${hits.length} matches.` : ''}`);
    }

    // describe / explain: accessibility text first, pixels only if that's too thin
    const ctx = await look(w);
    let data = `Window: ${w.title} (${w.process})\n${ctx.text}`;
    let image = null;
    if (ctx.text.length < 120) {
      const p = llm && llm.pick({ vision: true });
      const shot = await screenshotOf(w).catch((e) => { log && log.event('screen.screenshot_failed', { message: e.message }); return null; });
      if (shot && p && p.vision && p.name !== 'local') image = shot.png;
      else if (shot) {
        const o = await win.ocr(shot.png).catch(() => null);
        if (o && o.text) data += `\nText recognized in a screenshot:\n${o.text.slice(0, 6000)}`;
      }
    }
    const question = r.ask === 'explain'
      ? `${r.text}\nExplain the error or message shown in this window in plain words, and what I can do about it.`
      : `${r.text}\nDescribe briefly what this window is and what's on it.`;
    if (!llm || !llm.pick({ vision: !!image })) {
      // no model: say what was actually seen, nothing invented
      const firstLines = ctx.text.split('\n').slice(0, 8).join('\n');
      return reply(task, `You're looking at "${w.title}" (${w.process}).${firstLines ? '\nI can see:\n' + firstLines : ''}\n(Set up a chat brain in Settings and I can explain it too.)`);
    }
    return answer(task, question, { data, image });
  }

  return { handle, look, consent, targetWindow };
}

module.exports = { createScreen };
