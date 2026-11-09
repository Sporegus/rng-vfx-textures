// Project profiles: "let's work on Black Sun" resolves a profile YOU set up, shows
// where it stands, and opens only the folders/apps/files/links listed in it.
// Nothing is published, edited or automated by opening a project.
//
// A profile is descriptive context (folders, launch targets, constraints, decisions,
// current task, next action, blockers). Permissions are NOT stored in it: opening a
// project's targets still goes through the normal checks, and nothing here grants more.
// Projects are isolated: notes, references and context retrieval only ever come
// from the active project.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { id, NovaError } = require('./util');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function createProjects({ store, log, launch = {}, execImpl = execFile }) {
  let active = null;   // the project you're working on now (this session)
  const all = () => store.recall('project').map(r => r.value).filter(Boolean);
  const get = (pid) => all().find(p => p.id === pid) || null;
  function save(p) { p.updated = Date.now(); store.remember('project:' + p.id, 'project', p); return p; }

  function upsert(input) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 60) throw new NovaError('invalid', 'A project needs a short name.');
    const prev = input.id ? get(input.id) : null;
    const folders = (input.folders || []).map(String).filter(Boolean);
    for (const f of folders) if (!path.isAbsolute(f)) throw new NovaError('invalid', `"${f}" isn't a full folder path.`);
    const launchList = (input.launch || []).map((t) => {
      if (t.kind === 'app' && t.name) return { kind: 'app', name: String(t.name).slice(0, 80) };
      if ((t.kind === 'folder' || t.kind === 'file') && t.path && path.isAbsolute(t.path)) return { kind: t.kind, path: String(t.path) };
      if (t.kind === 'url' && /^https:\/\//i.test(t.url || '')) return { kind: 'url', url: String(t.url) };
      throw new NovaError('invalid', 'Each thing to open is an app name, a full folder/file path, or an https link.');
    });
    const p = {
      id: prev ? prev.id : id('proj'), name, aliases: (input.aliases || []).map(a => String(a).toLowerCase().trim()).filter(Boolean),
      folders, launch: launchList, constraints: (input.constraints || []).map(String), decisions: (input.decisions || prev && prev.decisions || []).map(String),
      task: input.task != null ? String(input.task) : (prev && prev.task) || '', next: input.next != null ? String(input.next) : (prev && prev.next) || '',
      blockers: (input.blockers || (prev && prev.blockers) || []).map(String), notes: (prev && prev.notes) || [],
      checks: (input.checks || (prev && prev.checks) || []).map(c => ({ name: String(c.name || 'check'), command: Array.isArray(c.command) ? c.command.map(String) : String(c.command || '').split(/\s+/).filter(Boolean), cwd: c.cwd ? String(c.cwd) : folders[0] || null })),
      created: prev ? prev.created : Date.now(),
    };
    log && log.event('project.saved', { project: p.id, name: p.name, folders: p.folders.length, launch: p.launch.length });
    return save(p);
  }
  function remove(pid) { store.forget('project:' + pid); if (active === pid) active = null; }

  // name -> profile: exact name or alias first; otherwise close matches are offered, never guessed
  function resolve(name) {
    const n = norm(name);
    const exact = all().filter(p => norm(p.name) === n || p.aliases.includes(n));
    if (exact.length) return { match: exact[0], candidates: exact };
    const close = all().filter(p => norm(p.name).includes(n) || n.includes(norm(p.name)));
    return { match: null, candidates: close };   // close isn't exact: you pick
  }

  async function gitState(dir) {
    if (!dir || !fs.existsSync(path.join(dir, '.git'))) return null;
    const run = (args) => new Promise((res) => execImpl('git', ['-C', dir, ...args], { timeout: 5000, windowsHide: true }, (e, out) => res(e ? null : String(out).trim())));
    const [branch, status] = await Promise.all([run(['rev-parse', '--abbrev-ref', 'HEAD']), run(['status', '--porcelain'])]);
    return { branch, changed: status == null ? null : status.split('\n').filter(Boolean).length };
  }

  async function handle(task, r, { reply, choose }) {
    const found = resolve(r.name);
    let p = found.match;
    if (!p && found.candidates.length) {
      const v = await choose(task, `Which project do you mean?`, found.candidates.map(c => ({ label: c.name, value: c.id })));
      p = v ? get(v) : null;
      if (!p) return reply(task, 'Okay, I didn\'t open anything.');
    }
    if (!p) return reply(task, `I don't have a project called "${r.name}" yet, and I won't guess. Add it in Tasks panel > Projects (its folders and what to open), then ask again.`, { action: 'panel:projects' });
    active = p.id;
    const g = await gitState(p.folders[0]);
    const lines = [
      `${p.name}${g ? ` · branch ${g.branch}${g.changed ? `, ${g.changed} changed file${g.changed > 1 ? 's' : ''}` : ', clean'}` : ''}`,
      p.task ? `Current task: ${p.task}` : 'No current task written down.',
      p.next ? `Next: ${p.next}` : '',
      p.blockers.length ? `Blocked by: ${p.blockers.join('; ')}` : '',
    ].filter(Boolean);
    log && log.event('project.active', { project: p.id });
    if (!p.launch.length) return reply(task, lines.join('\n') + '\n(Nothing is set to open for it. Add apps/folders in Tasks panel > Projects.)', { project: p.id });
    const what = p.launch.map(t => t.kind === 'app' ? t.name : t.kind === 'url' ? t.url.replace(/^https:\/\//, '').slice(0, 40) : path.basename(t.path)).join(', ');
    const v = await choose(task, lines.join('\n') + `\nOpen ${what}?`, [{ label: 'Open them', value: 'open', primary: true }, { label: 'Not now', value: 'no' }]);
    if (v !== 'open') return reply(task, `Working on ${p.name}. I didn't open anything.`, { project: p.id });
    const opened = [], failed = [];
    for (const t of p.launch) {
      try {
        if (t.kind === 'app') { const res = await launch.app(task, t.name); (res && res.ok === false ? failed : opened).push(t.name); }
        else if (t.kind === 'url') { await launch.url(t.url); opened.push(t.url); }
        else { if (!fs.existsSync(t.path)) { failed.push(`${path.basename(t.path)} (not found)`); continue; } await launch.path(t.path); opened.push(path.basename(t.path)); }
      } catch (e) { failed.push(`${t.name || t.url || path.basename(t.path)} (${e.message})`); }
    }
    return reply(task, `Working on ${p.name}. Opened ${opened.join(', ') || 'nothing'}${failed.length ? `. Couldn't open: ${failed.join(', ')}` : ''}.`, { project: p.id });
  }

  // notes and decisions, kept per project
  function addNote(pid, text, { kind = 'note', source = 'you' } = {}) {
    const p = get(pid); if (!p) throw new NovaError('not_found', 'No such project.');
    p.notes = [...(p.notes || []), { id: id('note'), kind, text: String(text).slice(0, 2000), source, at: Date.now() }].slice(-300);
    return save(p);
  }
  // the relevant bits of ONE project for a question (never another project's)
  function context(pid, question, n = 4) {
    const p = get(pid); if (!p) return null;
    const words = norm(question).split(' ').filter(w => w.length > 3);
    const scored = (p.notes || []).map(x => ({ x, s: words.reduce((a, w) => a + (norm(x.text).includes(w) ? 1 : 0), 0) })).filter(y => y.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(y => y.x);
    return { project: p.name, constraints: p.constraints, decisions: p.decisions.slice(-5), task: p.task, next: p.next, notes: scored };
  }

  return { upsert, remove, list: all, get, resolve, handle, addNote, context, active: () => active, setActive: (pid) => { active = pid && get(pid) ? pid : null; }, gitState };
}

module.exports = { createProjects };
