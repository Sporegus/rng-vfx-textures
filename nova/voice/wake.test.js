// What the speech models actually heard in testing. Run: node voice/wake.test.js
const { hear } = require('./wake');
const YES = {
  'Nova, play God Did by DJ Khaled.': 'play god did by dj khaled', 'Nova open Roblox.': 'open roblox',
  'Neva open Roblox': 'open roblox', 'Hey Nova, how are you today?': 'how are you today',
  'Inova, how are you today?': 'how are you today', 'Taynova, how are you today?': 'how are you today',
  'ANOVA HOWER YOU TO': 'hower you to', 'Okay Nova, set a timer for 10 minutes.': 'set a timer for 10 minutes',
  'Ok Nova set a timer for 10 minutes': 'set a timer for 10 minutes', 'Nova, remind me to call Mom at 5 p.m.': 'remind me to call mom at 5 pm',
  'Nova turned the volume down.': 'turned the volume down', 'Nove returned the volume down.': 'returned the volume down',
  'No-va-find my resume.': 'find my resume', 'No va close chrome': 'close chrome', 'Nova fine my resume': 'fine my resume',
  'Nova.': '', 'Novers': '', 'Hey Nova!': '', 'Painova': '', 'Tnovas': '', 'Tay Novus': '', 'Pay nover': '', 'A. Nova how are you today?': 'how are you today', 'Ai Nova how are you today': 'how are you today',
  'Play some music Nova.': 'play some music', 'ok nova what time is it': 'what time is it',
};
const NO = ['No, but what time is it?', 'No return the volume down', 'Never find my resume.', 'Over what time is it?', 'No, the close chrome',
  'Now, overturn the volume down.', 'Novels are my favorite', 'November is cold', 'I watched a video about a nova', 'We saw a supernova', 'Play some bossa nova', 'Okinawa is in Japan', 'Innovation matters'];
let bad = 0;
for (const [said, want] of Object.entries(YES)) { const r = hear(said); if (!r.wake || r.text !== want) { bad++; console.log('✗', JSON.stringify(said), '->', JSON.stringify(r)); } }
for (const said of NO) { const r = hear(said); if (r.wake) { bad++; console.log('✗ woke on', JSON.stringify(said), '->', r.text); } }
console.log(`${Object.keys(YES).length + NO.length - bad} / ${Object.keys(YES).length + NO.length} right`);
process.exitCode = bad ? 1 : 0;
