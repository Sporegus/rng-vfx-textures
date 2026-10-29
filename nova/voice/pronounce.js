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
  [/\bctrl\s?\+\s?alt\s?\+\s?(\w+)\b/gi, (m, k) => `control, alt, ${k.length === 1 ? k.toUpperCase() : k}`],
  [/\bsec\b/gi, 'second'],          // "for a sec"
  [/\blo-?fi\b/gi, 'low fye'],         // not "low if I"
  // file sizes and file types, said in full
  [/(\d)\s?(KB|MB|GB|TB)\b/g, (m, d, u) => `${d} ${{ KB: 'kilobytes', MB: 'megabytes', GB: 'gigabytes', TB: 'terabytes' }[u]}`],
  [/([^\s.]+)\.txt\b/gi, '$1 text file'],
  [/([^\s.]+)\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|mp3|mp4|zip|exe|csv)\b/gi, (m, name, ext) => `${name} dot ${ext.toUpperCase().split('').join(' ')}`],
];

// Numbers, said in words. (Her own voice skips some digits, like the 6 in
// "6 folders", so every voice gets words.) 7:45 PM -> seven forty-five P M
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + words(n % 100) : '');
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= size) return words(Math.floor(n / size)) + ' ' + name + (n % size ? (n % size < 100 ? ' and ' : ' ') + words(n % size) : '');
  }
  return String(n);
}
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
const ordinal = (w) => w.replace(/(\w+)$/, (x) => ORD[x] || (x.endsWith('y') ? x.slice(0, -1) + 'ieth' : x + 'th'));
// "pm", "p.m." or "PM" (a "p.m." mid-sentence loses its dots so it isn't taken for a sentence end)
const AMPM = '([ap])(?:\\.\\s?m\\.(?=\\s+[a-z])|\\.\\s?m\\b|\\s?m\\b)';
const NUMBERS = [
  // percent and degrees
  [/(\d)\s?%/g, '$1 percent'],
  [/(\d)\s?°\s?[FC]?\b/g, '$1 degrees'],
  // times: 7:45 PM, 5:00, 7:05 am
  [new RegExp(`\\b(\\d{1,2}):(\\d\\d)\\s?${AMPM}`, 'gi'), (m, h, mi, ap) => `${clock(h, mi)} ${ap.toUpperCase()} M`],
  [/\b(\d{1,2}):(\d\d)\b/g, (m, h, mi) => clock(h, mi)],
  [new RegExp(`\\b(\\d{1,2})\\s?${AMPM}`, 'gi'), (m, h, ap) => `${words(+h)} ${ap.toUpperCase()} M`],
  // dice (d20), phone numbers (digit by digit), versions (1.13.8)
  [/\bd(\d+)\b/g, (m, n) => `D ${words(+n)}`],
  [/\b\d{3}-\d{3,4}(?:-\d{4})?\b/g, (m) => m.split('-').map(g => g.split('').map(d => ONES[+d]).join(' ')).join(', ')],
  [/\b\d+(?:\.\d+){2,}\b/g, (m) => m.split('.').map(n => words(+n)).join(' point ')],
  // money, decimals and "6+"
  [/\$(\d+)(?:\.(\d\d))?\b/g, (m, d, c) => `${words(+d)} ${+d === 1 ? 'dollar' : 'dollars'}${c && +c ? ' and ' + words(+c) + ' cents' : ''}`],
  [/\b(\d+)\.(\d+)\b/g, (m, a, b) => `${words(+a)} point ${b.split('').map(d => ONES[+d]).join(' ')}`],
  [/\b(\d+)\+/g, (m, n) => `${words(+n)} plus`],
  // 1st, 2nd, 23rd
  [/\b(\d+)(?:st|nd|rd|th)\b/gi, (m, n) => ordinal(words(+n))],
  // years: 1999, 2026
  [/\b(19|20)(\d\d)\b(?!\s*(?:files?|items?|songs?|apps?|MB|GB|percent|degrees))/g, (m, a, b) => (b === '00' ? words(+m) : `${words(+a)} ${+b < 10 ? 'oh ' + ONES[+b] : words(+b)}`)],
  [/\d{1,3}(?:,\d{3})+\b/g, (m) => words(+m.replace(/,/g, ''))],
  [/\b\d+\b/g, (m) => (m.length > 12 ? m.split('').map(d => ONES[+d]).join(' ') : words(+m))],
];
function clock(h, mi) { return `${words(+h)}${mi === '00' ? '' : +mi < 10 ? ' oh ' + ONES[+mi] : ' ' + words(+mi)}`; }

// words spelled the same but said differently; the words around them decide
const DETERMINER = 'my|your|the|a|an|this|that|his|her|their|our|new|old';
const CONTEXT = [
  // the document (REZ-oo-may), not the verb (ri-ZOOM): "your resume", "resume file"
  // (spelled "rezzoomay": her own voice sometimes dropped the end of "résumé")
  [new RegExp(`\\b(${DETERMINER})\\s+(?:resume|résumé)(s?)\\b`, 'gi'), (m, d, s) => `${d} rezzoomay${s}`],
  [/\b(?:resume|résumé)(s?)(?=\s+(?:file|pdf|doc|document|template|folder)s?\b|\.(?:pdf|docx?)\b)/gi, (m, s) => `rezzoomay${s}`],
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
  for (const [re, to] of NUMBERS) t = t.replace(re, to);
  return t;
}

module.exports = { pronounce, words };
