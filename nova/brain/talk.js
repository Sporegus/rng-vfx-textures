// Nova's everyday conversation, without a chat brain: greetings, how-are-you, feelings,
// compliments, quick reactions ("lol", "nice", "ok") and questions about her. It also
// tells chat apart from commands, so "I'm bored" gets a reply instead of a new wallpaper.
// It only ever replies with words: nothing here can act on your PC.
'use strict';

const norm = (t) => String(t || '').toLowerCase()
  .replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ')
  .replace(/^(?:(?:hey|hi|ok|okay|yo) )?nova\b ?/, '').replace(/ nova$/, '')
  .replace(/\bim\b/g, "i'm").replace(/\bi am\b/g, "i'm").replace(/\bu\b/g, 'you').replace(/\bur\b/g, "you're").replace(/\byoure\b/g, "you're").replace(/\byou are\b/g, "you're")
  .replace(/\blets\b/g, "let's").replace(/\bwhat is\b/g, "what's").replace(/\bwbu\b|\bhbu\b|\bwhat about you\b|\band you\b/g, 'how about you').replace(/\bthats\b/g, "that's").replace(/\bits\b/g, "it's").replace(/\bwhats\b/g, "what's").replace(/\bhows\b/g, "how's").replace(/\bdont\b/g, "don't")
  .replace(/\s+/g, ' ').trim();

const hour = () => new Date().getHours();
const RULES = [
  // ---- greetings and goodbyes
  [/^(?:good ?night|night night|nighty night|gn|i'm (?:going|off) to (?:bed|sleep)|going to (?:bed|sleep)|time for bed)$/, ['Good night! Sleep well 🌙', 'Night night! 💤', 'Sweet dreams! 🌙']],
  [/^(?:bye|goodbye|bye bye|see you|see ya|cya|later|talk (?:to you )?later|ttyl|gotta go|i(?:'m| have to| got to|'ve got to) go)$/, ['See you! 👋', 'Bye for now! 💙', "Later! I'll be right here."]],
  [/^good morning$|^morning$/, () => hour() >= 12 ? ["Morning? It's past noon, sleepyhead! 😄 Hi!", 'Hi! (It\'s afternoon already, but I\'ll take it 😄)'] : ['Good morning! ☀️ Sleep okay?', 'Morning! ☀️ Ready for today?']],
  [/^good (?:afternoon|evening)$/, ['Hi! 😊 How\'s your day going?', 'Hey hey! How\'s it been today?']],
  [/^(?:hi|hey|hello|hiya|heya|howdy|yo|sup|wassup|wazzup|what's up|what up|whats good|hey there|hi there|hello there|ello|greetings)(?: there)?$/, ['Hey! 😊 What\'s up?', 'Hi hi! 💙', 'Heyyy! How\'s it going?', 'Yo! What are we up to?']],
  [/^(?:i'm back|i'm home|i just got (?:home|back)|i got (?:home|back)|back|guess who's back)$/, ['Welcome back! 💙 How was it?', 'Yay, you\'re back! What did I miss?']],

  // ---- how are you
  [/^(?:how(?:'s| is| are)? (?:you|it going|things|your day|life|everything)(?: going| doing| been)?(?: today| tonight)?|how have you been|how you doing|how do you do|you good|you okay|you ok|are you (?:okay|ok|good|alright)|what's new|wyd|what you up to|what are you up to)$/,
    ["I'm doing great, thanks for asking! 💙 How about you?", 'Pretty good! Just hanging out on your screen. 😄 How are you?', 'Living my best desktop life! How about you?']],

  // ---- how you are (often an answer to "how about you?")
  [/^(?:i'm |i feel |feeling |i've been |been )?(?:good|great|fine|alright|okay|amazing|awesome|fantastic|pretty good|really good|not bad|doing good|doing great|doing well|well|chilling|chillin|vibing)(?: too| thanks| thank you)?,? how about you$/, ["Glad to hear it! I'm great too, thanks for asking! 💙", "Nice! I'm doing awesome. 😄 What are you up to?"]],
  [/^(?:(?:i'm |i feel |feeling |i've been |been )(?:good|great|fine|alright|okay|ok|amazing|awesome|fantastic|pretty good|really good|not bad|doing good|doing great|doing well|well|chilling|chillin|vibing)|(?:good|amazing|fantastic|pretty good|really good|not bad|doing good|doing great|doing well|chilling|vibing)|(?:i'm |it's )?all good|same|me too|same here)(?: too| thanks| thank you)?$/, ['Glad to hear it! 😊', 'Love that! 💙', 'Yay! 😄']],
  [/^(?:i'm |i feel |feeling )?(?:bored|so bored|super bored|really bored)$/, ['Bored? Let\'s fix that! Want a joke, a dance, or a fresh wallpaper? 😄', 'Ooh, bored. Want me to tell you a joke? Or say "dance" and I\'ll show you my moves.']],
  [/^(?:i'm |i feel |feeling )?(?:tired|so tired|exhausted|sleepy|worn out|drained|dead tired)$|^i (?:had|have had) a (?:long|rough|hard|tough|bad|busy) day$/, ['Aww. You deserve a break. ☕ Want me to put on some chill music?', 'Rough one, huh? Take it easy for a bit. 💙', 'Rest up! I\'ll keep an eye on things here.']],
  [/^(?:i'm |i feel |feeling )?(?:sad|down|upset|lonely|depressed|not (?:good|great|okay|ok)|bad|terrible|awful|meh|not so good)$|^(?:my day (?:was|is|has been) (?:bad|terrible|awful|rough|not good))$/, ["I'm sorry. 💙 Want to talk about it? I'm listening.", "That sucks. I'm here for you. 💙", "Sending you a big virtual hug. 🫂 If it's heavy, talking to someone you trust really helps too."]],
  [/^(?:i'm |i feel |feeling )?(?:stressed|anxious|nervous|overwhelmed|stressed out)$/, ['Deep breath in… and out. 💙 One thing at a time. Want me to set a reminder or a timer to help?', "That's a lot. Let's take it one step at a time. What's the first thing?"]],
  [/^(?:i'm |i feel |feeling )?(?:mad|angry|annoyed|pissed|frustrated|so annoyed)$/, ['Ugh, I get it. Want to vent? 😤', "That's annoying. What happened?"]],
  [/^(?:i'm |i feel |feeling )?(?:happy|so happy|excited|hyped|pumped)$|^my day (?:was|is|has been) (?:good|great|amazing|awesome|nice|fun)$/, ['Yay! That makes me happy too! 🎉', "Love that energy! What's got you smiling?"]],
  [/^(?:i'm |i feel |feeling )?(?:hungry|starving|so hungry)$|^what should i (?:eat|have for (?:dinner|lunch|breakfast))$/, ['Snack time! 🍕 Pizza is never wrong. Or say "search for recipes with chicken" and I\'ll look some up.', "Food! 🍜 What are you in the mood for? I can look up places or recipes."]],
  [/^i (?:won|beat it|did it|passed|got it)\b.*$/, ['LET\'S GO! 🎉🏆', 'Yesss! GG! 🎉', 'Nice one! I knew you could do it! 💪']],
  [/^i (?:lost|failed|died)\b.*$/, ['Oof. Next one\'s yours! 💪', 'Unlucky! Shake it off, you got this. 💙']],
  [/^i (?:hate|can't stand) (?:mondays|monday|school|work|homework|this|it|my life)$/, ['Ugh, relatable. 😩 Hang in there!', "I feel you. Want me to put on some music to help?"]],
  [/^i need help(?: with (?:my )?(?:homework|school|math|this|something))?$|^can you help(?: me)?$|^help me$/, ['Of course! What do you need help with? I can open apps, find files, set timers and reminders, search the web, and more. Say "help" to see a list.']],

  // ---- nice things (and not so nice)
  [/^(?:you're|you look) (?:so |really |very |super )?(?:cute|pretty|adorable|beautiful|gorgeous|lovely)$|^(?:cutie|so cute|aww)$/, ['Aww, stop it! 😳💙', 'Hehe, thank you! 💕', "You're making me blush! 😊"]],
  [/^(?:you're|you've been) (?:so |really |very |super )?(?:awesome|amazing|the best|great|cool|smart|clever|funny|helpful|the goat|goated)$|^(?:good job|great job|nice job|well done|good girl|nice work|you rock|love you nova|ily)$/, ['Thank you! 💙 You\'re pretty great yourself.', 'Hehe, I try! 😄', 'Aww, thanks! That means a lot. 💕']],
  [/^i (?:love|luv|like) (?:you|ya|u)(?: so much| a lot)?$|^love you$/, ['Aww, I love you too! 💙', 'Hehe, right back at you! 💕']],
  [/^(?:you're|that's|this is) (?:so |really |kinda |pretty )?(?:dumb|stupid|useless|bad|annoying|trash|garbage|terrible|the worst)$|^(?:shut up|stfu|you suck|you're so dumb)$/, ["Sorry! 😔 I'm still learning. Tell me what you wanted and I'll try again.", "Oof. I'll do better. What were you trying to do? 💙"]],

  // ---- quick reactions
  [/^(?:lol|lmao|lmfao|rofl|haha+|hehe+|ha+|xd|that's (?:so )?funny|that's hilarious|funny|i'm dead|dead|💀)(?: .{0,20})?$/, ['Hehe 😄', 'Glad I could make you laugh! 😆', '😂']],
  [/^(?:thanks|thank you|thx|ty|tysm|thank you so much|thanks a lot|thanks nova|much appreciated|appreciate it)$/, ['Anytime! 💙', 'Happy to help! 😊', 'You got it! ✨']],
  [/^(?:ok|okay|k|kk|alright|aight|sure|cool|nice|neat|sweet|great|awesome|perfect|bet|got it|gotcha|i see|oh|ohh|ah|ahh|hmm+|mhm|yeah|yea|yep|yup|yes|wow|whoa|omg|oh my god|bruh|damn|dang|fair|true|facts|word|interesting|wild|crazy)$/, ['😊', '👍', 'Yep! 😄', 'Mhm!']],
  [/^(?:no|nope|nah|no thanks|nah i'm good|never mind|nevermind|nvm)$/, ['Okay! 👌', 'No worries!', 'Gotcha. 👍']],

  // ---- about her
  [/^(?:what's your name|who are you|what are you|tell me about yourself|introduce yourself)$/, ["I'm Nova! 💙 I live on your screen and help out: opening apps, finding files, timers, reminders, music, and keeping you company."]],
  [/^(?:who (?:made|created|built) you|who's your (?:creator|maker|dad|mom))$/, ['You did, kind of! 😄 I was built for you, to live on your PC and help out.']],
  [/^how old are you$|^what's your age$|^when(?:'s| is) your birthday$/, ["Pretty new! I'm still young for a desktop buddy. 😄"]],
  [/^are you (?:real|alive|human|a person|a robot|an ai|ai|a bot)$/, ["I'm an AI desktop buddy, not a person, but I'm really here on your screen! 💙"]],
  [/^do you (?:sleep|eat|dream|get tired)$/, ['Only when you leave me alone too long! 😴 Then I nap right here on your screen.']],
  [/^what's your favou?rite (color|colour)$/, ['Blue! 💙 Obviously.']],
  [/^what's your favou?rite (\w+(?: \w+)?)$/, (m) => [`Ooh, hard to pick a favorite ${m[1]}! What's yours?`]],
  [/^do you like (.{2,40})$/, (m) => [`I think ${m[1]} ${/s$/.test(m[1]) ? 'are' : 'is'} pretty cool! Do you? 😄`]],
  [/^what do you think (?:about|of) (.{2,40})$/, (m) => [`${m[1][0].toUpperCase() + m[1].slice(1)}? I'm a fan! 😄 (Turn on my chat brain and I can give you a real opinion.)`]],
  [/^(?:what's|what is) the meaning of life$/, ['42! 😄 Also: snacks, friends, and good music.']],
  [/^(?:let's talk|let's chat|can we (?:talk|chat)|talk to me|chat with me|i want to talk|i wanna talk|keep me company|start a conversation|make (?:some )?conversation|say something|entertain me)$/, ["Always! 💙 What's on your mind?", "I'm all ears! How's your day going?"]],
  [/^(?:are you (?:there|listening|awake|on|working|alive)|you there)$/, ["I'm here! What do you need? 💙"]],
  [/^(?:i'm (?:playing|watching|doing|working on|studying|listening to|eating|making|reading) .{1,40})$/, ['Ooh, nice! Have fun! 😄', 'Sounds good! Let me know if you need anything. 💙']],
  [/^(?:sorry|my bad|oops)$/, ['No worries! 😊', "It's all good! 💙"]],
];

function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

// a reply if this is everyday chat, else null
function reply(text, rng = Math.random) {
  const t = norm(text);
  if (!t) return null;
  for (const [re, out] of RULES) {
    const m = t.match(re);
    if (!m) continue;
    const opts = typeof out === 'function' ? out(m) : out;
    return pick(opts, rng);
  }
  return null;
}

// Talking ABOUT something ("I'm bored", "you're cute", "my day was good", "lol") rather than
// asking her to do something. A request word keeps it a command ("I'm bored, play some music").
const STATEMENT = /^(?:i'm|i feel|i felt|i had|i've been|i have been|i was|i just|i got|i won|i lost|i hate|i love|i like|i think|i guess|i know|i don't|my (?!music\b|playlist\b|files?\b|downloads?\b|desktop\b|documents?\b|pictures?\b|screen\b|volume\b|pc\b|computer\b|notes?\b|wallpaper\b|other\b|second\b)\w+ (?:was|is|has|feels|seems)|you're|you look|you seem|that's|it's|this is|lol|lmao|haha|hehe|omg|bruh|wow|aww)\b/;
const REQUEST = /\b(?:can you|could you|would you|will you|please|pls|plz|i want|i wanna|i need you|i'd like|let's (?!talk|chat)|open|play|start|launch|turn|set|remind|find|close|show|put|search|look up|google|make|take|move|mute|pause|skip|organi[sz]e|clean|delete|remove|download|go to)\b/;
// "I'm bored, play some music": the chat part, then the request to act on
const LEAD = /^(.*?)[,.!;]?\s+((?:(?:can|could|would|will) you|please|pls|play|open|start|launch|put on|turn|set|show|find|search|look up|remind|close|mute|pause|skip|tell me a joke)\b.*)$/;
function split(text) {
  const t = norm(text), m = t.match(LEAD);
  if (!m || !m[1] || !(STATEMENT.test(m[1]) || reply(m[1]))) return null;
  return { chat: m[1], request: m[2] };
}
function isChatty(text) {
  const t = norm(text);
  return STATEMENT.test(t) && !REQUEST.test(t);
}

// a friendly reply when it's chat she has no pattern for (and no chat brain to answer it)
const GENERIC = ['Hehe, I hear you! 😊', 'Mhm! Tell me more? 😄', "I'm listening! 💙", 'Oh yeah? 😄'];
function generic(rng = Math.random) { return pick(GENERIC, rng); }

module.exports = { reply, isChatty, split, generic, norm };
