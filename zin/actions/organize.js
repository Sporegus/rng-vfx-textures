// Sorts a folder's loose files into subfolders: by type (Images, Documents...),
// A to Z (a folder per first letter) or by date (a folder per month). Always
// makes a plan first (so Zin can show you what will happen), and writes an undo log.
const fs = require('fs');
const path = require('path');

const CATEGORIES = {
  Images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff', 'ico', 'psd'],
  Videos: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'm4v'],
  Music: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'],
  Documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'md', 'epub'],
  Archives: ['zip', 'rar', '7z', 'tar', 'gz', 'iso'],
  Installers: ['exe', 'msi', 'msix', 'appx'],
  Code: ['js', 'ts', 'py', 'lua', 'json', 'html', 'css', 'java', 'cs', 'cpp', 'c', 'h', 'rbxl', 'rbxm'],
  '3D': ['obj', 'fbx', 'blend', 'stl', 'glb', 'gltf'],
};
const KEEP = new Set(['desktop.ini', 'thumbs.db']);
const KEEP_EXT = new Set(['lnk', 'url', 'tmp', 'crdownload', 'part']); // shortcuts and half-finished downloads stay put

function categoryOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  for (const [cat, exts] of Object.entries(CATEGORIES)) if (exts.includes(ext)) return cat;
  return null;
}

const MONTHS = ['01 January', '02 February', '03 March', '04 April', '05 May', '06 June', '07 July', '08 August', '09 September', '10 October', '11 November', '12 December'];
async function plan(folder, mode = 'type') {
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  const moves = [];
  const summary = {};
  for (const e of entries) {
    if (!e.isFile() || KEEP.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
    if (KEEP_EXT.has(path.extname(e.name).slice(1).toLowerCase())) continue;
    let cat;
    if (mode === 'alpha') { const c = e.name[0].toUpperCase(); cat = /[A-Z]/.test(c) ? c : '#'; }
    else if (mode === 'date') {
      let t; try { t = (await fs.promises.stat(path.join(folder, e.name))).mtime; } catch { continue; }
      cat = path.join(String(t.getFullYear()), MONTHS[t.getMonth()]);
    } else cat = categoryOf(e.name);
    if (!cat) continue;
    moves.push({ from: path.join(folder, e.name), to: path.join(folder, cat, e.name), cat });
    summary[cat] = (summary[cat] || 0) + 1;
  }
  return { folder, moves, summary };
}

function freeName(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) { const c = path.join(dir, `${name} (${i})${ext}`); if (!fs.existsSync(c)) return c; }
}

async function apply(thePlan, undoDir, onProgress) {
  const done = [];
  const failed = [];
  for (const m of thePlan.moves) {
    try {
      await fs.promises.mkdir(path.dirname(m.to), { recursive: true });
      const dest = freeName(m.to);
      await fs.promises.rename(m.from, dest);
      done.push({ from: dest, to: m.from });
      if (onProgress) onProgress(done.length, thePlan.moves.length, m.cat);
    } catch (e) { failed.push({ file: path.basename(m.from), error: e.code || e.message }); }
  }
  if (done.length) {
    await fs.promises.mkdir(undoDir, { recursive: true });
    await fs.promises.writeFile(path.join(undoDir, `${Date.now()}.json`), JSON.stringify({ folder: thePlan.folder, moves: done }, null, 1));
  }
  return { moved: done.length, failed };
}

async function undoLast(undoDir) {
  let logs = [];
  try { logs = (await fs.promises.readdir(undoDir)).filter(f => f.endsWith('.json')).sort(); } catch {}
  if (!logs.length) return { restored: 0, nothing: true };
  const file = path.join(undoDir, logs[logs.length - 1]);
  const log = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  let restored = 0;
  for (const m of log.moves.reverse()) {
    try { await fs.promises.rename(m.from, freeName(m.to)); restored++; } catch {}
  }
  // tidy up the folders the sort made, if they're empty now
  const made = new Set(log.moves.map(m => path.dirname(m.from)));
  for (const d of [...made].sort((a, b) => b.length - a.length)) {
    try { await fs.promises.rmdir(d); } catch {}
    try { if (path.dirname(d) !== log.folder) await fs.promises.rmdir(path.dirname(d)); } catch {}
  }
  await fs.promises.unlink(file);
  return { restored, folder: log.folder };
}

module.exports = { plan, apply, undoLast, CATEGORIES };
