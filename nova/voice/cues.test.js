// Which recorded phrase fits each line she says. Run: node voice/cues.test.js
const { cueFor } = require('./cues');
const CASES = [
  ['Opening Spotify! 🚀', 'open'], ['Opening Downloads! 📂', 'open'], ['Opened it in Explorer!', 'open'],
  ['Looking for "resume"… 🔍', 'search'], ['Searching Google for "how to tie a tie"…', 'search'], ['Sniffing around for junk…', 'search'],
  ['Scanning for junk… 🧹', 'tidy'], ['Time to tidy! What should I go after?', 'tidy'],
  ['Playing God Did 🎶', 'music'], ['One Drake coming up 🎵', 'music'], ['Skipping ⏭️', 'skip'], ['Louder! 🔊', 'louder'], ['Quieter… 🔉', 'quieter'],
  ['Timer set: 10 minutes ⏱️', 'timer'], ["Okay! I'll remind you to call mom at 5pm ⏰", 'remind'], ['Noted! 📝', 'note'],
  ['All sorted! Moved 37 files into 6 folders.', 'done'], ['Done! Freed up 1.8 GB. ✨', 'done'], ['Put 37 files back where they were.', 'done'],
  ['Found 2.4 GB of junk! Tick what I should clean:', 'found'], ['Found 3! Which one?', 'found'],
  ["Couldn't find anything called \"passport\". 😔", 'notfound'], ["I couldn't find an app called \"Fortnite\" on your PC.", 'notfound'],
  ['Oops: no internet', 'oops'], ['Sorry, my brain glitched for a sec. Try again? 😵‍💫', 'oops'],
  ['Close Chrome? Anything unsaved could be lost.', 'sure'], ['Shut down your PC in 30 minutes? Save your stuff first!', 'sure'],
  ['Yes? 👂', 'yes'], ['Listening… 🎙️', 'yes'], ['Hiii! 👋', 'hi'], ['Anytime! ❤️', 'welcome'], ['Bye for now 👋', 'bye'], ['Okay, never mind! 👌', 'cancel'],
  ['Say cheese! 📸', 'cheese'], ['Wheeee!', 'throw'],
  // she says these in full: they tell you something
  ["It's 7:45 PM ⏰", null], ["That's 12! 🧮", null], ['🌤️ It\'s 64°F and cloudy in Seattle.', null], ['Which folder? Downloads, Desktop, Documents, Pictures…', null],
  ['What should I remind you about?', null], ["I'm Nova, your desktop helper! I can find files, tidy folders, open apps, play music, set reminders and lots more.", null],
  ['Playing ▶️', null],
];
let bad = 0;
for (const [t, want] of CASES) { const got = cueFor(t); if (got !== want) { bad++; console.log('✗', JSON.stringify(t), '->', got, 'wanted', want); } }
console.log(bad ? `${bad} problems` : `all ${CASES.length} good`);
process.exitCode = bad ? 1 : 0;
