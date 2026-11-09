// Nova's Tasks panel: approvals waiting on you, what she's doing, long jobs and
// their job cards, memory, settings and keys, what works, and diagnostics.
// It only reads state and sends your answers; it can't run tools itself.
(() => {
  const P = window.novaPanel;
  const view = document.getElementById('view');
  let tab = 'tasks', openJob = null, timer = null, jobQuery = '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  const when = (t) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const st = (s) => `<span class="state ${esc(s)}">${esc(String(s).replace(/_/g, ' '))}</span>`;

  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  document.getElementById('ask').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('ask-in');
    const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    await P.query('say', { text });
    setTimeout(render, 300);
  });
  document.getElementById('stop').addEventListener('click', () => P.query('stop').then(render));
  P.on((m) => {
    if (m.type === 'tab') { if (m.jobId) openJob = m.jobId; show(m.tab === 'jobs' || m.jobId ? 'jobs' : m.tab); return; }
    if (['approve', 'choose', 'closed', 'task', 'job', 'reply'].includes(m.type)) { clearTimeout(timer); timer = setTimeout(render, 150); }
  });

  function show(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    render();
  }
  async function render() {
    const fn = { tasks, jobs, memory, settings, capability, diagnostics, projects, refs }[tab] || tasks;
    try { await fn(); } catch (e) { view.innerHTML = `<div class="card">Couldn't load this: ${esc(e.message)}</div>`; }
    const o = await P.query('overview');
    const n = o.waits.length;
    const badge = document.getElementById('inbox-n');
    badge.textContent = n; badge.classList.toggle('hidden', !n);
  }

  // ------------------------------------------------------------------ tasks + approval inbox
  async function tasks() {
    const o = await P.query('overview');
    view.innerHTML = '';
    view.append(h('<h2>Waiting on you</h2>'));
    if (!o.waits.length) view.append(h('<div class="empty">No approvals or questions waiting.</div>'));
    for (const w of o.waits) {
      const c = h(`<div class="card approval"><div class="title">${esc(w.title || w.question)}</div><div class="lines">${esc((w.lines || []).join('\n'))}${w.heard ? '\nI heard: “' + esc(w.heard) + '”' : ''}</div><div class="row"></div></div>`).firstChild;
      const row = c.querySelector('.row');
      if (w.kind === 'approve') {
        row.append(btn('Allow once', 'primary', () => P.answer(w.id, { allow: true })));
        if (w.remember) row.append(btn(typeof w.remember === 'string' ? w.remember : 'Always for this', '', () => P.answer(w.id, { allow: true, remember: true })));
        row.append(btn('Cancel', 'ghost', () => P.answer(w.id, { allow: false })));
      } else {
        for (const opt of w.options || []) row.append(btn(opt.label, opt.primary ? 'primary' : '', () => P.answer(w.id, opt.value)));
        row.append(btn('Never mind', 'ghost', () => P.answer(w.id, null)));
      }
      view.append(c);
    }
    view.append(h('<h2>Recent requests</h2>'));
    view.append(table(['When', 'Request', 'State', 'Kind'], o.tasks.slice(0, 25).map(t => [when(t.created), esc(t.text), st(t.state), esc(t.kind || '')])));
    view.append(h('<h2>Active permissions</h2>'));
    if (!o.grants.length) view.append(h('<div class="empty">None. Nova asks before anything consequential.</div>'));
    else view.append(table(['For', 'Allows', 'Until', ''], o.grants.map(g => [esc(g.title || `${g.scope.kind} ${g.scope.id.slice(-6)}`), esc(g.categories.join(', ')), g.expires ? when(g.expires) : '—', `<button data-revoke="${esc(g.id)}" class="danger">Revoke</button>`])));
    view.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', () => P.query('grants:revoke', { id: b.dataset.revoke }).then(render)));
    view.append(h('<h2>Conversation</h2>'));
    const chat = h('<div class="card chat"></div>').firstChild;
    for (const m of o.history.slice(-20)) chat.append(h(`<div class="${m.who}">${esc(m.text)}</div>`).firstChild);
    if (!o.history.length) chat.append(h('<div class="empty">Nothing yet. Type above, or press Ctrl+Alt+Space.</div>').firstChild);
    view.append(chat);
  }

  // ------------------------------------------------------------------ jobs
  async function jobs() {
    if (openJob) return jobDetail(openJob);
    let list = (await P.query('overview')).jobs;
    view.innerHTML = '';
    const top = h(`<div class="row" style="margin-top:0"></div>`).firstChild;
    top.append(btn('Run the coordination demo (fixtures)', '', async () => { const r = await P.query('job:demo'); openJob = r.id; render(); }),
      btn('Pause all jobs', '', () => P.query('job:pause').then(render)), btn('Finish current step, then pause', 'ghost', () => P.query('job:finishStep').then(render)));
    const presets = await P.query('presets');
    if (presets.length) {
      const sel = h(`<select><option value="">New job from a preset…</option>${presets.map(p => `<option>${esc(p.name)}</option>`).join('')}</select>`).firstChild;
      sel.addEventListener('change', async () => { if (!sel.value) return; const r = await P.query('job:fromPreset', { name: sel.value }); if (r) { openJob = r.id; render(); } });
      top.append(sel);
    }
    view.append(top);
    const sch = await P.query('schedules');
    if (sch.length) {
      view.append(h('<h2>Scheduled</h2>'));
      view.append(table(['Job', 'At', 'Repeat', 'Next', 'Last run', ''], sch.map(x => [esc(x.goal || x.jobId), esc(x.at), esc(x.repeat), x.enabled && x.due ? when(x.due) : '—', x.lastRun ? when(x.lastRun) : '—', `<button class="danger" data-unsched="${esc(x.id)}">Remove</button>`])));
      view.querySelectorAll('[data-unsched]').forEach(b => b.addEventListener('click', () => P.query('schedule:remove', { id: b.dataset.unsched }).then(render)));
    }
    view.append(h('<h2>Jobs</h2>'));
    const sq = h(`<input placeholder="Search goals and notes…" value="${esc(jobQuery)}" style="width:100%;margin-bottom:8px">`).firstChild;
    sq.addEventListener('change', () => { jobQuery = sq.value; render(); });
    view.append(sq);
    if (jobQuery) list = await P.query('job:search', { q: jobQuery });
    if (!list.length) view.append(h('<div class="empty">No jobs yet. Ask Nova to "coordinate ChatGPT and Claude on …", or run the demo.</div>'));
    else view.append(table(['Goal', 'State', 'Priority', 'Cycles', 'Next', 'Updated'], list.map(j => [`<a href="#" data-job="${esc(j.id)}">${esc(j.goal)}</a>`, st(j.state), esc(j.priority || 'normal'), j.usage.cycles + ' / ' + j.budgets.maxCycles, esc(j.stopReason || j.nextAction || ''), when(j.updated)])));
    view.querySelectorAll('[data-job]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openJob = a.dataset.job; render(); }));
    view.append(h('<h2>Morning digest</h2>'));
    view.append(h(`<div class="log">${esc(await P.query('digest'))}</div>`));
  }
  async function jobDetail(jid) {
    const { job: j, events, card, problems } = await P.query('job', { id: jid });
    view.innerHTML = '';
    if (!j) { openJob = null; return jobs(); }
    const back = btn('← All jobs', 'ghost', () => { openJob = null; render(); });
    view.append(back);
    view.append(h(`<h2>Job card</h2>`));
    const c = h(`<div class="card"><div class="title">${esc(j.goal)} ${st(j.state)}</div><div class="lines">${esc(card.lines.join('\n'))}</div><div class="row"></div></div>`).firstChild;
    const row = c.querySelector('.row');
    if (j.state === 'draft') {
      if (problems.length) c.append(h(`<div class="muted" style="margin-top:8px">Before it can start: ${esc(problems.join('; '))}.</div>`));
      row.append(btn('Choose project folder…', '', async () => { const f = await P.query('job:pickFolder'); if (f) { await P.query('job:update', { id: j.id, patch: { contract: { workspace: f } } }); render(); } }));
      const crit = h(`<input placeholder="Done when… (e.g. npm test passes)" style="flex:1;min-width:240px">`).firstChild;
      row.append(crit, btn('Add criterion', '', async () => { if (crit.value.trim()) { await P.query('job:update', { id: j.id, patch: { contract: { criteria: [...j.contract.criteria, crit.value.trim()] } } }); render(); } }));
      const tc = h(`<input placeholder='Test command, e.g. npm test' style="flex:1;min-width:200px" value="${esc((j.contract.testCommand || []).join(' '))}">`).firstChild;
      row.append(tc, btn('Set test command', '', async () => { const parts = tc.value.trim().split(/\s+/).filter(Boolean); await P.query('job:update', { id: j.id, patch: { contract: { testCommand: parts.length ? parts : null } } }); render(); }));
      const parts = await P.query('participants');
      const sel = (role) => `<select data-role="${role}">${parts.filter(p => !p.id.startsWith('demo-') || j.goal.startsWith('DEMO')).map(p => `<option value="${esc(p.id)}" ${j.contract.participants.some(x => x.role === role && x.id === p.id) ? 'selected' : ''}>${esc(p.id)}${p.live ? '' : ' (fixture)'}${p.ok ? '' : ' — ' + esc(p.reason)}</option>`).join('')}</select>`;
      const roles = h(`<div class="grid" style="margin-top:10px"><label>Planner</label>${sel('planner')}<label>Implementer</label>${sel('implementer')}<label>Reviewer</label>${sel('reviewer')}<label>Resume after restart</label><select data-rr><option value="0" ${j.contract.restartResume ? '' : 'selected'}>No, wait for me</option><option value="1" ${j.contract.restartResume ? 'selected' : ''}>Yes, until the deadline</option></select></div>`).firstChild;
      roles.querySelectorAll('select').forEach(s => s.addEventListener('change', async () => {
        const ps = ['planner', 'implementer', 'reviewer'].map(r => ({ id: roles.querySelector(`[data-role="${r}"]`).value, role: r }));
        await P.query('job:update', { id: j.id, patch: { contract: { participants: ps, restartResume: roles.querySelector('[data-rr]').value === '1' } } }); render();
      }));
      c.append(roles);
      const go = h('<div class="row"></div>').firstChild;
      go.append(btn('Approve once and start', 'primary', async () => { try { await P.query('job:approve', { id: j.id }); } catch (e) { alert(e.message); } setTimeout(render, 300); }), btn('Delete draft', 'ghost', () => P.query('job:delete', { id: j.id }).then(() => { openJob = null; render(); })));
      c.append(go);
    } else {
      if (['running', 'queued', 'waiting_on_assistant', 'verifying'].includes(j.state)) row.append(btn('Pause', '', () => P.query('job:pause').then(render)), btn('Finish this step, then pause', 'ghost', () => P.query('job:finishStep').then(render)));
      if (['paused', 'blocked'].includes(j.state)) row.append(btn('Resume', 'primary', async () => { const r = await P.query('job:resume', { id: j.id }); if (!r.ok) alert(r.reason); render(); }));
      if (!['completed', 'cancelled', 'failed'].includes(j.state)) row.append(btn('Cancel job', 'danger', () => P.query('job:cancel', { id: j.id }).then(render)));
      if (['paused', 'blocked'].includes(j.state)) {
        const t = h('<input type="time" value="02:00">').firstChild, rpt = h('<select><option value="once">once</option><option value="daily">daily</option></select>').firstChild;
        row.append(h('<span class="muted">Resume at</span>').firstChild, t, rpt, btn('Schedule', '', async () => { try { await P.query('schedule:add', { jobId: j.id, at: t.value, repeat: rpt.value }); alert('Scheduled. It still needs a valid job approval when it fires.'); } catch (e) { alert(e.message); } }));
      }
      row.append(btn('Refresh', 'ghost', render));
    }
    view.append(c);
    view.append(h(`<h2>Status</h2>`));
    view.append(h(`<div class="card"><div class="grid"><label>Next</label><div>${esc(j.nextAction || '')}</div><label>Stopped because</label><div>${esc(j.stopReason || '—')}</div><label>Cycles</label><div>${j.usage.cycles} of ${j.budgets.maxCycles} (no-progress streak ${j.usage.noProgress})</div><label>Plan version</label><div>${j.plan.version}</div><label>Spend</label><div>$${(j.usage.spendUsd || 0).toFixed(2)}${j.budgets.maxSpendUsd ? ' of $' + j.budgets.maxSpendUsd : ''}; ${j.usage.tokens || 0} tokens</div><label>Last check</label><div>${j.checkpoint && j.checkpoint.finalCheck ? (j.checkpoint.finalCheck.passed ? 'passed' : 'failed') + ' on revision ' + esc(j.checkpoint.finalCheck.revision) : '—'}</div></div></div>`));
    const elapsed = j.usage.started ? Math.round(((['completed', 'cancelled', 'failed'].includes(j.state) ? j.updated : Date.now()) - j.usage.started) / 60000) : 0;
    const left = j.usage.started ? Math.max(0, Math.round(j.budgets.maxHours * 60 - elapsed)) : j.budgets.maxHours * 60;
    view.append(h(`<div class="card grid"><label>Running for</label><div>${elapsed} min (${left} min left of ${j.budgets.maxHours} h)</div><label>Waiting on</label><div>${j.state === 'waiting_on_assistant' ? esc(j.nextAction) : '—'}</div><label>Priority</label><div><select data-prio><option ${j.priority === 'high' ? 'selected' : ''}>high</option><option ${(j.priority || 'normal') === 'normal' ? 'selected' : ''}>normal</option><option ${j.priority === 'low' ? 'selected' : ''}>low</option></select></div></div>`));
    view.querySelector('[data-prio]').addEventListener('change', (e) => P.query('job:priority', { id: j.id, priority: e.target.value }).then(render));
    const fc = j.checkpoint && (j.checkpoint.finalCheck || (j.checkpoint.review && j.checkpoint.review.check));
    if (fc && fc.files && fc.files.length) {
      view.append(h('<h2>Deliverables (checked by Nova)</h2>'));
      view.append(table(['File', 'Size', 'SHA-256'], fc.files.map(f => [esc(f.name), f.missing ? '<span class="state failed">missing</span>' : f.size + ' B', `<span class="mono">${esc((f.sha256 || '').slice(0, 16))}</span>`])));
    }
    view.append(h('<h2>Notes</h2>'));
    const nt = h(`<textarea rows="3" style="width:100%" placeholder="Your notes for this job (searchable)">${esc(j.notes || '')}</textarea>`).firstChild;
    nt.addEventListener('change', () => P.query('job:notes', { id: j.id, notes: nt.value }));
    view.append(nt);
    const dv = h('<div class="row"></div>').firstChild;
    dv.append(btn('Show what changed in the project', '', async () => {
      const d = await P.query('job:diff', { id: j.id });
      const box = h(`<div class="log">${d.available ? esc((d.since ? 'Since ' + d.since.slice(0, 12) + ':\n' : '') + (d.stat || 'No changes to tracked files.') + (d.untracked.length ? '\nNew files: ' + d.untracked.join(', ') : '') + (d.undo ? '\n\n' + d.undo : '')) : esc(d.reason)}</div>`).firstChild;
      dv.after(box);
    }));
    view.append(dv);
    view.append(h(`<h2>Events</h2>`));
    view.append(h(`<div class="card events">${events.slice(-80).map(e => `${new Date(e.t).toLocaleTimeString()}  ${esc(e.kind)}  ${esc(JSON.stringify(e.data || {})).slice(0, 220)}`).join('<br>')}</div>`));
  }

  // ------------------------------------------------------------------ projects
  let editProject = null;
  async function projects() {
    const list = await P.query('projects');
    view.innerHTML = '';
    view.append(h('<h2>Projects</h2><div class="muted">Say "let\'s work on &lt;name&gt;". Nova shows where it stands and opens only what\'s listed here. Each project\'s notes and references stay separate.</div>'));
    if (list.length) view.append(table(['Project', 'Current task', 'Next', 'Opens', ''], list.map(p => [`${esc(p.name)}${p.active ? ' <span class="state live">active</span>' : ''}`, esc(p.task || '—'), esc(p.next || '—'), esc(p.launch.map(t => t.name || t.url || t.path.split(/[\\/]/).pop()).join(', ') || '—'), `<button data-ep="${esc(p.id)}">Edit</button>`])));
    view.querySelectorAll('[data-ep]').forEach(b => b.addEventListener('click', () => { editProject = list.find(p => p.id === b.dataset.ep); render(); }));
    const p = editProject || { name: '', aliases: [], folders: [], launch: [], constraints: [], task: '', next: '', blockers: [], checks: [] };
    view.append(h(`<h2>${editProject ? 'Edit ' + esc(p.name) : 'New project'}</h2>`));
    const f = h(`<div class="card grid">
      <label>Name</label><input data-k="name" value="${esc(p.name)}">
      <label>Also called</label><input data-k="aliases" value="${esc(p.aliases.join(', '))}" placeholder="bs, black sun game">
      <label>Folders</label><div class="row" style="margin:0"><input data-k="folders" value="${esc(p.folders.join('; '))}" style="flex:1"><button data-pick>Add folder…</button></div>
      <label>Apps to open</label><input data-k="apps" value="${esc(p.launch.filter(t => t.kind === 'app').map(t => t.name).join(', '))}" placeholder="Roblox Studio, Discord">
      <label>Links to open</label><input data-k="urls" value="${esc(p.launch.filter(t => t.kind === 'url').map(t => t.url).join(' '))}" placeholder="https://…">
      <label>Open folders too</label><select data-k="openFolders"><option value="1" ${p.launch.some(t => t.kind === 'folder') ? 'selected' : ''}>Yes</option><option value="0" ${p.launch.some(t => t.kind === 'folder') ? '' : 'selected'}>No</option></select>
      <label>Constraints (exact)</label><textarea data-k="constraints" rows="2">${esc(p.constraints.join('\n'))}</textarea>
      <label>Current task</label><input data-k="task" value="${esc(p.task)}">
      <label>Next action</label><input data-k="next" value="${esc(p.next)}">
      <label>Blockers</label><input data-k="blockers" value="${esc(p.blockers.join('; '))}">
      <label>Check command</label><input data-k="check" value="${esc((p.checks[0] || {}).command ? p.checks[0].command.join(' ') : '')}" placeholder="npm test (used by troubleshooting)">
    </div>`).firstChild;
    f.querySelector('[data-pick]').addEventListener('click', async () => { const d = await P.query('pickFolder'); if (d) { const i = f.querySelector('[data-k=folders]'); i.value = [i.value, d].filter(Boolean).join('; '); } });
    view.append(f);
    const row = h('<div class="row"></div>').firstChild;
    row.append(btn(editProject ? 'Save changes' : 'Add project', 'primary', async () => {
      const v = (k) => f.querySelector(`[data-k=${k}]`).value;
      const folders = v('folders').split(';').map(x => x.trim()).filter(Boolean);
      const launch = [...v('apps').split(',').map(x => x.trim()).filter(Boolean).map(name => ({ kind: 'app', name })), ...v('urls').split(/\s+/).filter(Boolean).map(url => ({ kind: 'url', url })), ...(v('openFolders') === '1' ? folders.map(p2 => ({ kind: 'folder', path: p2 })) : [])];
      try { await P.query('project:save', { id: editProject && editProject.id, name: v('name'), aliases: v('aliases').split(',').map(x => x.trim()).filter(Boolean), folders, launch, constraints: v('constraints').split('\n').map(x => x.trim()).filter(Boolean), task: v('task'), next: v('next'), blockers: v('blockers').split(';').map(x => x.trim()).filter(Boolean), checks: v('check').trim() ? [{ name: 'check', command: v('check').trim().split(/\s+/) }] : [] }); editProject = null; render(); }
      catch (e) { alert(e.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, '')); }
    }));
    if (editProject) row.append(btn('Cancel', 'ghost', () => { editProject = null; render(); }), btn('Delete project', 'danger', async () => { await P.query('project:remove', { id: editProject.id }); editProject = null; render(); }));
    view.append(row);
    if (editProject) {
      view.append(h('<h2>Notes and decisions</h2>'));
      view.append(h(`<div class="card">${(editProject.notes || []).slice(-15).reverse().map(n => `<div><span class="muted">${when(n.at)}</span> ${esc(n.text)}</div>`).join('') || '<div class="empty">None yet.</div>'}</div>`));
      const nn = h('<input placeholder="Add a note or decision for this project" style="width:100%">').firstChild;
      nn.addEventListener('change', async () => { if (nn.value.trim()) { await P.query('project:note', { id: editProject.id, text: nn.value.trim() }); editProject = (await P.query('projects')).find(x => x.id === editProject.id); render(); } });
      view.append(nn);
    }
  }

  // ------------------------------------------------------------------ reference inbox
  async function refs() {
    const [list, projs] = await Promise.all([P.query('references', { q: refQuery }), P.query('projects')]);
    const pname = (id) => (projs.find(p => p.id === id) || {}).name || 'Unfiled';
    view.innerHTML = '';
    view.append(h('<h2>Reference inbox</h2><div class="muted">Say "save this image as an armour reference" (it saves what\'s on your clipboard) or add a file here. Nova never scans your drive.</div>'));
    const top = h('<div class="row"></div>').firstChild;
    const q = h(`<input placeholder="Search tags and notes…" value="${esc(refQuery)}" style="flex:1">`).firstChild;
    q.addEventListener('change', () => { refQuery = q.value; render(); });
    const tag = h('<input placeholder="tag (e.g. armour)" style="width:140px">').firstChild;
    const proj = h(`<select><option value="">Unfiled</option>${projs.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`).firstChild;
    top.append(q, tag, proj, btn('Add a file…', '', async () => { const f = await P.query('pickFile'); if (f) { await P.query('ref:addFile', { file: f, tag: tag.value, project: proj.value }); render(); } }), btn('Add from clipboard', '', async () => { try { await P.query('ref:addClipboard', { tag: tag.value, project: proj.value }); render(); } catch (e) { alert(e.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, '')); } }));
    view.append(top);
    if (!list.length) view.append(h('<div class="empty">Nothing saved yet.</div>'));
    else view.append(table(['Tag', 'What', 'Project', 'Saved', ''], list.map(r => [esc(r.tag || '—'), esc(r.kind + (r.url ? ': ' + r.url : r.file ? ': ' + r.file.split(/[\\/]/).pop() : '')) + (r.note ? `<div class="muted">${esc(r.note.slice(0, 80))}</div>` : ''), esc(pname(r.project)), when(r.saved), `<button data-ro="${esc(r.id)}">Open</button> <button class="danger" data-rd="${esc(r.id)}">Delete</button>`])));
    view.querySelectorAll('[data-ro]').forEach(b => b.addEventListener('click', () => P.query('ref:open', { id: b.dataset.ro })));
    view.querySelectorAll('[data-rd]').forEach(b => b.addEventListener('click', () => P.query('ref:remove', { id: b.dataset.rd }).then(render)));
  }
  let refQuery = '';

  // ------------------------------------------------------------------ memory
  async function memory() {
    const m = await P.query('memory');
    view.innerHTML = '';
    view.append(h('<h2>What Nova remembers</h2><div class="muted">Only things you confirmed (places, targets, settings). Delete anything.</div>'));
    if (!m.items.length) view.append(h('<div class="empty" style="margin-top:8px">Nothing saved.</div>'));
    else view.append(table(['Kind', 'Item', ''], m.items.map(x => [esc(x.kind), `<span class="mono">${esc(JSON.stringify(x.value)).slice(0, 160)}</span>`, `<button class="danger" data-forget="${esc(x.key)}">Forget</button>`])));
    view.querySelectorAll('[data-forget]').forEach(b => b.addEventListener('click', () => P.query('memory:forget', { key: b.dataset.forget }).then(render)));
    view.append(h('<h2>This conversation</h2>'));
    view.append(h(`<div class="card chat">${m.conversation.map(x => `<div class="${x.role === 'user' ? 'you' : 'nova'}">${esc(x.content)}</div>`).join('') || '<div class="empty">Empty.</div>'}</div>`));
    view.append(btn('Forget this conversation', 'danger', () => P.query('memory:forgetConversation').then(render)));
  }

  // ------------------------------------------------------------------ settings, keys, Discord, Roblox
  async function settings() {
    const [s, keys, targets] = await Promise.all([P.query('settings'), P.query('keys'), P.query('discord:targets')]);
    view.innerHTML = '';
    view.append(h('<h2>Brains (optional)</h2><div class="muted">Keys are encrypted on this PC, never shown again, and never sent to Nova\'s page or to a model.</div>'));
    const kc = h('<div class="card grid"></div>').firstChild;
    for (const [name, label] of [['anthropic', 'Anthropic (Claude) API key'], ['openai', 'OpenAI API key'], ['discord-bot', 'Nova\'s Discord bot token']]) {
      kc.append(h(`<label>${label}</label>`).firstChild);
      const cell = h(`<div class="row" style="margin:0">${keys[name] ? '<span class="state live">saved</span>' : '<span class="muted">not set</span>'}</div>`).firstChild;
      const inp = h(`<input type="password" placeholder="paste to ${keys[name] ? 'replace' : 'save'}" style="flex:1;min-width:180px">`).firstChild;
      cell.append(inp, btn('Save', '', async () => { if (inp.value.trim()) { await P.query('keys:save', { name, value: inp.value.trim() }); inp.value = ''; render(); } }));
      if (keys[name]) cell.append(btn('Remove', 'ghost', () => P.query('keys:forget', { name }).then(render)));
      kc.append(cell);
    }
    kc.append(h('<label>Which brain first</label>').firstChild);
    const order = h(`<select><option value="anthropic,openai,local">Claude, then ChatGPT, then on-device</option><option value="openai,anthropic,local">ChatGPT, then Claude, then on-device</option><option value="local,anthropic,openai">On-device first (private, free)</option></select>`).firstChild;
    order.value = (s.brainOrder || ['anthropic', 'openai', 'local']).join(',');
    order.addEventListener('change', () => P.query('settings:set', { brainOrder: order.value.split(',') }));
    kc.append(order);
    view.append(kc);

    view.append(h('<h2>Privacy</h2>'));
    const pv = h(`<div class="card grid"><label>Screen reading</label><div class="row" style="margin:0">${s.screenConsent ? '<span class="state live">allowed</span>' : '<span class="muted">asks each time</span>'}</div><label>Quiet hours</label><div class="row" style="margin:0"><input type="time" data-q="from" value="${esc((s.quietHours || {}).from || '')}"> to <input type="time" data-q="to" value="${esc((s.quietHours || {}).to || '')}"><span class="muted">she sits still and won't pop up on her own; your requests and reminders still work</span></div></div>`).firstChild;
    if (s.screenConsent) pv.children[1].append(btn('Revoke', 'danger', () => P.query('settings:set', { screenConsent: false }).then(render)));
    pv.querySelectorAll('[data-q]').forEach(i => i.addEventListener('change', () => P.query('settings:set', { quietHours: { from: pv.querySelector('[data-q=from]').value, to: pv.querySelector('[data-q=to]').value } })));
    view.append(pv);

    const sc = await P.query('shortcuts');
    view.append(h('<h2>Shortcuts</h2><div class="muted">Work from anywhere. If another app already uses one, it shows here; pick a different one.</div>'));
    const scc = h('<div class="card grid"></div>').firstChild;
    for (const [k, label] of [['ptt', 'Push to talk'], ['stop', 'Stop everything'], ['menu', 'Talk to Nova (menu)'], ['hide', 'Hide / show']]) {
      const prob = sc.problems.find(p => p.name === k);
      scc.append(h(`<label>${label}</label>`).firstChild);
      const cell = h(`<div class="row" style="margin:0"></div>`).firstChild;
      const inp = h(`<input value="${esc(sc.shortcuts[k] || '')}" style="width:220px">`).firstChild;
      cell.append(inp, btn('Save', '', async () => { try { await P.query('settings:set', { shortcuts: { [k]: inp.value.trim() } }); render(); } catch (e) { alert(e.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, '')); } }));
      if (prob) cell.append(h(`<span class="state failed">${esc(prob.why)}</span>`).firstChild);
      scc.append(cell);
    }
    view.append(scc);

    view.append(h('<h2>Discord places</h2><div class="muted">Nova only uses places you add here. IDs: Discord Settings > Advanced > Developer Mode, then right-click > Copy ID.</div>'));
    if (targets.length) view.append(table(['Name', 'Server / channel', 'Type', ''], targets.map(t => [esc(t.alias), `<span class="mono">${esc(t.guildId)} / ${esc(t.channelId)}${t.textChannelId ? ' (text ' + esc(t.textChannelId) + ')' : ''}</span>`, esc(t.kind), `<button class="danger" data-dt="${esc(t.key)}">Remove</button>`])));
    view.querySelectorAll('[data-dt]').forEach(b => b.addEventListener('click', () => P.query('discord:remove', { key: b.dataset.dt }).then(render)));
    const df = h(`<div class="card row"><input data-f="alias" placeholder="Name (e.g. Afterparty)"><input data-f="guildId" placeholder="Server ID"><input data-f="channelId" placeholder="Channel ID"><input data-f="textChannelId" placeholder="Text channel ID (for bot posts)"><select data-f="kind"><option value="voice">Voice</option><option value="text">Text</option></select></div>`).firstChild;
    df.append(btn('Add', 'primary', async () => { const v = Object.fromEntries([...df.querySelectorAll('[data-f]')].map(i => [i.dataset.f, i.value.trim()])); try { await P.query('discord:add', v); render(); } catch (e) { alert(e.message); } }));
    view.append(df);

    const aliases = await P.query('aliases');
    view.append(h('<h2>App names</h2><div class="muted">Your own names for apps: "open browser" then opens the app you set here.</div>'));
    if (aliases.length) view.append(table(['You say', 'Opens', ''], aliases.map(a => [esc(a.alias), esc(a.app), `<button class="danger" data-al="${esc(a.key)}">Remove</button>`])));
    view.querySelectorAll('[data-al]').forEach(b => b.addEventListener('click', () => P.query('memory:forget', { key: b.dataset.al }).then(render)));
    const af = h(`<div class="card row"><input data-a="alias" placeholder="Name you'll say (e.g. browser)"><input data-a="app" placeholder="App it opens (e.g. Google Chrome)"></div>`).firstChild;
    af.append(btn('Save', 'primary', async () => { try { await P.query('alias:add', { alias: af.querySelector('[data-a=alias]').value, app: af.querySelector('[data-a=app]').value }); render(); } catch (e) { alert(e.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, '')); } }));
    view.append(af);

    view.append(h('<h2>Roblox experiences</h2><div class="muted">Nova opens these through roblox.com. She won\'t play or press keys in Roblox.</div>'));
    const rf = h(`<div class="card row"><input data-r="alias" placeholder="Name you'll say"><input data-r="placeId" placeholder="Place ID (number in the roblox.com/games/ link)"></div>`).firstChild;
    rf.append(btn('Save', 'primary', async () => { try { await P.query('roblox:add', { alias: rf.querySelector('[data-r=alias]').value.trim(), placeId: rf.querySelector('[data-r=placeId]').value.trim() }); render(); } catch (e) { alert(e.message); } }));
    view.append(rf);
  }

  // ------------------------------------------------------------------ capability + diagnostics
  async function capability() {
    const c = await P.query('capability');
    view.innerHTML = '<h2>What works on this PC right now</h2>';
    view.append(table(['Ability', 'State', 'Notes'], c.map(x => [esc(x.what), st(x.state.replace(/ /g, '_')), esc(x.why)])));
  }
  async function diagnostics() {
    const d = await P.query('diagnostics');
    view.innerHTML = '';
    const top = h('<div class="row" style="margin-top:0"></div>').firstChild;
    top.append(btn('Export diagnostics…', '', async () => { const f = await P.query('diagnostics:export'); if (f) alert('Saved to ' + f); }), btn('Refresh', 'ghost', render));
    view.append(top);
    view.append(h(`<h2>System</h2><div class="card grid"><label>Platform</label><div>${esc(d.platform)}</div><label>Versions</label><div class="mono">Nova ${esc(d.versions.nova)} · Electron ${esc(d.versions.electron)} · Node ${esc(d.versions.node)}</div><label>Windows helper</label><div>${d.winHelper ? 'available' : 'not available'}</div><label>Database schema</label><div>v${esc(d.db)}</div><label>Microphone</label><div>${esc(d.mic.state)}${d.mic.device ? ' · ' + esc(d.mic.device) : ''}${d.mic.muted ? ' (muted)' : ''}${d.mic.error ? ' · ' + esc(d.mic.error) : ''}</div><label>Speech recognition</label><div>offline model in the voice service</div><label>Language / vision</label><div>${Object.entries(d.providers).map(([k, v]) => esc(k) + ': ' + (v.ok ? 'ready' : 'not set up')).join(' · ')}</div><label>Her voice</label><div>${d.speech.ok ? 'on' : 'off (' + esc(d.speech.reason) + ')'}</div><label>Screen reading</label><div>${d.permissions.screenConsent ? 'always allowed (revocable in Settings)' : 'asks each time'}</div><label>Active approvals</label><div>${d.permissions.active.length ? d.permissions.active.map(g => esc(g.scope + ': ' + g.categories.join(', '))).join(' · ') : 'none'}</div><label>Doing now</label><div>${d.activeTasks.length ? d.activeTasks.map(t => esc(t.text + ' (' + t.state + ')')).join(' · ') : 'nothing'}</div><label>Last tool result</label><div class="mono">${d.lastTool ? esc(JSON.stringify(d.lastTool).slice(0, 220)) : '—'}</div><label>Nova's resource use</label><div>${d.resources.cpuPercent}% CPU · ${d.resources.memoryMB} MB across ${d.resources.processes} processes <span class="muted">(${d.resources.byType.map(p => esc(p.type + (p.name ? ' ' + p.name : '')) + ' ' + p.mb + ' MB').join(', ')})</span></div></div>`));
    const by = {};
    for (const t of d.timings) (by[t.what] = by[t.what] || []).push(t.ms);
    for (const e of d.log.filter(e => e.type === 'timing' || e.type === 'stop.latency')) { const k = e.type === 'stop.latency' ? 'stop' : e.what; if (k && e.ms != null) (by[k] = by[k] || []).push(e.ms); }
    const stat = (a) => { const s = a.slice().sort((x, y) => x - y); return [s.length, s[Math.floor(s.length / 2)], s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]]; };
    view.append(h('<h2>Measured responsiveness (this session)</h2>'));
    const rows = Object.entries(by).map(([k, a]) => { const [n, med, p95] = stat(a); return [esc(k), n, med + ' ms', p95 + ' ms']; });
    view.append(rows.length ? table(['What', 'Samples', 'Median', 'p95'], rows) : h('<div class="empty">No measurements yet. Ask Nova something, press Ctrl+Alt+V, or press Stop.</div>'));
    view.append(h('<h2>Recent events (secrets removed)</h2>'));
    view.append(h(`<div class="log">${d.log.slice(-120).reverse().map(e => esc(`${new Date(e.t).toLocaleTimeString()} ${e.type} ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['t', 'type'].includes(k))))}`)).join('\n')}</div>`));
  }

  function btn(label, cls, fn) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); return b; }
  function table(head, rows) {
    const t = document.createElement('table');
    t.innerHTML = `<tr>${head.map(x => `<th>${x}</th>`).join('')}</tr>` + rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
    const wrap = document.createElement('div'); wrap.className = 'card'; wrap.style.overflowX = 'auto'; wrap.append(t); return wrap;
  }
  setInterval(() => { if (['tasks', 'jobs'].includes(tab) && !document.activeElement.matches('input,select')) render(); }, 3000);
  show('tasks');
})();
