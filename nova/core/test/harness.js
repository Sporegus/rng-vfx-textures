// A test harness: Nova's real core (store, tasks, permissions, tools, pipeline)
// with a recording fake bubble, a fake page, and fake apps. FIXTURE ONLY: it
// proves the core's logic, not that Windows, a microphone or an API works.
'use strict';
const { openStore } = require('../store');
const { createLog } = require('../log');
const { createTasks } = require('../tasks');
const { createPermissions } = require('../permissions');
const { createTools } = require('../tools');
const { createPipeline } = require('../pipeline');
const llmMod = require('../llm');
const brain = require('../../brain/brain');
const { sleep } = require('../util');

function harness({ installed = ['Discord', 'Spotify', 'Notepad', 'Google Chrome'], approveWith = () => ({ allow: true }), chooseWith = () => null, llm = null, page } = {}) {
  const store = openStore(':memory:');
  const log = createLog();
  const tasks = createTasks({ store, log });
  const permissions = createPermissions({ store, log });
  const tools = createTools({ permissions, log, store, locks: store });
  const events = [];
  const running = new Set();   // fake processes
  const ui = {
    transcript: (e) => events.push({ type: 'transcript', ...e }),
    status: (e) => events.push({ type: 'status', ...e }),
    reply: (e) => events.push({ type: 'reply', ...e }),
    approve: async (card) => { events.push({ type: 'approve', ...card }); return approveWith(card); },
    choose: async (q) => { events.push({ type: 'choose', ...q }); return chooseWith(q); },
    answer: (wid, value) => { events.push({ type: 'answered', id: wid, value }); },
    openPanel: (tab) => events.push({ type: 'panel', tab }),
  };
  const pageRuns = [];
  const fakePage = page || { run: async (step, signal) => { pageRuns.push(step); return { ok: true }; } };
  tools.register({
    name: 'app.open', purpose: 'Open an installed app', category: 'launch', effect: 'local', timeoutMs: 2000,
    args: { type: 'object', properties: { name: { type: 'string', maxLength: 80 } }, required: ['name'], additionalProperties: false },
    run: async ({ name }) => {
      const hit = installed.find(a => a.toLowerCase() === name.toLowerCase() || a.toLowerCase().startsWith(name.toLowerCase()));
      if (!hit) return { notFound: true, suggestions: installed.filter(a => a[0].toLowerCase() === name[0].toLowerCase()) };
      running.add(hit); return { opened: hit };
    },
    verify: async (a, r) => r.notFound ? { ok: true, evidence: 'not found' } : { ok: running.has(r.opened), evidence: running.has(r.opened) ? `process ${r.opened} running` : 'no process' },
  });
  const pipeline = createPipeline({ tasks, permissions, tools, log, llm: llm ? llmMod.chooser({ mock: llm }, ['mock']) : llmMod.chooser({}), brain, ui, page: fakePage });
  const replies = () => events.filter(e => e.type === 'reply' && !e.partial).map(e => e.text);
  return { store, log, tasks, permissions, tools, pipeline, events, replies, running, pageRuns, ui, sleep };
}

module.exports = { harness };
