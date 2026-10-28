// Words the voice reads wrong, respelled so they come out right before she
// speaks. Each one was checked with espeak, which turns spelling into sounds
// for her voices (e.g. it reads "resume" as the verb, ri-ZOOM).
// To add one: put a respelling below and a case in pronounce.test.js.

// words that are said one way whatever they're next to
const ALWAYS = [
  [/\broblox\b/gi, 'Roeblox'],          // ROH-blocks, not RAH-blocks
  [/\bkhaled\b/gi, 'Khalid'],           // DJ Khaled: KHAH-led, not "Kald"
  [/\bkawaii\b/gi, 'kah-why-ee'],
  [/\baww+\b/gi, 'aw'],                 // not "aw-uh"
  [/\bhmm+\b/gi, 'hmm'],
  [/\bvs\.?(?=\s)/gi, 'versus'],
  [/\be\.g\.,?/gi, 'for example,'],
  [/\bi\.e\.,?/gi, 'that is,'],
  [/\b(\d+)\s?mins?\b/gi, (m, n) => `${n} ${n === '1' ? 'minute' : 'minutes'}`],
  [/\b(\d+)\s?secs?\b/gi, (m, n) => `${n} ${n === '1' ? 'second' : 'seconds'}`],
  [/\b(\d+)\s?hrs?\b/gi, (m, n) => `${n} ${n === '1' ? 'hour' : 'hours'}`],
  [/\bctrl\s?\+\s?alt\s?\+\s?(\w)\b/gi, (m, k) => `control, alt, ${k.toUpperCase()}`],
];

// words spelled the same but said differently; the words around them decide
const DETERMINER = 'my|your|the|a|an|this|that|his|her|their|our|new|old';
const CONTEXT = [
  // the document (REZ-oo-may), not the verb (ri-ZOOM): "your resume", "resume file"
  [new RegExp(`\\b(${DETERMINER})\\s+resume(s?)\\b`, 'gi'), (m, d, s) => `${d} résumé${s}`],
  [/\bresume(s?)(?=\s+(?:file|pdf|doc|document|template|folder)s?\b)/gi, (m, s) => `résumé${s}`],
  // close the app (cloze), not close by (close): at the start, or before something to close
  [/(^|[.!?]\s+|\b(?:to|i'll|i will|should i|can i|please|then|and|or|let me|i can|want me to)\s+)close\b(?!\s+(?:to|by|call|enough|friend))/gi, (m, pre) => `${pre}${/^C/.test(m.slice(pre.length)) ? 'Cloze' : 'cloze'}`],
  [/\bclose(?=\s+(?:it|them|that|this|the|all|everything|chrome|discord|spotify|steam|roblox|word|excel|apps?|windows?|tabs?)\b)/gi, (m) => (m[0] === 'C' ? 'Cloze' : 'cloze')],
  // record a video (ri-CORD), not a record (REK-erd)
  [/\b(to|i'll|i will|can|should|start|stop|let me|i can)\s+record\b/gi, (m, pre) => `${pre} ree-cord`],
  // wind down (rhymes with find), not the wind
  [/\bwind\s+down\b/gi, 'wined down'],
];

function pronounce(text) {
  let t = String(text);
  for (const [re, to] of CONTEXT) t = t.replace(re, to);
  for (const [re, to] of ALWAYS) t = t.replace(re, to);
  return t;
}

module.exports = { pronounce };
