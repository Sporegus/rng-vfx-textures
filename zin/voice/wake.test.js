// What the speech models actually heard in testing. Run: node voice/wake.test.js
const { hear } = require('./wake');
const YES = {
  'Zin, play god did by dj called.': 'play god did by dj called', 'Zen play god did by dj call': 'play god did by dj call',
  'Xin play god did by dj called': 'play god did by dj called', 'Sin playguard did by dj cults': 'playguard did by dj cults',
  'Zin open Roblox.': 'open roblox', 'Zen open roblocks.': 'open roblocks', 'Hey Zen, how are you today?': 'how are you today',
  'Hazen, how are you today?': 'how are you today', 'Hey Zim, how are you today?': 'how are you today', 'Hey Zinn, how are you today?': 'how are you today',
  'Zinc set a timer for 10 minutes.': 'set a timer for 10 minutes', 'Zinn, remind me to call Mom at 5 p.m.': 'remind me to call mom at 5 pm',
  'Zin remind me to call mom at 5:00 p.': 'remind me to call mom at 5:00 p', 'Zinn turned the volume down.': 'turned the volume down',
  'Zinfine my resume.': 'find my resume', 'Zinfined my resume.': 'find my resume', 'Zin.': '', 'Hey Zin!': '',
  'play some music zin': 'play some music', 'ok zin what time is it': 'what time is it',
};
const NO = ['I watched a movie with my friends yesterday.', 'Since you asked, no.', 'Then find my resume.', 'Zinnias are pretty flowers', 'Zenith of the mountain', 'sinner', 'Sincerely yours', 'This is a sin'];
let bad = 0;
for (const [said, want] of Object.entries(YES)) { const r = hear(said); if (!r.wake || r.text !== want) { bad++; console.log('✗', JSON.stringify(said), '->', JSON.stringify(r)); } }
for (const said of NO) { const r = hear(said); if (r.wake) { bad++; console.log('✗ woke on', JSON.stringify(said), '->', r.text); } }
console.log(`${Object.keys(YES).length + NO.length - bad} / ${Object.keys(YES).length + NO.length} right`);
process.exitCode = bad ? 1 : 0;
