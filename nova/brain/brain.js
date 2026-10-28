// Nova's brain: turns what you type into things she can do.
//   understand(text, context) -> { steps: [{ intent, slots, confidence, risk, ready, missing }], reply, suggestions }
// It runs fully offline: a small Naive Bayes classifier trained (in a few
// milliseconds, when the brain loads) on the example phrasings in intents.js,
// plus rules that pick out the details (app, song, folder, time...).
// Works in the browser (window.NovaBrain, after intents.js) and in Node.
(function (root) {
  const { FILL, INTENTS } = typeof module !== 'undefined' && module.exports ? require('./intents') : root.NovaIntents;

  // ================================================================ cleaning up what you typed
  const SLANG = {
    u: 'you', ur: 'your', r: 'are', pls: 'please', plz: 'please', pleas: 'please', thx: 'thanks', ty: 'thanks', tysm: 'thanks',
    rn: 'right now', tmrw: 'tomorrow', tmr: 'tomorrow', tom: 'tomorrow', tonite: 'tonight', b4: 'before', w: 'with',
    pic: 'picture', pics: 'pictures', pix: 'pictures', photo: 'picture', photos: 'pictures', img: 'image', imgs: 'images',
    vid: 'video', vids: 'videos', vidz: 'videos', dl: 'download', dls: 'downloads', docs: 'documents', doc: 'document',
    comp: 'computer', pc: 'computer', laptop: 'computer', 'computer\'s': 'computer', vol: 'volume', yt: 'youtube',
    gonna: 'going to', wanna: 'want to', gotta: 'got to', lemme: 'let me', gimme: 'give me', cuz: 'because', bc: 'because',
    idk: 'i do not know', ya: 'you', yea: 'yes', yeah: 'yes', yep: 'yes', nah: 'no', nvm: 'never mind', thnx: 'thanks', thanx: 'thanks',
  };
  // filler and swear words that don't change what you're asking
  const FILLER = /\b(oops|whoops|oopsie|tf|wtf|the fuck|the hell|the heck|heck|damn|dang|freaking|frickin|fricking|lol|lmao|omg|ugh|umm+|um+|uh+|like literally|literally|bruh|bro|dude|pls+)\b/g;
  const CONTRACTIONS = [[/\bcan'?t\b/g, 'cannot'], [/\bwon'?t\b/g, 'will not'], [/\bdon'?t\b/g, 'do not'], [/\bdoesn'?t\b/g, 'does not'],
    [/\bdidn'?t\b/g, 'did not'], [/\bisn'?t\b/g, 'is not'], [/\bhaven'?t\b/g, 'have not'], [/\bi'?m\b/g, 'i am'], [/\bit'?s\b/g, 'it is'],
    [/\bwhat'?s\b/g, 'what is'], [/\bwhere'?s\b/g, 'where is'], [/\bhow'?s\b/g, 'how is'], [/\bthat'?s\b/g, 'that is'], [/\blet'?s\b/g, 'let us'],
    [/\bi'?ll\b/g, 'i will'], [/\byou'?re\b/g, 'you are']];

  // lower case, straighten quotes, expand slang and contractions; keeps ':' in times
  function normalize(text) {
    let t = String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
    t = t.replace(/[^a-z0-9:'.\-\s]/g, ' ').replace(/(^|\s)'+|'+(\s|$)/g, ' ').replace(/\.(\s|$)/g, ' ');
    return t.split(/\s+/).filter(Boolean).map(w => SLANG[w] || w).join(' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  }

  // ================================================================ features for the classifier
  const STOP = new Set(['the', 'a', 'an', 'please', 'could', 'would', 'can', 'you', 'me', 'my', 'i', 'for', 'of', 'just', 'nova', 'kindly',
    'maybe', 'quickly', 'now', 'right', 'real', 'really', 'some', 'it', 'this', 'that', 'is', 'am', 'are', 'be', 'will', 'to', 'and', 'so', 'okay', 'ok']);
  const CANON = { pictures: 'picture', images: 'picture', image: 'picture', screenshots: 'screenshot', downloads: 'download', documents: 'document',
    folders: 'folder', files: 'file', songs: 'song', tunes: 'song', track: 'song', tracks: 'song', computer: 'pc', machine: 'pc', storage: 'space',
    tidy: 'clean', declutter: 'organize', organise: 'organize', arrange: 'organize', sort: 'organize', remove: 'delete', erase: 'delete',
    launch: 'open', boot: 'open', quit: 'close', kill: 'close', exit: 'close', louder: 'loud', quieter: 'quiet', reboot: 'restart',
    disk: 'space', drive: 'space', harddrive: 'space', hogging: 'eat', eating: 'eat', using: 'eat', taking: 'eat', hog: 'eat',
    editing: 'work', edited: 'work', touched: 'work', modified: 'work', working: 'work', lately: 'recent', recently: 'recent',
    crank: 'turn', pump: 'turn', boost: 'turn', spreadsheet: 'file', pdf: 'file', docx: 'file', xlsx: 'file', pptx: 'file', essay: 'file',
    alphabetize: 'organize', alphabetise: 'organize', inbox: 'email', mail: 'email', emails: 'email', messages: 'email', bored: 'new',
    flip: 'flip', toss: 'flip', moves: 'dance', boogie: 'dance', groove: 'dance' };
  function stem(w) {
    if (/^\d/.test(w) || w.includes(':')) return '#n';
    w = CANON[w] || w;
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    return CANON[w] || w;
  }
  function features(words) {
    const all = words.map(stem);
    const toks = all.filter(w => !STOP.has(w));
    const f = toks.slice();
    for (let i = 0; i + 1 < all.length; i++) f.push(all[i] + '_' + all[i + 1]);
    if (all.length) f.push('^' + (toks[0] || all[0]));   // the first word matters a lot ("open ...", "play ...")
    return f;
  }

  // ================================================================ training
  function expand(template) {
    const slots = template.match(/\{(\w+)\}/g) || [];
    if (!slots.length) return [template];
    const out = [];
    for (let k = 0; k < 4; k++) {   // a few fillings of each template
      let s = template;
      for (const sl of slots) { const pool = FILL[sl.slice(1, -1)]; s = s.replace(sl, pool[(k * 7 + s.length) % pool.length]); }
      out.push(s);
    }
    return out;
  }
  const model = { classes: Object.keys(INTENTS), counts: {}, totals: {}, vocab: new Set(), words: new Set() };
  for (const c of model.classes) {
    model.counts[c] = new Map(); model.totals[c] = 0;
    for (const ex of INTENTS[c].examples) for (const s of expand(ex)) {
      const words = normalize(s).split(' ');
      words.forEach(w => model.words.add(w));
      for (const f of features(words)) { model.counts[c].set(f, (model.counts[c].get(f) || 0) + 1); model.totals[c]++; model.vocab.add(f); }
    }
  }
  for (const pool of Object.values(FILL)) for (const v of pool) normalize(v).split(' ').forEach(w => model.words.add(w));
  ['downloads', 'desktop', 'documents', 'pictures', 'music', 'videos', 'alphabetically', 'minutes', 'seconds', 'hours', 'tomorrow', 'tonight',
    'spotify', 'youtube', 'google', 'volume', 'shutdown', 'restart', 'organize', 'screenshot', 'wallpaper', 'reminder', 'remind'].forEach(w => model.words.add(w));

  // ================================================================ fixing typos
  function editDistance(a, b) {   // Damerau-Levenshtein (adjacent swaps count once)
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  const fixCache = new Map();
  function fixWord(w) {
    if (w.length < 4 || model.words.has(w) || /\d/.test(w)) return w;
    if (fixCache.has(w)) return fixCache.get(w);
    const max = w.length >= 7 ? 2 : 1;
    let best = w, bestD = max + 1;
    for (const v of model.words) {
      if (Math.abs(v.length - w.length) > max) continue;
      const d = editDistance(w, v);
      if (d < bestD) { best = v; bestD = d; }
    }
    fixCache.set(w, best);
    return best;
  }

  // ================================================================ classifying
  const ALPHA = 0.3;
  function classify(text) {
    const words = text.split(' ').filter(Boolean).map(fixWord);
    const f = features(words).filter(x => model.vocab.has(x));
    if (!f.length) return { ranked: [], known: 0 };
    const V = model.vocab.size;
    const scores = model.classes.map(c => {
      let s = 0;
      for (const x of f) s += Math.log(((model.counts[c].get(x) || 0) + ALPHA) / (model.totals[c] + ALPHA * V));
      return [c, s];
    });
    scores.sort((a, b) => b[1] - a[1]);
    const top = scores[0][1];
    const z = scores.reduce((a, [, s]) => a + Math.exp(s - top), 0);
    const said = words.join(' ');
    return { ranked: scores.map(([c, s]) => [c, Math.exp(s - top) / z]).filter(([c]) => !REQUIRE[c] || REQUIRE[c].test(said)), known: f.length };
  }
  // some abilities only make sense if a key word is there ("what is a black hole" isn't asking the time)
  const REQUIRE = {
    weather: /\b(weather|forecast|rain\w*|snow\w*|sun\w*|hot|cold|warm|chilly|temperature|umbrella|jacket|coat|outside|degrees|humid\w*|wind\w*|storm\w*|cloudy)\b/,
    time: /\b(time|date|day|month|year|today|clock)\b/,
  };

  // ================================================================ picking out the details
  const NUMS = { zero: 0, one: 1, a: 1, an: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const numberWords = (t) => t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (m, a, b) => NUMS[a] + NUMS[b])
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, (w) => NUMS[w]);

  // ================================================================ math ("what's 15% of 80")
  // A tiny calculator that understands words; it never runs code.
  function calc(raw) {
    let t = String(raw || '').toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/\ba(\d)/g, '$1'); // "a80": speech recognizers add stray letters
    t = t.replace(/^(?:hey |ok |okay )?(?:nova[, ]+)?/, '').replace(/^(?:what(?:'s| is)|whats|calculate|calc|compute|solve|how much is|work out|tell me|quick math:?)\s+/, '')
      .replace(/^(?:what|how much) (?:is|are|does)\s+/, '').replace(/\s*(?:equal|equals|make|come to)?\s*[?!=]*\s*$/, '').trim();
    t = numberWords(t).replace(/\b(\d+) hundred\b/g, (m, n) => n * 100).replace(/\b(\d+) thousand\b/g, (m, n) => n * 1000);
    t = t.replace(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+/g, '($1/100)*').replace(/(\d+(?:\.\d+)?)\s*(?:%|percent)/g, '($1/100)')
      .replace(/\b(?:the )?square root of\b|\bsqrt\b/g, ' r ').replace(/\bsquared\b/g, '^2').replace(/\bcubed\b/g, '^3')
      .replace(/\bto the power of\b|\bto the\b|\*\*/g, '^').replace(/\bplus\b|\band\b/g, '+').replace(/\bminus\b|\btake away\b/g, '-')
      .replace(/\btimes\b|\bmultiplied by\b|\bx\b|×/g, '*').replace(/\bdivided by\b|\bover\b|÷/g, '/').replace(/\s+/g, '');
    if (!/^[\d.+\-*/^()r]+$/.test(t) || !/\d/.test(t) || !/[+\-*/^r]/.test(t.replace(/^-/, ''))) return null;
    let i = 0;
    const num = () => { const m = t.slice(i).match(/^\d*\.?\d+/); if (!m) throw 0; i += m[0].length; return +m[0]; };
    const prim = () => { if (t[i] === '(') { i++; const v = expr(); if (t[i++] !== ')') throw 0; return v; } return num(); };
    const unary = () => { if (t[i] === '-') { i++; return -unary(); } if (t[i] === 'r') { i++; return Math.sqrt(unary()); } return prim(); };
    const pow = () => { const b = unary(); if (t[i] === '^') { i++; return Math.pow(b, pow()); } return b; };
    const term = () => { let v = pow(); while (t[i] === '*' || t[i] === '/') { const o = t[i++]; const w = pow(); v = o === '*' ? v * w : v / w; } return v; };
    const expr = () => { let v = term(); while (t[i] === '+' || t[i] === '-') { const o = t[i++]; const w = term(); v = o === '+' ? v + w : v - w; } return v; };
    try { const v = expr(); return i === t.length && isFinite(v) ? +v.toPrecision(12) : null; } catch { return null; }
  }

  function duration(t) {
    t = numberWords(t);
    if (/\bhalf (an|a) hour\b/.test(t)) return 1800;
    if (/\b(a )?quarter (of )?(an|a) hour\b/.test(t)) return 900;
    let total = 0, hit = false;
    const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;
    let m;
    while ((m = re.exec(t))) { hit = true; const n = parseFloat(m[1]), u = m[2][0]; total += n * (u === 'h' ? 3600 : u === 's' ? 1 : 60); }
    const h = t.match(/\b(\d+)h(\d+)\b/); if (h) { hit = true; total = (+h[1]) * 3600 + (+h[2]) * 60; }
    if (!hit) {
      const w = t.match(/\b(a|an|a few|a couple( of)?)\s+(hour|minute|second|sec|min)s?\b/);
      if (w) { hit = true; const n = /few/.test(w[1]) ? 3 : /couple/.test(w[1]) ? 2 : 1, u = w[3][0]; total = n * (u === 'h' ? 3600 : u === 's' ? 1 : 60); }
    }
    return hit ? Math.round(total) : null;
  }

  // a clock time: { h, m, day } with day 0 = today (or the next time it comes round), 1 = tomorrow
  function clock(t) {
    t = numberWords(t);
    const day = /\btomorrow\b/.test(t) ? 1 : 0;
    if (/\bnoon\b|\bmidday\b/.test(t)) return { h: 12, m: 0, day };
    if (/\bmidnight\b/.test(t)) return { h: 0, m: 0, day: day || 1 };
    const m = t.match(/\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m|p\.m)?\b/) || t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || t.match(/\b(\d{1,2}):(\d{2})\b()/);
    if (m) {
      let h = +m[1]; const min = +(m[2] || 0), ap = m[3] || '';
      if (ap.startsWith('p') && h < 12) h += 12;
      if (ap.startsWith('a') && h === 12) h = 0;
      const vague = !ap && h <= 12;
      if (vague && /\b(tonight|evening|afternoon)\b/.test(t) && h < 12) h += 12;
      return { h, m: min, day, vague: vague && !/\b(tonight|evening|afternoon|morning)\b/.test(t) };
    }
    if (/\btonight\b/.test(t)) return { h: 20, m: 0, day };
    if (/\bthis evening\b/.test(t)) return { h: 19, m: 0, day };
    if (/\bthis afternoon\b/.test(t)) return { h: 15, m: 0, day };
    if (/\b(tomorrow )?morning\b/.test(t)) return { h: 9, m: 0, day: day || 1 };
    if (day) return { h: 9, m: 0, day };
    return null;
  }
  const TIME_WORDS = /\b(in|for|after)\s+(\d+(?:\.\d+)?|a|an|a few|a couple( of)?|half an|half a|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|hour)\b|\b(at|by|around)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b|\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\b(tomorrow|tonight|this (evening|afternoon|morning)|noon|midnight|in the morning)\b/g;

  const FOLDERS = { download: 'downloads', downloads: 'downloads', desktop: 'desktop', document: 'documents', documents: 'documents',
    picture: 'pictures', pictures: 'pictures', image: 'pictures', images: 'pictures', music: 'music', songs: 'music', video: 'videos', videos: 'videos', movies: 'videos' };
  function folder(t) {
    const m = t.match(/\b(downloads?|desktop|documents?|pictures?|images?|music|songs|videos?|movies)\b/);
    if (m) return FOLDERS[m[1]];
    if (/\b(a|another|some other|this|that|pick a|choose a) folder\b/.test(t)) return 'pick';
    return null;
  }

  // strip the command words off the front (and a few fillers off the back) to get what's left
  function rest(t, leads, tails = []) {
    let s = ' ' + t + ' ';
    const lead = new RegExp('^\\s*(?:(?:hey|ok|okay|yo)\\s+)?(?:nova\\s+)?(?:(?:can|could|would|will) you\\s+|please\\s+|i want (?:you )?to\\s+|i need (?:you )?to\\s+|go\\s+|just\\s+)*(?:' + leads.join('|') + ')\\b');
    s = s.replace(lead, ' ');
    for (const tl of tails.concat(['please', 'for me', 'thanks', 'thank you', 'right now', 'real quick', 'now', 'too', 'as well', 'also'])) s = s.replace(new RegExp('\\b' + tl + '\\s*$'), ' ').replace(new RegExp('\\b' + tl + '\\s*$'), ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  const dropArticles = (s) => s.replace(/^(?:(?:my|the|a|an|some|that|this|our)\s+)+/, '').trim();

  const SITES = { youtube: 'https://www.youtube.com', netflix: 'https://www.netflix.com', gmail: 'https://mail.google.com', reddit: 'https://www.reddit.com',
    twitter: 'https://x.com', x: 'https://x.com', amazon: 'https://www.amazon.com', twitch: 'https://www.twitch.tv', github: 'https://github.com',
    instagram: 'https://www.instagram.com', facebook: 'https://www.facebook.com', tiktok: 'https://www.tiktok.com', 'google docs': 'https://docs.google.com',
    google: 'https://www.google.com', 'chat gpt': 'https://chatgpt.com', chatgpt: 'https://chatgpt.com', pinterest: 'https://www.pinterest.com',
    wikipedia: 'https://www.wikipedia.org', ebay: 'https://www.ebay.com', 'disney plus': 'https://www.disneyplus.com', hulu: 'https://www.hulu.com', crunchyroll: 'https://www.crunchyroll.com' };
  const siteOf = (s) => SITES[s] ? { name: s, url: SITES[s] } : /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? { name: s, url: 'https://' + s } : null;

  const OPEN_LEADS = ['open up', 'open', 'launch', 'start up', 'start', 'run', 'fire up', 'boot up', 'boot', 'pull up', 'bring up', 'load', 'get', 'go to', 'take me to', 'visit', 'show me', 'show', 'i want to use', 'use'];
  const CLOSE_LEADS = ['force close', 'close out of', 'close', 'quit', 'kill', 'shut down', 'shutdown', 'exit', 'stop', 'end'];
  function targetName(t, leads) {
    return dropArticles(rest(t, leads, ['app', 'the app', 'application', 'program', 'website', 'site', 'in the browser', 'in my browser', 'for me', 'up', 'open', 'please']))
      .replace(/\s+(app|application|program|website|site)$/, '').trim();
  }
  const splitList = (s) => s.split(/\s*(?:,|\band\b|&)\s*/).map(x => x.trim()).filter(Boolean);

  const SLOTS = {
    'files.find': (t) => ({ query: dropArticles(rest(t, ['find', 'search for', 'search my computer for', 'search my pc for', 'look for', 'look up', 'locate', 'where is', 'where did i put', 'i cannot find', 'help me find', 'get'], ['file', 'files', 'on my computer', 'on my pc', 'on here', 'at'])
      .replace(/^(?:the )?files? (?:called|named)\s+/, '').replace(/\s+files?$/, '')) || null }),
    'files.old': (t) => ({ folder: folder(t) }),
    'folder.open': (t) => ({ folder: folder(t) }),
    'organize': (t) => ({ folder: folder(t), mode: /\b(alphabetical(ly)?|a to z|a-z|abc|by name|by letter)\b/.test(t) ? 'alpha' : /\b(by date|by month|by year|by when|by day|date)\b/.test(t) ? 'date' : 'type' }),
    'app.open': (t) => ({ apps: splitList(targetName(t, OPEN_LEADS)) }),
    'app.close': (t) => ({ apps: splitList(targetName(t, CLOSE_LEADS)) }),
    'web.open': (t) => ({ apps: splitList(targetName(t, OPEN_LEADS)) }),
    'web.search': (t) => {
      const engine = /\b(youtube|yt)\b/.test(t) ? 'youtube' : 'google';
      let q = rest(t, ['search the web for', 'search google for', 'search youtube for', 'search for', 'google', 'youtube', 'look up', 'find me', 'search'], ['on youtube', 'on google', 'online', 'on the web', 'on the internet']);
      return { query: q || null, engine };
    },
    'music.play': (t) => {
      let s = rest(t, ['play me', 'play', 'put on', 'throw on', 'start playing', 'queue up', 'blast', 'spin', 'i want to listen to', 'listen to', 'let us hear', 'play the song'],
        ['on spotify', 'on youtube', 'on youtube music', 'in spotify', 'from spotify', 'song', 'please', 'for me', 'music by'])
        .replace(/^(?:the )?(?:song|track)\s+/, '').replace(/^(?:some )?music by\s+/, '').replace(/^songs? by\s+/, '');
      const kind = /\bplaylist\b/.test(s) ? 'playlist' : /\balbum\b/.test(s) ? 'album' : 'track';
      if (/^(?:some |a )?(?:music|songs?|something|anything|tunes?)$/.test(s) || !s) s = null;
      else s = dropArticles(s) || s;
      return { song: s, kind };
    },
    'media.control': (t) => ({ cmd: /\b(next|skip)\b/.test(t) ? 'next' : /\b(previous|back|last song|go back|prev)\b/.test(t) ? 'prev' : /\b(pause|stop|hold)\b/.test(t) ? 'pause' : 'play' }),
    'volume': (t) => {
      const set = numberWords(t).match(/\b(?:to|at)\s+(\d{1,3})\s*(?:%|percent)?/);
      if (set) return { cmd: 'set', level: Math.min(100, +set[1]) };
      if (/\bunmute\b/.test(t)) return { cmd: 'unmute' };
      if (/\bmute\b|\bsilence\b/.test(t)) return { cmd: 'mute' };
      const down = /\b(down|quiet|quieter|lower|decrease|too loud|softer|reduce)\b/.test(t);
      return { cmd: down ? 'down' : 'up', steps: /\b(a lot|way|much|max|all the way)\b/.test(t) ? 10 : /\b(a bit|a little|slightly|tad)\b/.test(t) ? 2 : 5 };
    },
    'theme': (t) => ({ mode: /\blight\b/.test(t) ? 'light' : /\bdark\b/.test(t) ? 'dark' : 'toggle' }),
    'wallpaper': (t) => ({ style: /\bsynth/.test(t) ? 'synth' : /\bspace|galaxy|stars\b/.test(t) ? 'space' : /\bhills?|pixel\b/.test(t) ? 'hills' : /\bglitch\b/.test(t) ? 'glitch'
      : /\b(old|back|restore|original|previous)\b/.test(t) ? 'restore' : /\b(random|my pictures?|my photos?|surprise)\b/.test(t) ? 'random' : /\b(pick|choose|my own|this)\b/.test(t) ? 'pick' : null }),
    'power': (t) => ({ kind: /\b(cancel|abort|stop|do not)\b/.test(t) ? 'cancel' : /\brestart|reboot\b/.test(t) ? 'restart' : /\bsleep\b/.test(t) ? 'sleep' : 'shutdown', delay: duration(t), at: clock(t) }),
    'timer': (t) => {
      const focus = /\b(focus|pomodoro|study session|work session)\b/.test(t);
      const label = (t.match(/\b(?:for|called|named)\s+(?:the\s+)?([a-z][a-z ]+?)\s*$/) || [])[1];
      return { seconds: duration(t) || (focus ? 1500 : null), label: focus ? 'Focus' : (label && !/minute|second|hour/.test(label) ? label : 'Timer') };
    },
    'reminder': (t) => {
      const sec = /\bin\s/.test(t) || /\bafter\s/.test(t) ? duration(t) : null;
      const at = sec ? null : clock(t);
      const m = t.replace(TIME_WORDS, ' ').match(/\b(?:to|about|that|of)\s+(.+)$/) || t.replace(TIME_WORDS, ' ').match(/\b(?:remind me|reminder|remember|nudge me|ping me|forget)\s+(.+)$/);
      let text = m ? m[1] : null;
      if (text) text = text.replace(TIME_WORDS, ' ').replace(/\b(please|okay|ok)\b/g, ' ').replace(/^(to|about|that)\s+/, '').replace(/\s+/g, ' ').trim() || null;
      return { text, when: sec ? { in: sec } : at ? { at } : null };
    },
    'note.add': (t) => ({ text: rest(t, ['note to self', 'make a note that', 'make a note', 'take a note', 'write down', 'write', 'save a note', 'jot down', 'add to my notes', 'remember that', 'remember', 'note'])
      .replace(/^(that|:)\s*/, '') || null }),
    'fun.8ball': (t) => ({ question: t }),
    'time': (t) => ({ what: /\b(date|day|month|year|today)\b/.test(t) ? 'date' : 'time' }),
    'weather': (t) => {
      const m = t.match(/\b(?:in|for|at|near)\s+([a-z][a-z .'-]*?)(?:\s+(?:today|tomorrow|tonight|this week(?:end)?|right now|now|later))?$/);
      const place = m && !/^(the )?(morning|evening|afternoon|weekend|week|moment|future|bit)$/.test(m[1]) ? m[1].trim() : null;
      return { place, day: /\btomorrow\b/.test(t) ? 1 : /\b(this week|weekend|next few days)\b/.test(t) ? 'week' : 0 };
    },
    'fun.dice': (t) => { const m = t.match(/\bd(\d+)\b|\b(\d+)[ -]sided\b/); return { sides: m ? +(m[1] || m[2]) : 6 }; },
  };

  // ================================================================ what Nova says back
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const nice = (s) => s.replace(/\b\w/g, c => c.toUpperCase());
  const fmtDur = (s) => s >= 3600 ? `${+(s / 3600).toFixed(1)} hour${s >= 7200 ? 's' : ''}` : s >= 60 ? `${Math.round(s / 60)} minute${s >= 120 ? 's' : ''}` : `${s} second${s === 1 ? '' : 's'}`;
  const fmtClock = (c) => { const h = c.h % 12 || 12, ap = c.h < 12 ? 'am' : 'pm'; return `${c.day ? 'tomorrow ' : ''}at ${h}${c.m ? ':' + String(c.m).padStart(2, '0') : ''}${ap}`; };
  const SAY = {
    'files.find': (s) => `Looking for "${s.query}"… 🔍`,
    'files.recent': () => 'Here\'s what you\'ve been working on…',
    'files.big': () => 'Hunting for the biggest files… 🐘',
    'files.old': (s) => `Let me find files you haven't touched in a while${s.folder && s.folder !== 'pick' ? ' in ' + nice(s.folder) : ''}. I'll show you before anything goes.`,
    'folder.open': (s) => `Opening ${nice(s.folder)}! 📂`,
    'organize': (s) => `Let's tidy ${s.folder === 'pick' ? 'a folder' : nice(s.folder)}${s.mode === 'alpha' ? ' A to Z' : s.mode === 'date' ? ' by date' : ''}. I'll show you the plan first. 📦`,
    'organize.undo': () => 'Putting everything back! ↩️',
    'clean.junk': () => 'Scanning for junk… 🧹',
    'app.open': (s) => `Opening ${s.apps.map(nice).join(' and ')}! 🚀`,
    'app.close': (s) => `Close ${s.apps.map(nice).join(' and ')}? Anything unsaved could be lost.`,
    'web.open': (s) => `Opening ${s.apps.map(nice).join(' and ')}! 🌐`,
    'web.search': (s) => `Searching ${s.engine === 'youtube' ? 'YouTube' : 'Google'} for "${s.query}"…`,
    'music.play': (s) => s.song ? pick([`Playing ${s.song} 🎶`, `Ooh, ${s.song}! 🎧`, `One ${s.song} coming up 🎵`]) : 'Music time! 🎶',
    'media.control': (s) => ({ next: 'Skipping ⏭️', prev: 'Going back a song ⏮️', pause: 'Paused ⏸️', play: 'Playing ▶️' })[s.cmd],
    'volume': (s) => ({ up: 'Louder! 🔊', down: 'Quieter… 🔉', mute: 'Muted 🔇', unmute: 'Sound\'s back 🔊', set: `Volume to ${s.level}% 🔊` })[s.cmd],
    'pc.stats': () => 'Checking your PC… 📊',
    'theme': (s) => s.mode === 'toggle' ? 'Switching it up! 🌗' : s.mode === 'dark' ? 'Going dark 🌙' : 'Lights on ☀️',
    'wallpaper': (s) => s.style === 'restore' ? 'Putting your old wallpaper back…' : 'Painting you a new wallpaper! 🎨',
    'screenshot': () => 'Say cheese! 📸',
    'pc.lock': () => 'Locking up. Bye for now 👋',
    'power': (s) => s.kind === 'cancel' ? 'Okay, cancelling the shutdown.' : `${{ shutdown: 'Shut down', restart: 'Restart', sleep: 'Sleep' }[s.kind]} your PC${s.delay ? ' in ' + fmtDur(s.delay) : s.at ? ' ' + fmtClock(s.at) : ' now'}? Save your stuff first!`,
    'timer': (s) => `${s.label === 'Focus' ? 'Focus time' : 'Timer set'}: ${fmtDur(s.seconds)} ⏱️`,
    'reminder': (s) => `Okay! I'll remind you to ${s.text} ${s.when.in ? 'in ' + fmtDur(s.when.in) : fmtClock(s.when.at)} ⏰`,
    'note.add': () => pick(['Noted! 📝', 'Got it, saved to your notes 📝', 'Written down ✍️']),
    'notes.open': () => 'Opening your notes 📒',
    'fun.dance': () => pick(['Dance party! 💃', 'Watch this! 🎶']),
    'fun.joke': () => null, 'fun.coin': () => null, 'fun.dice': () => null, 'fun.8ball': () => null,
    'fun.teleport': () => 'Zoom! ✨',
    'time': (s) => { const d = new Date(); return s.what === 'date' ? `It's ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} 📅` : `It's ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ⏰`; },
    'math': (s) => s.result == null ? 'Give me a sum, like "what\'s 15% of 80"! 🧮' : `That's ${s.result.toLocaleString('en-US', { maximumFractionDigits: 6 })}! 🧮`,
    'weather': () => 'Checking the sky… ☁️',
    'voice.hush': () => null,
    'voice.off': () => 'Okay, I\'ll stop listening. Turn me back on from the tray or say it in the box. 🙉',
    'voice.on': () => 'Yay, let\'s talk! 🎙️',
    'fun.sleep': () => 'Nap time… 💤',
    'chat.hello': () => pick(['Hiii! 👋', 'Hey hey!', 'Hi! What can I do for you?']),
    'chat.thanks': () => pick(['Anytime! ❤️', 'Happy to help! 💕', 'You got it! ✨']),
    'chat.how': () => pick(['I\'m great! Ready to help 💪', 'Doing awesome, thanks for asking! ✨', 'Feeling glitchy in a good way 😄']),
    'chat.who': () => 'I\'m Nova, your desktop helper! I can find files, tidy folders, open apps, play music, set reminders and lots more.',
    'help': () => 'Try things like: "find my resume", "organize downloads A to Z", "open discord", "play lofi on spotify", "remind me in 10 min to stretch", "turn the volume down", "dark mode" or "clean up my pc".',
    'cancel': () => 'Okay, never mind! 👌',
  };
  const ASK = {
    query: { 'files.find': 'What should I look for?', 'web.search': 'What should I search for?' },
    folder: 'Which folder? Downloads, Desktop, Documents, Pictures…',
    apps: 'Which app?',
    seconds: 'For how long?',
    text: { reminder: 'What should I remind you about?', 'note.add': 'What should I write down?' },
    when: 'When should I remind you? (like "in 20 minutes" or "at 5pm")',
  };
  const NOT_READY = 'I can\'t do that one yet, but it\'s on my list! 📝';

  // names that are files, not apps ("pull up my budget spreadsheet")
  const FILEISH = /\b(spreadsheet|pdf|docx?|document|essay|resume|invoice|report|file|photo of|picture of|screenshot of|homework|receipt|contract|form)\b/;

  const WEBBY = /\b(hotels?|flights?|near me|recipes?|weather|prices?|cheap|best|reviews?|news|tickets?|restaurants?|showtimes|how to|deals?|coupons?|jobs)\b/;

  // ================================================================ putting it together
  function readStep(text, intent, confidence) {
    const def = INTENTS[intent];
    let slots = SLOTS[intent] ? SLOTS[intent](text) : {};
    // "open X": a folder, a website or an app?
    if (intent === 'app.open' || intent === 'web.open' || intent === 'folder.open') {
      const apps = SLOTS['app.open'](text).apps, name = apps.join(' ');
      const f = folder(text);
      if (/^(?:my )?notes?$/.test(name)) { intent = 'notes.open'; slots = {}; }
      else if (FILEISH.test(name)) { intent = 'files.find'; slots = { query: name.replace(/^(?:my|the)\s+/, '') }; }
      else if (/\b(biggest|largest|huge|heaviest)\b/.test(name)) { intent = 'files.big'; slots = {}; }
      else if (/\b(recent|latest|newest)\b/.test(name)) { intent = 'files.recent'; slots = {}; }
      else if (/^(?:a |your )?dance$|^(?:your )?moves$/.test(name)) { intent = 'fun.dance'; slots = {}; }
      else if (f && f !== 'pick' && (!name || FOLDERS[name.replace(/ folder$/, '')] || /\bfolder\b/.test(text))) { intent = 'folder.open'; slots = { folder: f }; }
      else if (apps.length && apps.every(siteOf)) { intent = 'web.open'; slots = { apps, sites: apps.map(siteOf) }; }
      else { intent = 'app.open'; slots = { apps }; }
    }
    // "search for cheap flights" is a web search, not a file on your PC
    if (intent === 'files.find' && slots.query && WEBBY.test(slots.query)) { intent = 'web.search'; slots = { query: slots.query, engine: 'google' }; }
    // a question nobody asked to search for is better answered by chatting, when she can
    const fallback = intent === 'web.search' && !/\b(google|search|look up|look it up|bing|youtube|online|on the web|the internet)\b/.test(text);
    // "play" on its own just un-pauses
    if (intent === 'music.play' && !slots.song && /^(?:play|resume|unpause|continue)$/.test(text)) { intent = 'media.control'; slots = { cmd: 'play' }; }
    const d = INTENTS[intent];
    const needs = (d.needs || []).filter(k => slots[k] == null || (Array.isArray(slots[k]) && !slots[k].length));
    return { intent, slots, confidence: +confidence.toFixed(3), risk: d.risk, ready: d.ready !== false, missing: needs, ...(fallback ? { fallback } : {}) };
  }

  function replyFor(step) {
    if (!step.ready) return NOT_READY;
    if (step.missing.length) { const q = ASK[step.missing[0]]; return typeof q === 'object' ? q[step.intent] : q; }
    const f = SAY[step.intent];
    return f ? f(step.slots) : null;
  }

  const CONNECT = /\s*(?:,\s*)?\b(?:and then|then|after that|and also|also|and)\b\s*|\s*[;,]\s*/;
  const REPEAT = /^(?:again|do (?:it|that) again|repeat(?: that)?|one more time|same again|once more)$/;
  const FOLLOW = /^(?:now|and|also|then|what about|how about|same (?:for|with|to)|do the same (?:for|with|to)|do that (?:for|with|to))\b|\b(?:too|as well|also)$/;
  const THRESHOLD = 0.45;

  // context: { last: { intent, slots } } (Nova keeps this between messages)
  function understand(input, context = {}) {
    const text = normalize(input);
    const last = context.last;
    if (!text) return { steps: [], reply: 'Hm? 🙂' };
    const sum = calc(input);
    if (sum != null) { const step = { intent: 'math', slots: { result: sum }, confidence: 1, risk: 'auto', ready: true, missing: [] }; return { steps: [step], reply: replyFor(step) }; }
    if (REPEAT.test(text) && last) {
      const step = { ...last, confidence: 1, missing: [] };
      return { steps: [step], reply: replyFor(step) };
    }

    const whole = classify(text);
    const strong = STRONG.find(([re]) => re.test(text));
    if (strong && (!whole.ranked.length || (whole.ranked[0][0] !== strong[1] && (strong[2] || whole.ranked[0][1] < 0.6)))) whole.ranked.unshift([strong[1], 0.9]);
    let steps = null;
    // several requests in one go? ("open spotify and play drake")
    const parts = text.split(CONNECT).map(s => s.trim()).filter(s => s.split(' ').length >= 1 && s.length > 1);
    if (parts.length > 1) {
      const read = parts.map(p => { const c = classify(p); return c.ranked.length ? { p, c } : null; });
      if (read.every(Boolean)) {
        const cand = read.map(({ p, c }) => readStep(p, c.ranked[0][0], c.ranked[0][1]));
        const distinct = new Set(cand.map(s => s.intent)).size > 1;
        if (distinct && cand.every(s => s.confidence >= 0.6 && s.intent !== 'cancel' && !s.intent.startsWith('chat.'))) steps = cand;
      }
    }
    if (!steps) {
      if (!whole.ranked.length) return unknown(text, whole);
      const [intent, conf] = whole.ranked[0];
      let step = readStep(text, intent, conf);
      // a follow-up like "now do desktop" or "spotify too"
      if (last && (FOLLOW.test(text) || conf < THRESHOLD)) {
        const lastSlots = SLOTS[last.intent] ? SLOTS[last.intent](text) : {};
        const changed = Object.entries(lastSlots).filter(([k, v]) => v != null && (!Array.isArray(v) || v.length) && k !== 'mode' && k !== 'kind' && k !== 'engine' && k !== 'cmd');
        if (changed.length && (FOLLOW.test(text) || conf < THRESHOLD)) step = { ...readStep(text, last.intent, 1), slots: { ...last.slots, ...Object.fromEntries(changed) }, missing: [] };
      }
      const second = (whole.ranked[1] || [, 0])[1];
      if (step.confidence !== 1 && step.confidence < THRESHOLD && !(step.confidence >= 0.3 && step.confidence >= 3 * second)) return unknown(text, whole);
      steps = [step];
    }
    const reply = steps.map(replyFor).filter(Boolean).join(' ');
    return { steps, reply };
  }

  // patterns that are a near-certain sign of what you want (true = even over a confident guess)
  const STRONG = [
    [/^(?:where (?:is|are|did|has|have)|find|locate|look for|search (?:my (?:pc|computer) )?for|i need (?:the|my)|pull up my)\b(?!.*\b(?:online|web|google|youtube|internet)\b)(?!.*\b(?:app|folder)\b)/, 'files.find'],
    [/^undo\b|^undo$|\bundo (?:that|it|the (?:sort|organize))\b/, 'organize.undo'],
    [/^(?:crank|pump|turn) (?:it|the (?:volume|sound|music)) (?:up|down)\b/, 'volume'],
    [/^(?:shut ?down|turn off|power off|restart|reboot)\b(?! (?:spotify|chrome|discord|steam|the app|app))/, 'power', true],
    [/^(?:help|help me|help please|i need help)$/, 'help', true],
    [/^(?:shut up|be quiet|stop talking|stop speaking|hush|shh+|zip it|quiet)$/, 'voice.hush', true],
    [/\bstop listening\b|^turn off (?:your )?(?:mic|microphone|ears|voice)\b|^mute your (?:mic|microphone)\b/, 'voice.off', true],
    [/\b(?:weather|forecast)\b|\b(?:rain|snow|sunny|umbrella|jacket)\b.*\b(?:today|tomorrow|tonight|outside|later)\b|\b(?:hot|cold|warm) (?:is it )?outside\b/, 'weather'],
    [/^what (?:time|day|date|month|year) is it\b|^what is (?:the )?(?:time|date)\b|^(?:what is )?todays date$/, 'time', true],
    [/\bdance\b/, 'fun.dance'],
  ];
  // when unsure: a question is probably for the web, a yes/no question for the 8-ball
  const ASKS_WEB = /^(?:what|who|when|where|why|how|which)\b(?! (?:are|r) (?:you|u)\b)(?! (?:can|do) (?:you|i)\b)/;
  const ASKS_8BALL = /^(?:will|should|is|am|are|can|do|does|did|would|could)\s+(?:i|it|we|my|they|he|she)\b/;
  function unknown(text, cls) {
    if (ASKS_8BALL.test(text)) { const step = { ...readStep(text, 'fun.8ball', 0.5), fallback: true }; return { steps: [step], reply: replyFor(step) }; }
    if (ASKS_WEB.test(text) && text.split(' ').length >= 4) { const step = { ...readStep(text, 'web.search', 0.5), fallback: true }; step.slots = { query: text, engine: 'google' }; return { steps: [step], reply: replyFor(step) }; }
    const suggestions = (cls.ranked || []).slice(0, 3).filter(([, p]) => p > 0.05).map(([c]) => INTENTS[c].examples.find(e => !e.includes('{')) || expand(INTENTS[c].examples[0])[0]);
    return { steps: [], unknown: true, reply: `Hmm, I'm not sure what you mean by "${text}". ${suggestions.length ? 'Did you mean one of these?' : 'Try "help" to see what I can do.'}`, suggestions };
  }

  // fill in a detail she asked for ("Which folder?" -> "desktop")
  function answer(step, reply) {
    const text = normalize(reply);
    const key = step.missing[0];
    const slots = { ...step.slots };
    if (key === 'folder') slots.folder = folder(text) || (/\b(pick|choose|other|another)\b/.test(text) ? 'pick' : null);
    else if (key === 'seconds') slots.seconds = duration(text) || (/^\d+$/.test(text) ? +text * 60 : null);
    else if (key === 'when') { const s = duration(text); const c = s ? null : clock(text); slots.when = s ? { in: s } : c ? { at: c } : null; }
    else if (key === 'apps') slots.apps = splitList(targetName(text, OPEN_LEADS));
    else slots[key] = text || null;
    const d = INTENTS[step.intent];
    const missing = (d.needs || []).filter(k => slots[k] == null || (Array.isArray(slots[k]) && !slots[k].length));
    const next = { ...step, slots, missing };
    return { steps: [next], reply: replyFor(next) };
  }

  const api = { understand, answer, replyFor, calc, normalize, classify, duration, clock, folder, siteOf, SITES, INTENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NovaBrain = api;
})(typeof window !== 'undefined' ? window : globalThis);
