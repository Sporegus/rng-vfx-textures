// Browser demo: a pretend Windows desktop plus a fake `window.zin` API, so the
// real renderer.js can run anywhere. Nothing here touches a real PC.
(function () {
  const TASKBAR = 46;
  window.ZIN_BOTTOM_INSET = TASKBAR;
  const $ = (q) => document.querySelector(q);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const handlers = {};
  function fire(evt, ...args) { (handlers[evt] || []).forEach(cb => cb(...args)); }
  const on = (evt) => (cb) => { (handlers[evt] = handlers[evt] || []).push(cb); };

  // ---------------------------------------------------------------- settings
  const DEFAULTS = { skin: 'holo', hat: 'none', size: 3, sound: true, wander: true, followWindows: true, introDone: false };
  let settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('zin-demo') || '{}')); } catch {}
  if (!ZinSprites.SKINS[settings.skin]) settings.skin = 'holo';
  if (innerWidth < 600) settings.size = 2;
  const save = () => { try { localStorage.setItem('zin-demo', JSON.stringify(settings)); } catch {} };

  // ---------------------------------------------------------------- fake file system
  const HOME = 'C:\\Users\\you';
  const FILES = [
    ['Downloads', 'resume_final_v3.pdf', 182e3], ['Downloads', 'minecraft_server_1.21.zip', 48e6], ['Downloads', 'vacation_beach_01.jpg', 4.1e6],
    ['Downloads', 'vacation_beach_02.jpg', 3.8e6], ['Downloads', 'DiscordSetup.exe', 92e6], ['Downloads', 'SteamSetup.exe', 2.3e6],
    ['Downloads', 'song_demo_mix.mp3', 7.4e6], ['Downloads', 'taxes_2025.xlsx', 61e3], ['Downloads', 'meme_template.png', 880e3],
    ['Downloads', 'clip_highlight.mp4', 212e6], ['Downloads', 'notes_biology.docx', 33e3], ['Downloads', 'blender_scene.blend', 18e6],
    ['Documents', 'School\\history_essay.docx', 41e3], ['Documents', 'School\\math_homework.pdf', 380e3], ['Documents', 'budget.xlsx', 22e3],
    ['Documents', 'Roblox VFX\\air_blast_white_flipbook_4x4.png', 610e3], ['Documents', 'Roblox VFX\\aura_burst_blue_flipbook_2x2.png', 540e3],
    ['Pictures', 'Screenshots\\Screenshot 2026-10-21.png', 1.2e6], ['Pictures', 'dog_birthday.jpg', 5.1e6], ['Videos', 'gameplay_recording.mp4', 2.4e9],
    ['Desktop', 'project ideas.txt', 2e3], ['Desktop', 'resume_old.pdf', 160e3],
  ].map(([folder, rel, size], i) => {
    const name = rel.split('\\').pop();
    return { name, path: `${HOME}\\${folder}\\${rel}`, folder, size, mtime: Date.now() - i * 7.3e7 };
  });

  // ---------------------------------------------------------------- windows
  const desk = $('#desk');
  let active = null, z = 10;
  const wins = {};
  function report() {
    const w = active && wins[active];
    if (!w || w.hidden) return fire('active-window', null);
    const r = w.getBoundingClientRect();
    fire('active-window', { id: active, title: w.dataset.title, maximized: w.classList.contains('max'), x: r.left, y: r.top, width: r.width, height: r.height });
  }
  function focusWin(id) {
    const w = wins[id];
    if (!w) return;
    w.hidden = false;
    w.style.zIndex = ++z;
    active = id;
    document.querySelectorAll('.task-btn').forEach(b => b.classList.toggle('on', b.dataset.win === id));
    report();
  }
  function setupWindow(w) {
    const id = w.id;
    wins[id] = w;
    w.addEventListener('pointerdown', () => focusWin(id));
    const bar = w.querySelector('.win-bar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || w.classList.contains('max')) return;
      const r = w.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const maxX = innerWidth - 80, maxY = innerHeight - TASKBAR - 40;
        w.style.left = Math.min(maxX, Math.max(-r.width + 80, ev.clientX - ox)) + 'px';
        w.style.top = Math.min(maxY, Math.max(0, ev.clientY - oy)) + 'px';
        report();
      };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
    w.querySelector('[data-act=close]').addEventListener('click', () => { w.hidden = true; if (active === id) { active = null; report(); } syncTasks(); });
    w.querySelector('[data-act=max]').addEventListener('click', () => { w.classList.toggle('max'); report(); });
  }
  function syncTasks() {
    document.querySelectorAll('.task-btn').forEach(b => b.classList.toggle('open', !wins[b.dataset.win].hidden));
  }
  document.querySelectorAll('.win').forEach(setupWindow);
  document.querySelectorAll('.task-btn').forEach(b => b.addEventListener('click', () => { focusWin(b.dataset.win); syncTasks(); }));
  addEventListener('resize', report);

  // Explorer window contents
  const explorer = wins['win-explorer'];
  let organized = false;
  function showFolder(folder, highlight) {
    explorer.dataset.title = folder;
    explorer.querySelector('.win-title').textContent = folder;
    explorer.querySelector('.ex-path').textContent = `This PC › ${folder}`;
    const list = explorer.querySelector('.ex-list');
    list.innerHTML = '';
    let items = FILES.filter(f => f.folder === folder);
    if (folder === 'Downloads' && organized) {
      const cats = {};
      items.forEach(f => { const c = cat(f.name); cats[c] = (cats[c] || 0) + 1; });
      items = Object.entries(cats).map(([c, n]) => ({ name: c, dir: true, size: n }));
    }
    for (const f of items) {
      const row = document.createElement('div');
      row.className = 'ex-row' + (highlight && f.path === highlight ? ' hit' : '');
      row.innerHTML = `<span class="ex-ic">${f.dir ? '▰' : '▭'}</span><span class="ex-name"></span><span class="ex-size">${f.dir ? f.size + ' items' : fmt(f.size)}</span>`;
      row.querySelector('.ex-name').textContent = f.dir ? f.name : f.path.split(`${folder}\\`)[1];
      list.append(row);
    }
    focusWin('win-explorer'); syncTasks();
  }
  const CATS = { Images: /\.(png|jpe?g)$/i, Videos: /\.mp4$/i, Music: /\.mp3$/i, Documents: /\.(pdf|docx|xlsx|txt)$/i, Archives: /\.zip$/i, Installers: /\.exe$/i, '3D': /\.blend$/i };
  const cat = (n) => Object.keys(CATS).find(k => CATS[k].test(n)) || 'Other';
  const fmt = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
  showFolder('Downloads');
  focusWin('win-readme');
  syncTasks();

  // ---------------------------------------------------------------- toast, clock, tray
  let toastTimer = null;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const clock = () => { const d = new Date(); $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  clock(); setInterval(clock, 10000);
  function drawTray() {
    const c = $('#tray-zin'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    ZinSprites.draw(g, { anim: 'idle', frame: 0, skin: settings.skin, hat: settings.hat, x: -15, y: -3, scale: 1.4 });
  }
  drawTray();
  $('#tray-btn').addEventListener('click', () => { $('#zin').hidden = false; fire('command', 'menu'); });

  // ---------------------------------------------------------------- wallpaper
  const DEFAULT_WALL = getComputedStyle(document.documentElement).getPropertyValue('--wall');
  const PRESETS = ['linear-gradient(160deg,#0f2b3d,#1b6b72 55%,#f2b36d)', 'radial-gradient(circle at 30% 20%,#ff7ab6,#4b1d6b 60%,#120626)', 'linear-gradient(200deg,#13203a,#2a4f8f 50%,#9fd3ff)'];
  const setWall = (css) => { desk.style.background = css; };

  // ---------------------------------------------------------------- fake API
  const rect = (id) => { const r = wins[id].getBoundingClientRect(); return { id, x: r.left, y: r.top, width: r.width, height: r.height }; };
  let notes = [];

  const ACTIONS = {
    'files.find': async ({ query }) => {
      await wait(1400);
      const words = query.toLowerCase().split(/\s+/);
      const results = FILES.filter(f => words.every(w => f.name.toLowerCase().includes(w))).map(f => ({ ...f, isDir: false }));
      return { results, total: results.length };
    },
    'files.recent': async () => ({ results: FILES.slice(0, 6) }),
    'files.big': async () => { await wait(900); return { results: FILES.filter(f => f.size > 50e6).sort((a, b) => b.size - a.size) }; },
    'files.reveal': async ({ path }) => { const f = FILES.find(x => x.path === path); showFolder(f ? f.folder : 'Downloads', path); await wait(300); return { window: rect('win-explorer') }; },
    'files.openFolder': async () => { showFolder('Downloads'); await wait(300); return { window: rect('win-explorer') }; },
    'organize.plan': async ({ folder, mode }) => {
      if (folder !== 'downloads') { toast('In this demo only Downloads has files to sort.'); }
      if (organized) return { id: 'p', count: 0, summary: {} };
      const summary = {};
      const group = (f) => mode === 'alpha' ? (/[a-z]/i.test(f.name[0]) ? f.name[0].toUpperCase() : '#') : mode === 'date' ? '2026\\10 October' : cat(f.name);
      FILES.filter(f => f.folder === 'Downloads').forEach(f => { const c = group(f); summary[c] = (summary[c] || 0) + 1; });
      return { id: 'p', count: Object.values(summary).reduce((a, b) => a + b, 0), summary, folder: 'Downloads' };
    },
    'organize.apply': async () => { await wait(2200); organized = true; showFolder('Downloads'); return { moved: 12, failed: [] }; },
    'organize.undo': async () => { if (!organized) return { nothing: true }; organized = false; showFolder('Downloads'); return { restored: 12 }; },
    'clean.scan': async () => { await wait(1600); return { items: [
      { id: 'temp', label: 'Temporary files', bytes: 1.84e9, count: 3120, note: 'Leftovers apps forgot to delete' },
      { id: 'recycle', label: 'Recycle Bin', bytes: 612e6, count: 48, note: 'Empties it for good' },
      { id: 'installers', label: 'Old installers in Downloads', bytes: 94.3e6, count: 2, note: 'Setup files older than 2 weeks (go to Recycle Bin)' },
    ] }; },
    'clean.run': async ({ ids }) => { await wait(2600); const sizes = { temp: 1.84e9, recycle: 612e6, installers: 94.3e6 }; return { freed: ids.reduce((a, i) => a + (sizes[i] || 0), 0) }; },
    'wallpaper.generated': async ({ dataUrl }) => { setWall(`url(${dataUrl}) center / cover`); return {}; },
    'wallpaper.random': async () => { setWall(PRESETS[Math.floor(Math.random() * PRESETS.length)]); return {}; },
    'wallpaper.restore': async () => { setWall(DEFAULT_WALL); return {}; },
    'wallpaper.pick': () => new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', () => {
        const f = inp.files[0];
        if (!f) return resolve({ canceled: true });
        setWall(`url(${URL.createObjectURL(f)}) center / cover`);
        resolve({});
      });
      inp.addEventListener('cancel', () => resolve({ canceled: true }));
      inp.click();
    }),
    'system.stats': async () => ({ cpu: 18 + Math.round(Math.random() * 30), memUsed: 9.8e9, memTotal: 16e9, disk: { free: 212e9, total: 1e12 }, uptime: 3600 * 31 }),
    'system.theme': async ({ mode }) => { document.body.classList.toggle('light', mode === 'light'); return { mode }; },
    'system.open': async ({ app }) => { toast(`On your PC, this opens ${app[0].toUpperCase() + app.slice(1)}.`); return {}; },
    'system.lock': async () => { const l = $('#lock'); l.hidden = false; setTimeout(() => { l.hidden = true; }, 2600); return {}; },
    'system.screenshot': async () => { const f = $('#flash'); f.hidden = false; setTimeout(() => { f.hidden = true; }, 180); return {}; },
    'web.search': async ({ q, site }) => { toast(`On your PC, this searches ${site === 'youtube' ? 'YouTube' : 'Google'} for "${q}".`); return {}; },
    'files.old': async () => { await wait(1200); const old = FILES.filter(f => f.size > 20e6).map(f => ({ ...f, mtime: Date.now() - 400 * 86400000 })); return { results: old, total: old.length, bytes: old.reduce((a, f) => a + f.size, 0) }; },
    'files.recycle': async ({ paths }) => { toast(`On your PC, ${paths.length} file${paths.length === 1 ? '' : 's'} would go to the Recycle Bin.`); return { moved: paths.length, failed: [] }; },
    'apps.open': async ({ name }) => { toast(`On your PC, this opens ${name}.`); return { opened: name }; },
    'apps.close': async ({ name }) => { toast(`On your PC, this closes ${name}.`); return { closed: [name] }; },
    'web.open': async ({ url }) => { toast(`On your PC, this opens ${url}.`); return {}; },
    'music.play': async ({ query }) => { toast(query ? `On your PC, Spotify opens on "${query}".` : 'On your PC, your music starts playing.'); return { opened: 'spotify' }; },
    'media.key': async ({ cmd }) => { toast(`On your PC, this presses the ${cmd} media key.`); return {}; },
    'volume': async ({ cmd, level }) => { toast(cmd === 'set' ? `On your PC, the volume goes to ${level}%.` : `On your PC, the volume goes ${cmd}.`); return {}; },
    'power': async ({ kind, delay }) => { toast(kind === 'cancel' ? 'On your PC, this cancels the shutdown.' : `On your PC, this would ${kind === 'shutdown' ? 'shut down' : kind}${delay ? ' in ' + Math.round(delay / 60) + ' min' : ''}. Not in the demo!`); return {}; },
    'notes.add': async ({ text }) => { notes.push(text); renderNotes(); return {}; },
    'notes.open': async () => { renderNotes(); focusWin('win-notes'); syncTasks(); return {}; },
  };
  function renderNotes() {
    const ul = $('#notes-list');
    ul.innerHTML = '';
    (notes.length ? notes : ['(empty) Ask Zin: "note buy snacks"']).forEach(n => { const li = document.createElement('li'); li.textContent = n; ul.append(li); });
  }
  renderNotes();

  window.zin = {
    platform: 'demo',
    getSettings: async () => settings,
    setSettings: async (patch) => { settings = { ...settings, ...patch }; save(); drawTray(); fire('settings', settings); return settings; },
    action: async (name, args) => {
      const fn = ACTIONS[name];
      if (!fn) return { ok: false, error: 'Not in the demo' };
      try { return { ok: true, ...(await fn(args || {})) }; } catch (e) { return { ok: false, error: e.message }; }
    },
    capture() {}, focus() {}, blur() {},
    hide() { $('#zin').hidden = true; toast('Zin is hiding. Click the tray icon to bring Zin back.'); },
    onSettings: on('settings'), onCommand: on('command'), onActiveWindow: on('active-window'), onBounds: on('bounds'),
  };
  // the renderer subscribes after this file runs; send the first window once it's listening
  setTimeout(report, 400);
})();
