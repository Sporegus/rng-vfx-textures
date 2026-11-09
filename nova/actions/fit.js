// How well a name fits an app's name (0..100): exact, sounds alike, starts with,
// contains, or a near miss. Pure, so the request pipeline's tests use the same matching.
'use strict';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// roughly how a name sounds, so a misheard "raw blocks" still finds "Roblox"
const sound = (s) => norm(s).replace(/ /g, '').replace(/ph/g, 'f').replace(/ck|q|c(?=[aoukrl])/g, 'k').replace(/x/g, 'ks')
  .replace(/ight/g, 'ite').replace(/aw|au|ow|oa/g, 'o').replace(/ee|ea|ie/g, 'i').replace(/z/g, 's')
  .replace(/d/g, 't').replace(/b/g, 'p').replace(/g/g, 'k')   // (speech recognition mixes these up: "notepat" is Notepad)
  .replace(/(.)\1+/g, '$1');
// how well a typed name fits an app's name, 0..100
function fit(want, name) {
  const w = norm(want), n = norm(name);
  if (!w || !n) return 0;
  if (n === w) return 100;
  const sw = sound(w), sn = sound(n);
  if (sw === sn && sw.length >= 4) return 88;
  const parts = n.split(' ');
  if (sw.length >= 4 && parts.some((_, k) => sound(parts.slice(0, k + 1).join(' ')) === sw)) return 84;
  if (n.startsWith(w + ' ') || n.endsWith(' ' + w)) return 90;
  if (n.split(' ').includes(w)) return 85;
  if (n.startsWith(w)) return 80;
  if (n.includes(w)) return 70;
  const words = w.split(' ');
  if (words.length > 1 && words.every(x => n.includes(x))) return 75;
  const dist = Math.min(editDistance(w, n), ...n.split(' ').map(p => editDistance(w, p)));
  if (dist <= Math.max(1, Math.floor(w.length / 5))) return 65 - dist * 5;
  return sw.length >= 5 && editDistance(sw, sn) <= 1 ? 66 : 0;
}

module.exports = { norm, fit, sound };
