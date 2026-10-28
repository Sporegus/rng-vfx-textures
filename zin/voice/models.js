// The AI models Zin downloads the first time you turn on her voice or her chat.
// They're free and open, come from the projects' official release pages, and
// are saved in Zin's app data folder. Nothing you say ever leaves your PC.
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
      fs.renameSync(path.join(tmp, m.dir), target);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } finally { fs.rmSync(part, { force: true }); }
  return target;
}

module.exports = { MODELS, MINDS, ensure, have, where };
