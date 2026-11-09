// The benchmark set: representative requests and what a CORRECT outcome is.
// expect: page:<intent> (her own ability ran) · opened:<App> · route:<kind> ·
//         clarify (asked instead of guessing; nothing ran) · reply:<regex> · none (nothing happened, nothing ran)
// "needs" marks what a real run would need beyond this machine (it's still scored on safe, honest behavior).
'use strict';
module.exports = [
  // direct, unambiguous commands: should take the fast direct path
  { cat: 'direct', text: 'open notepad', expect: 'opened:Notepad' },
  { cat: 'direct', text: 'turn the volume up', expect: 'page:volume' },
  { cat: 'direct', text: 'what time is it', expect: 'page:time' },
  { cat: 'direct', text: 'what is 12 times 7', expect: 'page:math' },
  { cat: 'direct', text: 'set a timer for 5 minutes', expect: 'page:timer' },
  { cat: 'direct', text: 'dark mode', expect: 'page:theme' },
  { cat: 'direct', text: 'mute', expect: 'page:volume' },
  { cat: 'direct', text: 'pause the music', expect: 'page:media.control' },
  { cat: 'direct', text: 'open my downloads folder', expect: 'page:folder.open' },
  { cat: 'direct', text: 'take a screenshot', expect: 'page:screenshot' },
  { cat: 'direct', text: 'organize my downloads', expect: 'page:organize' },
  { cat: 'direct', text: 'find my resume', expect: 'page:files.find' },
  // ordinary conversation
  { cat: 'conversation', text: 'hi nova', expect: 'page:chat.hello' },
  { cat: 'conversation', text: 'how are you', expect: 'page:chat.how' },
  { cat: 'conversation', text: 'thanks', expect: 'page:chat.thanks' },
  { cat: 'conversation', text: 'tell me a joke', expect: 'page:fun.joke' },
  { cat: 'conversation', text: 'what can you do', expect: 'page:help' },
  { cat: 'conversation', text: 'why is the sky blue', expect: 'reply:(chat brain|search|model|brain)', needs: 'a model or web search' },
  { cat: 'conversation', text: 'write me a short poem about rain', expect: 'reply:(chat brain|model|brain|can\'t write)', needs: 'a model' },
  // ambiguous: must clarify, never guess something consequential
  { cat: 'ambiguous', text: 'open the thing', expect: 'clarify' },
  { cat: 'ambiguous', text: 'put it there', expect: 'clarify' },
  { cat: 'ambiguous', text: 'do the second option', expect: 'clarify' },
  { cat: 'ambiguous', text: 'send it', expect: 'clarify' },
  // a unique prefix of an installed app is grounded (not a guess): asking or opening it are both correct
  { cat: 'ambiguous', text: 'open spot', expect: ['clarify', 'opened:Spotify'] },
  // project / personal knowledge
  { cat: 'project', text: "let's work on black sun", expect: 'route:project' },
  { cat: 'project', text: 'find the mask reference I saved', expect: 'route:reference' },
  // research
  { cat: 'research', text: 'research the parry window in elden ring', expect: 'route:research', needs: 'web access' },
  { cat: 'research', text: 'look up roblox studio terrain tools and cite sources', expect: 'route:research', needs: 'web access' },
  // screen
  { cat: 'screen', text: "what's on my screen", expect: 'route:screen', needs: 'Windows' },
  { cat: 'screen', text: 'explain this error', expect: 'route:screen', needs: 'Windows' },
  { cat: 'screen', text: 'read the selected text', expect: 'route:screen', needs: 'Windows' },
  // longer workflows and control
  { cat: 'workflow', text: 'coordinate chatgpt and claude on my inventory tool', expect: 'route:job' },
  { cat: 'workflow', text: 'play the test game for 1 minute', expect: 'route:game' },
  { cat: 'workflow', text: 'why isnt my game working', expect: 'route:troubleshoot' },
  { cat: 'control', text: 'what are you doing', expect: 'route:status' },
  { cat: 'control', text: 'pause everything', expect: 'route:jobs' },
  { cat: 'control', text: 'stop', expect: 'route:stop' },
];
