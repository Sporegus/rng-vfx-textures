// The phone dashboard's server. The PC stays the host; the phone is a paired client.
//
// Off by default. When on, it listens only where you chose: this PC only (127.0.0.1),
// your home network (the PC's own LAN address), or an address you configured (e.g. a
// VPN like Tailscale). It never opens router ports, changes the firewall or creates
// public hosting. Always HTTPS (self-signed; the fingerprint is shown when pairing).
//
// Security, checked on the server for every request (hiding a button isn't security):
//   - pairing starts on the PC: a 6-digit code that expires in 2 minutes and works once,
//     then you allow the device on the PC; rate-limited
//   - the device gets an HttpOnly, Secure, SameSite=Strict cookie (never in a URL), with
//     expiry; revocable from the PC (open connections are closed at once)
//   - state-changing requests need the same Origin and an X-Nova header (no cross-site),
//     JSON only, small bodies; each carries a requestId: a resend returns the first result
//     instead of acting twice
//   - approvals bind to the exact card (its revision); a changed or expired card is refused
//   - a Stop or revocation on the PC wins: phone commands based on older state are refused
//   - nothing is cached by the phone, no desktop/mic streaming, every remote action audited
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { makeCert } = require('./cert');

const PAIR_TTL = 120000, DEVICE_TTL = 30 * 86400e3, MAX_BODY = 32 * 1024;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const tsEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a.address)) out.push(a.address);
  return out;
}

// simple token buckets
function limiter() {
  const b = new Map();
  return (key, perMin, burst = perMin) => {
    const t = Date.now(), cur = b.get(key) || { tokens: burst, at: t };
    cur.tokens = Math.min(burst, cur.tokens + (t - cur.at) / 60000 * perMin); cur.at = t;
    if (cur.tokens < 1) { b.set(key, cur); return false; }
    cur.tokens -= 1; b.set(key, cur); return true;
  };
}

function createRemote({ store, log, dir, host, now = () => Date.now(), staticDir = path.join(__dirname, 'phone') }) {
  // host: { state(), input(text, meta), approve(waitId, value), waits(), stop(why), job(op, id), digest(), artifact(jobId, name) -> path|null, confirmPairing(info) -> Promise<bool> }
  let server = null, info = null, epoch = 1, version = 1;
  const pairings = new Map();          // code -> { code, expires, used, device }
  const streams = new Map();           // res -> deviceId
  const allow = limiter();
  const devices = () => store.recall('remote_device').map(r => r.value).filter(Boolean);
  const saveDevice = (d) => store.remember('remote_device:' + d.id, 'remote_device', d);
  const audit = (deviceId, action, result, extra = {}) => { const e = { t: now(), device: deviceId, action, result, ...extra }; store.remember('remote_audit:' + e.t + ':' + crypto.randomBytes(3).toString('hex'), 'remote_audit', e); log && log.event('remote.' + action, { device: deviceId, result }); pruneAudit(); };
  const pruneAudit = () => { const all = store.recall('remote_audit').sort((a, b) => b.value.t - a.value.t); for (const x of all.slice(500)) store.forget(x.key); };

  // ---------------------------------------------------------------- certificate
  function certFor(ips) {
    const f = path.join(dir, 'remote-cert.json');
    let c = null;
    try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    const needIps = [...new Set(['127.0.0.1', ...ips])].sort();
    if (!c || JSON.stringify(c.ips.slice().sort()) !== JSON.stringify(needIps) || new Date(c.validTo).getTime() < now() + 30 * 86400e3) {
      c = makeCert({ ips: needIps, names: ['localhost', os.hostname().toLowerCase()], cn: `Nova on ${os.hostname()}` });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(f, JSON.stringify(c), { mode: 0o600 });
    }
    return c;
  }

  // ---------------------------------------------------------------- start / stop
  async function start({ mode = 'off', address = null, port = 0 } = {}) {
    await stop();
    if (mode === 'off') return { running: false };
    const bindIp = mode === 'local' ? '127.0.0.1' : mode === 'lan' ? lanAddresses()[0] : mode === 'custom' ? address : null;
    if (!bindIp || !/^\d{1,3}(\.\d{1,3}){3}$/.test(bindIp)) throw new Error(mode === 'lan' ? 'No home-network address found on this PC.' : 'That address isn\'t usable.');
    const c = certFor(bindIp === '127.0.0.1' ? [] : [bindIp]);
    server = https.createServer({ cert: c.cert, key: c.key, minVersion: 'TLSv1.2' }, (req, res) => handle(req, res).catch((e) => { if (e.status) return send(res, e.status, { error: e.status === 415 ? 'JSON only.' : e.status === 413 ? 'Too big.' : 'Bad request.' }); log && log.event('remote.error', { message: e.message }); send(res, 500, { error: 'Something went wrong on the PC.' }); }));
    server.headersTimeout = 10000; server.requestTimeout = 15000;
    await new Promise((ok, bad) => { server.once('error', bad); server.listen(port, bindIp, ok); });
    info = { mode, address: bindIp, port: server.address().port, url: `https://${bindIp}:${server.address().port}`, fingerprint: c.fingerprint };
    log && log.event('remote.started', { mode, address: bindIp, port: info.port });
    return { running: true, ...info };
  }
  async function stop() {
    for (const res of streams.keys()) { try { res.end(); } catch {} }
    streams.clear();
    if (server) { const s = server; server = null; info = null; await new Promise(r => s.close(() => r())); }
  }

  // ---------------------------------------------------------------- pairing (from the PC)
  function newPairing() {
    for (const [k, p] of pairings) if (p.expires < now() || p.used) pairings.delete(k);
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    pairings.set(code, { code, expires: now() + PAIR_TTL, used: false });
    return { code, expires: now() + PAIR_TTL, url: info && info.url, fingerprint: info && info.fingerprint };
  }
  function revoke(deviceId, why = 'revoked on the PC') {
    const d = devices().find(x => x.id === deviceId);
    if (d) { d.revoked = now(); saveDevice(d); }
    for (const [res, did] of streams) if (did === deviceId) { try { res.end(); } catch {} streams.delete(res); }
    audit(deviceId, 'revoke', why);
    return !!d;
  }
  // the PC's Stop also makes any phone command based on older state stale
  function bumpEpoch() { epoch++; changed(); }
  function changed() { version++; clearTimeout(changed.t); changed.t = setTimeout(() => { for (const res of streams.keys()) { try { res.write(`event: state\ndata: ${JSON.stringify({ version, epoch })}\n\n`); } catch {} } }, 150); }

  // ---------------------------------------------------------------- HTTP
  function send(res, code, body, headers = {}) {
    const data = Buffer.from(JSON.stringify(body));
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...headers });
    res.end(data);
  }
  function auth(req) {
    const m = /(?:^|;\s*)nova_s=([a-z0-9_]+)\.([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (!m) return null;
    const d = devices().find(x => x.id === m[1]);
    if (!d || d.revoked || d.expires < now() || !tsEq(d.secretHash, sha(m[2]))) return null;
    if (now() - (d.lastSeen || 0) > 60000) { d.lastSeen = now(); saveDevice(d); }
    return d;
  }
  const sameOrigin = (req) => {
    const want = `https://${req.headers.host}`;
    if (req.headers.origin !== want) return false;
    const sfs = req.headers['sec-fetch-site'];
    return !sfs || sfs === 'same-origin';
  };
  function readJson(req) {
    return new Promise((resolve, reject) => {
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('JSON only'), { status: 415 }));
      let n = 0; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(Object.assign(new Error('too big'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad JSON'), { status: 400 })); } });
    });
  }
  // a repeated requestId gets its first answer back (no second side effect)
  function once(device, requestId, fn) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(requestId || ''))) return Promise.resolve({ status: 400, body: { error: 'Missing request id.' } });
    const k = `remote_req:${device.id}:${requestId}`;
    const prev = store.recall('remote_req').find(r => r.key === k);
    if (prev) return Promise.resolve({ ...prev.value.out, duplicate: true });
    return Promise.resolve(fn()).then((out) => {
      store.remember(k, 'remote_req', { out, at: now() });
      const all = store.recall('remote_req').sort((a, b) => b.value.at - a.value.at); for (const x of all.slice(1000)) store.forget(x.key);
      return out;
    });
  }
  const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.png': ['icon.png', 'image/png'] };

  async function handle(req, res) {
    const u = new URL(req.url, 'https://x');
    const ip = req.socket.remoteAddress;
    // the dashboard itself (no secrets in it)
    if (req.method === 'GET' && STATIC[u.pathname]) {
      const [file, type] = STATIC[u.pathname];
      const body = fs.readFileSync(path.join(staticDir, file));
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'permissions-policy': 'camera=(), microphone=(), geolocation=()' });
      return res.end(body);
    }
    if (!u.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    const post = req.method === 'POST';
    if (post && !(sameOrigin(req) && req.headers['x-nova'] === '1')) { audit('-', 'blocked', 'cross-site or missing header', { path: u.pathname }); return send(res, 403, { error: 'Refused: not from the Nova dashboard.' }); }

    // ---- pairing
    if (post && u.pathname === '/api/pair') {
      if (!allow('pair:' + ip, 5, 5) || !allow('pair:all', 20, 20)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
      const b = await readJson(req);
      const p = pairings.get(String(b.code || ''));
      if (!p || p.used || p.expires < now()) { audit('-', 'pair', 'bad or expired code', { ip }); return send(res, 401, { error: 'That code is wrong or expired. Make a new one on the PC.' }); }
      p.used = true;   // single use, whatever happens next
      const name = String(b.name || 'Phone').replace(/[^\w .()'-]/g, '').slice(0, 40) || 'Phone';
      const ok = await host.confirmPairing({ name, ip });
      if (!ok) { audit('-', 'pair', 'declined on the PC', { name }); return send(res, 403, { error: 'Pairing was declined on the PC.' }); }
      const secret = crypto.randomBytes(32).toString('hex');
      const d = { id: 'dev_' + crypto.randomBytes(8).toString('hex'), name, created: now(), lastSeen: now(), expires: now() + DEVICE_TTL, revoked: null, secretHash: sha(secret) };
      saveDevice(d);
      audit(d.id, 'pair', 'paired', { name });
      return send(res, 200, { ok: true, device: { id: d.id, name, expires: d.expires } }, { 'set-cookie': `nova_s=${d.id}.${secret}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DEVICE_TTL / 1000}` });
    }
    const device = auth(req);
    if (!device) return send(res, 401, { error: 'Not paired (or this phone was removed). Pair again from the PC.' });

    // ---- reading
    if (req.method === 'GET' && u.pathname === '/api/state') return send(res, 200, { ...host.state(), epoch, version, device: { name: device.name, expires: device.expires }, serverTime: now() });
    if (req.method === 'GET' && u.pathname === '/api/events') {
      const sfs = req.headers['sec-fetch-site'];
      if (sfs && sfs !== 'same-origin') return send(res, 403, { error: 'Refused.' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: state\ndata: ${JSON.stringify({ version, epoch })}\n\n`);
      streams.set(res, device.id);
      const hb = setInterval(() => { try { res.write(`event: ping\ndata: ${now()}\n\n`); } catch {} }, 20000);
      req.on('close', () => { clearInterval(hb); streams.delete(res); });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/api/artifact') {
      const p = host.artifact(u.searchParams.get('job'), u.searchParams.get('file'));
      if (!p) return send(res, 404, { error: 'Not an approved deliverable of that job.' });
      audit(device.id, 'download', 'ok', { file: path.basename(p) });
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${path.basename(p).replace(/"/g, '')}"`, 'cache-control': 'no-store' });
      return fs.createReadStream(p).pipe(res);
    }
    if (!post) return send(res, 405, { error: 'Not allowed.' });
    if (!allow('cmd:' + device.id, 30, 10)) return send(res, 429, { error: 'Slow down a little.' });
    const b = await readJson(req);
    // a Stop (or revocation) on the PC since the phone last looked: refuse anything based on old state
    const stale = (Number(b.epoch) || 0) < epoch && !['/api/stop', '/api/logout'].includes(u.pathname);
    if (stale) { audit(device.id, 'stale', u.pathname); return send(res, 409, { error: 'Nova was stopped on the PC since you last looked. Check the latest state, then try again.', epoch }); }

    if (u.pathname === '/api/stop') {
      const out = await once(device, b.requestId, () => { const r = host.stop('phone: ' + device.name); bumpEpoch(); return { status: 200, body: { ok: true, acknowledged: true, stopped: r && r.stopped || 0, at: now() } }; });
      audit(device.id, 'stop', 'acknowledged');
      return send(res, out.status, { ...out.body, duplicate: !!out.duplicate });
    }
    if (u.pathname === '/api/input') {
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!text) return send(res, 400, { error: 'Empty.' });
      const out = await once(device, b.requestId, () => { host.input(text, { device: device.id, requestId: b.requestId }); changed(); return { status: 202, body: { ok: true, accepted: true } }; });
      audit(device.id, 'input', out.duplicate ? 'duplicate ignored' : 'accepted', { chars: text.length });
      return send(res, out.status, { ...out.body, duplicate: !!out.duplicate });
    }
    if (u.pathname === '/api/approve') {
      const out = await once(device, b.requestId, () => {
        const w = host.waits().find(x => x.id === b.waitId);
        if (!w) return { status: 410, body: { error: 'That request is no longer waiting (answered, expired or stopped).' } };
        if (w.revision !== b.revision) return { status: 409, body: { error: 'That request changed since you saw it. Look at the new version first.' } };
        if (w.kind === 'approve') { host.approve(w.id, b.decision === 'allow' ? { allow: true, via: 'phone' } : { allow: false, via: 'phone' }); }
        else { const opt = (w.options || []).find(o => o.value === b.decision); if (!opt && b.decision !== null) return { status: 400, body: { error: 'Not one of the options.' } }; host.approve(w.id, opt ? opt.value : null); }
        changed();
        return { status: 200, body: { ok: true } };
      });
      audit(device.id, 'approve', out.status === 200 ? String(b.decision) : out.body.error);
      return send(res, out.status, { ...out.body, duplicate: !!out.duplicate });
    }
    if (u.pathname === '/api/job') {
      if (!['pause', 'resume', 'cancel', 'finish_step'].includes(b.op)) return send(res, 400, { error: 'Unknown action.' });
      const out = await once(device, b.requestId, async () => { const r = await host.job(b.op, b.jobId); changed(); return { status: r && r.ok === false ? 409 : 200, body: r || { ok: true } }; });
      audit(device.id, 'job:' + b.op, out.status === 200 ? 'ok' : 'refused');
      return send(res, out.status, { ...out.body, duplicate: !!out.duplicate });
    }
    if (u.pathname === '/api/logout') { revoke(device.id, 'signed out on the phone'); return send(res, 200, { ok: true }, { 'set-cookie': 'nova_s=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' }); }
    return send(res, 404, { error: 'Not found' });
  }

  return {
    start, stop, newPairing, revoke, bumpEpoch, changed, lanAddresses,
    status: () => ({ running: !!server, ...(info || {}) }),
    devices: () => devices().map(d => ({ id: d.id, name: d.name, created: d.created, lastSeen: d.lastSeen, expires: d.expires, revoked: d.revoked, active: !d.revoked && d.expires > now() })),
    audit: (n = 50) => store.recall('remote_audit').map(r => r.value).sort((a, b) => b.t - a.t).slice(0, n),
    capability: () => server ? { ok: true, why: `${info.mode === 'local' ? 'this PC only' : info.mode === 'lan' ? 'home network' : 'custom address'}: ${info.url}` } : { ok: false, why: 'Off. Turn it on in Tasks panel > Phone.' },
  };
}

// an approval card's exact content -> its revision (a phone approval must match it)
function revisionOf(w) { const { id, revision, ...rest } = w; void id; void revision; return sha(JSON.stringify(rest)).slice(0, 16); }

module.exports = { createRemote, revisionOf, lanAddresses };
