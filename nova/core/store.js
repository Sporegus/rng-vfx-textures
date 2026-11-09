// Nova's durable store: SQLite (built into Node/Electron) with numbered
// migrations, WAL journaling and transactions, so a crash or power cut can't
// leave a half-written job, grant or outgoing message.
//
// Tables:
//   tasks        history of everything she was asked (bounded, deletable)
//   grants       permissions you gave, bound to a task or job
//   jobs         long-running jobs (goal, contract, plan, state, budgets)
//   job_events   each job's progress history and evidence
//   outbox       intent-to-send records, written BEFORE a message leaves, so a
//                lost acknowledgement or restart never causes a blind resend
//   leases       who owns a job / the desktop / a workspace right now
//   memory       things you approved her keeping (preferences, aliases, targets)
//   schedules    times to start already-authorized jobs
'use strict';
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  // 1: the first schema
  `CREATE TABLE tasks (id TEXT PRIMARY KEY, request_id TEXT, source TEXT, text TEXT, kind TEXT, state TEXT,
     intent TEXT, created INTEGER, updated INTEGER, result TEXT, error TEXT);
   CREATE INDEX tasks_created ON tasks(created);
   CREATE TABLE grants (id TEXT PRIMARY KEY, scope_kind TEXT, scope_id TEXT, categories TEXT, targets TEXT, effects TEXT,
     details TEXT, created INTEGER, expires INTEGER, revoked INTEGER DEFAULT 0, persistent INTEGER DEFAULT 0);
   CREATE TABLE jobs (id TEXT PRIMARY KEY, goal TEXT, state TEXT, contract TEXT, plan TEXT, budgets TEXT, usage TEXT,
     checkpoint TEXT, next_action TEXT, stop_reason TEXT, created INTEGER, updated INTEGER, version INTEGER DEFAULT 1);
   CREATE TABLE job_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, t INTEGER, kind TEXT, data TEXT);
   CREATE INDEX job_events_job ON job_events(job_id, seq);
   CREATE TABLE outbox (id TEXT PRIMARY KEY, job_id TEXT, iteration TEXT, destination TEXT, payload_hash TEXT,
     state TEXT, created INTEGER, updated INTEGER, detail TEXT);
   CREATE UNIQUE INDEX outbox_once ON outbox(job_id, iteration, destination);
   CREATE TABLE leases (name TEXT PRIMARY KEY, owner TEXT, expires INTEGER);
   CREATE TABLE memory (key TEXT PRIMARY KEY, kind TEXT, value TEXT, created INTEGER, updated INTEGER);
   CREATE TABLE schedules (id TEXT PRIMARY KEY, job_id TEXT, at INTEGER, tz TEXT, missed TEXT, last_run INTEGER, enabled INTEGER);`,
];

function openStore(file) {
  const { DatabaseSync } = require('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);');
  const get = db.prepare('SELECT v FROM meta WHERE k = ?');
  let version = Number((get.get('schema') || {}).v || 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    tx(db, () => { db.exec(MIGRATIONS[i]); db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run('schema', String(i + 1)); });
    version = i + 1;
  }
  const J = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
  const S = (v) => v == null ? null : JSON.stringify(v);

  const api = {
    db, version: () => version, J, S,
    tx: (fn) => tx(db, fn),
    close: () => db.close(),

    // ---- tasks (bounded history)
    putTask(t) {
      db.prepare(`INSERT INTO tasks (id, request_id, source, text, kind, state, intent, created, updated, result, error)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, intent=excluded.intent,
        updated=excluded.updated, result=excluded.result, error=excluded.error, kind=excluded.kind`)
        .run(t.id, t.requestId || null, t.source || null, (t.text || '').slice(0, 500), t.kind || null, t.state, t.intent || null,
          t.created || Date.now(), Date.now(), S(t.result), t.error || null);
      db.prepare('DELETE FROM tasks WHERE id NOT IN (SELECT id FROM tasks ORDER BY created DESC LIMIT 500)').run();
    },
    tasks: (n = 50) => db.prepare('SELECT * FROM tasks ORDER BY created DESC LIMIT ?').all(n).map(r => ({ ...r, result: J(r.result) })),
    clearTasks: () => db.prepare('DELETE FROM tasks').run(),

    // ---- grants
    putGrant(g) {
      db.prepare(`INSERT OR REPLACE INTO grants (id, scope_kind, scope_id, categories, targets, effects, details, created, expires, revoked, persistent)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(g.id, g.scope.kind, g.scope.id, S(g.categories), S(g.targets), S(g.effects), S(g.details),
          g.created, g.expires || null, g.revoked ? 1 : 0, g.persistent ? 1 : 0);
    },
    grants: () => db.prepare('SELECT * FROM grants').all().map(r => ({
      id: r.id, scope: { kind: r.scope_kind, id: r.scope_id }, categories: J(r.categories), targets: J(r.targets), effects: J(r.effects),
      details: J(r.details), created: r.created, expires: r.expires, revoked: !!r.revoked, persistent: !!r.persistent })),

    // ---- jobs
    putJob(j) {
      db.prepare(`INSERT INTO jobs (id, goal, state, contract, plan, budgets, usage, checkpoint, next_action, stop_reason, created, updated, version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET goal=excluded.goal, state=excluded.state, contract=excluded.contract,
        plan=excluded.plan, budgets=excluded.budgets, usage=excluded.usage, checkpoint=excluded.checkpoint, next_action=excluded.next_action,
        stop_reason=excluded.stop_reason, updated=excluded.updated, version=excluded.version`)
        .run(j.id, j.goal, j.state, S(j.contract), S(j.plan), S(j.budgets), S(j.usage), S(j.checkpoint), j.nextAction || null,
          j.stopReason || null, j.created, Date.now(), j.version || 1);
    },
    job(id) { const r = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id); return r ? rowToJob(r) : null; },
    jobs: (states) => db.prepare('SELECT * FROM jobs ORDER BY created DESC').all().map(rowToJob).filter(j => !states || states.includes(j.state)),
    deleteJob(id) { tx(db, () => { db.prepare('DELETE FROM job_events WHERE job_id = ?').run(id); db.prepare('DELETE FROM outbox WHERE job_id = ?').run(id); db.prepare('DELETE FROM jobs WHERE id = ?').run(id); }); },
    addEvent(jobId, kind, data) {
      db.prepare('INSERT INTO job_events (job_id, t, kind, data) VALUES (?,?,?,?)').run(jobId, Date.now(), kind, S(data));
      // bounded history per job
      db.prepare('DELETE FROM job_events WHERE job_id = ? AND seq NOT IN (SELECT seq FROM job_events WHERE job_id = ? ORDER BY seq DESC LIMIT 2000)').run(jobId, jobId);
    },
    events: (jobId, n = 200) => db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY seq DESC LIMIT ?').all(jobId, n).reverse().map(r => ({ seq: r.seq, t: r.t, kind: r.kind, data: J(r.data) })),

    // ---- outbox: record intent before sending, then reconcile
    outboxIntent({ id, jobId, iteration, destination, payloadHash }) {
      // unique (job, iteration, destination): a second intent for the same handoff is refused
      try {
        db.prepare('INSERT INTO outbox (id, job_id, iteration, destination, payload_hash, state, created, updated) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, jobId, iteration, destination, payloadHash, 'intent', Date.now(), Date.now());
        return { created: true };
      } catch (e) {
        if (/UNIQUE/.test(e.message)) return { created: false, existing: api.outboxFor(jobId, iteration, destination) };
        throw e;
      }
    },
    outboxSet(id, state, detail) { db.prepare('UPDATE outbox SET state = ?, detail = ?, updated = ? WHERE id = ?').run(state, S(detail), Date.now(), id); },
    outboxFor(jobId, iteration, destination) { const r = db.prepare('SELECT * FROM outbox WHERE job_id = ? AND iteration = ? AND destination = ?').get(jobId, iteration, destination); return r ? { ...r, detail: J(r.detail) } : null; },
    outboxPending: () => db.prepare("SELECT * FROM outbox WHERE state IN ('intent', 'sending', 'unknown')").all().map(r => ({ ...r, detail: J(r.detail) })),

    // ---- leases: one owner at a time, with expiry for crashed owners
    acquire(name, owner, ms) {
      let ok = false;
      tx(db, () => {
        const r = db.prepare('SELECT * FROM leases WHERE name = ?').get(name);
        if (!r || r.owner === owner || r.expires < Date.now()) {
          db.prepare('INSERT OR REPLACE INTO leases (name, owner, expires) VALUES (?,?,?)').run(name, owner, Date.now() + ms);
          ok = true;
        }
      });
      return ok;
    },
    release(name, owner) { db.prepare('DELETE FROM leases WHERE name = ? AND owner = ?').run(name, owner); },
    holder(name) { const r = db.prepare('SELECT * FROM leases WHERE name = ?').get(name); return r && r.expires >= Date.now() ? r.owner : null; },

    // ---- memory (only what you approved; inspectable and deletable)
    remember(key, kind, value) {
      db.prepare(`INSERT INTO memory (key, kind, value, created, updated) VALUES (?,?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, kind=excluded.kind, updated=excluded.updated`).run(key, kind, S(value), Date.now(), Date.now());
    },
    recall: (kind) => db.prepare('SELECT * FROM memory' + (kind ? ' WHERE kind = ?' : '')).all(...(kind ? [kind] : [])).map(r => ({ key: r.key, kind: r.kind, value: J(r.value), updated: r.updated })),
    forget(key) { db.prepare('DELETE FROM memory WHERE key = ?').run(key); },

    // ---- schedules
    putSchedule(s) { db.prepare('INSERT OR REPLACE INTO schedules (id, job_id, at, tz, missed, last_run, enabled) VALUES (?,?,?,?,?,?,?)').run(s.id, s.jobId, s.at, s.tz, s.missed || 'skip', s.lastRun || null, s.enabled ? 1 : 0); },
    schedules: () => db.prepare('SELECT * FROM schedules').all().map(r => ({ id: r.id, jobId: r.job_id, at: r.at, tz: r.tz, missed: r.missed, lastRun: r.last_run, enabled: !!r.enabled })),
  };
  function rowToJob(r) {
    return { id: r.id, goal: r.goal, state: r.state, contract: J(r.contract), plan: J(r.plan), budgets: J(r.budgets), usage: J(r.usage),
      checkpoint: J(r.checkpoint), nextAction: r.next_action, stopReason: r.stop_reason, created: r.created, updated: r.updated, version: r.version };
  }
  return api;
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

module.exports = { openStore, MIGRATIONS };
