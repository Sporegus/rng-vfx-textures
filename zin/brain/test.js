// Tests Zin's brain on requests written separately from her training examples
// (with typos, slang and run-on requests). Run: node brain/test.js
const brain = require('./brain');

// [what you type, expected intent(s), optional check on the details]
const CASES = [
  // files
  ['where tf is my resume', 'files.find', s => s.query === 'resume'],
  ['can u find the pdf for my car insurance', 'files.find', s => /car insurance/.test(s.query)],
  ['i lost my essay help', 'files.find'],
  ['find homework doc', 'files.find', s => /homework/.test(s.query)],
  ['look for vacation pics', 'files.find', s => /vacation/.test(s.query)],
  ['search for invoice 2023', 'files.find', s => /invoice/.test(s.query)],
  ['wheres my tax stuff', 'files.find', s => /tax/.test(s.query)],
  ['what was i working on yesterday', 'files.recent'],
  ['show recently opened files', 'files.recent'],
  ['whats hogging all my disk space', 'files.big'],
  ['which files are the largest', 'files.big'],
  ['get rid of stuff i havent opened in forever', 'files.old'],
  ['find old junk in my downloads i never use', 'files.old', s => s.folder === 'downloads'],
  ['open downloads', 'folder.open', s => s.folder === 'downloads'],
  ['show me my desktop folder', 'folder.open', s => s.folder === 'desktop'],
  ['open my pics', 'folder.open', s => s.folder === 'pictures'],
  ['organise my downloads', 'organize', s => s.folder === 'downloads' && s.mode === 'type'],
  ['sort my desktop a-z', 'organize', s => s.folder === 'desktop' && s.mode === 'alpha'],
  ['put documents in alphabetical order', 'organize', s => s.folder === 'documents' && s.mode === 'alpha'],
  ['clean up my desktop its so messy', 'organize', s => s.folder === 'desktop'],
  ['sort my pictures by date', 'organize', s => s.folder === 'pictures' && s.mode === 'date'],
  ['my downloads folder is a disaster', 'organize', s => s.folder === 'downloads'],
  ['undo that sort', 'organize.undo'],
  ['put my stuff back', 'organize.undo'],
  ['free up some space on my pc', 'clean.junk'],
  ['my computer is out of storage', 'clean.junk'],
  ['empty recycle bin', 'clean.junk'],
  ['delete temp files', 'clean.junk'],
  ['find duplicate photos', 'files.dupes'],
  ['convert my heic pictures to jpg', 'files.convert'],

  // apps and web
  ['open discord', 'app.open', s => s.apps[0] === 'discord'],
  ['open spotify', 'app.open', s => s.apps[0] === 'spotify'],
  ['launch steam pls', 'app.open', s => s.apps[0] === 'steam'],
  ['can you open up google chrome for me', 'app.open', s => s.apps[0] === 'google chrome'],
  ['start minecraft', 'app.open', s => s.apps[0] === 'minecraft'],
  ['fire up vs code', 'app.open', s => s.apps[0] === 'vs code'],
  ['open word and excel', 'app.open', s => s.apps.length === 2],
  ['open the calculator', 'app.open', s => s.apps[0] === 'calculator'],
  ['opne discrod', 'app.open'],
  ['close chrome', 'app.close', s => s.apps[0] === 'chrome'],
  ['quit steam', 'app.close', s => s.apps[0] === 'steam'],
  ['kill discord its frozen', 'app.close'],
  ['open youtube', 'web.open', s => s.sites[0].url.includes('youtube')],
  ['go to reddit', 'web.open', s => s.sites[0].name === 'reddit'],
  ['take me to netflix', 'web.open'],
  ['open github.com', 'web.open', s => s.sites[0].url === 'https://github.com'],
  ['google how to tie a tie', 'web.search', s => s.query === 'how to tie a tie' && s.engine === 'google'],
  ['look up the weather in chicago', 'weather', s => s.place === 'chicago'],
  ['search youtube for lofi hip hop', 'web.search', s => s.engine === 'youtube' && /lofi/.test(s.query)],
  ['how do i fix a flat tire', 'web.search'],

  // music
  ['play blinding lights by the weeknd', 'music.play', s => /blinding lights/.test(s.song)],
  ['play some drake', 'music.play', s => s.song === 'drake'],
  ['put on my liked songs on spotify', 'music.play', s => /liked songs/.test(s.song)],
  ['play my chill playlist', 'music.play', s => s.kind === 'playlist'],
  ['i wanna listen to taylor swift', 'music.play', s => /taylor swift/.test(s.song)],
  ['play music', 'music.play', s => s.song === null],
  ['skip this song', 'media.control', s => s.cmd === 'next'],
  ['next', 'media.control', s => s.cmd === 'next'],
  ['pause the music', 'media.control', s => s.cmd === 'pause'],
  ['play', 'media.control', s => s.cmd === 'play'],
  ['go back to the last song', 'media.control', s => s.cmd === 'prev'],
  ['turn it up', 'volume', s => s.cmd === 'up'],
  ['its way too loud', 'volume', s => s.cmd === 'down'],
  ['turn the volume down a bit', 'volume', s => s.cmd === 'down' && s.steps === 2],
  ['set the volume to 30', 'volume', s => s.cmd === 'set' && s.level === 30],
  ['mute', 'volume', s => s.cmd === 'mute'],

  // PC
  ['hows my computer doing', 'pc.stats'],
  ['how much battery do i have', 'pc.stats'],
  ['my pc is slow', 'pc.stats'],
  ['switch to dark mode', 'theme', s => s.mode === 'dark'],
  ['light theme please', 'theme', s => s.mode === 'light'],
  ['change wallpaper to space', 'wallpaper', s => s.style === 'space'],
  ['i want a new background', 'wallpaper'],
  ['put my old background back', 'wallpaper', s => s.style === 'restore'],
  ['take a screenshot', 'screenshot'],
  ['screenshot this', 'screenshot'],
  ['lock my computer', 'pc.lock'],
  ['shut down my pc in 30 minutes', 'power', s => s.kind === 'shutdown' && s.delay === 1800],
  ['restart the computer', 'power', s => s.kind === 'restart'],
  ['turn off the computer', 'power', s => s.kind === 'shutdown'],
  ['cancel the shutdown', 'power', s => s.kind === 'cancel'],

  // time
  ['set a timer for 10 minutes', 'timer', s => s.seconds === 600],
  ['timer 5 min', 'timer', s => s.seconds === 300],
  ['25 minute timer', 'timer', s => s.seconds === 1500],
  ['start a pomodoro', 'timer', s => s.seconds === 1500 && s.label === 'Focus'],
  ['give me a 2 hour timer', 'timer', s => s.seconds === 7200],
  ['timer for half an hour', 'timer', s => s.seconds === 1800],
  ['remind me to call mom in 20 minutes', 'reminder', s => s.text === 'call mom' && s.when.in === 1200],
  ['remind me in an hour to take my pills', 'reminder', s => s.text === 'take my pills' && s.when.in === 3600],
  ['remind me at 5pm to pick up the kids', 'reminder', s => s.text === 'pick up the kids' && s.when.at.h === 17],
  ['dont let me forget to email jake tomorrow at 9', 'reminder', s => /email jake/.test(s.text) && s.when.at.day === 1],
  ['remind me to stretch', 'reminder', s => s.text === 'stretch'],
  ['remind me tonight about the game', 'reminder', s => s.text === 'the game' && s.when.at.h === 20],
  ['note buy eggs and bread', 'note.add', s => s.text === 'buy eggs and bread'],
  ['write down that the meeting moved to thursday', 'note.add', s => /meeting moved/.test(s.text)],
  ['jot this down: password hint is my dog', 'note.add'],
  ['show my notes', 'notes.open'],

  // email
  ['any new emails', 'email.check'],
  ['did i get mail', 'email.check'],

  // fun and chat
  ['dance!!', 'fun.dance'],
  ['tell me something funny', 'fun.joke'],
  ['heads or tails?', 'fun.coin'],
  ['roll a d20', 'fun.dice', s => s.sides === 20],
  ['should i go to the gym today', 'fun.8ball'],
  ['come over here', 'fun.teleport'],
  ['take a nap zin', 'fun.sleep'],
  ['hey zin', 'chat.hello'],
  ['good morning!', 'chat.hello'],
  ['thank you so much', 'chat.thanks'],
  ['how r u', 'chat.how'],
  ['who are u', 'chat.who'],
  ['what can u do', 'help'],
  ['nvm', 'cancel'],
  ['never mind', 'cancel'],

  // everyday questions
  ['what time is it', 'time', s => s.what === 'time'],
  ['whats the date today', 'time', s => s.what === 'date'],
  ["what's 15% of 80", 'math', s => s.result === 12],
  ['what is 12 times 7', 'math', s => s.result === 84],
  ['2+2*3', 'math', s => s.result === 8],
  ['whats the square root of 81', 'math', s => s.result === 9],
  ['100 divided by 8', 'math', s => s.result === 12.5],
  ['what is twenty five plus seventeen', 'math', s => s.result === 42],
  ['whats the weather', 'weather', s => s.place === null && s.day === 0],
  ['will it rain tomorrow', 'weather', s => s.day === 1],
  ['weather in new york', 'weather', s => s.place === 'new york'],
  ['do i need a jacket today', 'weather'],
  ['how hot is it outside', 'weather'],

  // her voice
  ['stop talking', 'voice.hush'],
  ['shut up', 'voice.hush'],
  ['stop listening', 'voice.off'],
  ['turn on your voice', 'voice.on'],

  // more than one thing at once
  ['open spotify and play drake', ['app.open', 'music.play']],
  ['organize my downloads then empty the recycle bin', ['organize', 'clean.junk']],
  ['turn on dark mode and change my wallpaper', ['theme', 'wallpaper']],
  ['set a timer for 10 min and play lofi', ['timer', 'music.play']],
];

// follow-ups that depend on the last request
const FOLLOWUPS = [
  [['organize my downloads', 'now do the desktop'], 'organize', s => s.folder === 'desktop'],
  [['open discord', 'spotify too'], 'app.open', s => s.apps[0] === 'spotify'],
  [['play drake', 'again'], 'music.play', s => s.song === 'drake'],
];

let pass = 0, fail = 0;
const fails = [];
function check(text, got, want, test) {
  const intents = got.steps.map(s => s.intent);
  const wantList = want == null ? [] : Array.isArray(want) ? want : [want];
  let ok = intents.length === wantList.length && intents.every((x, i) => x === wantList[i]);
  if (ok && test) { try { ok = !!test(got.steps[0].slots); } catch { ok = false; } }
  if (ok) pass++; else { fail++; fails.push(`  ✗ "${text}"  →  ${intents.join(' + ') || '(unknown)'}  ${JSON.stringify(got.steps.map(s => s.slots))}  (wanted ${wantList.join(' + ') || 'unknown'})`); }
}
const t0 = Date.now();
for (const [text, want, test] of CASES) check(text, brain.understand(text), want, test);
for (const [msgs, want, test] of FOLLOWUPS) {
  let last;
  let r;
  for (const m of msgs) { r = brain.understand(m, { last }); if (r.steps[0]) last = { intent: r.steps[0].intent, slots: r.steps[0].slots }; }
  check(msgs.join(' → '), r, want, test);
}
const ms = Date.now() - t0;
console.log(`${pass} / ${pass + fail} understood (${Math.round(100 * pass / (pass + fail))}%), ${(ms / (pass + fail)).toFixed(1)} ms each`);
if (fails.length) console.log(fails.join('\n'));
process.exitCode = fail > Math.ceil((pass + fail) * 0.1) ? 1 : 0;
