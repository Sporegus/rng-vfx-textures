// Nova's chatty side: a small open AI model running on your PC (llama.cpp via
// node-llama-cpp). It handles normal conversation and anything the quick
// command brain doesn't understand. It can't touch your PC directly: to do
// something it writes a plain request ("open roblox") that goes back through
// the command brain, so the same safety rules apply.
const os = require('os');
const { MINDS, MIND_SIZES } = require('./models');
const MOODS = ['cute', 'happy', 'excited', 'sad', 'calm', 'confused', 'proud', 'pouty', 'shy', 'love'];

let L = null; // node-llama-cpp, loaded on first use

function persona({ facts = [], name } = {}) {
  const now = new Date();
  return `You are Nova, a cute, cheerful, slightly glitchy hologram girl who lives on the user's Windows desktop and helps them out. You're playful, warm and a little cheeky, but always helpful.

How you talk:
- Everything you say is spoken out loud, so keep it short: one to three sentences, natural and friendly. No emoji, no lists, no markdown.
- You can add a sound now and then where it fits: <giggle> <laugh> <chuckle> <sigh> <gasp> <yawn>. Don't overdo it.
- Start each sentence with the feeling you say it with, in brackets, one of: [cute] [happy] [excited] [sad] [calm] [confused] [proud] [pouty] [shy] [love]. For example: "[excited] Ooh, I love that song! [cute] Want me to play it?"
- Never make things up about the user's PC or files. If you don't know something (like today's news or prices), say so and offer to search the web.

What you can do: call do_task with a short plain request to do things on the PC, for example "open roblox", "play god did by dj khaled", "find my resume", "remind me at 5pm to call mom", "set a timer for 10 minutes", "turn the volume down", "organize my downloads a to z", "google best pizza near me", "dark mode". Call it whenever the user wants something done. Never say you did something unless do_task said it worked.
Use get_weather for weather questions and get_time for the time or date. When the user tells you something about themselves worth remembering (their name, birthday, favorite things, where they live), call remember.
You can't send or delete emails, delete files for good, buy things, install software, or change passwords or security settings. If asked, say so kindly.

${name ? `The user's name is ${name}.\n` : ''}${facts.length ? 'Things you remember about the user:\n' + facts.map(f => '- ' + f).join('\n') + '\n' : ''}Today is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
}

// Reading what you meant, in ONE call: a command for her command path, a chat reply, or a
// question back. The instructions never change, so the model processes them once and reuses
// them (llama.cpp keeps the shared start of the prompt); output is forced to valid JSON.
const DECIDE_SYSTEM = `You read what the user just said to Nova, a desktop assistant on their Windows PC, and decide what it is. Answer with JSON only.
kind "command": they want something done on the PC now. Put it in "command" as one short plain instruction in the style of the list below.
kind "chat": conversation, or a question you can answer. Put a short, warm reply (one or two sentences, no emoji) in "reply".
kind "ask": they want something done but you can't tell what. Put one short question in "reply".
Only make a command when they ask for it. Something they mention, ask about, or tell you not to do is not a command ("don't open discord", "why is discord slow", "i love spotify" are not commands). Ignore swearing and filler.
Instructions Nova understands: open <app>; close <app>; open <website>; open <app> in chrome; play <song, artist or genre>; pause the music; next song; turn the volume up; turn the volume down; mute; set a timer for <time>; remind me at <time> to <thing>; search google for <thing>; open my <folder> folder; find <file name>; take a screenshot; organize my downloads; clean up junk files; dark mode; light mode; lock my pc; what's the weather; what time is it; get out of the way; go away; tell me a joke; stop.`;
const DECIDE_SCHEMA = { type: 'object', properties: { kind: { enum: ['command', 'chat', 'ask'] }, command: { type: 'string' }, reply: { type: 'string' } }, required: ['kind', 'command', 'reply'] };

class Mind {
  // host: { task(command), weather(place), remember(fact), memory() } — all async
  // uris: which models to try (defaults to the best fit for this PC's memory)
  // size: 'auto' (picked from this PC's graphics card and memory) or small / standard / medium / large
  constructor(dir, host, uris, size = 'auto') { this.dir = dir; this.host = host; this.uris = uris; this.size = size; this.ready = false; this.lastAt = 0; }

  // downloads the model the first time (onProgress(done, total)), then loads it
  async load(onProgress) {
    L = L || await import('node-llama-cpp');
    this.llama = await L.getLlama();
    const gb = os.totalmem() / 1e9;
    let vram = 0;
    try { vram = this.llama.gpu ? (await this.llama.getVramState()).total / 1e9 : 0; } catch {}
    const auto = vram >= 11 ? 'large' : vram >= 7 ? 'medium' : gb >= 12 ? 'standard' : 'small';
    this.chosen = MIND_SIZES[this.size] ? this.size : auto;
    const uris = this.uris || MIND_SIZES[this.chosen].flatMap(k => MINDS[k]);
    let file = null, err = null;
    for (const uri of uris) {
      try { file = await L.resolveModelFile(uri, { directory: this.dir, cli: false, onProgress: ({ downloadedSize, totalSize }) => onProgress && onProgress(downloadedSize, totalSize) }); break; }
      catch (e) { err = e; }
    }
    if (!file) throw err || new Error('Could not download a chat model');
    this.model = await this.llama.loadModel({ modelPath: file });
    this.file = file; this.vram = vram;
    this.context = await this.model.createContext({ contextSize: 4096 });
    this.sequence = this.context.getSequence();
    await this.fresh();
    this.ready = true;
    // get the decision prompt processed now, so the first real request doesn't wait for it
    this.warming = this.decide('hello').catch(() => {});
    return { file, gpu: this.llama.gpu, size: this.chosen, vramGB: Math.round(vram * 10) / 10 };
  }

  async fresh() {
    if (this.session) this.session.dispose({ disposeSequence: false });
    this.sequence.clearHistory();
    const mem = await this.host.memory().catch(() => ({}));
    this.session = new L.LlamaChatSession({ contextSequence: this.sequence, systemPrompt: persona(mem) });
    this.day = new Date().toDateString();
  }

  functions() {
    const h = this.host;
    return {
      do_task: L.defineChatSessionFunction({
        description: 'Do something on the user\'s PC. Write it as a short plain request, like "open roblox" or "play god did by dj khaled".',
        params: { type: 'object', properties: { request: { type: 'string' } } },
        handler: ({ request }) => h.task(request),
      }),
      get_weather: L.defineChatSessionFunction({
        description: 'Current weather and the next few days. Leave place empty for where the user lives.',
        params: { type: 'object', properties: { place: { type: 'string' } } },
        handler: ({ place }) => h.weather(place || null),
      }),
      get_time: L.defineChatSessionFunction({
        description: 'The current date and time.',
        handler: () => new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      }),
      remember: L.defineChatSessionFunction({
        description: 'Remember a fact about the user for later, like "their name is Sam" or "they love DJ Khaled".',
        params: { type: 'object', properties: { fact: { type: 'string' } } },
        handler: ({ fact }) => h.remember(fact),
      }),
    };
  }

  // onSentence(text) is called as each sentence is ready, so she can start
  // speaking before the whole reply is written
  async chat(text, onSentence, signal, { tools = true } = {}) {
    if (!this.ready) throw new Error('not ready');
    // a new conversation after a long break, or on a new day
    if (Date.now() - this.lastAt > 20 * 60000 || this.day !== new Date().toDateString()) await this.fresh();
    this.lastAt = Date.now();
    let buf = '', mood = 'cute';
    // "[excited] Ooh!" -> say "Ooh!" excitedly; a sentence without a tag keeps the last mood
    const say = (s) => {
      const tag = s.match(/^\[(\w+)\]\s*/);
      if (tag && MOODS.includes(tag[1].toLowerCase())) mood = tag[1].toLowerCase();
      const clean = s.replace(/\[\w+\]\s*/g, '').trim();
      if (clean && onSentence) onSentence(clean, mood);
    };
    const flush = (all) => {
      const re = all ? /^([\s\S]+)$/ : /^([\s\S]*?[.!?…]+["')\]]?)(\s+[\s\S]*)$/;
      let m;
      while ((m = buf.match(re))) {
        const s = m[1].trim();
        buf = all ? '' : m[2];
        if (s) say(s);
        if (all) break;
      }
    };
    let reply = '';
    try {
      reply = await this.session.prompt(text, {
        ...(tools ? { functions: this.functions() } : {}), maxTokens: 220, temperature: 0.7, signal, stopOnAbortSignal: true,
        onTextChunk: (c) => { buf += c; flush(false); },
      });
    } catch (e) { if (!(signal && signal.aborted)) throw e; } // stopped: you started talking again
    if (signal && signal.aborted) return '';
    flush(true);
    return reply.replace(/\[\w+\]\s*/g, '').trim();
  }

  // { kind, command, reply } for what was said; history: [{ role: 'user'|'assistant', content }]
  async decide(text, { history = [] } = {}, signal) {
    if (!this.ready) throw new Error('not ready');
    if (!this.dctx) {
      this.dctx = await this.model.createContext({ contextSize: 2048 });
      this.dseq = this.dctx.getSequence();
      this.dgrammar = await this.llama.createGrammarForJsonSchema(DECIDE_SCHEMA);
    }
    // (the sequence keeps what it already processed: a new session over it reuses the shared start)
    const session = new L.LlamaChatSession({ contextSequence: this.dseq, systemPrompt: DECIDE_SYSTEM });
    try {
      const past = history.slice(-6).map(h => h.role === 'user' ? { type: 'user', text: String(h.content).slice(0, 400) } : { type: 'model', response: [String(h.content).slice(0, 400)] });
      if (past.length) session.setChatHistory([{ type: 'system', text: DECIDE_SYSTEM }, ...past]);
      const before = this.dseq.tokenMeter ? this.dseq.tokenMeter.usedInputTokens : 0;
      const out = await session.prompt(String(text).slice(0, 500), { grammar: this.dgrammar, maxTokens: 200, temperature: 0.2, signal, stopOnAbortSignal: true });
      this.lastInputTokens = this.dseq.tokenMeter ? this.dseq.tokenMeter.usedInputTokens - before : null;   // (how much it had to read this time)
      try { return this.dgrammar.parse(out); } catch { return null; }   // (cut off mid-answer: treated as "not sure")
    } finally { session.dispose({ disposeSequence: false }); }
  }

  // fixes a misheard song or app name ("god did by dj cald" -> "God Did by DJ Khaled")
  async fixName(kind, heard) {
    if (!this.ready) return heard;
    const { LlamaCompletion } = L;
    if (!this.small) this.small = await this.model.createContext({ contextSize: 512 });
    const seq = this.small.getSequence();
    try {
      const done = new LlamaCompletion({ contextSequence: seq });
      const out = await done.generateCompletion(`Speech recognition sometimes mishears names. Write the most likely real ${kind} the person meant, and nothing else.\nHeard: play the weekend blinding lights\nMeant: The Weeknd Blinding Lights\nHeard: ${heard}\nMeant:`, { maxTokens: 24, temperature: 0, customStopTriggers: ['\n'] });
      const fixed = out.trim();
      return fixed && fixed.length < 80 && !/[^\x20-\x7E]/.test(fixed) ? fixed : heard;
    } catch { return heard; }
    finally { seq.dispose(); }
  }
}

module.exports = { Mind, persona };
