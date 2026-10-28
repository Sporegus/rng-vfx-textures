// Junk cleanup. Scans first and reports sizes; only cleans what you tick.
// Temp files are deleted (Windows recreates what it needs); everything else
// goes to the Recycle Bin so it can be restored.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const ps = require('./ps');
const files = require('./files');

const DAY = 86400000;

async function sizeOf(dir, olderThan = 0) {
  let bytes = 0, count = 0;
  const list = [];
  await files.walk([dir], (full, e) => { if (e.isFile()) list.push(full); }, { maxDepth: 8, limit: 50000 });
  for (const f of list) {
    try {
      const st = await fs.promises.stat(f);
      if (olderThan && Date.now() - st.mtimeMs < olderThan) continue;
      bytes += st.size; count++;
    } catch {}
  }
  return { bytes, count };
}

async function oldInstallers() {
  const dl = path.join(os.homedir(), 'Downloads');
  const out = [];
  try {
    for (const name of await fs.promises.readdir(dl)) {
      if (!/\.(exe|msi)$/i.test(name)) continue;
      const full = path.join(dl, name);
      const st = await fs.promises.stat(full);
      if (Date.now() - st.mtimeMs > 14 * DAY) out.push({ path: full, size: st.size });
    }
  } catch {}
  return out;
}

async function recycleBinSize() {
  try {
    const out = await ps.run(`$s = 0; $n = 0; (New-Object -ComObject Shell.Application).Namespace(0xA).Items() | ForEach-Object { $s += $_.Size; $n++ }; "$s $n"`);
    const [bytes, count] = out.split(' ').map(Number);
    return { bytes: bytes || 0, count: count || 0 };
  } catch { return { bytes: 0, count: 0 }; }
}

async function scan() {
  const temp = os.tmpdir();
  const [tmp, bin, inst] = await Promise.all([sizeOf(temp, DAY), recycleBinSize(), oldInstallers()]);
  return {
    items: [
      { id: 'temp', label: 'Temporary files', bytes: tmp.bytes, count: tmp.count, note: 'Leftovers apps forgot to delete' },
      { id: 'recycle', label: 'Recycle Bin', bytes: bin.bytes, count: bin.count, note: 'Empties it for good' },
      { id: 'installers', label: 'Old installers in Downloads', bytes: inst.reduce((a, b) => a + b.size, 0), count: inst.length, note: 'Setup files older than 2 weeks (go to Recycle Bin)' },
    ],
  };
}

async function run(ids) {
  let freed = 0;
  if (ids.includes('temp')) {
    const list = [];
    await files.walk([os.tmpdir()], (full, e) => { if (e.isFile()) list.push(full); }, { maxDepth: 8, limit: 50000 });
    for (const f of list) {
      try {
        const st = await fs.promises.stat(f);
        if (Date.now() - st.mtimeMs < DAY) continue; // might still be in use
        await fs.promises.unlink(f);
        freed += st.size;
      } catch {} // locked files are skipped
    }
  }
  if (ids.includes('installers')) {
    for (const f of await oldInstallers()) {
      try { await shell.trashItem(f.path); freed += f.size; } catch {}
    }
  }
  if (ids.includes('recycle')) {
    const bin = await recycleBinSize();
    try { await ps.run('Clear-RecycleBin -Force -ErrorAction SilentlyContinue'); freed += bin.bytes; } catch {}
  }
  return { freed };
}

module.exports = { scan, run };
