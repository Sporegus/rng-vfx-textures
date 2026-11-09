// Run this on your Windows PC (npm run check-windows) to test the Windows helper
// Nova uses for windows, UI text, screenshots and OCR. It only LOOKS: it never
// types, clicks, presses keys or moves anything. Prints PASS/FAIL per check.
'use strict';
const { createWin } = require('../core/win');
const log = { event: () => {} };
const checks = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); checks.push({ name, ok: true, ms: Date.now() - t0, detail }); console.log(`PASS  ${name} (${Date.now() - t0} ms)${detail ? '  ' + detail : ''}`); }
  catch (e) { checks.push({ name, ok: false, ms: Date.now() - t0, error: e.message }); console.log(`FAIL  ${name}: ${e.message}`); }
};
(async () => {
  if (process.platform !== 'win32') { console.log('This check is for Windows. Nothing to do here.'); return; }
  const win = createWin({ log });
  await check('helper starts and answers', async () => { const r = await win.call('ping', {}); return JSON.stringify(r); });
  await check('active window', async () => { const w = await win.foreground(); if (!w || !w.title) throw new Error('no title'); return `"${w.title}" (${w.process})`; });
  await check('list windows', async () => { const ws = await win.windows(); if (!Array.isArray(ws) || !ws.length) throw new Error('none'); return `${ws.length} windows`; });
  await check('monitors and scaling', async () => { const ms = await win.monitors(); if (!ms.length) throw new Error('none'); return `${ms.length} monitor(s): ${JSON.stringify(ms).slice(0, 200)}`; });
  await check('idle time / lock state', async () => { const r = await win.idle(); return `idle ${r.ms} ms, locked ${r.locked}`; });
  await check('UI Automation: focused element', async () => { const r = await win.uiaFocused(); return r ? `${r.type || ''} "${String(r.name || '').slice(0, 40)}"` : 'nothing focused'; });
  await check('screenshot of a small area', async () => { const r = await win.screenshot({ x: 0, y: 0, w: 200, h: 120 }); if (!r.png || r.png.length < 100) throw new Error('empty'); return `${r.w}x${r.h}, ${Math.round(r.png.length * 0.75 / 1024)} KB`; });
  await check('text recognition (OCR)', async () => { const s = await win.screenshot({ x: 0, y: 0, w: 600, h: 300 }); const r = await win.ocr(s.png); return `${String(r.text || '').length} characters read`; });
  await check('release keys (nothing held)', async () => { const r = await win.releaseAll(); return `released ${r.released}`; });
  win.stop();
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed.` + (failed ? ' Copy this output into the chat so the failures can be fixed.' : ' The Windows helper works on this PC.'));
  require('fs').writeFileSync(require('path').join(__dirname, '..', 'windows-check-result.json'), JSON.stringify({ ran: new Date().toISOString(), checks }, null, 2));
})();
