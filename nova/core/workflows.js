// Routines and learned workflows: named, versioned procedures ("start gaming mode",
// "save that as my stream setup"). Each step is a real Nova action with its own
// checks; nothing is a list of screen coordinates.
//
//   steps: { type: 'app', name }                 open an installed app (verified)
//          { type: 'intent', intent, slots }      one of her own abilities (theme, volume, timer, notes…)
//          { type: 'setting', key, value }        Nova's own setting (performance, reasoning, dnd): reversible
//          { type: 'window', op, which }          arrange/move the window in front (Windows)
//   preconditions: { kind: 'folder-exists', path } | { kind: 'windows' }
//
// Running one shows what it will do and what can be undone, then asks once.
// "Always for this version" is your explicit choice and ends the moment the routine
// is edited; a successful run never turns into permanent permission on its own.
// Ending a routine restores only what is actually reversible, and says what isn't.
'use strict';
const fs = require('fs');
const { id, NovaError, sha256 } = require('./util');

const NOVA_SETTINGS = { performance: ['gaming', 'balanced', 'overnight'], reasoning: ['auto', 'quick', 'think', 'thorough'], dnd: [true, false] };
const PRESETS = [
  { name: 'Gaming', steps: [{ type: 'setting', key: 'performance', value: 'gaming' }, { type: 'setting', key: 'dnd', value: true }, { type: 'app', name: 'Discord' }] },
  { name: 'Study', steps: [{ type: 'setting', key: 'dnd', value: true }, { type: 'intent', intent: 'notes.open', slots: {} }, { type: 'intent', intent: 'timer', slots: { seconds: 1500, label: 'Focus' } }] },
  { name: 'Development', steps: [{ type: 'setting', key: 'reasoning', value: 'think' }, { type: 'setting', key: 'performance', value: 'balanced' }, { type: 'app', name: 'Visual Studio Code' }] },
  { name: 'Wind down', steps: [{ type: 'intent', intent: 'theme', slots: { mode: 'dark' } }, { type: 'setting', key: 'dnd', value: true }, { type: 'setting', key: 'performance', value: 'overnight' }] },
];

function describeStep(s) {
  if (s.type === 'app') return { text: `Open ${s.name}`, reversible: false, why: 'you can close it yourself' };
  if (s.type === 'setting') return { text: s.key === 'dnd' ? (s.value ? 'Turn on Nova\'s do-not-disturb' : 'Turn off do-not-disturb') : `Set ${s.key} to ${s.value}`, reversible: true };
  if (s.type === 'window') return { text: `${s.op === 'arrange' ? 'Arrange' : 'Move'} the window in front${s.which ? ` (${s.which})` : ''}`, reversible: false, why: 'the old position isn\'t restored' };
  if (s.type === 'intent') {
    const t = { theme: `Switch to ${s.slots.mode || 'the other'} mode`, timer: `Start a ${Math.round((s.slots.seconds || 0) / 60)}-minute ${s.slots.label || ''} timer`, volume: `Volume ${s.slots.cmd || ''}`, 'notes.open': 'Open your notes', 'media.control': `Music: ${s.slots.cmd || ''}`, 'folder.open': `Open your ${s.slots.folder || ''} folder` }[s.intent] || s.intent;
    return { text: t.replace(/\s+/g, ' ').trim(), reversible: false, why: s.intent === 'theme' ? 'Nova can\'t read what it was before' : 'not undoable' };
  }
  return { text: JSON.stringify(s), reversible: false };
}
function validateSteps(steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 20) throw new NovaError('invalid', 'A routine needs 1 to 20 steps.');
  for (const s of steps) {
    if (s.type === 'app' && typeof s.name === 'string' && s.name.trim()) continue;
    if (s.type === 'setting' && NOVA_SETTINGS[s.key] && NOVA_SETTINGS[s.key].includes(s.value)) continue;
    if (s.type === 'intent' && typeof s.intent === 'string' && !/^(power|app\.close|files\.|organize|clean|pc\.lock)/.test(s.intent)) continue;   // nothing destructive or consequential in routines
    if (s.type === 'window' && ['arrange', 'move'].includes(s.op)) continue;
    throw new NovaError('invalid', `A routine can't include that step (${JSON.stringify(s).slice(0, 80)}).`);
  }
  return steps;
}

function createWorkflows({ store, log, settings, saveSettings, run }) {
  // run: { app(task, name) -> {ok, note}, intent(task, step) -> {ok}, window(task, step) -> {ok} }
  const all = () => store.recall('workflow').map(r => r.value).filter(Boolean);
  const get = (name) => all().find(w => w.name.toLowerCase() === String(name).toLowerCase().trim());
  const save = (w) => { store.remember('workflow:' + w.id, 'workflow', w); return w; };
  const hashOf = (w) => sha256(JSON.stringify(w.steps)).slice(0, 16);

  function ensurePresets() { for (const p of PRESETS) if (!get(p.name)) create({ name: p.name, steps: p.steps, provenance: { kind: 'preset' } }); }
  function create({ name, steps, preconditions = [], provenance = { kind: 'you' } }) {
    if (!name || String(name).length > 40) throw new NovaError('invalid', 'Give the routine a short name.');
    if (get(name)) throw new NovaError('invalid', `There's already a routine called "${name}".`);
    const w = { id: id('wf'), name: String(name).trim(), version: 1, steps: validateSteps(steps), preconditions, provenance: { ...provenance, at: Date.now() }, history: [], approvedHash: null, created: Date.now() };
    log && log.event('workflow.created', { workflow: w.id, name: w.name, steps: w.steps.length, from: provenance.kind });
    return save(w);
  }
  function edit(name, { steps, why = 'edited' }) {
    const w = get(name); if (!w) throw new NovaError('not_found', 'No such routine.');
    w.history = [...w.history, { version: w.version, steps: w.steps, at: Date.now(), why }].slice(-20);
    w.steps = validateSteps(steps); w.version++; w.approvedHash = null;   // an edited routine needs a fresh OK
    return save(w);
  }
  function revert(name) {
    const w = get(name); if (!w || !w.history.length) throw new NovaError('invalid', 'There\'s no earlier version.');
    const prev = w.history[w.history.length - 1];
    w.history = w.history.slice(0, -1).concat([{ version: w.version, steps: w.steps, at: Date.now(), why: 'reverted' }]);
    w.steps = prev.steps; w.version++; w.approvedHash = null;
    return save(w);
  }
  function remove(name) { const w = get(name); if (w) store.forget('workflow:' + w.id); return !!w; }

  function preconditionsFail(w) {
    for (const p of w.preconditions || []) {
      if (p.kind === 'folder-exists' && !fs.existsSync(p.path)) return `${p.path} isn't there`;
    }
    return null;
  }

  // run it: preview -> one approval -> steps with checks -> honest summary; remember what to undo
  async function start(task, name, { approve, reply, choose, run: runner = run }) {
    const w = get(name);
    if (!w) return reply(task, `I don't have a routine called "${name}". Your routines: ${all().map(x => x.name).join(', ') || 'none'}.`);
    const bad = preconditionsFail(w);
    if (bad) return reply(task, `I didn't start ${w.name}: ${bad}.`);
    const plan = w.steps.map(describeStep);
    if (w.approvedHash !== hashOf(w)) {
      let g;
      try {
        g = await approve(task, { title: `Start ${w.name}?`, lines: [...plan.map((p, i) => `${i + 1}. ${p.text}${p.reversible ? '' : ` (can't be undone: ${p.why})`}`), 'Say "end ' + w.name.toLowerCase() + ' mode" to put back what can be put back.'], categories: ['launch', 'system', 'window'], remember: 'Always for this version', ttlMs: 10 * 60000 });
      } catch (e) { if (e.category === 'denied') return reply(task, `Okay, I didn't start ${w.name}.`); throw e; }
      if (g && g.details && g.details.remember) { w.approvedHash = hashOf(w); save(w); }
    }
    const undo = [], done = [], failed = [];
    for (const [i, s] of w.steps.entries()) {
      if (task.ac && task.ac.signal.aborted) break;
      try {
        if (s.type === 'setting') { undo.push({ key: s.key, value: (settings() || {})[s.key] }); saveSettings({ [s.key]: s.value }); done.push(plan[i].text); }
        else if (s.type === 'app') { const r = await runner.app(task, s.name); (r && r.ok ? done : failed).push(r && r.ok ? plan[i].text : `${plan[i].text} (${(r && r.note) || 'not found'})`); }
        else if (s.type === 'intent') { const r = await runner.intent(task, s); (r && r.ok !== false ? done : failed).push(plan[i].text); }
        else if (s.type === 'window') { const r = await runner.window(task, s); (r && r.ok ? done : failed).push(plan[i].text); }
      } catch (e) { failed.push(`${plan[i].text} (${e.message})`); }
    }
    store.remember('workflow-undo:' + w.id, 'workflow_undo', { workflow: w.id, name: w.name, undo, at: Date.now() });
    log && log.event('workflow.ran', { workflow: w.id, version: w.version, done: done.length, failed: failed.length });
    return reply(task, `${w.name} is on: ${done.length} of ${w.steps.length} done${failed.length ? `. Didn't work: ${failed.join('; ')}` : ''}.`, { workflow: w.id });
  }
  function end(task, name, { reply }) {
    const w = get(name);
    const rec = w && store.recall('workflow_undo').find(r => r.value.workflow === w.id);
    if (!rec) return reply(task, `${w ? w.name : name} isn't on, so there's nothing to put back.`);
    for (const u of rec.value.undo.slice().reverse()) saveSettings({ [u.key]: u.value === undefined ? null : u.value });
    store.forget(rec.key);
    const notBack = w.steps.map(describeStep).filter(p => !p.reversible).map(p => p.text);
    return reply(task, `Put back ${rec.value.undo.length} setting${rec.value.undo.length === 1 ? '' : 's'}.${notBack.length ? ` Not undone (can't be): ${notBack.join('; ')}.` : ''}`);
  }
  // "save that as X": what you just had her do, as a routine (after you confirm the preview)
  async function saveLast(task, name, lastSteps, { reply, choose }) {
    if (!lastSteps || !lastSteps.length) return reply(task, 'There\'s nothing recent to save. Have me do the steps first, then say "save that as …".');
    let steps;
    try { steps = validateSteps(lastSteps); } catch (e) { return reply(task, e.message); }
    const v = await choose(task, `Save these as "${name}"?\n${steps.map((s, i) => `${i + 1}. ${describeStep(s).text}`).join('\n')}`, [{ label: 'Save', value: 'yes', primary: true }, { label: 'Cancel', value: 'no' }]);
    if (v !== 'yes') return reply(task, 'Okay, not saved.');
    create({ name, steps, provenance: { kind: 'learned', from: task.text } });
    return reply(task, `Saved "${name}". Say "start ${name.toLowerCase()} mode" to run it; you can edit or delete it in Tasks panel > Routines.`);
  }
  async function handle(task, r, ctx) {
    if (r.op === 'save') return saveLast(task, r.name, ctx.lastSteps, ctx);
    if (r.op === 'end') return end(task, r.name, ctx);
    return start(task, r.name, ctx);
  }
  return { ensurePresets, create, edit, revert, remove, list: all, get, start, end, handle, describeStep, PRESETS };
}

module.exports = { createWorkflows, describeStep, validateSteps, PRESETS };
