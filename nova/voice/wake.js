// Was that said to Nova? Speech recognizers almost always write her name as
// "Nova", but now and then as "Novah", "Novus", "Nover" or "No-va", and they
// sometimes glue it to the word before it ("Hey Nova" -> "Inova", "Taynova").
// hear("Nova, play God Did by DJ Khaled.") -> { wake: true, text: 'play god did by dj khaled' }
// Works in the browser (window.NovaWake) and in Node.
(function (root) {

const NAME = '(?:nova[hs]?|novus|novers?|nove|neva|no[ -]va)';
const LEAD = '(?:(?:hey|hi|hello|ok|okay|yo|oi|ay|ai|hay|he|pay|tay|a|um|uh)[\\s,.]+)?';
const WAKE = new RegExp(`^${LEAD}${NAME}(?![a-z])[\\s,.!?:-]*(.*)$`);
// "Inova, how are you" is "hey Nova, how are you"
const GLUED_LEAD = /^(?:i|a|t|hey|hay|hi|he|pay|pai|tay)(?:nova[hs]?|novus)(?![a-z])[\s,.!?]*(.*)$/;
// "No-va-find my resume" is "Nova, find my resume"
const GLUED_NEXT = /^no-?va-(\w.*)$/;
// at the end only her name as it's written counts, and not "a nova" or "the nova"
const TRAILING = /^(.+?)(?<!\b(?:a|the|super|bossa|casa))[\s,]+(?:hey\s+)?nova[.!?]*$/;

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
  let m = t.match(WAKE) || t.match(GLUED_LEAD) || t.match(GLUED_NEXT);
  if (m) return { wake: true, text: tidy(m[1]) };
  m = t.match(TRAILING);
  if (m && m[1].split(' ').length >= 2) return { wake: true, text: tidy(m[1]) };
  return { wake: false, text: t };
}

const api = { hear, tidy };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NovaWake = api;
})(typeof window !== 'undefined' ? window : globalThis);
