// Was that said to Zin? Speech recognizers hear her name as "Zin", "Zinn",
// "Zen", "Xin" and so on, and sometimes glue it to the next word ("Zinfine").
// hear("Zinn, play God Did by DJ Khaled.") -> { wake: true, text: 'play god did by dj khaled' }
// Works in the browser (window.ZinWake) and in Node.
(function (root) {

const NAME = '(?:zinn?|zinne|zen+|xin+|zinc|zim|zyn+|sinn?|jinn?|zeen)';
const LEAD = '(?:(?:hey|hi|hello|ok|okay|yo|oi|ay|hay|a|um|uh)[\\s,]+)?';
const WAKE = new RegExp(`^${LEAD}${NAME}(?![a-z])[\\s,.!?:-]*(.*)$`);
// "Hazen, how are you" is "hey Zin, how are you"
const GLUED_LEAD = /^(?:ha|hay|hey|a)(?:zen|zin|zinn|sin)(?![a-z])[\s,.!?]*(.*)$/;
// "Zinfine my resume" is "Zin, find my resume"
const GLUED_NEXT = /^(?:zin|zen|sin|xin)(find|fine|open|play|turn|set|show|tell|close|search|look|start|stop|pause|skip|remind|what|how|who|can|could|please)([a-z]*)\b(.*)$/;
// at the end only the clear spellings count ("this is a sin" isn't for her)
const TRAILING = /^(.+?)[\s,]+(?:hey\s+)?(?:zinn?|zen|xin)[.!?]*$/;

// tidy what the recognizer wrote into what you'd type
function tidy(t) {
  return t.toLowerCase()
    .replace(/\b([ap])\.\s?m\b\.?/g, '$1m')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:\s]+$/, '')
    .replace(/^[.!?,;:\s]+/, '')
    .trim();
}

function hear(raw) {
  const t = tidy(raw || '');
  let m = t.match(WAKE);
  if (m) return { wake: true, text: tidy(m[1]) };
  m = t.match(GLUED_LEAD);
  if (m) return { wake: true, text: tidy(m[1]) };
  m = t.match(GLUED_NEXT);
  if (m) return { wake: true, text: tidy(m[1] === 'fine' ? 'find' + m[3] : m[1] + m[2] + m[3]) };
  m = t.match(TRAILING);
  if (m && m[1].split(' ').length >= 2) return { wake: true, text: tidy(m[1]) };
  return { wake: false, text: t };
}

const api = { hear, tidy };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.ZinWake = api;
})(typeof window !== 'undefined' ? window : globalThis);
