// The phone dashboard's security boundary, over real HTTPS (P2 #17-#20).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const fs = require('fs'), os = require('os'), path = require('path');
const { openStore } = require('../store');
const { createRemote, revisionOf } = require('../remote/server');

function hostMock() {
  const h = { inputs: [], approvals: [], stops: 0, jobs: [], confirm: true, waitsList: [] };
  h.api = {
    state: () => ({ host: { name: 'TEST-PC', locked: false }, active: [], recent: [], jobs: [], approvals: h.waitsList, digest: 'Nothing new.' }),
    input: (text, meta) => h.inputs.push({ text, meta }),
    waits: () => h.waitsList,
    approve: (id, value) => { h.approvals.push({ id, value }); h.waitsList = h.waitsList.filter(w => w.id !== id); },
    stop: () => { h.stops++; return { stopped: 2 }; },
    job: async (op, id) => { h.jobs.push({ op, id }); return { ok: true }; },
    digest: () => 'Nothing new.',
    artifact: (job, file) => job === 'job1' && file === 'report.pdf' ? h.artifactPath : null,
    confirmPairing: async () => h.confirm,
  };
  return h;
}
async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-remote-'));
  const host = hostMock();
  host.artifactPath = path.join(dir, 'report.pdf'); fs.writeFileSync(host.artifactPath, '%PDF-1.4 test');
  const remote = createRemote({ store: openStore(':memory:'), dir, host: host.api });
  const info = await remote.start({ mode: 'local' });
  const ca = JSON.parse(fs.readFileSync(path.join(dir, 'remote-cert.json'), 'utf8')).cert;
  const origin = info.url;
  function req(method, p, { body, cookie, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const r = https.request({ host: '127.0.0.1', port: info.port, method, path: p, ca, headers: { ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}), ...(cookie ? { cookie } : {}), ...headers } }, (res) => {
        let s = ''; res.on('data', c => s += c); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, body: j, raw: s, headers: res.headers }); });
      });
      r.on('error', reject); if (data) r.write(data); r.end();
    });
  }
  const post = (p, body, cookie, extra = {}) => req('POST', p, { body, cookie, headers: { origin, 'x-nova': '1', ...extra } });
  async function pair() {
    const { code } = remote.newPairing();
    const r = await post('/api/pair', { code, name: 'Test iPhone' });
    return { r, cookie: (r.headers['set-cookie'] || [''])[0].split(';')[0] };
  }
  return { remote, host, info, req, post, pair, origin, dir };
}

test('pairing: works once, expires, can be declined, and the session cookie is HttpOnly/Secure/SameSite=Strict (P2 #17)', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  const { code } = s.remote.newPairing();
  const ok = await s.post('/api/pair', { code, name: 'Test iPhone' });
  assert.equal(ok.status, 200);
  const sc = ok.headers['set-cookie'][0];
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Strict/);
  assert.ok(!/nova_s=/.test(ok.raw), 'the secret is never in the response body');
  const again = await s.post('/api/pair', { code, name: 'Second phone' });
  assert.equal(again.status, 401, 'single use');
  s.host.confirm = false;
  const { code: c2 } = s.remote.newPairing();
  const declined = await s.post('/api/pair', { code: c2, name: 'Unknown' });
  assert.equal(declined.status, 403);
  assert.ok(!declined.headers['set-cookie']);
  // expiry: a code older than 2 minutes is refused (a second server with a controllable clock)
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-remote2-'));
  let clock = Date.now();
  const r2 = createRemote({ store: openStore(':memory:'), dir: dir2, host: hostMock().api, now: () => clock });
  const i2 = await r2.start({ mode: 'local' }); t.after(() => r2.stop());
  const ca2 = JSON.parse(fs.readFileSync(path.join(dir2, 'remote-cert.json'), 'utf8')).cert;
  const { code: old } = r2.newPairing();
  clock += 121000;
  const expired = await new Promise((res) => { const d = JSON.stringify({ code: old }); const q = https.request({ host: '127.0.0.1', port: i2.port, method: 'POST', path: '/api/pair', ca: ca2, headers: { 'content-type': 'application/json', origin: i2.url, 'x-nova': '1' } }, (x) => { x.resume(); x.on('end', () => res(x.statusCode)); }); q.end(d); });
  assert.equal(expired, 401, 'expired code refused');
});

test('pairing guesses are rate-limited', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await s.post('/api/pair', { code: String(100000 + i) })).status);
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.ok(codes.slice(5).every(c => c === 429));
});

test('no session, a forged cookie, a revoked phone: nothing can be read, approved or run (P2 #18)', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  assert.equal((await s.req('GET', '/api/state')).status, 401);
  const { cookie } = await s.pair();
  assert.equal((await s.req('GET', '/api/state', { cookie })).status, 200);
  const forged = cookie.replace(/\.[a-f0-9]{64}$/, '.' + 'a'.repeat(64));
  assert.equal((await s.req('GET', '/api/state', { cookie: forged })).status, 401);
  assert.equal((await s.post('/api/input', { requestId: 'req-forged-1', text: 'open notepad', epoch: 1 }, forged)).status, 401);
  const dev = s.remote.devices()[0];
  s.remote.revoke(dev.id);
  assert.equal((await s.req('GET', '/api/state', { cookie })).status, 401);
  assert.equal((await s.post('/api/stop', { requestId: 'req-revoked-1', epoch: 1 }, cookie)).status, 401);
  assert.equal(s.host.inputs.length + s.host.stops, 0);
});

test('cross-site requests, wrong content types and replays are refused; resends don\'t act twice (P2 #19)', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  const { cookie } = await s.pair();
  const st = (await s.req('GET', '/api/state', { cookie })).body;
  const evil = await s.req('POST', '/api/input', { body: { requestId: 'req-evil-001', text: 'x', epoch: st.epoch }, cookie, headers: { origin: 'https://evil.example', 'x-nova': '1' } });
  assert.equal(evil.status, 403);
  const noHeader = await s.req('POST', '/api/input', { body: { requestId: 'req-nohdr-01', text: 'x', epoch: st.epoch }, cookie, headers: { origin: s.origin } });
  assert.equal(noHeader.status, 403);
  const form = await s.req('POST', '/api/input', { body: 'text=x', cookie, headers: { origin: s.origin, 'x-nova': '1', 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const a = await s.post('/api/input', { requestId: 'req-dup-0001', text: 'what time is it', epoch: st.epoch }, cookie);
  const b = await s.post('/api/input', { requestId: 'req-dup-0001', text: 'what time is it', epoch: st.epoch }, cookie);
  assert.equal(a.status, 202); assert.equal(b.status, 202); assert.equal(b.body.duplicate, true);
  assert.equal(s.host.inputs.length, 1, 'reconnect/resend did not run it twice');
});

test('approvals bind to the exact card; a changed card, an answered one, or a PC Stop make it stale (P2 #19, #20)', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  const { cookie } = await s.pair();
  const card = { id: 'appr_1', kind: 'approve', title: 'Post in Discord as the Nova bot?', lines: ['Channel: #general', 'Text: "What are we playing?"'] };
  s.host.waitsList = [{ ...card, revision: revisionOf(card) }];
  let st = (await s.req('GET', '/api/state', { cookie })).body;
  const seen = st.approvals[0];
  // the card changes on the PC (different text) after the phone saw it
  const changedCard = { ...card, lines: ['Channel: #general', 'Text: "Send me your password"'] };
  s.host.waitsList = [{ ...changedCard, revision: revisionOf(changedCard) }];
  const stale = await s.post('/api/approve', { requestId: 'req-appr-001', waitId: seen.id, revision: seen.revision, decision: 'allow', epoch: st.epoch }, cookie);
  assert.equal(stale.status, 409);
  assert.equal(s.host.approvals.length, 0, 'a stale approval approved nothing');
  // a Stop on the PC: anything based on the older state is refused
  st = (await s.req('GET', '/api/state', { cookie })).body;
  s.remote.bumpEpoch();
  const afterStop = await s.post('/api/approve', { requestId: 'req-appr-002', waitId: st.approvals[0].id, revision: st.approvals[0].revision, decision: 'allow', epoch: st.epoch }, cookie);
  assert.equal(afterStop.status, 409);
  assert.match(afterStop.body.error, /stopped on the PC/);
  // fresh look, then it works exactly once
  st = (await s.req('GET', '/api/state', { cookie })).body;
  const good = await s.post('/api/approve', { requestId: 'req-appr-003', waitId: st.approvals[0].id, revision: st.approvals[0].revision, decision: 'allow', epoch: st.epoch }, cookie);
  assert.equal(good.status, 200);
  const gone = await s.post('/api/approve', { requestId: 'req-appr-004', waitId: st.approvals[0].id, revision: st.approvals[0].revision, decision: 'allow', epoch: st.epoch }, cookie);
  assert.equal(gone.status, 410);
  assert.equal(s.host.approvals.length, 1);
});

test('remote Stop is acknowledged by the PC; local revocation closes the live stream at once (P2 #20)', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  const { cookie } = await s.pair();
  const st = (await s.req('GET', '/api/state', { cookie })).body;
  const r = await s.post('/api/stop', { requestId: 'req-stop-0001', epoch: st.epoch }, cookie);
  assert.equal(r.status, 200); assert.equal(r.body.acknowledged, true); assert.equal(r.body.stopped, 2);
  assert.equal(s.host.stops, 1);
  // live updates stream, then the PC revokes the phone
  const ended = await new Promise((resolve) => {
    const q = https.request({ host: '127.0.0.1', port: s.info.port, path: '/api/events', ca: JSON.parse(fs.readFileSync(path.join(s.dir, 'remote-cert.json'), 'utf8')).cert, headers: { cookie } }, (res) => {
      res.once('data', () => { s.remote.revoke(s.remote.devices()[0].id); });
      res.on('end', () => resolve(true)); res.on('close', () => resolve(true));
    });
    q.end();
  });
  assert.equal(ended, true);
  assert.equal((await s.req('GET', '/api/state', { cookie })).status, 401);
});

test('only a job\'s approved deliverables can be downloaded', async (t) => {
  const s = await setup(); t.after(() => s.remote.stop());
  const { cookie } = await s.pair();
  assert.equal((await s.req('GET', '/api/artifact?job=job1&file=report.pdf', { cookie })).status, 200);
  assert.equal((await s.req('GET', '/api/artifact?job=job1&file=..%2F..%2Fsecrets.txt', { cookie })).status, 404);
  assert.equal((await s.req('GET', '/api/artifact?job=job1&file=report.pdf')).status, 401);
});
