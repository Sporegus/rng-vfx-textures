// Nova's recorded phrases: short lines made once in her ElevenLabs voice ("On it!",
// "All done!", "Found it!"), each with its feeling, played instead of making the
// whole line with her copied voice. The speech bubble still shows the details
// ("Opening Spotify! 🚀"); she just says the phrase that fits.
// cueFor("Opening Spotify! 🚀") -> 'open'. Lines with something to tell you (the
// time, the weather, a question only you can answer) get no cue, so she says them in full.
// Works in the browser (window.NovaCues) and in Node.
(function (root) {

// first match wins
const CUES = [
  // she's touched, picked up or thrown
  ['pickup', /^(hey!? (put me|don'?t)|whoa!?$|eek)/i],
  ['throw', /^whe+!?$/i],
  // starting and doing things
  ['open', /^(opening|opened|here you go)\b/i],
  ['search', /^(looking for|searching|let me (look|find)|hunting|sniffing|digging|checking (your|the))\b/i],
  ['tidy', /^(scanning for junk|time to tidy|let'?s tidy|sweep|carrying boxes)/i],
  ['paint', /^(painting|fresh!)/i],
  ['music', /^(playing (?!▶)|one .* coming up|music time)/i],
  ['skip', /^skipping/i],
  ['pause', /^paused/i],
  ['louder', /^louder/i],
  ['quieter', /^(quieter|muted)/i],
  ['cheese', /^say cheese/i],
  ['dark', /^going dark/i],
  ['light', /^lights on/i],
  ['dance', /^(dance party|watch this)/i],
  ['nap', /^nap time/i],
  ['timer', /^(timer set|focus time)/i],
  ['remind', /^okay! i'?ll remind you/i],
  ['note', /^(noted|got it, saved to your notes|written down|wrote it down)/i],
  // how it went
  ['done', /^(all done|done!|all sorted|finished|put .* back where|sent .* to the recycle bin|putting everything back)/i],
  ['found', /^found\b/i],
  ['notfound', /^(couldn'?t find|i couldn'?t find|no luck|nothing new|no giant files)/i],
  ['oops', /^(oops|sorry, my brain glitched|hmm, that didn'?t work)/i],
  ['huh', /^(sorry, i didn'?t catch|huh\??$)/i],
  // asking and answering
  ['sure', /^(close|shut down|restart|sleep) .*\?/i],
  ['which', /^which one\??$/i],
  ['yes', /^(yes\??|listening…?|i'?m all ears)/i],
  ['hi', /^(hiii+!?$|hey hey|hi!? what can i do|hey!? what do you need)/i],
  ['welcome', /^(anytime|happy to help|you got it)/i],
  ['bye', /^(bye for now|locking)/i],
  ['cancel', /^(okay, never mind|okay, cancelling|okay, leaving it|okay, keeping everything|okay, i won'?t)/i],
];

// tidy a line for matching: no emoji, no extra spaces
const tidy = (t) => String(t || '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

function cueFor(text) {
  const t = tidy(text);
  for (const [cue, re] of CUES) if (re.test(t)) return cue;
  return null;
}

const api = { cueFor, CUES: CUES.map(c => c[0]) };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NovaCues = api;
})(typeof window !== 'undefined' ? window : globalThis);
