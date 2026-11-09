// Research: find what's missing, search sources that don't need an account,
// read the relevant pages, and keep each finding as an evidence record:
//   { claim, value, title, url, retrieved, excerpt, source, kind, uncertainty }
// kind: 'official' (vendor docs), 'reference' (encyclopedias), 'community' (guides, forums).
// Sources that disagree are flagged, not hidden. Everything fetched is data:
// it can inform an answer but can't change permissions or the task.
// Bounded: a few queries, cached pages, a minimum gap between requests to a site.
'use strict';
const fs = require('fs');
const path = require('path');
const { NovaError, sleep } = require('./util');

const OFFICIAL = /(^|\.)(microsoft\.com|learn\.microsoft\.com|support\.discord\.com|discord\.com|create\.roblox\.com|devforum\.roblox\.com|roblox\.com|developer\.mozilla\.org|nodejs\.org|electronjs\.org|python\.org|docs\.github\.com|apple\.com|google\.com|support\.google\.com|anthropic\.com|openai\.com|steampowered\.com|minecraft\.net)$/i;
const COMMUNITY = /(^|\.)(reddit\.com|fandom\.com|wiki\.gg|stackexchange\.com|stackoverflow\.com|steamcommunity\.com|gamefaqs\.gamespot\.com|youtube\.com)$/i;
const kindOf = (url) => { try { const h = new URL(url).hostname; return OFFICIAL.test(h) ? 'official' : COMMUNITY.test(h) ? 'community' : /wikipedia\.org$/.test(h) ? 'reference' : 'web'; } catch { return 'web'; } };

// page HTML -> readable text (enough for evidence, not a full reader mode)
function textOf(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
// the passages most related to the question
function bestPassages(text, question, n = 3) {
  const terms = String(question).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const paras = text.split('\n').map(p => p.trim()).filter(p => p.length > 60);
  return paras.map(p => ({ p, s: terms.reduce((a, t) => a + (p.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.p.slice(0, 600));
}
// numbers next to the same unit that differ between sources
function conflicts(evidence) {
  const seen = {};
  const out = [];
  for (const e of evidence) {
    for (const m of String(e.excerpt).matchAll(/(\d[\d,.]*)\s*(seconds?|ms|frames?|percent|%|damage|hp|meters?|km|miles?|years?|dollars?|\$)/gi)) {
      const unit = m[2].toLowerCase().replace(/s$/, ''), val = parseFloat(m[1].replace(/,/g, ''));
      (seen[unit] = seen[unit] || []).push({ val, url: e.url });
    }
  }
  for (const [unit, vals] of Object.entries(seen)) {
    const urls = new Set(vals.map(v => v.url));
    const distinct = [...new Set(vals.map(v => v.val))];
    if (urls.size > 1 && distinct.length > 1) out.push({ unit, values: distinct.slice(0, 5), sources: [...urls] });
  }
  return out;
}

function createResearch({ fetchImpl = fetch, log, now = () => new Date(), minGapMs = 1000, maxQueries = 3 } = {}) {
  const cache = new Map(), lastHit = new Map();
  async function get(url, signal, asJson) {
    const key = url;
    const c = cache.get(key);
    if (c && Date.now() - c.t < 10 * 60000) return c.v;
    const host = new URL(url).hostname;
    const wait = (lastHit.get(host) || 0) + minGapMs - Date.now();
    if (wait > 0) await sleep(wait, signal);
    lastHit.set(host, Date.now());
    const res = await fetchImpl(url, { signal, headers: { 'user-agent': 'NovaDesktopResearch/0.1 (personal assistant)', accept: asJson ? 'application/json' : 'text/html' } });
    if (!res.ok) throw new NovaError('failed', `${host} said ${res.status}`);
    const v = asJson ? await res.json() : await res.text();
    cache.set(key, { t: Date.now(), v });
    return v;
  }

  // Wikipedia: search, then the intro of the best pages
  async function wikipedia(q, signal) {
    const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(q)}`, signal, true);
    const hits = (s.query && s.query.search) || [];
    const out = [];
    for (const h of hits.slice(0, 2)) {
      const p = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(h.title)}`, signal, true);
      const page = Object.values((p.query && p.query.pages) || {})[0];
      if (page && page.extract) out.push(record({ title: h.title + ' (Wikipedia)', url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_')), excerpt: page.extract.slice(0, 900), source: 'wikipedia' }));
    }
    return out;
  }
  // DuckDuckGo's instant answers (official, keyless; often empty for niche topics)
  async function ddg(q, signal) {
    const r = await get(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(q)}`, signal, true);
    const out = [];
    if (r.AbstractText) out.push(record({ title: (r.Heading || q) + ` (${r.AbstractSource || 'DuckDuckGo'})`, url: r.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(q), excerpt: r.AbstractText.slice(0, 900), source: 'ddg' }));
    if (r.Answer) out.push(record({ title: 'Instant answer (DuckDuckGo)', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(q), excerpt: String(r.Answer).slice(0, 400), source: 'ddg' }));
    return out;
  }
  // a page you named, or a link from the results
  async function page(url, question, signal) {
    if (!/^https:\/\//i.test(url)) throw new NovaError('invalid', 'Only https pages.');
    const html = await get(url, signal, false);
    const t = textOf(html);
    const title = (String(html).match(/<title[^>]*>([^<]{1,160})/i) || [])[1] || url;
    return bestPassages(t, question).map(p => record({ title: title.trim(), url, excerpt: p, source: 'page' }));
  }
  function record({ title, url, excerpt, source, claim = null, value = null }) {
    return { claim, value, title, url, retrieved: now().toISOString(), excerpt, source, kind: kindOf(url), uncertainty: kindOf(url) === 'community' ? 'community source: may be outdated or wrong for the current version' : null };
  }

  async function investigate(question, { signal, urls = [] } = {}) {
    const evidence = [], errors = [];
    const q = String(question).replace(/^(what|how|who|why|when|where)\s+(is|are|was|were|does|do|did)\s+/i, '').replace(/\?$/, '').slice(0, 200);
    const tries = [() => ddg(q, signal), () => wikipedia(q, signal), ...urls.slice(0, 3).map(u => () => page(u, question, signal))].slice(0, maxQueries + urls.length);
    for (const t of tries) {
      if (signal && signal.aborted) throw new NovaError('cancelled', 'Stopped.');
      try { evidence.push(...await t()); } catch (e) { if (e.category === 'cancelled') throw e; errors.push(e.message); }
    }
    // keep distinct sources
    const uniq = [];
    for (const e of evidence) if (!uniq.some(u => u.url === e.url && u.excerpt === e.excerpt)) uniq.push(e);
    const report = { question, evidence: uniq.slice(0, 8), conflicts: conflicts(uniq), gaps: [], errors, at: now().toISOString() };
    if (!uniq.length) report.gaps.push(errors.length ? 'Live search failed: ' + errors.join('; ') : 'No source covered this.');
    if (uniq.length && uniq.every(e => e.kind === 'community')) report.gaps.push('Only community sources: check against official information.');
    log && log.event('research', { sources: uniq.length, conflicts: report.conflicts.length, errors: errors.length });
    return report;
  }

  function saveReport(report, dir) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `research-${report.at.replace(/[:.]/g, '-')}.md`);
    const lines = [`# ${report.question}`, '', `Researched ${report.at}.`, '', '## Sources', ''];
    report.evidence.forEach((e, i) => lines.push(`${i + 1}. [${e.title}](${e.url}) — ${e.kind}, retrieved ${e.retrieved}${e.uncertainty ? ` (${e.uncertainty})` : ''}`, `   > ${e.excerpt.replace(/\n/g, ' ').slice(0, 400)}`));
    if (report.conflicts.length) lines.push('', '## Sources disagree', '', ...report.conflicts.map(c => `- ${c.unit}: ${c.values.join(' vs ')} (${c.sources.join(', ')})`));
    if (report.gaps.length) lines.push('', '## Gaps', '', ...report.gaps.map(g => '- ' + g));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return file;
  }

  return { investigate, saveReport, page, kindOf, textOf };
}

module.exports = { createResearch, conflicts, textOf, bestPassages, kindOf };
