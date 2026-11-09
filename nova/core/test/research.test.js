// Research with a FIXTURE web (no network): evidence records, kinds, conflicts.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createResearch } = require('../research');

function fakeWeb(pages) {
  const hits = [];
  const fetchImpl = async (url) => {
    hits.push(url);
    for (const [k, v] of Object.entries(pages)) if (url.includes(k)) return { ok: true, status: 200, json: async () => v, text: async () => v };
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  return { fetchImpl, hits };
}
const now = () => new Date('2026-11-09T12:00:00Z');

test('evidence keeps source, retrieval time, excerpt and kind; conflicts are flagged (test 35)', async () => {
  const web = fakeWeb({
    'api.duckduckgo.com': { Heading: 'Parry', AbstractText: 'A parry window lasts 8 frames in the current patch.', AbstractURL: 'https://example-wiki.fandom.com/wiki/Parry', AbstractSource: 'Fandom' },
    'list=search': { query: { search: [{ title: 'Parry (fencing)' }] } },
    'prop=extracts': { query: { pages: { 1: { extract: 'In fencing, a parry is a defensive action. Classic training uses a 12 frames reaction drill.' } } } },
    'docs.example.com': '<html><title>Combat docs</title><body><p>The parry window is 6 frames long for all weapons in version 2.1 of the game combat system.</p></body></html>',
  });
  const r = createResearch({ fetchImpl: web.fetchImpl, now, minGapMs: 0 });
  const rep = await r.investigate('how long is the parry window', { urls: ['https://docs.example.com/combat'] });
  assert.ok(rep.evidence.length >= 3);
  for (const e of rep.evidence) { assert.ok(e.url && e.retrieved && e.excerpt && e.kind); }
  assert.equal(rep.evidence.find(e => /fandom/.test(e.url)).kind, 'community');
  assert.match(rep.evidence.find(e => /fandom/.test(e.url)).uncertainty, /community/);
  assert.ok(rep.conflicts.some(c => c.unit === 'frame' && c.values.includes(8) && c.values.includes(6)));
  const file = r.saveReport(rep, fs.mkdtempSync(path.join(os.tmpdir(), 'nova-res-')));
  const md = fs.readFileSync(file, 'utf8');
  assert.match(md, /Sources disagree/);
  assert.match(md, /retrieved 2026-11-09/);
});

test('when live search is unavailable, the gap is reported, not hidden', async () => {
  const r = createResearch({ fetchImpl: async () => { throw new Error('offline'); }, now, minGapMs: 0 });
  const rep = await r.investigate('anything');
  assert.equal(rep.evidence.length, 0);
  assert.match(rep.gaps[0], /Live search failed/);
});

test('pages are cached and queries are bounded', async () => {
  const web = fakeWeb({ 'api.duckduckgo.com': { AbstractText: 'x'.repeat(70), AbstractURL: 'https://a.org/x' }, 'list=search': { query: { search: [] } } });
  const r = createResearch({ fetchImpl: web.fetchImpl, now, minGapMs: 0 });
  await r.investigate('same question');
  const n = web.hits.length;
  await r.investigate('same question');
  assert.equal(web.hits.length, n, 'second run served from cache');
  assert.ok(n <= 4);
});
