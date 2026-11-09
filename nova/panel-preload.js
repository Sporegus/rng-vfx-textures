// The Tasks panel's only bridge: read status, answer approvals, change a few
// settings, save keys (they go in, never come back out).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('novaPanel', {
  query: (what, arg) => ipcRenderer.invoke('core:query', what, arg),
  answer: (id, value) => ipcRenderer.send('core:answer', id, value),
  on: (cb) => ipcRenderer.on('core', (_, m) => cb(m)),
});
