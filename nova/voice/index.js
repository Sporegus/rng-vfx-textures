// Main-process side of Nova's voice: starts the background voice service,
// passes audio and words between it and Nova's page, and answers its questions
// (do this task, what's the weather, remember this).
const path = require('path');
const fs = require('fs');
const { utilityProcess, ipcMain, session, safeStorage } = require('electron');

module.exports = function startVoice({ app, getWin, settings, saveSettings, actions }) {
  const root = path.join(app.getPath('userData'), 'models');
  let proc = null, quitting = false, restarts = 0, chatReady = false, coreId = 0;
  const coreChats = new Map();
  const toPage = (m) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('voice', m); };

  // Nova's page may use the microphone (and nothing else that needs permission)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(perm === 'media' && (!details.mediaTypes || details.mediaTypes.every(t => t === 'audio'))));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media');

  // the page answers "task" requests (it knows how to do things); the rest are answered here
  let pageId = 0;
  const pageWaits = new Map();
  ipcMain.on('voice:answer', (_, id, result) => { const r = pageWaits.get(id); if (r) { pageWaits.delete(id); r(result); } });
  const askPage = (name, args) => new Promise((resolve) => {
    const id = ++pageId;
    pageWaits.set(id, resolve);
    toPage({ type: 'ask', id, name, args });
    setTimeout(() => { if (pageWaits.delete(id)) resolve('No answer.'); }, 15000);
  });
  async function answer(name, args) {
    const st = settings();
    if (name === 'task') return askPage('task', args);
    if (name === 'memory') return { name: st.userName, facts: st.memory || [] };
    if (name === 'remember') {
      const fact = String(args.fact || '').trim().slice(0, 200);
      if (!fact) return 'Nothing to remember.';
      const named = fact.match(/\bname is ([A-Z]?[a-z]+(?: [A-Z][a-z]+)?)/i);
      const city = fact.match(/\b(?:lives? in|from|live in) ([A-Za-z .'-]+?)\.?$/i);
      saveSettings({ memory: [...(st.memory || []).filter(f => f !== fact), fact].slice(-40), ...(named ? { userName: named[1] } : {}), ...(city && !st.city ? { city: city[1] } : {}) });
      return 'Saved.';
    }
    if (name === 'weather') {
      const r = await actions.run('weather.get', { place: args.place }).catch((e) => ({ text: e.message }));
      return r.needCity ? 'You don\'t know where the user lives yet; ask them which city.' : r.text;
    }
    return 'I can\'t do that.';
  }

  // Your ElevenLabs API key: encrypted with Windows' own protection and kept in its
  // own file, so it's never in settings.json and never reaches Nova's page.
  const keyFile = path.join(app.getPath('userData'), 'elevenlabs.key');
  let keyCache;
  const readKey = () => { if (keyCache !== undefined) return keyCache; try { keyCache = safeStorage.decryptString(fs.readFileSync(keyFile)); } catch { keyCache = null; } return keyCache; };
  const eleven = () => { const st = settings(); const key = readKey(); return key && st.elevenVoiceId ? { key, voiceId: st.elevenVoiceId, model: st.elevenModel || 'quick' } : null; };
  ipcMain.handle('eleven:set', async (_, { key, voiceId, model }) => {
    voiceId = String(voiceId || '').trim();
    if (!voiceId) return { ok: false, error: 'No voice ID' };
    if (key) {
      // Windows always has its encryption; on Linux without a keyring, Electron's
      // weaker built-in store is the fallback (Nova is a Windows app; this is for testing)
      if (!safeStorage.isEncryptionAvailable() && process.platform === 'linux' && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true);
      if (!safeStorage.isEncryptionAvailable() && process.platform !== 'linux') return { ok: false, error: 'This PC can\'t store the key safely' };
      const k = String(key).trim();
      fs.writeFileSync(keyFile, safeStorage.encryptStringAsync ? await safeStorage.encryptStringAsync(k) : safeStorage.encryptString(k));
      keyCache = k;
    } else if (!readKey()) return { ok: false, error: 'No API key' };
    saveSettings({ elevenVoiceId: voiceId, elevenModel: model || 'quick', elevenReady: true, voiceName: 'eleven', voice: true });
    if (proc) proc.postMessage({ type: 'eleven', creds: eleven() });
    return { ok: true };
  });
  ipcMain.handle('eleven:forget', () => { fs.rmSync(keyFile, { force: true }); keyCache = null; saveSettings({ elevenReady: false, voiceName: 'nova' }); if (proc) proc.postMessage({ type: 'eleven', creds: null }); return { ok: true }; });

  function start() {
    proc = utilityProcess.fork(path.join(__dirname, 'service.js'), [], { serviceName: 'Nova voice', stdio: 'ignore' });
    proc.on('message', async (m) => {
      // Nova's core asked the local chat brain something: its answer comes back here, not to the page
      if (typeof m.id === 'string' && m.id.startsWith('core-') && (m.type === 'sentence' || m.type === 'replied')) {
        const w = coreChats.get(m.id);
        if (w && m.type === 'sentence') w.onText && w.onText(m.text);
        if (w && m.type === 'replied') { coreChats.delete(m.id); w.resolve(m.text || ''); }
        return;
      }
      if (m.type === 'status' && m.what === 'chat') chatReady = m.state === 'ready';
      if (m.type === 'rpc') { const result = await answer(m.name, m.args || {}).catch((e) => e.message); if (proc) proc.postMessage({ type: 'rpc-reply', id: m.id, result }); return; }
      toPage(m);
    });
    proc.on('exit', () => {
      proc = null;
      toPage({ type: 'status', what: 'voice', state: 'stopped' });
      // if the voice service crashed (out of memory, a bad model), try again a couple of times
      if (!quitting && restarts++ < 3) setTimeout(start, 3000);
    });
    const st = settings();
    proc.postMessage({ type: 'setup', root, voice: !!(st.voice || st.listen), voiceName: st.voiceName, chat: !!st.chat, light: !!st.earsLight, chatModel: st.chatModel || null, eleven: eleven() });
  }
  // started on demand: only when voice is actually used (it holds speech models in memory)
  ipcMain.on('voice', (_, m) => {
    if (!proc) {
      if (!m || m.type === 'hush' || (m.type === 'listen' && !m.on)) return;   // nothing to do without it
      start();
    }
    if (proc) proc.postMessage(m);
  });
  app.on('will-quit', () => { quitting = true; if (proc) proc.kill(); });
  { const st = settings(); if (st.voice || st.listen || st.chat) start(); }   // otherwise it starts the first time you use voice
  // without the service running, the page still needs to know whether the voice models are already downloaded
  const reportModels = () => {
    if (proc) return;
    try {
      const models = require('./models');
      const have = ((models.have(root, 'clone') && models.have(root, 'vocos')) || models.have(root, 'voiceEmo') || models.have(root, 'voice')) && models.have(root, 'vad') && (models.have(root, 'ears') || models.have(root, 'earsLight'));
      toPage({ type: 'status', what: 'models', have: { voice: !!have } });
    } catch {}
  };
  { const w = getWin(); if (w && !w.isDestroyed()) { w.webContents.on('did-finish-load', () => setTimeout(reportModels, 500)); setTimeout(reportModels, 1500); } }
  return {
    send: (m) => { if (!proc) start(); proc && proc.postMessage(m); },
    running: () => !!proc,
    chatReady: () => !!(proc && chatReady),
    // the local chat brain, for the core's answers: ask(text, onText, signal) -> reply text
    ask(text, onText, signal) {
      return new Promise((resolve, reject) => {
        if (!proc) return reject(new Error('The voice service isn\'t running.'));
        const id = 'core-' + (++coreId);
        coreChats.set(id, { resolve, onText });
        if (signal) signal.addEventListener('abort', () => { coreChats.delete(id); proc && proc.postMessage({ type: 'hush' }); reject(Object.assign(new Error('Stopped.'), { category: 'cancelled' })); }, { once: true });
        proc.postMessage({ type: 'chat', id, text, opts: { voice: settings().voiceName, mood: 'cute', speed: 1, speak: false } });
      });
    },
  };
};
