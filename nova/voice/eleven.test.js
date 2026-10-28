// Checks the ElevenLabs voice against a stand-in server that behaves like the real
// streaming API. Run: node voice/eleven.test.js
const http = require('http');
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; console.log('✗', what); } };
let lastBody = null;
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    lastBody = JSON.parse(body || '{}');
    if (req.headers['xi-api-key'] !== 'good-key') { res.writeHead(401); return res.end('{"detail":"invalid key"}'); }
    if (!req.url.startsWith('/v1/text-to-speech/my-voice/stream?output_format=pcm_24000')) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'audio/pcm' });
    // one second of a known pattern, sent in odd-sized pieces
    const pcm = Buffer.alloc(24000 * 2); for (let i = 0; i < 24000; i++) pcm.writeInt16LE((i % 200) * 100 - 10000, i * 2);
    for (let o = 0; o < pcm.length; o += 4097) { res.write(pcm.subarray(o, o + 4097)); await new Promise(r => setTimeout(r, 5)); }
    res.end();
  });
});
server.listen(0, async () => {
  process.env.NOVA_ELEVEN_API = 'http://127.0.0.1:' + server.address().port;
  const { ElevenMouth, MODELS, prepare } = require('./eleven');
  const m = new ElevenMouth({ key: 'good-key', voiceId: 'my-voice' });
  const got = []; await m.say('Hi there! 💙 <giggle> nice', { mood: 'excited' }, (c) => got.push(...c));
  check(got.length === 24000, 'all samples arrive: ' + got.length);
  check(got.every((v, i) => Math.abs(v - ((i % 200) * 100 - 10000) / 32768) < 1e-6), 'samples decode correctly');
  check(lastBody.text === 'Hi there! nice' && lastBody.model_id === MODELS.quick && lastBody.voice_settings.stability === 0.3, 'request: ' + JSON.stringify(lastBody));
  check(prepare('<giggle> Yay!', 'excited', MODELS.expressive) === '[excited] [giggles] Yay!', 'v3 tags: ' + prepare('<giggle> Yay!', 'excited', MODELS.expressive));
  const wrongKey = await new ElevenMouth({ key: 'nope', voiceId: 'my-voice' }).say('hi').then(() => 'ok', (e) => e.message);
  check(/key was refused/.test(wrongKey), 'wrong key message: ' + wrongKey);
  const wrongVoice = await new ElevenMouth({ key: 'good-key', voiceId: 'other' }).say('hi').then(() => 'ok', (e) => e.message);
  check(/voice ID/.test(wrongVoice), 'wrong voice message: ' + wrongVoice);
  // stopping part way
  let pieces = 0; const m2 = new ElevenMouth({ key: 'good-key', voiceId: 'my-voice' });
  await m2.say('long one', {}, () => { if (++pieces === 2) m2.hush(); });
  check(pieces === 2, 'hush stops it: ' + pieces);
  console.log(bad ? `${bad} problems` : 'all good');
  server.close(); process.exitCode = bad ? 1 : 0;
});
