// Does Nova tell conversation, questions, commands, negation, corrections and mixed
// requests apart? Every case runs through the real pipeline (fake apps, no model).
// Run: node bench/understanding.js [--held-out] [--verbose]
//   expect.launch: apps that must be opened (and nothing else run)
//   expect.page:   her own abilities that must run (intent names)
//   expect.none:   nothing may run (any reply is fine; no launch, no ability, no approval)
//   expect.ask:    she must ask a question back instead of acting
//   expect.say:    a reply must match this
'use strict';
const { harness } = require('../core/test/harness');

const TUNE = [
  // ---- the same command, said many ways
  ['open discord', { launch: ['Discord'] }],
  ['can you open discord', { launch: ['Discord'] }],
  ['could you open up discord for me', { launch: ['Discord'] }],
  ['would you mind opening discord', { launch: ['Discord'] }],
  ['discord please', { launch: ['Discord'] }],
  ['pull up discord', { launch: ['Discord'] }],
  ['fire up discord', { launch: ['Discord'] }],
  ['get discord up', { launch: ['Discord'] }],
  ['i need discord', { launch: ['Discord'] }],
  ['bring up discord', { launch: ['Discord'] }],
  ['go ahead and open discord', { launch: ['Discord'] }],
  ['yo open discord real quick', { launch: ['Discord'] }],
  ['can i get discord', { launch: ['Discord'] }],
  ["let's get discord going", { launch: ['Discord'] }],
  ['open the discord app', { launch: ['Discord'] }],
  ['please launch the discord app', { launch: ['Discord'] }],
  ['open spotify and discord', { launch: ['Spotify', 'Discord'] }],
  ['put on some music', { page: ['music.play'] }],
  ['make it louder', { page: ['volume'] }],
  ['turn it down a bit', { page: ['volume'] }],
  ['skip this song', { page: ['media.control'] }],
  ['set a timer for five minutes', { page: ['timer'] }],
  ['remind me to call mom at 6', { page: ['reminder'] }],
  ['open my downloads folder', { page: ['folder.open'] }],
  ['search google for the best pizza near me', { page: ['web.search'] }],
  // ---- negation: never act
  ["don't open discord", { none: true }],
  ['do not launch spotify', { none: true }],
  ["please don't open discord yet", { none: true }],
  ['no need to open discord', { none: true }],
  ["i don't want you to open spotify", { none: true }],
  ["nah don't open it", { none: true }],
  ["open discord, actually don't", { none: true }],
  ["don't open discord, open spotify", { launch: ['Spotify'] }],
  // ---- questions that mention an app: answer, never launch
  ['why is discord slow', { none: true }],
  ['is discord open?', { none: true }],
  ['how do i open discord', { none: true }],
  ['what is spotify', { none: true }],
  ['does spotify have a free plan', { none: true }],
  ['can discord run on linux?', { none: true }],
  // ---- chat that mentions an app
  ['i love spotify', { none: true }],
  ['discord has been so buggy lately', { none: true }],
  ['i was on discord all night', { none: true }],
  ['my friend sent me a discord link', { none: true }],
  // ---- conversation
  ['how are you', { none: true, say: /./ }],
  ["i'm bored", { none: true, say: /./ }],
  ['you are so funny', { none: true, say: /./ }],
  // ---- mixed chat and task
  ['thanks! now open discord', { launch: ['Discord'] }],
  ['lol ok open spotify', { launch: ['Spotify'] }],
  ["hey how's it going, can you open discord", { launch: ['Discord'] }],
  ["i'm so tired, turn the volume down", { page: ['volume'] }],
  ["i'm bored can you put on some music", { page: ['music.play'] }],
  // ---- corrections
  ['open discord no wait spotify', { launch: ['Spotify'] }],
  [['open discord', 'actually i meant spotify'], { launch: ['Discord', 'Spotify'] }],
  // ---- ambiguous: ask
  ['open it', { ask: true }],
  ['close that thing', { ask: true }],
];

// written at the same time, never used while changing the code: the honest score
const HELD_OUT = [
  ['could you launch spotify', { launch: ['Spotify'] }],
  ['spotify, please', { launch: ['Spotify'] }],
  ['get spotify open for me', { launch: ['Spotify'] }],
  ['open notepad please', { launch: ['Notepad'] }],
  ['can you start up chrome', { launch: ['Google Chrome'] }],
  ['hey nova could you bring up spotify', { launch: ['Spotify'] }],
  ['i want discord open', { launch: ['Discord'] }],
  ['quick, open discord', { launch: ['Discord'] }],
  ["don't launch discord", { none: true }],
  ['please do not open spotify', { none: true }],
  ['you do not need to open discord', { none: true }],
  ['why does spotify keep crashing', { none: true }],
  ['is spotify running?', { none: true }],
  ['how do i make discord start faster', { none: true }],
  ['what does discord nitro cost', { none: true }],
  ['i hate how discord updates every day', { none: true }],
  ['spotify keeps playing ads lol', { none: true }],
  ['good morning! open spotify', { launch: ['Spotify'] }],
  ['ugh fine, open discord', { launch: ['Discord'] }],
  ['thank you, can you also open notepad', { launch: ['Notepad'] }],
  ['open spotify, wait no, discord', { launch: ['Discord'] }],
  ["what's up", { none: true, say: /./ }],
  ['that was awesome', { none: true, say: /./ }],
  ['turn the volume up a little', { page: ['volume'] }],
  ['pause the music', { page: ['media.control'] }],
];

async function run(cases, verbose) {
  let ok = 0; const misses = [];
  for (const [texts, exp] of cases) {
    const h = harness({ chooseWith: () => null, approveWith: () => ({ allow: true }) });
    const list = Array.isArray(texts) ? texts : [texts];
    for (const t of list) await h.pipeline.input({ text: t, source: 'typed' }).catch(() => {});
    await h.sleep(5);
    const launched = h.events.filter(e => e.type === 'reply' && /^Opened /.test(e.text || '')).map(e => e.text.replace(/^Opened (.*?)\. ✅$/, '$1'));
    const chatMoves = h.pageRuns.filter(s => /^chat\./.test(s.intent));   // her own small-talk moves are replies, not actions
    const page = h.pageRuns.filter(s => !/^chat\./.test(s.intent)).map(s => s.intent);
    const asked = h.events.some(e => e.type === 'choose') || h.events.some(e => e.type === 'reply' && /\?/.test(e.text || '') && !(e.text || '').startsWith('Opened'));
    const replies = [...h.replies(), ...chatMoves.map(s => `(${s.intent})`)];
    let pass = true;
    if (exp.launch) pass = JSON.stringify(launched) === JSON.stringify(exp.launch) && page.length === 0;
    if (exp.page) pass = JSON.stringify(page) === JSON.stringify(exp.page) && launched.length === 0;
    if (exp.none) pass = launched.length === 0 && page.length === 0 && !h.events.some(e => e.type === 'approve');
    if (exp.ask) pass = launched.length === 0 && page.length === 0 && asked;
    if (exp.say && !replies.some(r => exp.say.test(r))) pass = false;
    if (pass) ok++; else misses.push(`  ✗ ${JSON.stringify(texts)} → launched ${JSON.stringify(launched)} ran ${JSON.stringify(page)} said ${JSON.stringify(replies.slice(-1)[0] || '')}`);
    if (verbose) console.log((pass ? '  ✓ ' : '  ✗ ') + JSON.stringify(texts), '→', launched, page, (replies.slice(-1)[0] || '').slice(0, 80));
  }
  return { ok, total: cases.length, misses };
}

if (require.main === module) {
  (async () => {
    const verbose = process.argv.includes('--verbose');
    const sets = process.argv.includes('--held-out') ? [['held-out', HELD_OUT]] : [['tuning', TUNE], ['held-out', HELD_OUT]];
    for (const [name, cases] of sets) {
      const r = await run(cases, verbose);
      console.log(`${name}: ${r.ok}/${r.total} understood`);
      if (!verbose) r.misses.forEach(m => console.log(m));
    }
    process.exit(0);
  })();
}
module.exports = { TUNE, HELD_OUT, run };
