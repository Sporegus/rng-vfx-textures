// Phase 2 modules plugged into the core benchmark (same as in the app, with a fake PC).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
module.exports = (h, deps) => {
  const { createProjects } = require('../core/projects');
  const { createReferences } = require('../core/references');
  const { createWorkflows } = require('../core/workflows');
  const { createReminders } = require('../core/reminders');
  const { createNotifications } = require('../core/notifications');
  const { createTroubleshoot } = require('../core/troubleshoot');
  const projects = createProjects({ store: h.store, log: h.log, launch: { app: async () => ({ ok: true }), url: async () => {}, path: async () => {} } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bench-'));
  let st = { performance: 'balanced' };
  const workflows = createWorkflows({ store: h.store, log: h.log, settings: () => st, saveSettings: (p) => { st = { ...st, ...p }; } });
  workflows.ensurePresets();
  return {
    projects, workflows,
    references: createReferences({ store: h.store, dir, log: h.log, projects, clipboard: { image: () => null, text: () => '' } }),
    reminders: createReminders({ store: h.store, log: h.log }),
    notifications: createNotifications({ store: h.store, log: h.log }),
    troubleshoot: createTroubleshoot({ store: h.store, projects, log: h.log, jobs: deps.jobs }),
    settings: () => st,
  };
};
