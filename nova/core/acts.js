// What kind of thing did you say? Runs before any command matching, so the shape of
// the sentence decides first:
//   command   an instruction, however it's phrased ("could you open up discord for me",
//             "would you mind opening spotify", "let's get discord going", "discord please")
//   negated   "don't open discord", "no need to launch spotify": never acted on
//   question  "why is discord slow", "is spotify running?": answered, never acted on
//   chat      "i love spotify", "discord has been so buggy lately", "i'm bored"
// Mixed sentences are split into clauses: "ugh fine, open discord" and "thanks! now open
// discord" do the instruction; "don't open discord, open spotify" opens only Spotify.
// Returns null when it has no opinion (the router and command brain carry on as before).
'use strict';
const talk = require('../brain/talk');

// verbs that start an instruction (after fillers and polite wrappers are removed)
const VERBS = 'open|launch|start|run|close|quit|exit|kill|play|put on|turn|set|show|find|search|look up|google|pull up|bring up|fire up|boot up|load|go to|take me to|mute|unmute|pause|resume|skip|remind|organi[sz]e|clean|take|lock|restart|shut down|switch|change|make|move|minimize|maximi[sz]e|type|save|write down|note|add|delete|remove|download|join|call|send|tell me a joke|dance|hide|get';
const VERB = new RegExp(`^(?:${VERBS})\\b`);
const GERUND = { opening: 'open', launching: 'launch', starting: 'start', running: 'run', closing: 'close', playing: 'play', putting: 'put', turning: 'turn', setting: 'set', showing: 'show', finding: 'find', searching: 'search', pulling: 'pull', bringing: 'bring', firing: 'fire', booting: 'boot', loading: 'load', muting: 'mute', pausing: 'pause', skipping: 'skip', getting: 'get', making: 'make', taking: 'take', moving: 'move', organizing: 'organize', cleaning: 'clean', locking: 'lock', closing_: 'close' };
// filler before an instruction ("yo", "ok so", "quick,", "go ahead and", "now", "also")
const LEAD_FILLER = /^(?:(?:hey|hi|yo|ok|okay|so|um+|uh+|uhh|alright|right|well|quick|real quick|quickly|ugh|fine|now|also|and|then|just|please|pls|plz|nova|hey nova|go ahead and|let me get you to|i need you to|i want you to|i'd like you to|could you please|can you please)\b[\s,]*)+/;
const TRAIL_FILLER = /(?:\s*,?\s*\b(?:please|pls|plz|for me|real quick|right now|now|thanks|thank you|thx|asap|if you can|when you get a chance)\b)+$/;
// polite wrappers around an instruction
const POLITE = /^(?:would you mind|do you mind|(?:can|could|would|will) you(?: please)?(?: also| just| quickly)?|why don'?t you|how about you|i need you to|i want you to|i'd like you to|you can|you should|try to|please)\s+/;
// "don't open discord", "no need to launch spotify", "i don't want you to open it"
const NEGATED = new RegExp(`^(?:(?:no|nah|nope)[,!]?\\s+)?(?:please\\s+)?(?:don'?t|do not|dont|never|no need to|there'?s no need to|you (?:don'?t|do not) (?:have|need) to|you don'?t need to|i (?:don'?t|do not) (?:want|need) (?:you )?to|stop trying to|quit trying to)\\s+(?:(?:go ahead and|bother|actually|even)\\s+)?((?:${VERBS})\\b.*)$`);
// "open discord, actually don't" / "… on second thought, never mind"
const TAKE_BACK = /^(.+?)[,;.!]*\s+(?:actually|wait|no wait|on second thought|hmm)[,]?\s+(?:don'?t|do not|dont|never ?mind|forget it|cancel(?: that)?|no)(?:\s+(?:do (?:that|it)|open it|bother))?$/;
// questions (not polite requests)
const WH = /^(?:why|what|what's|whats|how|how's|where|where's|when|who|who's|which|whose)\b/;
const AUX = /^(?:is|isn't|are|aren't|was|were|does|doesn't|do|did|didn't|has|have|had|should|will|would|can|could|won't)\s+(?!you\b|u\b)\S/;
// a statement about something ("discord has been so buggy", "spotify keeps playing ads")
const STATEMENT_VERB = /^(?:[\w'.-]+\s+){0,3}?(?:is|isn't|was|wasn't|are|aren't|were|has|hasn't|have|haven't|had|keeps|kept|won't|doesn't|didn't|can't|cannot|sucks|crashed|crashes|lags|lagged|froze|freezes|updates|updated|looks|seems|feels|sounds|got|gets|went|goes|just|always|never|literally|really|be)\b/;
const IMPLICIT = [
  [/\b(?:too|so|way too|really) loud\b|\bhurts my ears\b/, 'turn the volume down'],
  [/\b(?:too|so|really) quiet\b|\bcan'?t hear (?:it|anything|the music|that)\b/, 'turn the volume up'],
];

const norm = (t) => String(t || '').toLowerCase().replace(/[’`]/g, "'").replace(/\bu\b/g, 'you').replace(/\bur\b/g, 'your').replace(/\bpls\b|\bplz\b/g, 'please').replace(/\s+/g, ' ').trim();
function strip(c) {
  let t = c.replace(LEAD_FILLER, '').replace(TRAIL_FILLER, '').replace(/[.!?,;]+$/, '').trim();
  t = t.replace(POLITE, '').replace(LEAD_FILLER, '').trim();
  const g = t.match(/^(\w+ing)\b(.*)$/);
  if (g && GERUND[g[1]]) t = GERUND[g[1]] + g[2];
  // "i want to listen to drake" -> "play drake"; "i wanna open spotify" -> "open spotify"
  const wish = t.match(/^(?:i (?:want|need|would like|'d like) to|i wanna|i gotta|i have to|let me|lemme)\s+((?:open|launch|start|play|listen to|hear|watch|put on|turn|set|find|search|look up|google|go to|mute|pause|skip|close|lock|organi[sz]e|clean)\b.*)$/);
  if (wish) t = wish[1].replace(/^(?:listen to|hear)\s+/, 'play ');
  // "open the discord app" -> "open discord"
  t = t.replace(/^((?:open|launch|start|close|quit|exit)(?: up)?) (?:the |my )?(.+?) (?:app|application|program)$/, '$1 $2');
  return t;
}

// one clause: what is it?
function clause(raw, isApp) {
  const c = norm(raw).replace(/[.!?]+$/, '');
  if (!c) return { kind: 'empty' };
  const neg = c.replace(LEAD_FILLER, '').match(NEGATED);
  if (neg) return { kind: 'negated', what: neg[1].replace(TRAIL_FILLER, '').trim() };
  for (const [re, cmd] of IMPLICIT) if (re.test(c)) return { kind: 'command', text: cmd };
  // a polite request is an instruction even though it's shaped like a question
  const politeShape = /^(?:(?:hey|yo|ok|okay|so|nova)\b[\s,]*)*(?:(?:can|could|would|will) you|would you mind|do you mind|why don'?t you|how about you)\b/.test(c);
  const s = strip(c);
  if (!s) return { kind: 'chat' };
  if (VERB.test(s) && (politeShape || !WH.test(c) && !AUX.test(c))) return { kind: 'command', text: s };
  // wants: "i need discord", "i want discord open", "can i get discord", "let's get discord going", "get spotify open", "discord please"
  const want = s.match(/^(?:i (?:need|want|wanna have|would like)|can i (?:get|have)|could i (?:get|have)|let'?s (?:get|have)|gimme|give me)\s+(.+?)(?:\s+(?:open|opened|up|going|running|started|on))?$/)
    || s.match(/^(?:let'?s|get)\s+(.+?)\s+(?:open|opened|up|going|running|started)$/)
    || s.match(/^(?:throw|put)\s+(.+?)\s+up$/);
  if (want && isApp(want[1].replace(/^(?:the|my)\s+/, '').replace(/\s+app$/, ''))) return { kind: 'command', text: 'open ' + want[1].replace(/^(?:the|my)\s+/, '').replace(/\s+app$/, '') };
  if (isApp(s.replace(/^(?:the|my)\s+/, '').replace(/\s+app$/, '')) && (s !== c || /\b(?:please|pls|plz)\b/.test(c) || c.split(' ').length <= 2)) return { kind: 'command', text: 'open ' + s.replace(/^(?:the|my)\s+/, '').replace(/\s+app$/, '') };
  if (politeShape && /^(?:tell|help|show) me\b/.test(s)) return { kind: 'question' };
  // "can you hear me", "can you speak spanish", "could you understand that": about her, not a task
  if (politeShape && /^(?:hear|see|understand|speak|read|remember|feel|think|learn|talk|do that|do this)\b/.test(s)) return { kind: 'question' };
  if (politeShape) return { kind: 'request' };   // "can you sort that": a request, in words the command brain may not know
  if (WH.test(c) || AUX.test(c) || /\?$/.test(raw.trim())) return { kind: 'question' };
  if (talk.reply(c) || talk.isChatty(c)) return { kind: 'chat' };
  if (/^(?:lol|lmao|haha+|ugh+|fine|ok|okay|thanks|thank you|ty|cool|nice|yay|omg|bruh|alright|sure|yes|yeah|good morning|morning|hi|hey|hello|yo)\b/.test(c) && c.split(' ').length <= 4) return { kind: 'chat' };
  if (STATEMENT_VERB.test(c) && !VERB.test(c)) return { kind: 'chat' };
  // someone doing or having something ("my friend sent me a link", "we watched it last night")
  if (/^(?:my|our|his|her|their|he|she|they|we|it|i|someone|somebody|everyone|nobody|people)\b/.test(c)) return { kind: 'chat' };
  return { kind: 'other', text: s };
}

// the whole utterance
function analyze(text, { isApp = () => false } = {}) {
  const t = norm(text);
  if (!t) return null;
  const back = t.match(TAKE_BACK);
  if (back) return { kind: 'negated', what: strip(back[1]) };
  // split into clauses at punctuation, and where chat runs into a request ("i'm bored can you put on music")
  let parts = t.split(/\s*[,;!?.]+\s+|\s*[!?]+\s*|\s+(?:and then|then)\s+(?=(?:can you|could you|please|open|launch|start|play|put|turn|set|close|find|search|show|pull|bring|fire)\b)/).filter(Boolean);
  parts = parts.flatMap((p) => {
    if (NEGATED.test(p.replace(LEAD_FILLER, ''))) return [p];
    const sp = talk.split(p); if (sp) return [sp.chat, sp.request];
    const pol = p.match(/^(.+?)\s+((?:can|could|would|will) you\b.*)$/);   // "my pc is a mess can you sort that"
    return pol && !/^(?:how|what|why|where|when|who)\b/.test(pol[1]) ? [pol[1], pol[2]] : [p];
  });
  const cs = parts.map(p => ({ raw: p, ...clause(p, isApp) }));
  const cmds = cs.filter(c => c.kind === 'command');
  if (!cmds.length && cs.some(c => c.kind === 'request')) return { kind: 'request' };   // (the whole sentence goes on, so a chat brain sees the context)
  if (cmds.length) {
    const negs = cs.filter(c => c.kind === 'negated');
    return { kind: 'command', text: cmds.map(c => c.text).join(' and '), skipped: negs.map(c => c.what), mixed: cs.length > 1 };
  }
  const negs = cs.filter(c => c.kind === 'negated');
  if (negs.length) return { kind: 'negated', what: negs[0].what };
  const others = cs.filter(c => c.kind !== 'chat' && c.kind !== 'empty');
  if (!others.length) return { kind: 'chat' };
  if (others[0].kind === 'question') return { kind: 'question' };
  return null;   // (something else: the router, the command brain and, if on, the chat brain see all of it)
}

// "Okay, I won't open Discord."
function wontSay(what) {
  const w = String(what || '').replace(/\b(it|that)\b/, 'it').trim();
  if (!w || /^(?:do (?:that|it)|it|that)$/.test(w)) return "Okay, I won't. 👍";
  return `Okay, I won't ${w.replace(/\b([a-z])(\w*)$/, (m) => m)}. 👍`;
}

// "open discord, actually don't": checked before corrections, which would read it as "don't"
const takeBack = (text) => { const m = norm(text).match(TAKE_BACK); return m ? { kind: 'negated', what: strip(m[1]) } : null; };

module.exports = { analyze, clause, wontSay, strip, takeBack };
