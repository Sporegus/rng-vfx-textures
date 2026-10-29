// Records Nova's training sentences in your ElevenLabs voice, one file each, so
// her own voice model can be trained on them (see README.md in this folder).
// Uses the API key and voice you saved in Nova; the key never leaves this PC.
//   npm run voice-record             shows what it will record and how many credits it takes
//   npm run voice-record -- --go     records (it skips what's already recorded, so you can stop and go again)
// Options: --model=<ElevenLabs model id> (default eleven_multilingual_v2), --voice=<voice ID>
const fs = require('fs');
const path = require('path');

const API = process.env.NOVA_ELEVEN_API || 'https://api.elevenlabs.io';
const RATE = 24000;
const MOODS = ['cute', 'happy', 'excited', 'sad', 'calm', 'shy', 'pouty', 'confused', 'proud', 'love'];
// the settings your ElevenLabs clips were made with (speed 1, stability 50, similarity 75)
const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 };

// the sentences, two at a time (a recording of about 5 to 10 seconds is what training likes)
function plan() {
  const out = [];
  for (const mood of MOODS) {
    const lines = fs.readFileSync(path.join(__dirname, `sentences-${mood}.txt`), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    let n = 0;
    for (let i = 0; i < lines.length;) {
      let text = lines[i++];
      if (i < lines.length && text.length + lines[i].length < 170) text += ' ' + lines[i++];
      out.push({ id: `${mood}-${String(++n).padStart(3, '0')}`, mood, text });
    }
  }
  return out;
}

function wav(samples16) {
  const b = Buffer.alloc(44 + samples16.length);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples16.length, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples16.length, 40); samples16.copy(b, 44);
  return b;
}

async function say(key, voiceId, model, text) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_${RATE}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/pcm' },
      body: JSON.stringify({ text, model_id: model, voice_settings: SETTINGS }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('ElevenLabs refused the API key. Set it up again in Nova (tray > Voice > Set up my ElevenLabs voice).');
    if (res.status === 404) throw new Error(`ElevenLabs couldn't find the voice ${voiceId}.`);
    if (/quota|credits|insufficient/i.test(body)) throw new Error('Out of ElevenLabs credits. What\'s recorded so far is kept; run it again after topping up.');
    // busy or a network hiccup: wait and try again a few times
    if (attempt >= 4) throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
}

module.exports = async function record(app, safeStorage) {
  const args = process.argv.slice(1);
  const opt = (name, def) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : def; };
  const go = args.includes('--go');
  const user = app.getPath('userData');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(path.join(user, 'settings.json'), 'utf8')); } catch {}
  const voiceId = opt('voice', settings.elevenVoiceId || 'X9FWmStt6EWpyHmBlB7C');
  const model = opt('model', 'eleven_multilingual_v2');
  const outDir = path.join(app.getPath('documents'), 'Nova voice training');
  const items = plan();
  const todo = items.filter(it => !fs.existsSync(path.join(outDir, 'wavs', it.id + '.wav')));
  const chars = todo.reduce((a, it) => a + it.text.length, 0);

  console.log('\nNova voice recorder');
  console.log(`  voice ${voiceId}, model ${model}`);
  console.log(`  ${items.length} recordings in all, ${items.length - todo.length} already done, ${todo.length} to go`);
  console.log(`  that's ${chars.toLocaleString()} characters: about ${chars.toLocaleString()} credits (less on Flash/Turbo models), about ${Math.round(chars / 14 / 60)} minutes of her talking`);
  console.log(`  saved to: ${outDir}`);
  if (!go) { console.log('\nTo start recording, run:  npm run voice-record -- --go\n'); return; }

  let key = null;
  try {
    // (on Linux without a keyring the key was stored with Electron's built-in fallback; Nova is a Windows app, this is for testing)
    if (process.platform === 'linux' && !safeStorage.isEncryptionAvailable() && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true);
    const enc = fs.readFileSync(path.join(user, 'elevenlabs.key'));
    key = safeStorage.decryptStringAsync ? (await safeStorage.decryptStringAsync(enc)).result : safeStorage.decryptString(enc);
  } catch {}
  if (!key) throw new Error('No ElevenLabs key saved yet. In Nova: tray > Voice > Set up my ElevenLabs voice, then run this again.');

  fs.mkdirSync(path.join(outDir, 'wavs'), { recursive: true });
  // the list of what's said in each file, for training
  fs.writeFileSync(path.join(outDir, 'recordings.tsv'), items.map(it => `${it.id}\t${it.mood}\t${it.text}`).join('\n') + '\n');
  let done = 0, used = 0;
  const t0 = Date.now();
  // two at a time
  const queue = [...todo];
  const worker = async () => {
    for (let it; (it = queue.shift());) {
      const pcm = await say(key, voiceId, model, it.text);
      fs.writeFileSync(path.join(outDir, 'wavs', it.id + '.wav'), wav(pcm));
      done++; used += it.text.length;
      const left = Math.round((Date.now() - t0) / done * (todo.length - done) / 1000);
      process.stdout.write(`\r  recorded ${done} of ${todo.length} (${used.toLocaleString()} characters), about ${Math.floor(left / 60)} min ${left % 60} s left   `);
    }
  };
  await Promise.all([worker(), worker()]);
  console.log(`\n\nAll done! ${items.length} recordings are in "${outDir}".`);
  console.log('Next: npm run voice-check-data\n');
};

module.exports.plan = plan;
