// Desktop wallpaper: read, set, and remember the old one so you can go back.
const fs = require('fs');
const path = require('path');
const ps = require('./ps');
const files = require('./files');

const SET = `
Add-Type @"
using System.Runtime.InteropServices;
public class ZWall { [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int SystemParametersInfo(int a, int b, string c, int d); }
"@
# 20 = SPI_SETDESKWALLPAPER, 3 = save to profile + tell every app
[ZWall]::SystemParametersInfo(20, 0, $env:NOVA_ARG0, 3) | Out-Null
`;

async function get() {
  const out = await ps.run(`(Get-ItemProperty 'HKCU:\\Control Panel\\Desktop').WallPaper`);
  return out || null;
}

async function set(file, ctx) {
  if (!fs.existsSync(file)) throw new Error("I can't find that picture.");
  const s = ctx.settings();
  if (!s.originalWallpaper) {
    try { const cur = await get(); if (cur) ctx.saveSettings({ originalWallpaper: cur }); } catch {}
  }
  await ps.run(SET, [file]);
  return { path: file };
}

async function random(ctx) {
  const pics = files.userFolders().filter(p => /Pictures|OneDrive/.test(p));
  const imgs = [];
  await files.walk(pics, (full, e) => { if (e.isFile() && /\.(jpe?g|png|bmp)$/i.test(e.name)) imgs.push(full); }, { maxDepth: 4, limit: 20000 });
  if (!imgs.length) throw new Error('No pictures found in your Pictures folder.');
  return set(imgs[Math.floor(Math.random() * imgs.length)], ctx);
}

async function saveGenerated(dataUrl, ctx) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Bad image');
  const dir = path.join(ctx.app.getPath('pictures'), 'Nova Wallpapers');
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `nova-${Date.now()}.png`);
  await fs.promises.writeFile(file, Buffer.from(m[1], 'base64'));
  return set(file, ctx);
}

async function restore(ctx) {
  const orig = ctx.settings().originalWallpaper;
  if (!orig) throw new Error("I haven't changed your wallpaper yet.");
  await ps.run(SET, [orig]);
  ctx.saveSettings({ originalWallpaper: null });
  return { path: orig };
}

module.exports = { get, set, random, saveGenerated, restore };
