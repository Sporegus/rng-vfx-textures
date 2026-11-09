// The quick, deterministic part of Nova's understanding. It runs before
// anything slow, on every final transcript or typed line, and catches:
//   stop / cancel            -> handled at once, never queued behind a model
//   corrections              -> "no, Spotify", "open Discord, actually Spotify", "I meant the other window"
//   status and job control   -> "what are you doing?", "pause everything", "resume that task"
//   core abilities the older command brain doesn't know (windows, screen, Discord,
//   research, coordination jobs, games, memory)
//   questions                -> answered by the language model (or research), not by opening Google
// Everything else goes to the existing command brain (brain/brain.js).
'use strict';

// swearing used for emphasis ("get the fuck out of the way") isn't part of what you want done
const CURSE = /\b(?:the )?(?:fuck(?:ing|in'?)?|f\*+k(?:ing)?|freaking|frickin'?|friggin'?|bloody|goddamn|damn(?:ed)?|the hell|the heck)\b/gi;
const clean = (t) => String(t || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim().replace(/^(hey |ok |okay )?nova[,!.: ]*/i, '').replace(CURSE, ' ').replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim();

const STOP = /^(stop|stop it|stop that|stop everything|cancel|cancel (that|it|everything)|abort|halt|never ?mind|forget it|quit it|freeze|hold on|wait stop|nova stop)$/i;
// "X, actually Y" / "X no wait Y" / "X I mean Y" inside one utterance
const MID_CORRECTION = /^(.+?)[,;.]?\s+(?:actually|no wait|wait no|i mean|i meant|or rather|scratch that|no make (?:it|that))[,]?\s+(.+)$/i;
// a whole utterance that corrects the last one
const CORRECTION = /^(?:no|nope|nah|not that|wrong|actually|i meant|i mean|wait|no wait|sorry)[,!.]?\s+(?:i meant |i mean |make it |use )?(.+)$/i;
const QUESTION = /^(what|whats|what's|why|how|who|whos|who's|when|where|which|explain|tell me about|define|describe)\b/i;
// "do/is/can..." starts a question only with a subject after it ("do you know", "is it raining") or a question mark
const AUX_QUESTION = /^(is|are|was|were|can|could|does|do|did|should|would|will|has|have)\s+(you|i|we|they|it|he|she|there|this|that|these|those)\b/i;
const CURRENT = /\b(today|tonight|now|current|currently|latest|newest|recent|this week|this year|news|price|prices|cost|score|scores|weather|stock|release date|patch|update|version|202\d)\b/i;

function route(raw, ctx = {}) {
  const text = clean(raw);
  const low = text.toLowerCase();
  if (!text) return { kind: 'empty' };
  if (STOP.test(low)) return { kind: 'stop' };
  // "wait": drop what's pending right now (an open question or approval), but don't pause background jobs
  if (/^(?:wait|hold on|hang on|one sec(?:ond)?|wait a (?:sec(?:ond)?|minute|moment))[.!]?$/i.test(low)) return { kind: 'hold' };

  // ---- corrections
  const mid = text.match(MID_CORRECTION);
  if (mid && mid[2].split(' ').length <= 8) return { kind: 'correction', replaces: mid[1], text: rebuild(mid[1], mid[2], ctx), raw: text };
  const corr = text.match(CORRECTION);
  if (corr && ctx.last && Date.now() - (ctx.last.at || 0) < 120000 && corr[1].split(' ').length <= 6) {
    return { kind: 'correction', text: rebuild(ctx.last.text || '', corr[1], ctx), raw: text };
  }

  // ---- status and job control
  if (/^(what are you doing|what're you doing|what are you working on|status|what's going on|whats going on|are you busy)\b/i.test(low)) return { kind: 'status', what: 'doing' };
  if (/^(what have you (finished|done|completed)|what did you (finish|do|get done)|what (finished|got done|happened) (while|when) i was (away|gone|asleep|out)|what did i miss|morning (digest|report)|any updates)\b/i.test(low)) return { kind: 'status', what: 'finished' };
  if (/^(pause|pause everything|pause all|pause all tasks|pause the task|hold everything)$/i.test(low)) return { kind: 'jobs', op: 'pause_all' };
  if (/^(resume|resume (that|the|it|my|this) ?(last )?(task|job)?|resume (the )?last (task|job)|continue (that|the|the last) (task|job)|keep going)$/i.test(low)) return { kind: 'jobs', op: 'resume_last' };
  if (/^(finish (the|this) (current )?(safe )?step( and stop)?|wrap up)$/i.test(low)) return { kind: 'jobs', op: 'finish_step' };
  if (/^(show|open) (the )?(tasks?|task panel|dashboard|jobs?)( panel)?$/i.test(low)) return { kind: 'panel', tab: 'tasks' };
  if (/^(show|open) (the )?(diagnostics|settings|capabilities)$/i.test(low)) return { kind: 'panel', tab: /settings|capab/i.test(low) ? 'settings' : 'diagnostics' };
  if (/^(what do you (remember|know) about me|show (my )?memory)$/i.test(low)) return { kind: 'panel', tab: 'memory' };

  // ---- coordination jobs
  if (/\bcoordinate\b.*\b(chatgpt|claude|gpt|assistants?)\b/i.test(low) || /\b(relay|hand off|handoff)\b.*\b(chatgpt|claude)\b/i.test(low)) return { kind: 'job', template: 'coordination', text };

  // ---- Discord
  const openOn = text.match(/^(?:open|go to|take me to|show me)\s+(?:the\s+)?(.+?)\s+(?:on|in)\s+discord$/i);
  if (openOn) return { kind: 'discord', text, alias: openOn[1].replace(/\s+(channel|server|call|chat)$/i, ''), open: true, join: false, call: false, question: null };
  if (/\bdiscord\b/i.test(low) && /\b(join|call|voice|channel|ask|tell|message|post|say)\b/i.test(low) && !/^open discord$/i.test(low)) {
    return { kind: 'discord', text, ...parseDiscord(text) };
  }

  // ---- windows
  const mv = low.match(/\b(?:put|move|send|throw|drag)\b\s+(?:(that|this|the|my) )?(?:(.+?) )?window\b.*\b(other|second|2nd|left|right|main|primary|next|first|1st|third|3rd) (monitor|screen|display)\b/);
  if (mv) return { kind: 'tool', calls: [{ tool: 'window.move', args: { which: mv[2] && !/^(that|this|the|my)$/.test(mv[2]) ? mv[2] : 'that', to: mv[3] } }] };
  if (/\b(minimi[sz]e|maximi[sz]e|snap)\b.*\bwindow\b/.test(low)) {
    const op = /minim/.test(low) ? 'minimize' : /maxim/.test(low) ? 'maximize' : /left/.test(low) ? 'snap_left' : 'snap_right';
    return { kind: 'tool', calls: [{ tool: 'window.arrange', args: { which: 'that', op } }] };
  }

  // ---- the screen (needs your screen permission)
  if (/^(?:(?:can you |please )?(?:explain|tell me|describe|look at)\s+)?(what am i looking at|what'?s on (my|the) screen|what is on (my|the) screen|(my|the|this) screen|what is this( window)?|what'?s this)\??$/i.test(low)) return { kind: 'screen', ask: 'describe', text };
  if (/\b(explain|what does|what's|what is)\b.*\b(error|warning|exception|message|popup|pop-up|dialog)\b/i.test(low)) return { kind: 'screen', ask: 'explain', text };
  if (/^(read|read me|read out) (the |this |my )?(selected|selection|highlighted)( text)?$/i.test(low)) return { kind: 'screen', ask: 'selection', text };
  const find = low.match(/^(?:help me )?(?:find|where is|where's|show me) (?:the )?(.+?) (button|menu|tab|option|setting|icon|link)$/);
  if (find) return { kind: 'screen', ask: 'find', target: `${find[1]} ${find[2]}`, text };

  // ---- about Nova herself: move aside or hide
  if (/^(?:(?:get|move|go|step) )?(?:out of (?:the|my) way|outta (?:the|my) way)$|^(?:move|scoot|shift|step)(?: over| aside| away| to the side| out of the way)?$|^(?:you'?re|youre|you are) in (?:the|my) way$|^(?:get|move) (?:off|away from) (?:my|the) (?:screen|window|stuff)$|^(?:move|go) to the (?:other|left|right) side$/i.test(low)) return { kind: 'self', op: 'move', text };
  if (/^(?:go away|hide|go hide|hide yourself|disappear|vanish|leave me alone|get lost)$/i.test(low)) return { kind: 'self', op: 'hide', text };

  // ---- answering her own pending question by position ("the second option", "the first one")
  const nth = low.match(/^(?:(?:do|pick|choose|take|go with|use|select)\s+)?(?:the\s+)?(first|second|third|fourth|last|1st|2nd|3rd|4th)\s+(?:one|option|choice)$/);
  if (nth) return { kind: 'pick', index: { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, last: -1 }[nth[1]], text };

  // ---- reading your own file ("summarize C:\\…\\report.pdf", "summarize the file I copied")
  const readFile = text.match(/^(?:summari[sz]e|read|open and summari[sz]e|what(?:'s| is) in|tell me about|analy[sz]e)\s+(?:the\s+)?(?:file|document|pdf|spreadsheet|workbook|report)?\s*(?:at|in|called)?\s*["“]?((?:[a-zA-Z]:\\|\/|~\/)[^"”]+?\.(?:pdf|docx|xlsx|csv|txt|md|json|log))["”]?\??$/i);
  if (readFile) return { kind: 'readfile', path: readFile[1], text };
  if (/^(?:summari[sz]e|read|analy[sz]e|what(?:'s| is) in)\s+(?:the\s+|this\s+)?(?:file|document|pdf|spreadsheet|workbook)\s+(?:i\s+)?(?:copied|on my clipboard)\??$/i.test(low)) return { kind: 'readfile', path: null, clipboard: true, text };

  // ---- documents and tables in a real format
  const fmtWord = '(pdf|word(?: doc(?:ument)?)?|docx|excel(?: (?:file|sheet|spreadsheet))?|spreadsheet|xlsx|csv|markdown|md|chart|bar chart)';
  const docMake = low.match(new RegExp('^(?:please\\s+)?(?:make|create|generate|build|export|save|turn|put|write)\\b.*?\\b(?:as|into|to|in)\\s+(?:a\\s+|an\\s+)?' + fmtWord + '\\b')) || low.match(new RegExp('^(?:please\\s+)?(?:make|create|generate|build)\\s+(?:me\\s+)?(?:a\\s+|an\\s+)?' + fmtWord + '\\b'));
  if (docMake) {
    const f = docMake[1];
    const format = /pdf/.test(f) ? 'pdf' : /word|docx/.test(f) ? 'docx' : /excel|spreadsheet|xlsx/.test(f) ? 'xlsx' : /csv/.test(f) ? 'csv' : /chart/.test(f) ? 'svg' : 'md';
    return { kind: 'document', format, fromLast: /\b(that|this|it|the answer|your answer|the report|the research|what you (?:said|found))\b/.test(low.replace(/\bthat (?:shows|lists|compares|has)\b/, '')), text };
  }

  // ---- duplicates (by content)
  const dup = low.match(/\b(?:find|show|look for|check for|any)\b.*\bduplicates?\b(?:.*\b(?:in|from|on)\s+(?:my\s+|the\s+)?(downloads|desktop|documents|pictures|photos|music|videos))?/) || low.match(/\bduplicate (?:files|photos|pictures|images|songs)\b(?:.*\b(?:in|from|on)\s+(?:my\s+|the\s+)?(downloads|desktop|documents|pictures|photos|music|videos))?/);
  if (dup) return { kind: 'files', op: 'duplicates', folder: (dup[1] || 'downloads').replace('photos', 'pictures'), text };

  // ---- reminders and what you missed
  const remCancel = text.match(/^(?:cancel|delete|remove|clear)\s+(?:my\s+|the\s+|all\s+(?:my\s+)?)?reminders?(?:\s+(?:to|about|for)\s+(.+?))?[.!]?$/i);
  if (remCancel) return { kind: 'reminders', op: 'cancel', match: remCancel[1] || null, text };
  if (/^(?:what|which|show(?: me)?|list)\s+(?:are\s+)?(?:my\s+)?reminders(?:\s+do i have)?\??$/i.test(low) || /^what reminders do i have\??$/i.test(low)) return { kind: 'reminders', op: 'list', text };
  if (/^(?:what did i miss|what'?d i miss|anything new|catch me up|what happened (?:while i was (?:away|gone|asleep|out)))\??$/i.test(low)) return { kind: 'notifications', text };

  // ---- routines / modes ("start gaming mode", "end study mode", "save that as my stream setup")
  const wfRun = text.match(/^(?:start|run|begin|enter|switch to|activate|turn on|go into)\s+(?:my\s+|the\s+)?(.+?)\s+(?:mode|preset|workflow|routine)[.!]?$/i);
  if (wfRun && !/\b(until|record|replay)\b/i.test(low)) return { kind: 'workflow', op: 'run', name: wfRun[1].trim(), text };
  const wfEnd = text.match(/^(?:end|stop|exit|leave|undo|turn off|finish)\s+(?:my\s+|the\s+)?(.+?)\s+(?:mode|preset|workflow|routine)[.!]?$/i);
  if (wfEnd) return { kind: 'workflow', op: 'end', name: wfEnd[1].trim(), text };
  const wfSave = text.match(/^save (?:that|this|it|what you (?:just )?did) as (?:a |my |the )?(.+?)(?:\s+(?:routine|workflow|mode|preset))?[.!]?$/i);
  if (wfSave) return { kind: 'workflow', op: 'save', name: wfSave[1].trim(), text };

  // ---- projects and saved references
  const proj = text.match(/^(?:let'?s|lets|i want to|time to|can we)\s+(?:work on|open|continue(?: with)?|get back to|switch to)\s+(?:the\s+|my\s+)?(.+?)(?:\s+project)?[.!]?$/i) || text.match(/^(?:open|switch to|load)\s+(?:the\s+|my\s+)?project\s+(.+?)[.!]?$/i) || text.match(/^(?:open|switch to|load)\s+(?:the\s+|my\s+)?(.+?)\s+project[.!]?$/i);
  if (proj) return { kind: 'project', name: proj[1].trim(), text };
  if (/\breferences?\b/i.test(low) || /^(?:save|remember|keep)\s+(?:this|that)\s+(?:link|image|picture|page|file|screenshot)\b/i.test(low)) {
    const save = text.match(/^(?:save|remember|keep|store)\s+(?:this|that|the)?\s*(link|image|picture|page|file|screenshot|it)?\s*(?:as\s+(?:an?\s+)?(.+?)\s+reference|for\s+(?:the\s+)?(.+?))?(?:\s+(?:in|for)\s+(?:the\s+)?(.+?)(?:\s+project)?)?[.!]?$/i);
    if (save && /^(save|remember|keep|store)\b/i.test(low)) return { kind: 'reference', op: 'save', what: (save[1] || 'it').toLowerCase(), tag: (save[2] || save[3] || '').trim() || null, project: save[4] || null, text };
    const find2 = text.match(/^(?:find|show|get|open|where(?:'s| is))\s+(?:me\s+)?(?:the\s+|my\s+)?(.+?)\s+references?(?:\s+i\s+saved)?[?.!]?$/i) || text.match(/^(?:find|show|get|open)\s+(?:me\s+)?(?:the\s+|my\s+)?(?:references?|refs?)\s+(?:for|about|of)\s+(.+?)[?.!]?$/i);
    if (find2) return { kind: 'reference', op: 'find', query: find2[1].trim(), text };
  }

  // ---- troubleshooting ("why isn't this working?", "check again", "fix it")
  if (/^(?:check (?:it )?again|run the check again|is it fixed(?: now)?|did that (?:fix|work)(?: it)?)\??$/i.test(low)) return { kind: 'troubleshoot', op: 'recheck', text };
  if (/^(?:fix it|fix that|try to fix it|can you fix it)\??$/i.test(low)) return { kind: 'troubleshoot', op: 'fix', text };
  if (/^(?:why (?:is|isn'?t|is not|does|doesn'?t|does not|won'?t|will not|can'?t|cannot|did|didn'?t)|what'?s wrong with|how (?:do|can) i fix|help me fix|fix)\b.*\b(work|working|load|loading|open|opening|start|starting|launch|crash|crashing|broken|error|errors|fail|failing|freez\w*|lag\w*|run|running)\b/i.test(low)) return { kind: 'troubleshoot', text };

  // ---- writing, rewriting, translating, summarizing: a model's job, not a command
  if (/^(?:please\s+|can you\s+|could you\s+)?(?:write|draft|compose|rewrite|reword|translate|summari[sz]e|proofread|brainstorm|outline|paraphrase)\b/i.test(low) && !/^(?:please\s+)?write (?:down|this down|that down|a note|me a note|it down)\b/i.test(low)) return { kind: 'compose', text };

  // ---- research (before games: "look up roblox studio ... cite sources" is research)
  if (/^(research|investigate|look into|find out|compare)\b/i.test(low) || /^look up\b.*\b(cite|sources?)\b/i.test(low)) return { kind: 'research', question: text.replace(/^(research|investigate|look into|look up|find out|compare)\s+/i, '').replace(/\s+(and|with) (cite|give me|show|list) (the |your )?sources\.?$|\s+and cite (them|it|sources)\.?$/i, ''), text };

  // ---- games
  if (/^(?:my goal (?:in|for)|track (?:a |my )?goal (?:in|for)|set (?:a |my )?goal (?:in|for))\s+.+?\s+(?:is|:|to)\s+.+$/i.test(text) || /^(?:what are|show|list) my (?:game )?goals(?: (?:in|for) .+)?\??$/i.test(low)) return { kind: 'game', text };
  if (/\broblox\b/i.test(low) && /\b(join|experience|game|play)\b/i.test(low) && !/^(open|launch|start) roblox$/i.test(low)) return { kind: 'game', text };
  if (/\broblox\b/i.test(low) && !/^(open|launch|start) roblox$/i.test(low)) return { kind: 'game', text };
  if (/\b(aim ?bot|executor|anti-?afk|wall ?hack|cheat engine|speed ?hack|dupe glitch)\b/i.test(low)) return { kind: 'game', text };
  if (/\broutines?\b/i.test(low) && /\b(record|replay|run|play|do|repeat)\b/i.test(low)) return { kind: 'game', text };
  if (/\b(test|fixture|coin) game\b/i.test(low)) return { kind: 'game', text };
  if (/\b(play|beat|grind|farm|repeat)\b.*\b(game|level|objective|until|counter|times)\b/i.test(low)) return { kind: 'game', text };

  // ---- questions: answered, not googled
  if ((QUESTION.test(low) || AUX_QUESTION.test(low) || /\?$/.test(text)) && !/^(can you|could you|would you|will you) (open|launch|start|play|find|close|turn|set|organi[sz]e|clean|show|move|put)\b/i.test(low)) {
    return { kind: 'question', text, current: CURRENT.test(low) };
  }
  return { kind: 'command', text };
}

// "open Discord" + "Spotify" -> "open Spotify"; "find my resume" + "the cover letter" -> "find my the cover letter"
function rebuild(before, after, ctx) {
  const a = clean(after);
  // a full command on its own: use it as is
  if (/^(open|launch|start|close|play|find|search|google|move|put|organi[sz]e|clean|show|turn|set|remind|join|ask|tell)\b/i.test(a)) return a;
  const b = clean(before);
  const verb = b.match(/^(open|launch|start|close|play|find|search for|google|show me|show)\b/i);
  if (verb) return `${verb[1]} ${a}`;
  if (ctx.last && ctx.last.verb) return `${ctx.last.verb} ${a}`;
  return a;
}

// "join Discord Afterparty call and ask the boys what we're playing"
function parseDiscord(text) {
  const low = text.toLowerCase();
  const join = /\b(join|hop in|get in|connect to)\b/.test(low);
  const call = /\b(call|voice|vc)\b/.test(low);
  const alias = (text.match(/discord\s+(?:server\s+|channel\s+)?([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*|\w+)\s+(?:call|voice|vc|channel|server|chat)/i)
    || text.match(/\b(?:the\s+)?([A-Z][\w'-]+)\s+(?:call|voice chat|vc|channel)\b/) || [])[1] || null;
  const ask = text.match(/\b(?:ask|tell)\s+(?:the boys|everyone|them|the group|the guys|people|chat)?\s*(.+)$/i);
  let question = ask ? ask[1].replace(/^(if|whether)\s+/i, '').trim() : null;
  if (question) {
    question = question.replace(/\bwe're\b/gi, 'we are').replace(/\bwhat we are\b/i, 'what are we').replace(/\bwhat we're\b/i, 'what are we');
    if (!/[?.!]$/.test(question)) question += '?';
    question = question[0].toUpperCase() + question.slice(1);
  }
  return { alias: alias && !/^(the|a|my|our)$/i.test(alias) ? alias : null, join, call, question };
}

module.exports = { route, clean, rebuild, parseDiscord };
