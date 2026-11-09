// "Why isn't this working?" for your projects:
//   1. which project (the one you're working on, or one you name; never guessed)
//   2. evidence: run the project's own check command (from its profile) and keep the
//      error lines; nothing else on the PC is read
//   3. explanation: a model explains if one is set up (evidence and inference kept
//      apart); otherwise she shows what the check says
//   4. memory of what was tried for this exact error, so the same fix isn't repeated
//   5. a fix only through an approved job (scoped to the project folder), and "fixed"
//      only after the original check passes again
'use strict';
const { execFile } = require('child_process');
const { NovaError, sha256 } = require('./util');

function errorLines(out) {
  const lines = String(out).split(/\r?\n/);
  const hits = lines.map((l, i) => ({ l, i })).filter(x => /\b(error|failed|failing|exception|cannot|can't|not found|undefined|expected|assert|traceback|fatal|ENOENT|EACCES|TypeError|SyntaxError|ReferenceError)\b/i.test(x.l));
  const pick = new Set();
  for (const h of hits.slice(0, 12)) for (let k = Math.max(0, h.i - 1); k <= Math.min(lines.length - 1, h.i + 2); k++) pick.add(k);
  const out2 = [...pick].sort((a, b) => a - b).map(k => lines[k]).filter(Boolean);
  return (out2.length ? out2 : lines.filter(Boolean).slice(-15)).slice(0, 40).join('\n');
}
// the same failure, even if line numbers or timings change
const signature = (text) => sha256(String(text).replace(/\d+(\.\d+)?\s*(ms|s)\b/g, '').replace(/:\d+:\d+/g, '').replace(/\s+/g, ' ').trim()).slice(0, 16);

function createTroubleshoot({ store, projects, log, execImpl = execFile, jobs = null }) {
  const key = (pid, sig) => `trouble:${pid}:${sig}`;
  function runCheck(check, signal) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const child = execImpl(check.command[0], check.command.slice(1), { cwd: check.cwd, timeout: 120000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => resolve({ passed: !e, code: e ? (e.code || 1) : 0, output: (String(out) + String(err)).slice(-20000), ms: Date.now() - t0 }));
      try { require('os').setPriority(child.pid, require('os').constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
      if (signal) signal.addEventListener('abort', () => { try { child.kill(); } catch {} }, { once: true });
    });
  }
  function which(text) {
    const active = projects.active() && projects.get(projects.active());
    const named = projects.list().find(p => new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text) || p.aliases.some(a => new RegExp(`\\b${a}\\b`, 'i').test(text)));
    return named || active || null;
  }
  async function handle(task, r, { reply, choose, answer }) {
    const p = which(r.text);
    if (!p) return reply(task, 'Which project or app? Say "let\'s work on <project>" first, or name it. For a project I can run its check and read the errors; I won\'t go digging through your PC.');
    const check = (p.checks || [])[0];
    if (!check || !check.command.length) return reply(task, `${p.name} has no check command yet (Tasks panel > Projects > Check command, like "npm test"). With one, I can see the actual error instead of guessing.`);
    const res = await runCheck(check, task.ac && task.ac.signal);
    if (res.passed) return reply(task, `${p.name}'s check (\`${check.command.join(' ')}\`) passes right now, in ${(res.ms / 1000).toFixed(1)} s. What exactly isn't working? Tell me what you see, or the step that fails.`);
    const errs = errorLines(res.output), sig = signature(errs);
    const rec = (store.recall('trouble').find(x => x.key === key(p.id, sig)) || {}).value || { project: p.id, signature: sig, first: Date.now(), attempts: [], seen: 0 };
    rec.seen++; rec.last = Date.now(); rec.errors = errs.slice(0, 2000);
    store.remember(key(p.id, sig), 'trouble', rec);
    log && log.event('troubleshoot.checked', { project: p.id, passed: false, signature: sig, seen: rec.seen });
    const tried = rec.attempts.length ? `\nAlready tried for this exact error: ${rec.attempts.map(a => `${a.what} (${a.result})`).join('; ')}. I won't suggest those again.` : '';
    const header = `${p.name}: \`${check.command.join(' ')}\` fails (exit ${res.code}).\nWhat the check says (evidence):\n${errs}${tried}`;
    if (answer) {
      await answer(task, `My project "${p.name}" fails its check. Explain the most likely cause from the error output, separating what the output shows from your inference, and suggest one fix that hasn't been tried. Already tried: ${rec.attempts.map(a => a.what).join('; ') || 'nothing'}. Project constraints: ${p.constraints.join('; ') || 'none'}.`, { data: errs, explain: true });
    }
    return reply(task, header + `\nSay "fix it" to have an approved job try (scoped to the project folder, verified by this same check), or "check again" after you change something.`, { trouble: { project: p.id, signature: sig } });
  }
  // after a change: rerun the same check, compare with the recorded failure
  async function recheck(task, { reply }) {
    const p = projects.active() && projects.get(projects.active());
    if (!p || !(p.checks || [])[0]) return reply(task, 'Which project? Say "let\'s work on <project>" first.');
    const check = p.checks[0];
    const res = await runCheck(check, task.ac && task.ac.signal);
    const open = store.recall('trouble').filter(x => x.value.project === p.id && !x.value.fixed);
    if (res.passed) {
      for (const o of open) { o.value.fixed = Date.now(); if (o.value.attempts.length) o.value.attempts[o.value.attempts.length - 1].result = 'worked'; store.remember(o.key, 'trouble', o.value); }
      return reply(task, `Fixed: \`${check.command.join(' ')}\` passes now (verified by rerunning it).`, { verified: true });
    }
    const sig = signature(errorLines(res.output));
    const same = open.find(o => o.value.signature === sig);
    if (same && same.value.attempts.length) { same.value.attempts[same.value.attempts.length - 1].result = 'didn\'t help'; store.remember(same.key, 'trouble', same.value); }
    return reply(task, same ? `Still failing with the same error. ${same.value.attempts.length ? 'The last change didn\'t help; I\'ve noted that.' : ''}` : `Still failing, but with a different error now:\n${errorLines(res.output)}`, { verified: false });
  }
  function noteAttempt(projectId, what) {
    const open = store.recall('trouble').filter(x => x.value.project === projectId && !x.value.fixed).sort((a, b) => b.value.last - a.value.last)[0];
    if (!open) return false;
    open.value.attempts.push({ what: String(what).slice(0, 200), at: Date.now(), result: 'pending' });
    store.remember(open.key, 'trouble', open.value);
    return true;
  }
  // "fix it": a draft job whose test command is this check (you approve the card)
  function draftFix(task) {
    const p = projects.active() && projects.get(projects.active());
    const open = p && store.recall('trouble').filter(x => x.value.project === p.id && !x.value.fixed).sort((a, b) => b.value.last - a.value.last)[0];
    if (!p || !open || !jobs) return null;
    const check = p.checks[0];
    const j = jobs.draft(`Make \`${check.command.join(' ')}\` pass in ${p.name}`, { workspace: check.cwd || p.folders[0], testCommand: check.command, criteria: [`\`${check.command.join(' ')}\` passes`, ...p.constraints.map(c => `Keep: ${c}`)], constraints: ['Don\'t delete data, weaken security, disable or skip tests, or change unrelated settings to make it pass.', ...p.constraints] });
    noteAttempt(p.id, `job ${j.id}`);
    return j;
  }
  return { handle, recheck, noteAttempt, draftFix, errorLines, signature };
}

module.exports = { createTroubleshoot, errorLines, signature };
