// Nova on your phone: a client of the PC. It shows what the PC reports (and how old
// that is), sends your instructions and answers, and says "stopped" only after the PC
// confirms. Nothing is cached on the phone; no desktop or microphone streaming.
(() => {
  const main = document.getElementById('main'), banner = document.getElementById('banner'), dot = document.getElementById('dot'), ageEl = document.getElementById('age'), hostEl = document.getElementById('host');
  let state = null, gotAt = 0, lastEvent = 0, es = null, offline = false, stopNote = '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
  const when = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  async function api(path, body) {
    const opt = body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-nova': '1' }, body: JSON.stringify({ requestId: rid(), epoch: state ? state.epoch : 0, ...body }), credentials: 'same-origin', cache: 'no-store' } : { credentials: 'same-origin', cache: 'no-store' };
    const r = await fetch(path, opt);
    let j = {}; try { j = await r.json(); } catch {}
    return { status: r.status, ...j };
  }
  function show(msg, bad) { banner.textContent = msg; banner.className = 'banner' + (bad ? ' bad' : ''); if (!msg) banner.className = 'banner hidden'; }

  // ---------------------------------------------------------------- pairing
  function pairView(err) {
    dot.className = 'dot off'; hostEl.textContent = 'Nova'; ageEl.textContent = '';
    main.innerHTML = '';
    main.append(el(`<div><h2>Pair this phone</h2><div class="card"><div class="lines">On your PC: Tasks panel &gt; Phone &gt; Pair a phone. Type the 6-digit code it shows, then allow this phone on the PC.</div>
      <form id="pf" class="row"><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" aria-label="Pairing code"><button class="primary">Pair</button></form>
      <div class="row"><input id="nm" maxlength="40" aria-label="Name for this phone" placeholder="Name for this phone" value="${esc(guessName())}"></div>
      <div class="note">Your browser warned about the certificate because it's your own PC's (self-signed). Check the fingerprint here matches the one in the Tasks panel.</div>
      ${err ? `<div class="note" style="color:#ffb3c2">${esc(err)}</div>` : ''}</div></div>`));
    document.getElementById('pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('code').value.trim();
      if (!/^\d{6}$/.test(code)) return pairView('The code is 6 digits.');
      show('Waiting for you to allow this phone on the PC…');
      try {
        const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json', 'x-nova': '1' }, body: JSON.stringify({ code, name: document.getElementById('nm').value }), credentials: 'same-origin' });
        const j = await r.json().catch(() => ({}));
        show('');
        if (r.ok) return boot(); else pairView(j.error || 'Pairing failed.');
      } catch { show(''); pairView('Can\'t reach the PC.'); }
    });
  }
  function guessName() { const ua = navigator.userAgent; return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : 'Phone'; }

  // ---------------------------------------------------------------- dashboard
  function render() {
    const s = state;
    hostEl.textContent = s.host.name;
    main.innerHTML = '';
    if (s.host.locked) show('Your PC is locked or asleep: things that need the desktop will wait until you\'re back.', false);
    else if (!offline) show(stopNote ? '' : '');
    const stop = el(`<button id="stop">■ Stop everything</button>`);
    stop.addEventListener('click', doStop);
    main.append(stop);
    if (stopNote) main.append(el(`<div class="note">${esc(stopNote)}</div>`));
    // approvals
    main.append(el('<h2>Waiting on you</h2>'));
    if (!s.approvals.length) main.append(el('<div class="muted">Nothing waiting.</div>'));
    for (const w of s.approvals) {
      const c = el(`<div class="card approval"><div class="title">${esc(w.title || w.question)}</div><div class="lines">${esc((w.lines || []).join('\n'))}</div><div class="row"></div><div class="note">Exactly as shown on the PC. If it changes, you'll need to look again.</div></div>`);
      const row = c.querySelector('.row');
      const answer = async (decision, b) => { b.disabled = true; const r = await api('/api/approve', { waitId: w.id, revision: w.revision, decision }); if (r.status !== 200) show(r.error || 'Not accepted.', true); await refresh(); };
      if (w.kind === 'approve') { const a = el('<button class="primary">Allow once</button>'), n = el('<button>Cancel</button>'); a.onclick = () => answer('allow', a); n.onclick = () => answer('deny', n); row.append(a, n); }
      else for (const o of w.options || []) { const b = el(`<button>${esc(o.label)}</button>`); b.onclick = () => answer(o.value, b); row.append(b); }
      main.append(c);
    }
    // tell Nova
    main.append(el('<h2>Tell Nova</h2>'));
    const f = el('<form><input id="say" maxlength="1000" placeholder="e.g. what are you doing?" aria-label="Instruction for Nova" autocomplete="off"><button class="primary">Send</button></form>');
    f.addEventListener('submit', async (e) => { e.preventDefault(); const i = f.querySelector('input'); const text = i.value.trim(); if (!text) return; const b = f.querySelector('button'); b.disabled = true; const r = await api('/api/input', { text }); b.disabled = false; if (r.status === 202) { i.value = ''; show(r.duplicate ? 'Already sent (not sent twice).' : 'Sent. The PC is on it.'); setTimeout(() => show(''), 3000); } else show(r.error || 'Not sent.', true); refresh(); });
    main.append(f);
    // tasks and jobs
    main.append(el('<h2>Doing now</h2>'));
    if (!s.active.length) main.append(el('<div class="muted">Nothing right now.</div>'));
    for (const t of s.active) main.append(el(`<div class="card"><span class="state ${esc(t.state)}">${esc(t.state.replace(/_/g, ' '))}</span> ${esc(t.text)}</div>`));
    main.append(el('<h2>Jobs</h2>'));
    if (!s.jobs.length) main.append(el('<div class="muted">No jobs.</div>'));
    for (const j of s.jobs) {
      const c = el(`<div class="card"><div class="title">${esc(j.goal)}</div><span class="state ${esc(j.state)}">${esc(j.state.replace(/_/g, ' '))}</span> <span class="muted">${j.cycles} of ${j.maxCycles} cycles</span><div class="lines">${esc(j.stopReason || j.nextAction || '')}</div><div class="row"></div></div>`);
      const row = c.querySelector('.row');
      const act = (op, label, cls) => { const b = el(`<button class="${cls || ''}">${label}</button>`); b.onclick = async () => { b.disabled = true; const r = await api('/api/job', { op, jobId: j.id }); if (r.status !== 200) show(r.reason || r.error || 'Not done.', true); refresh(); }; row.append(b); };
      if (['running', 'queued', 'waiting_on_assistant', 'verifying'].includes(j.state)) { act('pause', 'Pause'); act('finish_step', 'Finish step, then pause'); }
      if (['paused', 'blocked'].includes(j.state)) act('resume', 'Resume', 'primary');
      if (!['completed', 'cancelled', 'failed', 'draft'].includes(j.state)) act('cancel', 'Cancel', 'danger');
      for (const a of j.artifacts || []) row.append(el(`<a class="muted" href="/api/artifact?job=${encodeURIComponent(j.id)}&file=${encodeURIComponent(a)}" download>⬇ ${esc(a)}</a>`));
      main.append(c);
    }
    main.append(el('<h2>What you missed</h2>'));
    main.append(el(`<div class="card"><pre>${esc(s.digest || 'Nothing new.')}</pre></div>`));
    main.append(el('<h2>Recent</h2>'));
    for (const t of s.recent.slice(0, 8)) main.append(el(`<div class="card"><span class="state ${esc(t.state)}">${esc(t.state)}</span> ${esc(t.text)} <span class="muted">${esc(when(t.created))}</span></div>`));
    const out = el(`<div class="row"><button>Sign out this phone</button></div>`);
    out.querySelector('button').onclick = async () => { await api('/api/logout', {}); boot(); };
    main.append(out);
    main.append(el(`<div class="note">${esc(s.device.name)} · paired until ${esc(new Date(s.device.expires).toLocaleDateString())}</div>`));
  }

  async function doStop() {
    const b = document.getElementById('stop');
    b.disabled = true; b.textContent = 'Stopping… (waiting for the PC)';
    stopNote = '';
    try {
      const r = await api('/api/stop', {});
      stopNote = r.status === 200 && r.acknowledged ? `Stopped: the PC confirmed at ${when(r.at)}${r.stopped ? ` (${r.stopped} task${r.stopped > 1 ? 's' : ''} cancelled)` : ''}.` : `Not confirmed: ${r.error || 'the PC didn\'t acknowledge'}. Nova may still be working.`;
    } catch { stopNote = 'Not confirmed: can\'t reach the PC. Nova may still be working.'; }
    await refresh();
  }

  async function refresh() {
    try {
      const r = await api('/api/state');
      if (r.status === 401) { state = null; if (es) es.close(); return pairView(); }
      if (r.status !== 200) throw new Error(r.error);
      state = r; gotAt = Date.now(); offline = false; show('');
      render(); tick();
    } catch { offline = true; tick(); }
  }
  // how fresh is what we show?
  function tick() {
    if (!state) return;
    const age = Math.round((Date.now() - gotAt) / 1000);
    const live = !offline && Date.now() - lastEvent < 45000;
    dot.className = 'dot ' + (offline ? 'off' : live ? 'on' : 'stale');
    ageEl.textContent = offline ? `offline · last seen ${age}s ago` : live ? 'live' : `updated ${age}s ago`;
    if (offline) show('Can\'t reach your PC. What you see may be out of date; nothing you tap will be done until it\'s back.', true);
    document.querySelectorAll('button').forEach(b => { if (b.id !== 'stop') b.disabled = offline; });
  }
  function listen() {
    if (es) es.close();
    es = new EventSource('/api/events');
    es.addEventListener('state', () => { lastEvent = Date.now(); refresh(); });
    es.addEventListener('ping', () => { lastEvent = Date.now(); tick(); });
    es.onerror = () => { offline = true; tick(); };
    es.onopen = () => { lastEvent = Date.now(); };
  }
  async function boot() { await refresh(); if (state) listen(); }
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  boot();
})();
