// Everything Nova understands: one entry per thing she can do.
//   examples  phrasings she learns from. {slot} placeholders are filled from FILL
//   risk      'auto' (just does it), 'ask' (asks first) or 'never'
//   needs     details she has to have; she asks for any that are missing
//   ready     false for abilities that are planned but not built yet
// Works in the browser (window.NovaIntents) and in Node (module.exports).
(function (root) {
  const FILL = {
    query: ['resume', 'tax return', 'invoice', 'essay', 'project proposal', 'vacation photos', 'minecraft screenshots', 'homework', 'budget spreadsheet', 'birthday video', 'contract', 'cover letter', 'report', 'lease agreement', 'recipe'],
    folder: ['downloads', 'desktop', 'documents', 'pictures', 'music', 'videos'],
    app: ['chrome', 'discord', 'steam', 'spotify', 'word', 'excel', 'notepad', 'calculator', 'vs code', 'obs', 'minecraft', 'roblox', 'firefox', 'photoshop', 'zoom', 'teams', 'outlook', 'file explorer', 'task manager', 'paint'],
    site: ['youtube', 'netflix', 'gmail', 'reddit', 'twitter', 'amazon', 'twitch', 'github', 'instagram', 'facebook'],
    song: ['blinding lights', 'bohemian rhapsody', 'lofi beats', 'taylor swift', 'drake', 'shape of you', 'some jazz', 'my liked songs', 'a chill playlist', 'the weeknd', 'lose yourself', 'some rock'],
    search: ['how to make pancakes', 'best gaming mouse', 'cat videos', 'minecraft tutorials', 'cheap flights to tokyo', 'how tall is mount everest', 'pizza places near me'],
    dur: ['5 minutes', '10 min', 'an hour', '30 seconds', 'half an hour', '2 hours', '20 mins', '45 minutes'],
    time: ['at 3pm', 'at 5', 'at 7:30', 'tomorrow at 9am', 'at noon', 'tonight at 8'],
    todo: ['call mom', 'take out the trash', 'drink water', 'check the oven', 'start my homework', 'stretch', 'join the meeting', 'feed the cat'],
    city: ['chicago', 'new york', 'london', 'tokyo', 'los angeles', 'paris', 'miami', 'toronto', 'seattle', 'dallas'],
    note: ['buy milk', 'pick up dry cleaning', 'idea for a game about cats', 'the wifi password is on the router', 'dentist on friday'],
  };

  const INTENTS = {
    // ---------------------------------------------------------------- files
    'files.find': { risk: 'auto', needs: ['query'], examples: [
      'find {query}', 'find my {query}', 'where is my {query}', "where's the {query}", 'search for {query}', 'look for my {query}',
      'can you find my {query}', 'locate {query}', 'i cant find my {query}', 'help me find the {query}', 'find the file called {query}',
      'where did i put my {query}', 'search my computer for {query}', 'find {query} file', 'look up the {query} file', 'get my {query}'] },
    'files.recent': { risk: 'auto', examples: [
      'show my recent files', 'what did i work on recently', 'recent files', 'what files did i open this week', 'show me what i was working on',
      'files i used lately', 'my latest files', 'what did i download recently', 'show recent documents'] },
    'files.big': { risk: 'auto', examples: [
      'find big files', 'what is taking up space', 'show me the biggest files', 'what files are huge', 'whats eating my storage',
      'find large files', 'which files take the most space', 'show huge files', 'biggest stuff on my pc'] },
    'files.old': { risk: 'ask', examples: [
      'clean up old files', 'find files i havent used in ages', 'delete old stuff i dont use', 'get rid of old files in {folder}',
      'find old files', 'what files have i not touched in months', 'clear out old {folder}', 'remove files i never use', 'clean old photos'] },
    'folder.open': { risk: 'auto', needs: ['folder'], examples: [
      'open {folder}', 'open my {folder} folder', 'show me my {folder}', 'take me to {folder}', 'go to my {folder}', 'open the {folder} folder',
      'show {folder} folder', 'bring up my {folder}'] },
    'organize': { risk: 'ask', needs: ['folder'], examples: [
      'organize my {folder}', 'sort my {folder}', 'clean up my {folder} folder', 'tidy up {folder}', 'organize {folder} by type',
      'sort {folder} alphabetically', 'organize my {folder} by date', 'put my {folder} in order', 'my {folder} is a mess', 'sort out my {folder}',
      'arrange {folder} a to z', 'organize the files in {folder}', 'group my {folder} by file type', 'organize {folder} by name', 'declutter my {folder}',
      'my {folder} folder is a mess', 'my {folder} is a disaster', 'my {folder} is so cluttered', 'my {folder} folder is messy', 'fix my messy {folder}'] },
    'organize.undo': { risk: 'auto', examples: [
      'undo', 'undo that', 'put my files back', 'undo the sort', 'revert the organize', 'put everything back how it was', 'undo last organize'] },
    'clean.junk': { risk: 'ask', examples: [
      'clean up my pc', 'clean my computer', 'free up space', 'delete junk files', 'clear temp files', 'my disk is full', 'empty the recycle bin',
      'clean junk', 'make some room on my drive', 'clear out the trash', 'get rid of junk', 'speed up my computer by cleaning', 'run a cleanup',
      'my computer is out of space', 'i am out of storage', 'running out of space', 'low on storage', 'not enough space on my drive', 'out of disk space'] },
    'files.dupes': { risk: 'ask', ready: false, examples: [
      'find duplicate files', 'are there duplicates', 'find duplicate photos', 'delete duplicate pictures', 'remove copies of files', 'find files i have twice'] },
    'files.convert': { risk: 'ask', ready: false, examples: [
      'convert my iphone photos to jpg', 'convert heic to jpg', 'resize these images', 'make these pictures smaller', 'convert png to jpg', 'shrink my photos'] },
    'files.zip': { risk: 'ask', ready: false, examples: [
      'zip my {folder}', 'unzip this', 'extract the zip file', 'compress this folder', 'make a zip of {folder}'] },
    'files.rename': { risk: 'ask', ready: false, examples: [
      'rename my photos by date', 'bulk rename files', 'rename all these files', 'rename my screenshots'] },

    // ---------------------------------------------------------------- apps, web and music
    'app.open': { risk: 'auto', needs: ['apps'], examples: [
      'open {app}', 'launch {app}', 'start {app}', 'run {app}', 'can you open {app}', 'fire up {app}', 'boot up {app}', 'open up {app} for me',
      'i want to use {app}', 'pull up {app}', 'get {app} open', 'load {app}'] },
    'app.close': { risk: 'ask', needs: ['apps'], examples: [
      'close {app}', 'quit {app}', 'kill {app}', 'shut down {app}', 'exit {app}', 'close out of {app}', 'stop {app}', 'end {app}', 'force close {app}'] },
    'web.open': { risk: 'auto', needs: ['apps'], examples: [
      'open {site}', 'go to {site}', 'take me to {site}', 'pull up {site}', 'open {site} in the browser', 'visit {site}', 'load {site} website'] },
    'web.search': { risk: 'auto', needs: ['query'], examples: [
      'google {search}', 'search the web for {search}', 'look up {search}', 'search google for {search}', 'youtube {search}', 'search youtube for {search}',
      'what is {search}', 'find me {search} online', 'look up {search} on youtube', 'can you google {search}',
      'how do i fix my bike', 'how to cook rice', 'how can i learn guitar', 'what is the capital of france', 'who won the game last night', 'why is the sky blue',
      'when is the next full moon', 'how do i change a tire', 'how do you make slime', 'what time is it in tokyo', 'how many ounces in a cup'] },
    'music.play': { risk: 'auto', examples: [
      'play {song}', 'play {song} on spotify', 'put on {song}', 'play some music', 'i want to listen to {song}', 'play the song {song}',
      'can you play {song}', 'throw on {song}', 'start playing {song}', 'play music by {song}', 'queue up {song}', 'blast {song}', 'spin {song}'] },
    'media.control': { risk: 'auto', examples: [
      'pause', 'pause the music', 'resume the music', 'next song', 'skip this song', 'skip', 'go back a song', 'previous track', 'stop the music',
      'unpause', 'play next track', 'skip track', 'pause spotify', 'resume'] },
    'volume': { risk: 'auto', examples: [
      'turn it up', 'volume up', 'turn the volume down', 'mute', 'unmute', 'its too loud', 'louder', 'quieter', 'set volume to 50',
      'turn down the sound', 'mute my computer', 'make it louder', 'lower the volume', 'raise the volume', 'turn the sound up'] },

    // ---------------------------------------------------------------- PC
    'pc.stats': { risk: 'auto', examples: [
      'how is my pc doing', 'check my computer', 'how much ram am i using', 'cpu usage', 'how much storage do i have left', 'battery level',
      'is my computer ok', 'pc health', 'system info', 'how full is my disk', 'how much memory is free', 'why is my pc slow'] },
    'theme': { risk: 'auto', examples: [
      'dark mode', 'turn on dark mode', 'switch to light mode', 'light mode', 'make windows dark', 'change the theme', 'enable dark theme', 'go light'] },
    'wallpaper': { risk: 'auto', examples: [
      'change my wallpaper', 'new background', 'give me a synthwave wallpaper', 'space wallpaper', 'set a random wallpaper', 'change my desktop background',
      'make a cool wallpaper', 'put my old wallpaper back', 'pixel hills wallpaper', 'glitch background', 'switch up my background',
      'i need a new wallpaper', 'give me a fresh background', 'new desktop picture', 'im bored of my wallpaper'] },
    'screenshot': { risk: 'auto', examples: [
      'take a screenshot', 'screenshot', 'grab my screen', 'capture the screen', 'snap the screen', 'take a picture of my screen', 'screen shot please', 'screenshot this', 'screenshot my screen'] },
    'pc.lock': { risk: 'auto', examples: ['lock my pc', 'lock the computer', 'lock screen', 'lock it', 'lock windows'] },
    'power': { risk: 'ask', examples: [
      'shut down my computer', 'turn off the pc', 'restart my computer', 'reboot', 'put the computer to sleep', 'shut down in {dur}',
      'turn off my pc in {dur}', 'restart in {dur}', 'sleep mode', 'power off', 'cancel the shutdown', 'shutdown the pc tonight'] },

    // ---------------------------------------------------------------- time
    'timer': { risk: 'auto', needs: ['seconds'], examples: [
      'set a timer for {dur}', 'timer {dur}', '{dur} timer', 'start a {dur} timer', 'countdown {dur}', 'time me for {dur}', 'set timer {dur}',
      'can you time {dur}', 'alarm in {dur}', 'focus timer', 'pomodoro', 'start a focus session'] },
    'reminder': { risk: 'auto', needs: ['text', 'when'], examples: [
      'remind me to {todo} in {dur}', 'remind me in {dur} to {todo}', 'remind me {time} to {todo}', 'remind me to {todo} {time}',
      'dont let me forget to {todo}', 'set a reminder to {todo}', 'reminder {todo} {time}', 'can you remind me to {todo}', 'in {dur} remind me to {todo}',
      'nudge me {time} about {todo}'] },
    'note.add': { risk: 'auto', needs: ['text'], examples: [
      'note {note}', 'write down {note}', 'take a note {note}', 'make a note that {note}', 'save a note {note}', 'jot down {note}',
      'add to my notes {note}', 'remember that {note}', 'note to self {note}'] },
    'time': { risk: 'auto', examples: ['what time is it', 'whats the time', 'what is the date', 'what day is it', 'what is todays date', 'tell me the time',
      'what time is it right now', 'what month is it', 'what is the date today', 'do you know what time it is', 'what year is it'] },
    'math': { risk: 'auto', examples: ['calculate this', 'do some math', 'can you do math', 'help me with math', 'calculator mode'] },
    'weather': { risk: 'auto', examples: [
      'whats the weather', 'what is the weather like', 'is it going to rain', 'will it rain tomorrow', 'how hot is it outside', 'do i need a jacket',
      'do i need an umbrella today', 'weather in {city}', 'whats the forecast', 'is it cold outside', 'what is the temperature outside', 'weather tomorrow',
      'is it going to snow', 'how is the weather in {city}', 'forecast for {city}', 'is it sunny', 'whats it like outside'] },
    'notes.open': { risk: 'auto', examples: ['open my notes', 'show my notes', 'what are my notes', 'read my notes', 'where are my notes'] },

    // ---------------------------------------------------------------- email
    'email.check': { risk: 'auto', ready: false, examples: [
      'do i have any new emails', 'check my email', 'any new mail', 'did anyone email me', 'check my inbox', 'how many unread emails', 'any messages',
      'got any emails for me', 'did i receive any emails', 'is there new mail', 'anything in my inbox', 'check mail'] },

    // ---------------------------------------------------------------- fun and chat
    'fun.dance': { risk: 'auto', examples: ['dance', 'dance for me', 'show me your moves', 'party time', 'bust a move', 'lets dance'] },
    'fun.joke': { risk: 'auto', examples: ['tell me a joke', 'make me laugh', 'say something funny', 'joke', 'got any jokes', 'i need a laugh'] },
    'fun.coin': { risk: 'auto', examples: ['flip a coin', 'heads or tails', 'coin toss', 'toss a coin'] },
    'fun.dice': { risk: 'auto', examples: ['roll a dice', 'roll a die', 'roll dice', 'give me a random number', 'roll'] },
    'fun.8ball': { risk: 'auto', examples: ['should i play games', 'should i go to bed', 'is today my lucky day', 'magic 8 ball', 'should i eat pizza'] },
    'fun.teleport': { risk: 'auto', examples: ['teleport', 'teleport somewhere', 'come here', 'go somewhere else', 'move over there', 'teleport to my mouse'] },
    'fun.sleep': { risk: 'auto', examples: ['go to sleep', 'take a nap', 'sleep', 'rest for a bit', 'go to bed nova'] },
    'chat.hello': { risk: 'auto', examples: ['hi', 'hello', 'hey', 'yo', 'sup', 'good morning', 'hey nova', 'hiya', 'whats up', 'good evening', 'hello there', 'hi there', 'hey there'] },
    'chat.thanks': { risk: 'auto', examples: ['thanks', 'thank you', 'thx', 'ty', 'thanks nova', 'appreciate it', 'you are the best', 'good job'] },
    'chat.how': { risk: 'auto', examples: ['how are you', 'how are you doing', 'hows it going', 'are you ok', 'how do you feel'] },
    'chat.who': { risk: 'auto', examples: ['who are you', 'what are you', 'whats your name', 'what is your name', 'tell me about yourself'] },
    'voice.hush': { risk: 'auto', examples: ['stop talking', 'be quiet', 'shut up', 'quiet please', 'hush', 'shh', 'stop speaking', 'zip it', 'you talk too much'] },
    'voice.off': { risk: 'auto', examples: ['stop listening', 'turn off your microphone', 'stop listening to me', 'mute your mic', 'turn off voice', 'dont listen to me', 'turn your ears off'] },
    'voice.on': { risk: 'auto', examples: ['start listening', 'turn on your voice', 'talk to me', 'can you talk', 'i want to talk to you', 'turn on voice mode', 'enable voice', 'listen to me', 'turn on your mic'] },
    'help': { risk: 'auto', examples: ['help', 'what can you do', 'what can i ask you', 'show me commands', 'how do i use you', 'what are your abilities', 'menu'] },
    'cancel': { risk: 'auto', examples: ['cancel', 'never mind', 'nevermind', 'stop', 'forget it', 'no', 'nope', 'dont'] },
  };

  const api = { FILL, INTENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NovaIntents = api;
})(typeof window !== 'undefined' ? window : globalThis);
