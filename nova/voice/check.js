// Tries Nova's natural voices (Orpheus) on this PC: downloads them the first time
// (about 2.5 GB, into Nova's models folder), checks the graphics card keeps up,
// and saves a sample of each voice to "Nova voice check" on your Desktop.
// Run: npm run voice-check
const fs = require('fs');
const os = require('os');
const path = require('path');
const models = require('./models');
const { OrpheusMouth, VOICES, REAL_TIME } = require('./orpheus');

const root = process.platform === 'win32'
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Nova', 'models')
  : path.join(os.homedir(), '.config', 'Nova', 'models');
const desktop = [path.join(os.homedir(), 'OneDrive', 'Desktop'), path.join(os.homedir(), 'Desktop')].find(fs.existsSync) || os.homedir();
const outDir = path.join(desktop, 'Nova voice check');

function wav(file, samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  fs.writeFileSync(file, b);
}

(async () => {
  console.log('Nova voice check\n');
  let last = 0;
  const { gguf, snac } = await models.ensureOrpheus(root, (done, total) => {
    if (Date.now() - last < 1000) return; last = Date.now();
    process.stdout.write(`\r  downloading ${total ? Math.floor(100 * done / total) + '% of ' + (total / 1e9).toFixed(1) + ' GB' : (done / 1e6).toFixed(0) + ' MB'}   `);
  });
  console.log('\r  models ready:', path.basename(gguf), '              ');
  const L = await import('node-llama-cpp');
  const llama = await L.getLlama();
  console.log('  using:', llama.gpu ? `graphics card (${llama.gpu})` : 'processor only (no graphics card found, so it will be slow)');
  const mouth = await OrpheusMouth.load(gguf, snac, llama);
  await mouth.say('Hi.', { voice: 'tara' }, () => {}); // warm up
  fs.mkdirSync(outDir, { recursive: true });

  const lines = [
    ['cute', "Hiii! I'm Nova, your desktop helper. Want me to open Roblox for you?"],
    ['happy', '<giggle> Okay, that one was actually really funny.'],
    ['excited', "<gasp> Whoa, you found it! That's amazing!"],
    ['sad', "<sigh> Aw, I couldn't find that file. I'm sorry."],
  ];
  const rows = [];
  for (const voice of VOICES.filter(v => !['leo', 'dan', 'zac'].includes(v))) {
    const parts = []; let speed = 0, first = 0;
    for (const [mood, text] of lines) {
      const t0 = Date.now(); let got = false;
      await mouth.say(text, { voice, mood }, (c) => { if (!got) { got = true; first = Math.max(first, Date.now() - t0); } parts.push(c); });
      speed += mouth.speed / lines.length;
      parts.push(new Float32Array(mouth.sampleRate * 0.5));
    }
    const n = parts.reduce((a, p) => a + p.length, 0), all = new Float32Array(n); let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    wav(path.join(outDir, `${voice}.wav`), all, mouth.sampleRate);
    rows.push({ voice, speed: Math.round(speed), first });
    console.log(`  ${voice.padEnd(5)} ${Math.round(speed)} sound tokens/s (needs ${REAL_TIME}) ${speed >= REAL_TIME ? 'keeps up' : 'TOO SLOW, would pause'}, starts talking after ${(first / 1000).toFixed(1)} s`);
  }
  console.log(`\nSamples saved in: ${outDir}`);
  console.log('Listen, pick your favorite, and choose it under Voice in Nova\'s tray menu (or tell Claude which one).');
})().catch((e) => { console.error('\nThe voice check failed:', e.message); process.exitCode = 1; });
