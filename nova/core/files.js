// File tools with real safety:
//   - only inside folders you approved (your user folders and project folders)
//   - duplicates are decided by content (size, then SHA-256), never by name
//   - moves and renames are previewed first, never overwrite (collisions get " (2)"),
//     check free space, and are written to an undo journal
//   - deleting means the Recycle Bin, never permanent deletion
//   - locked/in-use files and other failures are reported per file (partial results are said plainly)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { id, NovaError } = require('./util');

function createFiles({ store, log, roots = () => [], trash }) {
  const inside = (p) => { const r = path.resolve(p); return roots().some(root => (r + path.sep).startsWith(path.resolve(root) + path.sep)); };
  const need = (p) => { if (!inside(p)) throw new NovaError('denied', `${p} isn't in a folder you've let Nova work in.`); };

  function walk(dir, { max = 20000, depth = 6 } = {}) {
    need(dir);
    const out = [];
    (function go(d, lvl) {
      if (out.length >= max || lvl > depth) return;
      let ents = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) go(p, lvl + 1);
        else if (e.isFile()) { try { out.push({ path: p, size: fs.statSync(p).size }); } catch {} }
        if (out.length >= max) return;
      }
    })(dir, 0);
    return out;
  }
  const hashFile = (p) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(p).on('error', rej).on('data', c => h.update(c)).on('end', () => res(h.digest('hex'))); });

  // groups of files with identical bytes (the oldest is suggested to keep)
  async function duplicates(dirs, { minSize = 1, signal } = {}) {
    const files = dirs.flatMap(d => walk(d)).filter(f => f.size >= minSize);
    const bySize = new Map();
    for (const f of files) (bySize.get(f.size) || bySize.set(f.size, []).get(f.size)).push(f);
    const groups = [];
    let hashed = 0;
    for (const same of bySize.values()) {
      if (same.length < 2) continue;
      const byHash = new Map();
      for (const f of same) {
        if (signal && signal.aborted) throw new NovaError('cancelled', 'Stopped.');
        try { const h = await hashFile(f.path); hashed++; (byHash.get(h) || byHash.set(h, []).get(h)).push(f); } catch { /* unreadable: skipped */ }
      }
      for (const [h, g] of byHash) if (g.length > 1) {
        const withTime = g.map(f => ({ ...f, mtime: fs.statSync(f.path).mtimeMs })).sort((a, b) => a.mtime - b.mtime);
        groups.push({ sha256: h, size: g[0].size, keep: withTime[0].path, extra: withTime.slice(1).map(f => f.path) });
      }
    }
    log && log.event('files.duplicates', { scanned: files.length, hashed, groups: groups.length });
    return { scanned: files.length, groups, wastedBytes: groups.reduce((a, g) => a + g.size * g.extra.length, 0) };
  }

  // a preview of moving files into a folder: final names, collisions, space
  function planMove(paths, destDir) {
    need(destDir);
    const taken = new Set();
    const steps = paths.map((src) => {
      need(src);
      if (!fs.existsSync(src)) return { from: src, problem: 'not there any more' };
      const base = path.basename(src), ext = path.extname(base), stem = base.slice(0, base.length - ext.length);
      let to = path.join(destDir, base), n = 2;
      while (fs.existsSync(to) || taken.has(to.toLowerCase())) to = path.join(destDir, `${stem} (${n++})${ext}`);
      taken.add(to.toLowerCase());
      return { from: src, to, renamed: path.basename(to) !== base, bytes: fs.statSync(src).size };
    });
    let free = null;
    try { const s = fs.statfsSync(fs.existsSync(destDir) ? destDir : path.dirname(destDir)); free = s.bavail * s.bsize; } catch {}
    const bytes = steps.reduce((a, s) => a + (s.bytes || 0), 0);
    return { id: id('plan'), destDir, steps, bytes, free, enoughSpace: free == null || bytes < free };
  }
  // do it: per-file results, an undo journal, never an overwrite
  function applyMove(plan) {
    if (!plan.enoughSpace) throw new NovaError('blocked', 'There isn\'t enough free space there.');
    fs.mkdirSync(plan.destDir, { recursive: true });
    const done = [], failed = [];
    for (const s of plan.steps) {
      if (s.problem) { failed.push({ from: s.from, why: s.problem }); continue; }
      if (fs.existsSync(s.to)) { failed.push({ from: s.from, why: 'something with that name appeared meanwhile' }); continue; }
      try {
        try { fs.renameSync(s.from, s.to); }
        catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(s.from, s.to, fs.constants.COPYFILE_EXCL); fs.unlinkSync(s.from); }
        done.push({ from: s.from, to: s.to });
      } catch (e) { failed.push({ from: s.from, why: lockedWhy(e) }); }
    }
    const journal = { id: id('undo'), kind: 'move', at: Date.now(), moves: done };
    if (done.length) store.remember('undo:' + journal.id, 'file_undo', journal);
    log && log.event('files.moved', { done: done.length, failed: failed.length });
    return { done, failed, undo: done.length ? journal.id : null };
  }
  // put moved files back, if they're still where Nova put them and their old place is free
  function undo(journalId) {
    const rec = store.recall('file_undo').find(r => r.value.id === journalId);
    if (!rec) throw new NovaError('not_found', 'Nothing to undo.');
    const back = [], failed = [];
    for (const m of rec.value.moves.slice().reverse()) {
      if (!fs.existsSync(m.to)) { failed.push({ file: m.to, why: 'it isn\'t there any more' }); continue; }
      if (fs.existsSync(m.from)) { failed.push({ file: m.to, why: 'something else is in its old place' }); continue; }
      try { fs.mkdirSync(path.dirname(m.from), { recursive: true }); fs.renameSync(m.to, m.from); back.push(m.from); } catch (e) { failed.push({ file: m.to, why: lockedWhy(e) }); }
    }
    store.forget(rec.key);
    return { back, failed };
  }
  // to the Recycle Bin (restorable there; Nova itself can't bring them back)
  async function recycle(paths) {
    if (!trash) throw new NovaError('unavailable', 'The Recycle Bin isn\'t available here, so nothing was deleted.');
    const done = [], failed = [];
    for (const p of paths) {
      try { need(p); await trash(p); done.push(p); } catch (e) { failed.push({ file: p, why: e.category === 'denied' ? e.message : lockedWhy(e) }); }
    }
    log && log.event('files.recycled', { done: done.length, failed: failed.length });
    return { done, failed };
  }
  return { duplicates, planMove, applyMove, undo, recycle, inside, hashFile };
}
function lockedWhy(e) { return e && (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') ? 'it\'s open in another program or locked' : (e && e.message) || 'failed'; }

module.exports = { createFiles };
