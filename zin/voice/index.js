// Main-process side of Zin's voice: starts the background voice service,
// passes audio and words between it and Zin's page, and answers its questions
// (do this task, what's the weather, remember this).
const path = require('path');
const { utilityProcess, ipcMain, session } = require('electron');

module.exports = function startVoice({ app, getWin, settings, saveSettings, actions }) {
  const root = path.join(app.getPath('userData'), 'models');
  let proc = null, quitting = false, restarts = 0;
  const toPage = (m) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('voice', m); };

  // Zin's page may use the microphone (and nothing else that needs permission)
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

  function start() {
    proc = utilityProcess.fork(path.join(__dirname, 'service.js'), [], { serviceName: 'Zin voice', stdio: 'ignore' });
    proc.on('message', async (m) => {
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
    proc.postMessage({ type: 'setup', root, voice: !!(st.voice || st.listen), voiceName: st.voiceName, chat: !!st.chat, light: !!st.earsLight, chatModel: st.chatModel || null });
  }
  ipcMain.on('voice', (_, m) => { if (proc) proc.postMessage(m); });
  app.on('will-quit', () => { quitting = true; if (proc) proc.kill(); });
  start();
  return { send: (m) => proc && proc.postMessage(m) };
};
