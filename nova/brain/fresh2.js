// A third untouched batch, written after the last round of fixes. Run: node brain/fresh2.js
const brain = require('./brain');
const CASES = [
  ['where are my wedding photos', 'files.find'], ['find the lease pdf', 'files.find'], ['search my pc for minecraft worlds', 'files.find'],
  ['what files did i change today', 'files.recent'], ['show me the biggest videos', 'files.big'], ['sort downloads by type', 'organize'],
  ['tidy my desktop a to z please', 'organize'], ['revert that', 'organize.undo'], ['can you clean up junk on my laptop', 'clean.junk'],
  ['open the camera app', 'app.open'], ['open microsoft edge', 'app.open'], ['shut spotify', 'app.close'], ['go to amazon', 'web.open'],
  ['look up flights to denver', 'web.search'], ['how many calories in a banana', 'web.search'], ['play rap music', 'music.play'],
  ['play lose yourself by eminem', 'music.play'], ['next track please', 'media.control'], ['stop the song', 'media.control'],
  ['make the volume louder', 'volume'], ['turn volume to 20 percent', 'volume'], ['how is my battery', 'pc.stats'],
  ['turn on light mode', 'theme'], ['random wallpaper please', 'wallpaper'], ['grab a screenshot', 'screenshot'],
  ['put my computer to sleep', 'power'], ['shutdown at 11pm', 'power'], ['timer for 90 seconds', 'timer'],
  ['remind me to drink water every hour', 'reminder'], ['remind me in 2 hours to leave for work', 'reminder'],
  ['write a note that i owe sam 20 bucks', 'note.add'], ['new mail?', 'email.check'], ['do a little dance', 'fun.dance'],
  ['joke please', 'fun.joke'], ['heads or tails', 'fun.coin'], ['hi nova!', 'chat.hello'], ['ty nova', 'chat.thanks'],
  ['whats your name', 'chat.who'], ['help me', 'help'], ['open chrome and go to youtube', ['app.open', 'web.open']],
];
let pass = 0; const fails = [];
for (const [text, want] of CASES) {
  const got = brain.understand(text).steps.map(s => s.intent), w = Array.isArray(want) ? want : [want];
  if (got.length === w.length && got.every((x, i) => x === w[i])) pass++; else fails.push(`  ✗ "${text}" → ${got.join(' + ') || '(unknown)'} (wanted ${w.join(' + ')})`);
}
console.log(`${pass} / ${CASES.length} brand-new requests understood (${Math.round(100 * pass / CASES.length)}%)`);
if (fails.length) console.log(fails.join('\n'));
