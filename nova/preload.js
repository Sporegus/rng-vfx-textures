// The only bridge between Nova's page and the PC. The page can ask for named
// actions; it can't run arbitrary commands.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nova', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  action: (name, args) => ipcRenderer.invoke('action', name, args),
  capture: (on) => ipcRenderer.send('capture', on),
  focus: () => ipcRenderer.send('focus'),
  blur: () => ipcRenderer.send('blur'),
  hide: () => ipcRenderer.send('hide'),
  onSettings: (cb) => ipcRenderer.on('settings', (_, s) => cb(s)),
  onCommand: (cb) => ipcRenderer.on('command', (_, cmd, arg) => cb(cmd, arg)),
  onActiveWindow: (cb) => ipcRenderer.on('active-window', (_, w) => cb(w)),
  onBounds: (cb) => ipcRenderer.on('bounds', (_, b) => cb(b)),
  // her voice: send audio and requests to the voice service, hear back from it
  voice: {
    // set up your ElevenLabs voice (the key is encrypted by the main process and never comes back)
    eleven: (cfg) => ipcRenderer.invoke('eleven:set', cfg),
    forgetEleven: () => ipcRenderer.invoke('eleven:forget'),
    send: (m) => ipcRenderer.send('voice', m),
    answer: (id, result) => ipcRenderer.send('voice:answer', id, result),
    on: (cb) => ipcRenderer.on('voice', (_, m) => cb(m)),
  },
});
