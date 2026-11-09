// Long-running jobs, and the coordinator that runs planner -> implementer ->
// reviewer cycles between assistants until the job's success criteria pass.
//
// Durable: every job, plan version, event, send intent and checkpoint is in the
// SQLite store, so a crash or restart loses nothing and never resends blindly.
// Bounded: time, cycles, retries, spend, and "no progress" all stop or pause a job.
// Honest: an assistant saying "done" isn't done; Nova checks the files and runs
// the agreed test command herself, on the current revision.
// Scoped: one job-level approval covers routine in-scope handoffs between the
// approved participants. New recipients, secrets, purchases, deployments, public
// posts, paths outside the project or a changed objective are refused.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { id, NovaError, sha256, sleep } = require('./util');
const { envelopeText } = require('./participants');

// background helpers (test commands, assistant CLIs) shouldn't compete with what you're doing
function lowPriority(child) { try { if (child && child.pid) require('os').setPriority(child.pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL); } catch {} }

const JOB_STATES = ['draft', 'queued', 'running', 'waiting_on_assistant', 'verifying', 'paused', 'blocked', 'completed', 'cancelled', 'failed'];
const DEFAULT_BUDGETS = { maxHours: 8, maxCycles: 20, maxRetries: 2, noProgressCycles: 3, maxSpendUsd: null };

// things a handoff may never ask for, whoever wrote it
const OUT_OF_SCOPE = [
  [/\b(password|passcode|api[ -]?key|secret key|access token|session token|cookie|private key|ssh key|seed phrase|credentials?)\b/i, 'asks for secrets'],
  [/\b(buy|purchase|pay for|subscribe|checkout|credit card)\b/i, 'involves a purchase'],
  [/\b(deploy|publish|release to production|push to prod|go live|npm publish)\b/i, 'deploys or publishes'],
  [/\b(post (it )?(publicly|on twitter|on x|on reddit)|tweet|public post)\b/i, 'makes a public post'],
  [/\b(email|message|dm|text) (someone|people|my friends|the team|[A-Z][a-z]+@)/i, 'contacts new people'],
  [/\b(rm -rf|format [a-z]:|del \/s|drop database|wipe)\b/i, 'destroys data'],
  [/\b(new goal|change the (goal|objective)|instead (build|make|do)|forget the (task|goal)|ignore (the|your) (contract|instructions|rules))\b/i, 'changes the objective'],
];

function createJobs({ store, permissions, log, participants = {}, now = () => Date.now(), owner = 'nova-' + process.pid, execImpl = execFile, selfDir = path.resolve(__dirname, '..'), maxConcurrent = 1 }) {
  const running = new Map();       // jobId -> { ac, finishStep }
  const listeners = new Set();
  const emit = (j) => { for (const l of listeners) { try { l(j); } catch {} } };

  // ------------------------------------------------------------------ contract
  function draft(goal, opts = {}) {
    const j = {
      id: id('job'), goal: String(goal).slice(0, 400), state: 'draft', created: now(), version: 1,
      contract: {
        workspace: opts.workspace || null,          // the project folder the job may read and write
        criteria: opts.criteria || [],               // success criteria, in words
        files: opts.files || [],                     // deliverables that must exist (relative to workspace)
        testCommand: opts.testCommand || null,       // the agreed check Nova runs herself, e.g. ["npm", "test"]
        participants: opts.participants || [],       // [{ id, role }] approved assistants
        constraints: opts.constraints || [],
        deadline: opts.deadline || now() + 8 * 3600e3,
        restartResume: !!opts.restartResume,         // may it resume itself after a restart?
        sharing: opts.sharing || 'project files and test output only',
        testEnv: opts.testEnv || null,               // extra environment for the test command (no secrets)
      },
      plan: { version: 1, steps: [] },
      budgets: { ...DEFAULT_BUDGETS, ...(opts.budgets || {}) },
      usage: { cycles: 0, spendUsd: 0, noProgress: 0, replans: 0, started: null, tokens: 0 },
      checkpoint: null, nextAction: 'waiting for your approval', stopReason: null,
      priority: 'normal', notes: '',            // your own notes (searchable); priority orders the queue
      context: null,                             // compact summary a fresh assistant session can continue from
    };
    save(j); event(j, 'drafted', { goal: j.goal });
    return j;
  }
  function card(j) {
    const c = j.contract;
    return {
      title: `Start this job?`,
      lines: [
        `Goal: ${j.goal}`,
        `Project folder: ${c.workspace || '(not chosen)'}`,
        `Participants: ${c.participants.map(p => `${p.id} as ${p.role}${participants[p.id] && !participants[p.id].live ? ' (fixture)' : ''}`).join(', ') || '(none)'}`,
        `Done when: ${[...c.criteria, ...(c.files.length ? [`files exist: ${c.files.join(', ')}`] : []), ...(c.testCommand ? [`\`${[path.basename(c.testCommand[0]).replace(/^electron(\.exe)?$/i, 'node'), ...c.testCommand.slice(1)].join(' ')}\` passes`] : [])].join('; ') || '(no criteria)'}`,
        `Shares: ${c.sharing}. Never: secrets, purchases, deployments, public posts, other chats.`,
        `Limits: ${j.budgets.maxHours} h, ${j.budgets.maxCycles} cycles, ${j.budgets.maxRetries} retries per step${j.budgets.maxSpendUsd ? `, $${j.budgets.maxSpendUsd}` : ''}; deadline ${new Date(c.deadline).toLocaleString()}.`,
        c.restartResume ? 'May resume by itself after a restart (until the deadline).' : 'After a restart it waits for you.',
      ],
      categories: ['relay', 'read'],
      targets: { participant: c.participants.map(p => p.id) },
      effects: { objective: sha256(j.goal + JSON.stringify(c.criteria)) },
    };
  }
  function validateContract(j) {
    const c = j.contract, errs = [];
    if (!c.workspace) errs.push('choose a project folder');
    else if (!fs.existsSync(c.workspace)) errs.push('the project folder does not exist');
    else if (selfDir && (path.resolve(c.workspace) + path.sep).startsWith(path.resolve(selfDir) + path.sep)) errs.push('that is Nova\'s own running folder: changes to Nova go through a separate development copy, never a job inside her');
    if (!c.participants.length) errs.push('pick at least one participant');
    for (const p of c.participants) {
      const a = participants[p.id];
      if (!a) errs.push(`unknown participant ${p.id}`);
      else if (!a.available().ok) errs.push(`${p.id}: ${a.available().reason}`);
    }
    if (!c.criteria.length && !c.files.length && !c.testCommand) errs.push('add at least one success criterion');
    if (!['planner', 'implementer', 'reviewer'].every(r => c.participants.some(p => p.role === r))) errs.push('needs a planner, an implementer and a reviewer (one assistant can have several roles)');
    return errs;
  }
  // one approval for the whole job (the card above). Returns the grant.
  function approve(j) {
    const errs = validateContract(j);
    if (errs.length) throw new NovaError('invalid', 'This job isn\'t ready: ' + errs.join('; ') + '.');
    const c = card(j);
    const g = permissions.grant({ scope: { kind: 'job', id: j.id }, categories: c.categories, targets: c.targets, effects: c.effects, details: { goal: j.goal }, ttlMs: Math.max(60000, j.contract.deadline - now()) });
    j.state = 'queued'; j.nextAction = 'starting'; save(j); event(j, 'approved', { grant: g.id });
    return g;
  }

  // is this proposed handoff inside the contract?
  function inScope(j, text, destination) {
    const reasons = [];
    for (const [re, why] of OUT_OF_SCOPE) if (re.test(text)) reasons.push(why);
    if (!j.contract.participants.some(p => p.id === destination)) reasons.push('goes to an assistant this job didn\'t approve');
    // absolute paths must stay inside the project folder
    for (const m of String(text).matchAll(/(?:[A-Za-z]:\\|\/(?:home|Users|etc|var|usr|root|tmp)\/)[^\s"'`]+/g)) {
      const p = path.resolve(m[0]);
      if (!j.contract.workspace || !p.startsWith(path.resolve(j.contract.workspace))) reasons.push(`touches ${m[0]} outside the project`);
    }
    const ok = permissions.check({ category: 'relay', scope: { kind: 'job', id: j.id }, target: { kind: 'participant', value: destination }, effects: { objective: card(j).effects.objective } });
    if (!ok.ok) reasons.push(ok.reason === 'needs approval' ? 'this job has no valid approval (expired or revoked)' : ok.reason);
    return { ok: !reasons.length, reasons };
  }

  // ------------------------------------------------------------------ evidence Nova checks herself
  function revision(j) {
    // a fingerprint of the deliverables: which revision the tests ran against
    const files = j.contract.files.map(f => { const p = path.join(j.contract.workspace, f); try { const b = fs.readFileSync(p); return { name: f, sha256: sha256(b), size: b.length }; } catch { return { name: f, missing: true }; } });
    return { files, id: sha256(JSON.stringify(files)).slice(0, 16) };
  }
  function runTests(j, signal) {
    const cmd = j.contract.testCommand;
    if (!cmd) return Promise.resolve(null);
    return new Promise((resolve) => {
      const child = execImpl(cmd[0], cmd.slice(1), { cwd: j.contract.workspace, timeout: 10 * 60000, windowsHide: true, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...(j.contract.testEnv || {}) } }, (e, out, err) => {
        resolve({ passed: !e, code: e ? (e.code || 1) : 0, output: (String(out) + String(err)).slice(-3000) });
      });
      lowPriority(child);
      if (signal) signal.addEventListener('abort', () => { try { child.kill(); } catch {} }, { once: true });
    });
  }
  async function verify(j, signal) {
    const rev = revision(j);
    const tests = await runTests(j, signal);
    const missing = rev.files.filter(f => f.missing).map(f => f.name);
    return { revision: rev.id, files: rev.files, missing, tests, passed: !missing.length && (!tests || tests.passed), at: now() };
  }

  // ------------------------------------------------------------------ one handoff, at most once
  async function handoff(j, iteration, participantId, env, signal) {
    const a = participants[participantId];
    if (!a) throw new NovaError('blocked', `${participantId} isn't available.`);
    const text = envelopeText(env);
    // scope is checked on Nova's own words; attachments are verbatim project files (already inside the job's folder)
    const scope = inScope(j, envelopeText({ ...env, attachments: [] }), participantId);
    if (!scope.ok) throw new NovaError('blocked', `I didn't send that to ${participantId}: it ${scope.reasons.join(', ')}.`, { outOfScope: scope.reasons });
    let outId = id('out');
    let rec = store.outboxIntent({ id: outId, jobId: j.id, iteration, destination: participantId, payloadHash: sha256(text) });
    // an earlier attempt the assistant clearly refused (an error reply, so it was never processed) may be sent again,
    // under a new attempt number; only an interrupted or timed-out send is uncertain
    for (let n = 2; !rec.created && rec.existing.state === 'failed' && n < 20; n++) {
      outId = id('out');
      rec = store.outboxIntent({ id: outId, jobId: j.id, iteration: `${iteration}#${n}`, destination: participantId, payloadHash: sha256(text) });
      if (rec.created) event(j, 'resend_after_refusal', { iteration, attempt: n });
    }
    if (!rec.created) {
      // this exact handoff was already attempted: use its result if we have it, never send twice
      const prev = rec.existing;
      if (prev.state === 'sent' && prev.detail && prev.detail.result) return prev.detail.result;
      const found = await a.lookup(j.id, iteration);
      if (found) { store.outboxSet(prev.id, 'sent', { result: found, reconciled: true }); event(j, 'reconciled', { iteration, participant: participantId }); return found; }
      throw new NovaError('blocked', `I'm not sure whether ${participantId} got step ${iteration} before the interruption. Check it, then resume.`, { uncertain: true });
    }
    store.outboxSet(outId, 'sending', null);
    event(j, 'handoff', { iteration, to: participantId, role: env.destinationRole, chars: text.length });
    setState(j, 'waiting_on_assistant', `waiting on ${participantId} (${env.destinationRole})`);
    let res;
    try { res = await a.send(env, { signal, workspace: j.contract.workspace }); }
    catch (e) { store.outboxSet(outId, ['cancelled', 'timeout'].includes(e.category) || e.ambiguous ? 'unknown' : 'failed', { error: e.message }); throw e; }
    // a turn that's still running or stuck isn't a result
    if (res.status === 'running') { store.outboxSet(outId, 'unknown', { note: 'still running' }); throw new NovaError('blocked', `${participantId} is still working; I'll check again before sending anything else.`, { pause: true }); }
    store.outboxSet(outId, 'sent', { result: res, attachments: (env.attachments || []).map(a => ({ name: a.name, sha256: a.sha256, bytes: a.bytes, included: a.content != null })) });
    if (env.attachments && env.attachments.length) event(j, 'attachments.delivered', { iteration, to: participantId, files: env.attachments.map(a => ({ name: a.name, sha256: a.sha256.slice(0, 16), included: a.content != null })) });
    if (signal && signal.aborted) throw new NovaError('cancelled', 'Stopped.');   // it arrived, but the job was paused or cancelled meanwhile
    if (res.usage) { j.usage.tokens += (res.usage.input || 0) + (res.usage.output || 0); if (res.usage.costUsd) j.usage.spendUsd += res.usage.costUsd; }
    if (res.status === 'limit') throw new NovaError('blocked', `${participantId} hit a usage limit. The job is paused until it resets.`, { pause: true, limit: true });
    if (res.status === 'needs_approval') throw new NovaError('blocked', `${participantId} is waiting for an approval only you can give.`, { needsUser: true });
    if (res.status === 'failed') throw new NovaError('failed', `${participantId} reported an error: ${String(res.output).slice(0, 300)}`);
    return res;
  }

  // a reply that is a question rather than work done
  const questionOf = (res) => {
    if (!res) return null;
    if (res.status === 'question') return String(res.output || '').trim() || 'a question';
    const o = String(res.output || '').trim();
    const m = o.match(/^QUESTION:\s*([\s\S]+)/i);
    if (m) return m[1].trim();
    const pj = (() => { try { return JSON.parse((o.match(/\{[\s\S]*\}/) || ['null'])[0]); } catch { return null; } })();
    return pj && typeof pj.question === 'string' ? pj.question : null;
  };
  // the compact context a planner (or a fresh session) gets: exact constraints, what's done, what's open, what's next
  function summarize(j, review) {
    const done = (j.plan.steps || []).slice(-6).map(s => `- ${s.iteration}: ${s.task.slice(0, 160)}`);
    const ctx = {
      goal: j.goal, criteria: j.contract.criteria.slice(), constraints: j.contract.constraints.slice(),
      done: done, open: review ? `${review.verdict}${review.corrections ? ': ' + String(review.corrections).slice(0, 600) : ''}` : null,
      checks: review && review.check ? (review.check.passed ? 'passing' : 'failing') + ` on revision ${review.check.revision}` : 'not run yet',
      next: review ? 'address the open items' : 'first step',
    };
    j.context = ctx;
    return [`Goal: ${ctx.goal}`, `Done when (exact): ${ctx.criteria.join('; ') || '(see files/tests)'}`, ctx.constraints.length ? `Constraints (exact): ${ctx.constraints.join('; ')}` : '', done.length ? `Steps so far:\n${done.join('\n')}` : 'This is the first step.', ctx.open ? `Last review: ${ctx.open}` : '', `Latest checks: ${ctx.checks}`].filter(Boolean).join('\n');
  }
  // the deliverables themselves go with the evidence (text files up to 20 KB are included verbatim)
  function attachmentsOf(j, check) {
    return (check.files || []).filter(f => !f.missing).slice(0, 10).map((f) => {
      let content = null;
      try { const b = fs.readFileSync(path.join(j.contract.workspace, f.name)); if (b.length <= 20000 && !b.includes(0)) content = b.toString('utf8'); } catch {}
      return { name: f.name, sha256: f.sha256, bytes: f.size, content };
    });
  }
  const roleOf = (j, role) => (j.contract.participants.find(p => p.role === role) || {}).id;
  const parseJson = (s) => { try { return JSON.parse((String(s).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch { return null; } };

  // ------------------------------------------------------------------ the loop
  async function run(jobId, { signal } = {}) {
    const j = store.job(jobId);
    if (!j) throw new NovaError('not_found', 'No such job.');
    if (!['queued', 'paused', 'running', 'waiting_on_assistant', 'verifying'].includes(j.state)) throw new NovaError('invalid', `Job is ${j.state}.`);
    if (!store.acquire('job:' + j.id, owner, 120000)) throw new NovaError('blocked', 'Another Nova process is running this job.');
    if (j.contract.workspace && !store.acquire('workspace:' + path.resolve(j.contract.workspace), j.id, 8 * 3600e3)) { store.release('job:' + j.id, owner); throw new NovaError('blocked', 'Another job is changing that project folder.'); }
    const ac = new AbortController();
    if (signal) signal.addEventListener('abort', () => ac.abort(), { once: true });
    const ctl = { ac, finishStep: false };
    running.set(j.id, ctl);
    if (!j.usage.started) {
      j.usage.started = now();
      // where the project started, so you can see (and undo by hand) exactly what the job changed
      j.usage.startRev = await gitHead(j.contract.workspace);
    }
    setState(j, 'running', 'starting the next cycle');
    let review = j.checkpoint && j.checkpoint.review || null;
    let lastFingerprint = j.checkpoint && j.checkpoint.fingerprint || null;
    try {
      for (;;) {
        // ---- budgets and controls, between every step
        const stop = overBudget(j);
        if (stop) return finish(j, stop.state, stop.reason);
        if (ac.signal.aborted) return j;
        const iteration = `i${j.usage.cycles + 1}`;
        // 1. planner: the next bounded task (or "done", which is checked, not trusted)
        const plan = await step(j, iteration + '-plan', roleOf(j, 'planner'), {
          objective: j.goal, destinationRole: 'planner',
          context: summarize(j, review),
          constraints: [...j.contract.constraints, `Work only inside the project folder.`, `Done when: ${j.contract.criteria.join('; ')}`],
          expectedOutput: 'JSON: {"task": "<one concrete, bounded implementation task>"} or {"done": true, "reason": "..."}',
          evidence: review && review.check ? review.check.files.map(f => ({ name: f.name, sha256: f.sha256, summary: f.missing ? 'missing' : `${f.size} bytes` })) : [],
        }, ac.signal);
        const p = parseJson(plan.output) || {};
        if (p.done) {
          const check = await verify(j, ac.signal);
          event(j, 'checked', check);
          if (check.passed && criteriaMet(j, check)) return finish(j, 'completed', 'The planner said it was done and Nova\'s own checks pass.', check);
          review = { verdict: 'not done', corrections: `You said it's done, but Nova's checks disagree: ${check.missing.length ? 'missing ' + check.missing.join(', ') + '. ' : ''}${check.tests && !check.tests.passed ? 'Tests fail:\n' + check.tests.output.slice(-800) : ''}`, check };
          j.usage.cycles++; checkpoint(j, { review, fingerprint: lastFingerprint }); continue;
        }
        if (!p.task) { review = { verdict: 'unclear', corrections: 'Reply with the JSON format asked for.' }; j.usage.cycles++; checkpoint(j, { review }); continue; }
        j.plan = { version: j.plan.version + 1, steps: [...j.plan.steps.slice(-19), { iteration, task: String(p.task).slice(0, 2000) }] };
        // 2. implementer: one bounded task, sent once
        if (ctl.finishStep) return pause(j, 'Finished the current safe step, as you asked.');
        let impl = await step(j, iteration + '-impl', roleOf(j, 'implementer'), {
          objective: String(p.task), destinationRole: 'implementer', context: `Overall goal: ${j.goal}`,
          constraints: [...j.contract.constraints, 'Work only inside the project folder.', 'Report what you changed and how you tested it.', 'If a routine technical choice is unclear, pick a reversible default and say which.'],
          expectedOutput: 'What you changed, files touched, and test results.',
        }, ac.signal);
        // a routine technical question: answer it from your contract with a reversible default (recorded), at most twice per step.
        // Anything that needs YOU (approval, credentials, money, scope) blocks instead.
        for (let n = 1, q = questionOf(impl); q && n <= 2; n++, q = questionOf(impl)) {
          if (/\b(approv|permission|password|credential|api key|token|pay|purchase|billing|account|deploy|publish|delete|scope|should i (also|expand))/i.test(q)) {
            return finish(j, 'blocked', `${roleOf(j, 'implementer')} asked something only you can decide: "${q.slice(0, 200)}"`);
          }
          const answer = `Use the simplest reversible option that satisfies: ${j.contract.criteria.join('; ') || 'the stated goal'}.${j.contract.constraints.length ? ' Constraints: ' + j.contract.constraints.join('; ') + '.' : ''} Note the assumption in your report.`;
          event(j, 'assumption', { iteration, question: q.slice(0, 300), answer });
          impl = await step(j, `${iteration}-impl-a${n}`, roleOf(j, 'implementer'), {
            objective: String(p.task), destinationRole: 'implementer', context: `You asked: ${q.slice(0, 1000)}\nAnswer from the job contract: ${answer}`,
            constraints: [...j.contract.constraints, 'Work only inside the project folder.'], expectedOutput: 'What you changed, files touched, and test results.',
          }, ac.signal);
        }
        if (questionOf(impl)) return finish(j, 'blocked', `${roleOf(j, 'implementer')} keeps asking questions instead of working; it needs you.`);
        // 3. Nova's own checks on the current revision (an assistant's claims aren't evidence)
        setState(j, 'verifying', 'checking the work');
        const check = await verify(j, ac.signal);
        event(j, 'checked', { revision: check.revision, missing: check.missing, tests: check.tests && { passed: check.tests.passed, code: check.tests.code } });
        // 4. reviewer: sees the evidence bundle
        const rv = await step(j, iteration + '-review', roleOf(j, 'reviewer'), {
          objective: `Review this step of: ${j.goal}`, destinationRole: 'reviewer',
          context: `Task: ${p.task}\nImplementer said:\n${String(impl.output).slice(0, 3000)}\nNova's checks (revision ${check.revision}): ${check.passed ? 'PASS' : 'FAIL'}${check.missing.length ? '; missing ' + check.missing.join(', ') : ''}${check.tests ? '\nTest output:\n' + check.tests.output.slice(-1500) : ''}`,
          expectedOutput: 'JSON: {"verdict": "accept" | "reject", "corrections": "...", "critical": true|false}',
          evidence: check.files.map(f => ({ name: f.name, sha256: f.sha256, summary: f.missing ? 'missing' : `${f.size} bytes` })),
          attachments: attachmentsOf(j, check),
        }, ac.signal);
        const v = parseJson(rv.output) || { verdict: 'reject', corrections: 'The review wasn\'t in the expected format.' };
        review = { verdict: v.verdict, corrections: v.corrections || '', critical: v.critical !== false, check };
        j.usage.cycles++;
        // a reviewer that says opposite things about the same unchanged files isn't progress
        const seen = { ...((j.checkpoint && j.checkpoint.verdicts) || {}) };
        const prevV = seen[check.revision];
        seen[check.revision] = v.verdict;
        if (prevV && prevV !== v.verdict) {
          j.usage.contradictions = (j.usage.contradictions || 0) + 1;
          event(j, 'contradiction', { revision: check.revision, before: prevV, now: v.verdict });
          if (j.usage.contradictions >= 2) return finish(j, 'blocked', 'The reviewer keeps contradicting itself about the same unchanged files; it needs your call.', check);
          review.corrections = `Note: you said "${prevV}" about these exact files before and "${v.verdict}" now. Be consistent: name the specific defect, or accept. ` + review.corrections;
        }
        j.checkpoint = { ...(j.checkpoint || {}), verdicts: Object.fromEntries(Object.entries(seen).slice(-20)) };
        // 5. progress or stall?
        const fingerprint = sha256(check.revision + (check.tests ? check.tests.output.slice(-500) : ''));
        if (fingerprint === lastFingerprint) j.usage.noProgress++; else j.usage.noProgress = 0;
        lastFingerprint = fingerprint;
        event(j, 'reviewed', { iteration, verdict: v.verdict, critical: review.critical, passed: check.passed, noProgress: j.usage.noProgress });
        // accepted AND Nova's checks pass AND the criteria hold: done. Optional polish doesn't block.
        if (check.passed && criteriaMet(j, check) && (v.verdict === 'accept' || !review.critical)) return finish(j, 'completed', 'Reviewed, and Nova\'s own checks pass.', check);
        if (j.usage.noProgress >= j.budgets.noProgressCycles) {
          if (j.usage.replans < 1) { j.usage.replans++; j.usage.noProgress = 0; review.corrections = 'No measurable progress in the last cycles. Try a different approach. ' + review.corrections; event(j, 'replan', {}); }
          else return finish(j, 'blocked', `No progress after ${j.budgets.noProgressCycles} cycles, even after a new approach.`, check);
        }
        checkpoint(j, { review, fingerprint, iteration, verdicts: (j.checkpoint || {}).verdicts });
      }
    } catch (e) {
      if (e.category === 'cancelled' || ac.signal.aborted) { const cur = store.job(j.id); return cur && cur.state === 'cancelled' ? cur : pause(j, 'Paused.'); }
      if (e.pause) return pause(j, e.message);
      return finish(j, e.category === 'blocked' || e.category === 'unavailable' ? 'blocked' : 'failed', e.message);
    } finally {
      running.delete(j.id);
      store.release('job:' + j.id, owner);
      if (j.contract.workspace) store.release('workspace:' + path.resolve(j.contract.workspace), j.id);
    }
  }
  // a handoff with bounded retries for failures that are safe to retry
  async function step(j, iteration, participantId, env, signal) {
    env = { jobId: j.id, iteration, sender: 'nova', destination: participantId, unresolved: [], ...env };
    let tries = 0;
    for (;;) {
      try { return await handoff(j, iteration + (tries ? `-r${tries}` : ''), participantId, env, signal); }
      catch (e) {
        if (e.category !== 'failed' || tries >= j.budgets.maxRetries) throw e;
        tries++; event(j, 'retry', { iteration, participant: participantId, tries, error: e.message });
        await sleep(Math.min(30000, 1000 * 2 ** tries), signal);
      }
    }
  }
  function criteriaMet(j, check) { return !check.missing.length && (!j.contract.testCommand || (check.tests && check.tests.passed)); }
  function overBudget(j) {
    if (now() > j.contract.deadline) return { state: 'paused', reason: 'Reached the deadline.' };
    if (j.usage.started && now() - j.usage.started > j.budgets.maxHours * 3600e3) return { state: 'paused', reason: `Ran for the ${j.budgets.maxHours}-hour limit.` };
    if (j.usage.cycles >= j.budgets.maxCycles) return { state: 'paused', reason: `Used all ${j.budgets.maxCycles} cycles.` };
    if (j.budgets.maxSpendUsd != null && j.usage.spendUsd >= j.budgets.maxSpendUsd) return { state: 'paused', reason: `Reached the $${j.budgets.maxSpendUsd} spend limit.` };
    return null;
  }

  // ------------------------------------------------------------------ state, controls, recovery
  function save(j) { j.updated = now(); store.putJob(j); emit(j); }
  function event(j, kind, data) { store.addEvent(j.id, kind, data); log && log.event('job.' + kind, { job: j.id, ...(data && typeof data === 'object' && !Array.isArray(data) ? { keys: Object.keys(data).slice(0, 6) } : {}) }); }
  function setState(j, state, next) { j.state = state; j.nextAction = next || j.nextAction; save(j); }
  function checkpoint(j, data) { j.checkpoint = { ...data, at: now() }; save(j); }
  function finish(j, state, reason, check) {
    j.state = state; j.stopReason = reason; j.nextAction = state === 'completed' ? 'done' : 'needs you';
    if (check) j.checkpoint = { ...(j.checkpoint || {}), finalCheck: check };
    save(j); event(j, 'finished', { state, reason });
    if (state === 'completed' || state === 'failed' || state === 'cancelled') permissions.endScope('job', j.id, state);
    return j;
  }
  function pause(j, reason) { const cur = store.job(j.id) || j; cur.state = 'paused'; cur.stopReason = reason; cur.nextAction = 'paused: ' + reason; save(cur); event(cur, 'paused', { reason }); return cur; }

  function control(op, { task, ui } = {}) {
    const all = store.jobs();
    const say = (t) => { if (ui) ui.reply({ taskId: task && task.id, text: t }); return { said: t }; };
    if (op === 'pause_all') {
      let n = 0;
      for (const [jid, ctl] of running) { ctl.ac.abort(); n++; const j = store.job(jid); if (j) pause(j, 'You paused everything.'); }
      for (const j of all.filter(x => x.state === 'queued')) { pause(j, 'You paused everything.'); n++; }
      return say(n ? `Paused ${n} job${n > 1 ? 's' : ''}. Anything already sent to an assistant may still finish on their side.` : 'Nothing was running.');
    }
    if (op === 'finish_step') { for (const ctl of running.values()) ctl.finishStep = true; return say(running.size ? "I'll finish the current step, then pause." : 'Nothing is running.'); }
    if (op === 'resume_last') {
      const j = all.find(x => x.state === 'paused' || x.state === 'blocked');
      if (!j) return say('There\'s nothing paused to resume.');
      return resume(j.id).then(r => say(r.ok ? `Resuming "${j.goal}".` : r.reason));
    }
    return say('I can pause everything, resume the last job, or finish the current step.');
  }
  async function resume(jobId) {
    const j = store.job(jobId);
    if (!j) return { ok: false, reason: 'No such job.' };
    const ok = permissions.check({ category: 'relay', scope: { kind: 'job', id: j.id }, target: { kind: 'participant', value: (j.contract.participants[0] || {}).id }, effects: { objective: card(j).effects.objective } });
    if (!ok.ok) { j.state = 'paused'; j.nextAction = 'needs a fresh approval'; save(j); return { ok: false, reason: 'This job\'s approval has expired or was revoked, so it needs a fresh OK before it continues.', needsApproval: true }; }
    j.state = 'queued'; save(j);
    kick();   // starts now, or after the job ahead of it (priority order)
    return { ok: true, queued: !running.has(j.id) };
  }
  function cancel(jobId) {
    const ctl = running.get(jobId);
    const j = store.job(jobId);
    if (!j) return null;
    finish(j, 'cancelled', 'You cancelled it.');
    if (ctl) ctl.ac.abort();
    return { cancelled: true, note: ctl ? 'Nova sent nothing more. A request already with an assistant may still finish on their side.' : null };
  }
  // after a restart: only jobs with a valid restart-resume grant continue; others wait for you
  async function recover() {
    const out = [];
    for (const j of store.jobs(['running', 'waiting_on_assistant', 'verifying', 'queued'])) {
      const valid = permissions.check({ category: 'relay', scope: { kind: 'job', id: j.id }, target: { kind: 'participant', value: (j.contract.participants[0] || {}).id }, effects: { objective: card(j).effects.objective } }).ok;
      if (j.contract.restartResume && valid && now() < j.contract.deadline) { event(j, 'recovered', { auto: true }); j.state = 'queued'; save(j); out.push({ id: j.id, resumed: true }); }
      else { pause(j, valid ? 'Nova restarted; resume it when you\'re ready.' : 'Nova restarted and the job\'s approval is no longer valid.'); out.push({ id: j.id, resumed: false }); }
    }
    kick();
    return out;
  }

  function summary() {
    const all = store.jobs();
    return {
      running: all.filter(j => ['running', 'waiting_on_assistant', 'verifying', 'queued'].includes(j.state)),
      finished: all.filter(j => j.state === 'completed'),
      blocked: all.filter(j => ['blocked', 'paused', 'failed'].includes(j.state)),
      drafts: all.filter(j => j.state === 'draft'),
    };
  }
  function digest(sinceMs = 12 * 3600e3) {
    const recent = store.jobs().filter(j => now() - j.updated < sinceMs);
    const line = (j) => `• ${j.goal} — ${j.state}${j.stopReason ? ` (${j.stopReason})` : ''}; ${j.usage.cycles} cycle${j.usage.cycles === 1 ? '' : 's'}`;
    return ['Completed:', ...recent.filter(j => j.state === 'completed').map(line), 'Needs you:', ...recent.filter(j => ['blocked', 'paused', 'failed'].includes(j.state)).map(line), 'Still going:', ...recent.filter(j => ['running', 'queued', 'waiting_on_assistant', 'verifying'].includes(j.state)).map(line)].join('\n');
  }

  // "coordinate ChatGPT and Claude on this project": a draft job card for you to finish and approve
  async function draftFromRequest(task, r, { ui, reply }) {
    const want = [];
    if (/chatgpt|gpt|openai/i.test(r.text)) want.push(participants['openai-api'] ? 'openai-api' : null);
    if (/claude/i.test(r.text)) want.push(participants['claude-cli'] ? 'claude-cli' : participants['anthropic-api'] ? 'anthropic-api' : null);
    const roles = [];
    const list = want.filter(Boolean);
    if (list.length) { roles.push({ id: list[0], role: 'planner' }, { id: list[list.length - 1], role: 'implementer' }, { id: list[0], role: 'reviewer' }); }
    const j = draft(r.text, { participants: roles });
    ui.openPanel('jobs', { jobId: j.id });
    const unavailable = Object.entries(participants).filter(([, a]) => !a.available().ok).map(([k, a]) => `${k}: ${a.available().reason}`);
    return reply(task, `I drafted a job card in the Tasks panel. Pick the project folder and what "done" means, then approve it once and I'll run it. Note: I can't post into your existing ChatGPT or Claude chats; I use the API or the Claude command instead.${unavailable.length ? '\nNot ready yet: ' + unavailable.join('; ') : ''}`);
  }

  function gitHead(dir) {
    return new Promise((res) => { if (!dir || !fs.existsSync(path.join(dir, '.git'))) return res(null); execImpl('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeout: 5000, windowsHide: true }, (e, out) => res(e ? null : String(out).trim())); });
  }
  // read-only: what changed in the project since the job started (git projects)
  function diff(jobId) {
    const j = store.job(jobId);
    if (!j || !j.contract.workspace) return Promise.resolve({ available: false, reason: 'No project folder.' });
    if (!fs.existsSync(path.join(j.contract.workspace, '.git'))) return Promise.resolve({ available: false, reason: 'The project folder isn\'t a git repository, so I can only show which deliverables changed (see the job\'s checks).' });
    const base = j.usage.startRev;
    return new Promise((res) => execImpl('git', ['-C', j.contract.workspace, 'diff', '--stat', ...(base ? [base] : [])], { timeout: 10000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (e, out) => {
      execImpl('git', ['-C', j.contract.workspace, 'status', '--porcelain'], { timeout: 10000, windowsHide: true }, (e2, st) => res({ available: true, since: base, stat: e ? '' : String(out).slice(-6000), untracked: e2 ? [] : String(st).split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3)).slice(0, 50), undo: base ? `To undo by hand: git -C "${j.contract.workspace}" checkout ${base.slice(0, 12)} -- .  (review first; new files aren't removed)` : null }));
    }));
  }
  // the queue: approved jobs start in priority order, a few at a time (default one)
  const RANK = { high: 0, normal: 1, low: 2 };
  const limit = () => (typeof maxConcurrent === 'function' ? maxConcurrent() : maxConcurrent);
  function kick() {
    const max = limit();
    if (running.size >= max) return [];
    const next = store.jobs(['queued']).filter(j => !running.has(j.id)).sort((a, b) => (RANK[a.priority || 'normal'] - RANK[b.priority || 'normal']) || a.created - b.created);
    const started = [];
    for (const j of next.slice(0, max - running.size)) {
      started.push(j.id);
      run(j.id).catch(e => log && log.event('job.run_error', { job: j.id, message: e.message })).finally(() => setTimeout(kick, 0));
    }
    return started;
  }
  // pause one job (others keep going)
  function pauseJob(jobId) {
    const ctl = running.get(jobId), j = store.job(jobId);
    if (!j) return { ok: false, reason: 'No such job.' };
    if (['completed', 'cancelled', 'failed', 'draft'].includes(j.state)) return { ok: false, reason: `It's ${j.state}.` };
    if (ctl) ctl.ac.abort();
    pause(j, 'You paused it.');
    return { ok: true };
  }
  function setPriority(jobId, p) {
    if (!RANK.hasOwnProperty(p)) throw new NovaError('invalid', 'Priority is high, normal or low.');
    const j = store.job(jobId); if (!j) throw new NovaError('not_found', 'No such job.');
    j.priority = p; save(j); event(j, 'priority', { priority: p }); return j;
  }
  function setNotes(jobId, notes) { const j = store.job(jobId); if (!j) throw new NovaError('not_found', 'No such job.'); j.notes = String(notes).slice(0, 4000); save(j); return j; }
  function search(q) { const t = String(q || '').toLowerCase().trim(); return store.jobs().filter(j => !t || [j.goal, j.notes, j.stopReason, j.nextAction].some(x => String(x || '').toLowerCase().includes(t))); }

  return {
    kick, setPriority, setNotes, search, diff, pauseJob,
    draft, card, approve, validateContract, inScope, run, resume, cancel, control, recover, summary, digest, verify, draftFromRequest,
    job: (id) => store.job(id), events: (id) => store.events(id), list: () => store.jobs(),
    update(jobId, patch) {
      const j = store.job(jobId);
      if (!j || j.state !== 'draft') throw new NovaError('invalid', 'Only a draft can be edited; approved jobs keep their contract.');
      if (patch.goal) j.goal = String(patch.goal).slice(0, 400);
      Object.assign(j.contract, patch.contract || {});
      Object.assign(j.budgets, patch.budgets || {});
      j.version++; save(j); return j;
    },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    running: () => [...running.keys()],
  };
}

module.exports = { createJobs, JOB_STATES, DEFAULT_BUDGETS, OUT_OF_SCOPE, lowPriority };
