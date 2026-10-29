// Lines Nova has said before ("Opening Roblox now!"), saved so she can say them
// again straight away, at her best quality. Only the app's own lines are kept,
// never chat replies. Kept in her app data folder, oldest dropped past a limit.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LineCache {
  // dir: where to keep them; tag: anything that changes how she sounds (the model,
  // her clips), so old lines aren't reused after a change
  constructor(dir, tag, limitMB = 100) {
    this.dir = dir; this.tag = tag; this.limit = limitMB * 1e6; this.puts = 0;
    this.index = new Map(); // key -> file name ("<key>.<steps>.pcm")
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.pcm')) this.index.set(f.split('.')[0], f);
    } catch { this.dir = null; }
  }

  key(...parts) { return crypto.createHash('sha1').update(JSON.stringify([this.tag, ...parts])).digest('hex').slice(0, 24); }

  // -> { samples, steps } or null
  get(key) {
    if (!this.dir) return null;
    try {
      const name = this.index.get(key);
      if (!name) return null;
      const file = path.join(this.dir, name), b = fs.readFileSync(file);
      const samples = new Float32Array(b.length >> 1);
      for (let i = 0; i < samples.length; i++) samples[i] = b.readInt16LE(i * 2) / 32767;
      const now = new Date(); fs.utimesSync(file, now, now); // recently used: kept longer
      return { samples, steps: +name.split('.')[1] || 0 };
    } catch { return null; }
  }

  put(key, samples, steps) {
    if (!this.dir) return;
    try {
      if (this.index.has(key)) fs.rmSync(path.join(this.dir, this.index.get(key)), { force: true });
      const b = Buffer.alloc(samples.length * 2);
      for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
      const name = `${key}.${steps}.pcm`;
      fs.writeFileSync(path.join(this.dir, name), b);
      this.index.set(key, name);
      if (++this.puts % 20 === 1) this.trim();
    } catch {}
  }

  trim() {
    const files = [...this.index.values()].map(f => { const s = fs.statSync(path.join(this.dir, f)); return { f, size: s.size, t: s.mtimeMs }; }).sort((a, b) => b.t - a.t);
    let total = 0;
    for (const x of files) {
      total += x.size;
      if (total > this.limit) { fs.rmSync(path.join(this.dir, x.f), { force: true }); this.index.delete(x.f.split('.')[0]); }
    }
  }
}

module.exports = { LineCache };
