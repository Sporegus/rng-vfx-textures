// The AI models Nova downloads the first time you turn on her voice or her chat.
// They're free and open, come from the projects' official release pages, and
// are saved in Nova's app data folder. Nothing you say ever leaves your PC.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const SHERPA = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/';

const MODELS = {
  // notices when someone is talking (silero VAD)
  vad: { label: 'listening', url: SHERPA + 'asr-models/silero_vad.onnx', file: 'silero_vad.onnx', mb: 1 },
  // turns speech into text (NVIDIA Parakeet, the most accurate of the ones we tested)
  ears: { label: 'ears', url: SHERPA + 'asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2', dir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8', mb: 482 },
  // a smaller, quicker one for slow PCs (Moonshine tiny)
  earsLight: { label: 'ears', url: SHERPA + 'asr-models/sherpa-onnx-moonshine-tiny-en-int8.tar.bz2', dir: 'sherpa-onnx-moonshine-tiny-en-int8', mb: 108 },
  // her own voice, Nova (ZipVoice): copies the voice and mood of the clips in voice/nova
  clone: { label: 'voice', url: SHERPA + 'tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2', dir: 'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia', mb: 109 },
  vocos: { label: 'voice', url: SHERPA + 'vocoder-models/vocos_24khz.onnx', file: 'vocos_24khz.onnx', mb: 54 },
  // the full-size version of the same voice model: clearer, fewer artifacts, but
  // slower; downloaded in the background once her voice is working (it also needs
  // the small one's word list). The parts it doesn't use are deleted after unpacking.
  cloneHQ: { label: 'clearer voice', url: SHERPA + 'tts-models/sherpa-onnx-zipvoice-distill-zh-en-emilia.tar.bz2', dir: 'sherpa-onnx-zipvoice-distill-zh-en-emilia', mb: 635, drop: ['fm_decoder_int8.onnx', 'text_encoder_int8.onnx', 'pinyin.raw', 'prompt.wav', 'vocos_24khz.onnx'] },
  // her emotional voice (Kyutai Pocket TTS): copies the mood of the clips in voice/emotions
  voiceEmo: { label: 'voice', url: SHERPA + 'tts-models/sherpa-onnx-pocket-tts-int8-2026-01-26.tar.bz2', dir: 'sherpa-onnx-pocket-tts-int8-2026-01-26', mb: 98 },
  // her classic voice (Kokoro v1.0, 54 voices; steady, no moods)
  voice: { label: 'voice', url: SHERPA + 'tts-models/kokoro-multi-lang-v1_0.tar.bz2', dir: 'kokoro-multi-lang-v1_0', mb: 350 },
};

// The chat model. Bigger is smarter but needs more memory; the first one that
// downloads is used. (These are Hugging Face model names, read by node-llama-cpp.)
const MINDS = {
  big: ['hf:unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M', 'hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M'],
  small: ['hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M'],
};

// The natural voice (Orpheus TTS, 3B, about 2 GB) and its sound decoder (SNAC).
// Several copies of the same model are listed in case one goes missing.
const ORPHEUS = [
  'hf:unsloth/orpheus-3b-0.1-ft-GGUF:Q4_K_M',
  'hf:isaiahbjork/orpheus-3b-0.1-ft-Q4_K_M-GGUF/orpheus-3b-0.1-ft-q4_k_m.gguf',
  'hf:lex-au/Orpheus-3b-FT-Q4_K_M.gguf/Orpheus-3b-FT-Q4_K_M.gguf',
];
const SNAC = [
  'https://huggingface.co/onnx-community/snac_24khz-ONNX/resolve/main/onnx/decoder_model.onnx',
  'https://huggingface.co/onnx-community/snac_24khz-ONNX/resolve/main/onnx/decoder_model_fp16.onnx',
];

const where = (root, key) => path.join(root, MODELS[key].file || MODELS[key].dir);
const have = (root, key) => fs.existsSync(where(root, key));

async function download(url, file, onProgress, signal) {
  const res = await fetch(url, { redirect: 'follow', signal });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  let done = 0, last = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => {
    done += c.length;
    if (onProgress && Date.now() - last > 250) { last = Date.now(); onProgress(done, total); }
  });
  await pipeline(body, fs.createWriteStream(file));
  if (onProgress) onProgress(done, total || done);
}

// Windows 10 and 11 come with tar, which is fast; if it can't, unpack in JavaScript
function untar(file, dir) {
  return new Promise((resolve) => {
    const p = spawn('tar', ['-xf', file, '-C', dir], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  }).then(async (ok) => {
    if (ok) return;
    const bunzip = require('unbzip2-stream');
    const tar = require('tar');
    await pipeline(fs.createReadStream(file), bunzip(), tar.x({ cwd: dir }));
  });
}

// makes sure a model is on disk; returns its path
async function ensure(root, key, onProgress, signal) {
  const m = MODELS[key];
  const target = where(root, key);
  if (fs.existsSync(target)) return target;
  fs.mkdirSync(root, { recursive: true });
  const part = path.join(root, path.basename(m.url) + '.part');
  try {
    await download(m.url, part, onProgress, signal);
    if (m.file) fs.renameSync(part, target);
    else {
      const tmp = path.join(root, '.unpack-' + key);
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp);
      await untar(part, tmp);
      for (const f of m.drop || []) fs.rmSync(path.join(tmp, m.dir, f), { force: true });
      fs.renameSync(path.join(tmp, m.dir), target);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } finally { fs.rmSync(part, { force: true }); }
  return target;
}

// makes sure the natural voice is on disk; returns { gguf, snac }
async function ensureOrpheus(root, onProgress) {
  const dir = path.join(root, 'orpheus');
  fs.mkdirSync(dir, { recursive: true });
  const snac = path.join(dir, 'snac_24khz_decoder.onnx');
  if (!fs.existsSync(snac)) {
    let err = null;
    for (const url of SNAC) {
      try { await download(url, snac + '.part', onProgress); fs.renameSync(snac + '.part', snac); err = null; break; }
      catch (e) { err = e; fs.rmSync(snac + '.part', { force: true }); }
    }
    if (err) throw err;
  }
  const L = await import('node-llama-cpp');
  let gguf = null, err = null;
  for (const uri of ORPHEUS) {
    try { gguf = await L.resolveModelFile(uri, { directory: dir, cli: false, onProgress: ({ downloadedSize, totalSize }) => onProgress && onProgress(downloadedSize, totalSize) }); break; }
    catch (e) { err = e; }
  }
  if (!gguf) throw err || new Error('Could not download the natural voice');
  return { gguf, snac };
}

module.exports = { MODELS, MINDS, ORPHEUS, SNAC, ensure, ensureOrpheus, have, where };
