// Run: node voice/pronounce.test.js
const { pronounce } = require('./pronounce');
const CASES = [
  ['I found your resume!', 'I found your rezzoomay!'],
  ['Opening the resume file.', 'Opening the rezzoomay file.'],
  ['Here are your résumés.', 'Here are your rezzoomays.'],
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
  ['Timer set for 10 min.', 'Timer set for ten minutes.'],
  ['That took 1 min.', 'That took one minute.'],
  ['Cats vs dogs?', 'Cats versus dogs?'],
  ['Press Ctrl+Alt+V to talk.', 'Press control, alt, V to talk.'],
  ['Want me to record your screen?', 'Want me to ree-cord your screen?'],
  ['That was a record!', 'That was a record!'],
  ['Time to wind down.', 'Time to wined down.'],
  ['Hit Ctrl+Alt+Space anytime.', 'Hit control, alt, Space anytime.'],
  ['Try again in a sec.', 'Try again in a second.'],
  // numbers become words (her voice skips some digits)
  ['Found 2.4 GB of junk!', 'Found two point four gigabytes of junk!'],
  ['All sorted! Moved 37 files into 6 folders.', 'All sorted! Moved thirty-seven files into six folders.'],
  ["12 files you haven't changed in 6+ months (3.1 GB).", "twelve files you haven't changed in six plus months (three point one gigabytes)."],
  ["It's 7:45 PM.", "It's seven forty-five P M."],
  ['I will remind you at 5 pm.', 'I will remind you at five P M.'],
  ['Meet at 5:00 or 9:05.', 'Meet at five or nine oh five.'],
  ['15% of 80 is 12.', 'fifteen percent of eighty is twelve.'],
  ["It's 64°F and sunny.", "It's sixty-four degrees and sunny."],
  ['Call mom at 5 p.m. tomorrow.', 'Call mom at five P M tomorrow.'],
  ['You have 120 GB free and 1,250 photos.', 'You have one hundred twenty gigabytes free and one thousand two hundred fifty photos.'],
  ['It costs $4.99.', 'It costs four dollars and ninety-nine cents.'],
  ['Your 3rd timer, in 2026.', 'Your third timer, in twenty twenty-six.'],
  ['Opening resume.pdf now.', 'Opening rezzoomay dot P D F now.'],
  ['Saved in Nova Notes.txt', 'Saved in Nova Notes text file'],
  ['Playing lo-fi beats.', 'Playing low fye beats.'],
  ['You rolled a d20 and got 17!', 'You rolled a D twenty and got seventeen!'],
  ['Call 555-1234.', 'Call five five five, one two three four.'],
];
let bad = 0;
for (const [i, want] of CASES) { const got = pronounce(i); if (got !== want) { bad++; console.log('✗', JSON.stringify(i), '->', JSON.stringify(got), 'wanted', JSON.stringify(want)); } }
console.log(bad ? `${bad} problems` : `all ${CASES.length} good`);
process.exitCode = bad ? 1 : 0;
