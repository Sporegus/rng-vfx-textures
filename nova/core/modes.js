// Two independent controls (Phase 2 §13). Neither changes permissions.
//
// Reasoning mode: how much effort an answer gets. It maps to things the configured
// provider really supports: the instructions, the output budget (max tokens), whether
// sources are gathered first, and whether a bounded second "check your answer" pass runs.
// It doesn't switch to secret better models or claim to make the model smarter.
//   auto      pick per request (short/direct -> quick; why/how/plan/debug -> think; research/in-depth -> thorough)
//   quick     concise, 1 call, small budget
//   think     step-by-step, 1 call, larger budget
//   thorough  sources first (if research is available) + answer + one review pass, largest budget
//
// Performance profile: how hard Nova works in the background.
//   gaming     no new background jobs start (running ones finish their step and wait); no wandering
//              or effects; job helpers run at low CPU priority
//   balanced   one background job at a time (default)
//   overnight  up to two background jobs at once, within each job's own limits
'use strict';

const REASONING = {
  quick: { label: 'Quick', maxTokens: 500, research: false, review: false, style: 'Answer briefly: 1-3 sentences, plain words. No preamble.' },
  think: { label: 'Think', maxTokens: 1500, research: false, review: false, style: 'Think it through step by step, then give a clear, well-organized answer. Keep it as short as the question allows.' },
  thorough: { label: 'Thorough', maxTokens: 3000, research: true, review: true, style: 'Be thorough: consider alternatives and edge cases, separate what the sources say from your inference, and say what is uncertain.' },
};
const PERFORMANCE = {
  gaming: { label: 'Gaming', jobsConcurrent: 0, wander: false, effects: false, lowPriorityHelpers: true },
  balanced: { label: 'Balanced', jobsConcurrent: 1, wander: true, effects: true, lowPriorityHelpers: true },
  overnight: { label: 'Overnight', jobsConcurrent: 2, wander: true, effects: true, lowPriorityHelpers: true },
};

// what effort a request deserves when the mode is Auto
function classify(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(research|in depth|in-depth|thoroughly|deep dive|compare .* (and|vs|versus)|pros and cons|sources?|cite|literature|comprehensive)\b/.test(t)) return 'thorough';
  if (/\b(why|how (do|does|can|should|would)|explain|plan|design|debug|troubleshoot|figure out|analy[sz]e|review|step by step|what'?s the best way|help me (understand|decide))\b/.test(t) || t.split(/\s+/).length > 25) return 'think';
  return 'quick';
}
function pickReasoning(setting, text) { const s = String(setting || 'auto').toLowerCase(); return REASONING[s] ? s : classify(text); }
// an answer that says it isn't sure, from a quick pass, earns one deeper try (Auto only)
const UNSURE = /\b(i'?m not (sure|certain)|i don'?t know|it depends|hard to say|can'?t tell|not enough information)\b/i;
function shouldEscalate(setting, chosen, answer) { return String(setting || 'auto') === 'auto' && chosen === 'quick' && UNSURE.test(String(answer || '')); }
function performance(setting) { return PERFORMANCE[String(setting || 'balanced').toLowerCase()] || PERFORMANCE.balanced; }

module.exports = { REASONING, PERFORMANCE, classify, pickReasoning, shouldEscalate, performance };
