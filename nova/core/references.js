// The reference inbox: "save this image as an armour reference", "remember this link
// for the terrain", "find the mask reference I saved".
// "This" means something you explicitly picked: what's on your clipboard right now
// (an image, a link or text) or a file you gave her. Nova never indexes your drive
// or reads other windows to find it. Each item keeps its source, your note, the
// project it belongs to and when it was saved; files are copied into Nova's folder
// so the reference survives the original moving.
'use strict';
const fs = require('fs');
const path = require('path');
const { id, NovaError, sha256 } = require('./util');

function createReferences({ store, dir, log, clipboard, projects, open = {} }) {
  const all = () => store.recall('reference').map(r => r.value).filter(Boolean);
  const save = (ref) => { store.remember('ref:' + ref.id, 'reference', ref); return ref; };

  // what "this" is: the clipboard's image, link or text (read once, only when you ask)
  function current(want) {
    if (!clipboard) return null;
    const img = clipboard.image && clipboard.image();
    if (img && (want === 'image' || want === 'picture' || want === 'screenshot' || want === 'it') && img.png && img.png.length) return { kind: 'image', png: img.png, size: img.size };
    const text = (clipboard.text && clipboard.text() || '').trim();
    const url = text.match(/^https?:\/\/\S+$/i);
    if (url && (want === 'link' || want === 'page' || want === 'it')) return { kind: 'link', url: url[0] };
    if (text && (want === 'it' || want === 'text')) return { kind: 'text', text: text.slice(0, 4000) };
    if (img && img.png && img.png.length) return { kind: 'image', png: img.png, size: img.size };
    if (url) return { kind: 'link', url: url[0] };
    return null;
  }

  function add({ kind, png, url, text, file, tag, note, projectId }) {
    const ref = { id: id('ref'), kind, tag: tag ? String(tag).toLowerCase().slice(0, 40) : null, note: note ? String(note).slice(0, 500) : '', project: projectId || null, saved: Date.now(), source: null };
    const folder = path.join(dir, projectId || 'unfiled');
    if (kind === 'image') {
      fs.mkdirSync(folder, { recursive: true });
      const f = path.join(folder, `${ref.tag || 'image'}-${ref.id.slice(-6)}.png`);
      fs.writeFileSync(f, png);
      Object.assign(ref, { file: f, sha256: sha256(png), bytes: png.length, source: 'clipboard image' });
    } else if (kind === 'file') {
      if (!file || !fs.existsSync(file)) throw new NovaError('not_found', 'That file isn\'t there any more.');
      fs.mkdirSync(folder, { recursive: true });
      const b = fs.readFileSync(file);
      const f = path.join(folder, `${ref.id.slice(-6)}-${path.basename(file)}`);
      fs.copyFileSync(file, f);
      Object.assign(ref, { file: f, sha256: sha256(b), bytes: b.length, source: file });
    } else if (kind === 'link') Object.assign(ref, { url, source: url });
    else if (kind === 'text') Object.assign(ref, { text, source: 'clipboard text' });
    else throw new NovaError('invalid', 'Unknown reference kind.');
    log && log.event('reference.saved', { ref: ref.id, kind, tag: ref.tag, project: ref.project });
    return save(ref);
  }

  // search tag, note, link and file name; only the active/named project unless you ask for all
  function find(query, { projectId = undefined, limit = 10 } = {}) {
    const words = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !['the', 'my', 'saved', 'reference', 'references', 'i'].includes(w));
    return all()
      .filter(r => projectId === undefined || r.project === projectId)
      .map(r => ({ r, s: words.reduce((a, w) => a + ([r.tag, r.note, r.url, r.file && path.basename(r.file), r.text].some(f => String(f || '').toLowerCase().includes(w)) ? 1 : 0), 0) }))
      .filter(x => !words.length || x.s > 0).sort((a, b) => b.s - a.s || b.r.saved - a.r.saved).slice(0, limit).map(x => x.r);
  }
  function remove(rid) { const r = all().find(x => x.id === rid); if (!r) return false; if (r.file) { try { fs.rmSync(r.file, { force: true }); } catch {} } store.forget('ref:' + rid); return true; }
  function update(rid, patch) { const r = all().find(x => x.id === rid); if (!r) throw new NovaError('not_found', 'No such reference.'); if (patch.tag != null) r.tag = String(patch.tag).toLowerCase().slice(0, 40); if (patch.note != null) r.note = String(patch.note).slice(0, 500); if (patch.project !== undefined) r.project = patch.project; return save(r); }

  async function handle(task, r, { reply, choose }) {
    const proj = r.project && projects ? projects.resolve(r.project).match : projects && projects.active() ? projects.get(projects.active()) : null;
    if (r.op === 'save') {
      const what = current(r.what);
      if (!what) return reply(task, `Copy the ${r.what === 'it' ? 'image or link' : r.what} first (or drop a file into Tasks panel > References), then ask me again. I only save what you give me.`);
      const ref = add({ ...what, tag: r.tag, note: r.text, projectId: proj ? proj.id : null });
      return reply(task, `Saved the ${what.kind}${ref.tag ? ` as a "${ref.tag}" reference` : ''}${proj ? ` in ${proj.name}` : ''}.`, { ref: ref.id });
    }
    let hits = find(r.query, { projectId: proj ? proj.id : undefined });
    if (!hits.length && proj) hits = find(r.query).filter(x => !x.project);   // also look in unfiled ones, never in other projects
    if (!hits.length) return reply(task, `I don't have a saved reference matching "${r.query}"${proj ? ` in ${proj.name}` : ''}.`);
    const pick = hits.length === 1 ? hits[0].id : await choose(task, `Which one?`, hits.slice(0, 6).map(h => ({ label: `${h.tag || h.kind}${h.note ? ': ' + h.note.slice(0, 40) : ''}`, sub: new Date(h.saved).toLocaleDateString(), value: h.id })));
    const ref = hits.find(h => h.id === pick);
    if (!ref) return reply(task, 'Okay.');
    if (ref.file && open.path) await open.path(ref.file); else if (ref.url && open.url) await open.url(ref.url);
    return reply(task, `Here's your ${ref.tag || ''} reference (${ref.kind}${ref.url ? ': ' + ref.url : ''}, saved ${new Date(ref.saved).toLocaleDateString()}).`, { ref: ref.id });
  }

  return { add, find, remove, update, list: all, current, handle };
}

module.exports = { createReferences };
