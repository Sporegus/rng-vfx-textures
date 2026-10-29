// Makes before/after samples of Nova's voice once her own voice is trained:
// the same lines in her old voice and her own voice, saved as two files to
// compare (and to send to Claude if you want them checked).
//   npm run voice-sample
const fs = require('fs');
const os = require('os');
const path = require('path');
const so = require('sherpa-onnx-node');
const { Mouth } = require('../speech');

const appData = process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Nova') : path.join(os.homedir(), '.config', 'Nova');
const M = path.join(appData, 'models');
const small = path.join(M, 'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia'), vocoder = path.join(M, 'vocos_24khz.onnx');
const full = path.join(M, 'sherpa-onnx-zipvoice-distill-zh-en-emilia'), own = path.join(M, 'nova-own-voice');
const docs = [path.join(os.homedir(), 'OneDrive', 'Documents'), path.join(os.homedir(), 'Documents')].find(fs.existsSync) || os.homedir();
const out = path.join(docs, 'Nova voice training', 'samples');

const LINES = [
  ['cute', "Hiii! I'm Nova, your little desktop helper. Want me to open Roblox for you?"],
  ['excited', 'Ooh, I found your resume! It was hiding in your Downloads folder. Want me to open it?'],
  ['happy', 'Found God Did by DJ Khaled on Spotify. Hit play on the top result!'],
  ['proud', 'All sorted! Moved 37 files into 6 folders.'],
  ['sad', "Aw, I couldn't find that file anywhere. I'm really sorry."],
  ['calm', "It's getting late. Maybe it's time to get some rest."],
  ['shy', "Oh, um, thank you. That's really sweet of you to say."],
  ['pouty', "Hey! Don't drag me around like that!"],
  ['confused', "Wait, what? Did you want me to open the folder, or play the song?"],
  ['love', "You know what? I really like hanging out with you."],
];

(async () => {
  if (!fs.existsSync(path.join(own, 'fm_decoder.onnx'))) { console.error(`Her own voice isn't trained yet (looked in ${own}).`); process.exit(1); }
  if (!fs.existsSync(small)) { console.error('Turn on her voice in Nova once first, so her voice files are downloaded.'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  const voices = [
    ['before', new Mouth(small, 'clone', { clips: path.join(__dirname, '..', 'nova'), vocoder, hq: fs.existsSync(full) ? full : null })],
    ['after', new Mouth(small, 'clone', { clips: path.join(__dirname, '..', 'nova'), vocoder, hq: own })],
  ];
  for (const [name, mouth] of voices) {
    mouth.fixedSteps = 8; // her clearest, for a fair comparison
    const parts = [];
    for (const [i, [mood, text]] of LINES.entries()) {
      await mouth.say(text, { mood }, (c) => parts.push(c));
      parts.push(new Float32Array(mouth.sampleRate * 0.8));
      process.stdout.write(`\r  ${name}: ${i + 1} of ${LINES.length} lines   `);
    }
    const n = parts.reduce((a, p) => a + p.length, 0), all = new Float32Array(n); let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    so.writeWave(path.join(out, `${name}.wav`), { samples: all, sampleRate: mouth.sampleRate });
  }
  console.log(`\n\nSaved before.wav (her old voice) and after.wav (her own voice) in:\n  ${out}`);
})().catch((e) => { console.error('\n' + e.message); process.exitCode = 1; });
