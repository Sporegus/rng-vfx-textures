// Run: node voice/pronounce.test.js
const { pronounce } = require('./pronounce');
const CASES = [
  ['I found your resume!', 'I found your résumé!'],
  ['Opening the resume file.', 'Opening the résumé file.'],
  ['Want me to resume the video?', 'Want me to resume the video?'],
  ['Resume playing?', 'Resume playing?'],
  ['Close Chrome? Anything unsaved could be lost.', 'Cloze Chrome? Anything unsaved could be lost.'],
  ["Okay, I'll close it.", "Okay, I'll cloze it."],
  ['Should I close Discord?', 'Should I cloze Discord?'],
  ["You're so close to done!", "You're so close to done!"],
  ['Stay close by.', 'Stay close by.'],
  ['Opening Roblox now.', 'Opening Roeblox now.'],
  ['Playing God Did by DJ Khaled.', 'Playing God Did by DJ Khalid.'],
  ['Aww, I am sorry.', 'aw, I am sorry.'],
  ['Timer set for 10 min.', 'Timer set for 10 minutes.'],
  ['That took 1 min.', 'That took 1 minute.'],
  ['Cats vs dogs?', 'Cats versus dogs?'],
  ['Press Ctrl+Alt+V to talk.', 'Press control, alt, V to talk.'],
  ['Want me to record your screen?', 'Want me to ree-cord your screen?'],
  ['That was a record!', 'That was a record!'],
  ['Time to wind down.', 'Time to wined down.'],
];
let bad = 0;
for (const [i, want] of CASES) { const got = pronounce(i); if (got !== want) { bad++; console.log('✗', JSON.stringify(i), '->', JSON.stringify(got), 'wanted', JSON.stringify(want)); } }
console.log(bad ? `${bad} problems` : `all ${CASES.length} good`);
process.exitCode = bad ? 1 : 0;
