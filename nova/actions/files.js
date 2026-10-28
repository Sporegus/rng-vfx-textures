// Finding files and folders in your personal folders.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKIP = new Set(['node_modules', '.git', 'AppData', '$RECYCLE.BIN', 'System Volume Information', '__pycache__', '.cache']);

function userFolders() {
  const home = os.homedir();
  const names = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'OneDrive'];
  return names.map(n => path.join(home, n)).filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
}

// Walks folders breadth-first and calls visit(fullPath, dirent, stat). Stops
// after `limit` entries so a huge drive doesn't freeze Nova.
async function walk(roots, visit, { maxDepth = 6, limit = 60000 } = {}) {
  let queue = roots.map(r => [r, 0]);
  let seen = 0;
  while (queue.length && seen < limit) {
    const [dir, depth] = queue.shift();
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (++seen > limit) break;
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (visit(full, e, depth) === false) return;
      if (e.isDirectory() && depth < maxDepth) queue.push([full, depth + 1]);
    }
  }
}

async function stat(p) {
  try { return await fs.promises.stat(p); } catch { return null; }
}

async function find(query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { results: [] };
  const hits = [];
  await walk(userFolders(), (full, e) => {
    const n = e.name.toLowerCase();
    if (words.every(w => n.includes(w))) hits.push({ full, e, exact: path.parse(n).name === words.join(' ') });
    if (hits.length > 400) return false;
  });
  const results = [];
  for (const h of hits) {
    const st = await stat(h.full);
    if (st) results.push({ name: h.e.name, path: h.full, isDir: h.e.isDirectory(), size: st.size, mtime: st.mtimeMs, exact: h.exact });
  }
  results.sort((a, b) => (b.exact - a.exact) || (b.mtime - a.mtime));
  return { results: results.slice(0, 12), total: results.length };
}

async function recent() {
  const since = Date.now() - 7 * 86400000;
  const roots = userFolders().filter(p => /Desktop|Documents|Downloads/.test(p));
  const files = [];
  await walk(roots, (full, e) => { if (e.isFile()) files.push(full); }, { maxDepth: 3, limit: 20000 });
  const out = [];
  for (const f of files) {
    const st = await stat(f);
    if (st && st.mtimeMs > since) out.push({ name: path.basename(f), path: f, size: st.size, mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return { results: out.slice(0, 10) };
}

async function big() {
  const files = [];
  await walk(userFolders(), (full, e) => { if (e.isFile()) files.push(full); }, { maxDepth: 6, limit: 80000 });
  const out = [];
  for (const f of files) {
    const st = await stat(f);
    if (st && st.size > 50 * 1024 * 1024) out.push({ name: path.basename(f), path: f, size: st.size, mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.size - a.size);
  return { results: out.slice(0, 10) };
}

// files you haven't changed in `days` (Windows doesn't reliably record when a
// file was last opened, so "changed" is the safe measure), biggest first
async function old({ folder, days = 180 } = {}) {
  const since = Date.now() - days * 86400000;
  const roots = folder ? userFolders().filter(p => path.basename(p).toLowerCase() === folder) : userFolders().filter(p => /Desktop|Documents|Downloads|Pictures|Videos/.test(p));
  const found = [];
  await walk(roots, (full, e) => { if (e.isFile()) found.push(full); }, { maxDepth: 3, limit: 30000 });
  const out = [];
  for (const f of found) {
    const st = await stat(f);
    if (st && st.mtimeMs < since && !/\.(lnk|url|ini)$/i.test(f)) out.push({ name: path.basename(f), path: f, size: st.size, mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.size - a.size);
  return { results: out.slice(0, 60), total: out.length, bytes: out.reduce((a, f) => a + f.size, 0) };
}

// sends files to the Recycle Bin (never deletes for good), only inside your own folders
async function recycle(paths, shell) {
  const roots = userFolders().map(r => r.toLowerCase() + path.sep);
  let moved = 0; const failed = [];
  for (const p of paths || []) {
    const full = path.resolve(String(p));
    if (!roots.some(r => full.toLowerCase().startsWith(r))) { failed.push(path.basename(full)); continue; }
    try { await shell.trashItem(full); moved++; } catch { failed.push(path.basename(full)); }
  }
  return { moved, failed };
}

module.exports = { userFolders, walk, find, recent, big , old, recycle };
