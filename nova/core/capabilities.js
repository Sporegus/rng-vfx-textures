// The capability registry: what each ability really does, what it needs, its inputs
// and outputs, its status right now (ready / unavailable / experimental / blocked),
// where it was last tested and how it behaves on errors and Stop.
// Status is computed from the live setup (keys, Windows helper, mic, voice), never assumed.
// "lastTested" is the most recent real evidence for it (see bench/ and docs/), not a promise.
'use strict';

const DEFS = [
  { id: 'typed', name: 'Typed requests and the bubble', does: 'Takes what you type and answers in her bubble', inputs: 'text', outputs: 'bubble text, approval cards', needs: [], errors: 'Errors show in plain words with Retry; Stop cancels.', tested: 'live app (Linux, virtual display), 2026-11-09' },
  { id: 'voice-in', name: 'Microphone (push-to-talk, wake word)', does: 'Push-to-talk or "Nova, …"; final transcripts only', inputs: 'microphone audio', outputs: 'text into the same pipeline', needs: ['an audio device', 'the offline speech model (downloads once)'], errors: 'Unplug/permission/model problems are said plainly; nothing runs from partial guesses.', tested: 'real recognizer on synthetic speech 6/6; live mic NOT RUN (no audio device here)' },
  { id: 'voice-out', name: 'Her voice (text to speech)', does: 'Speaks replies, with lip-sync events', inputs: 'reply text', outputs: 'audio', needs: ['a voice provider'], errors: 'Off by default; Stop and new replies interrupt it.', tested: 'interface tests only (no voice by design)' },
  { id: 'apps', name: 'Open apps (verified)', does: 'Opens an installed app and checks its window appeared', inputs: 'app name', outputs: 'verified / unverified result', tool: 'app.open', needs: ['Windows'], errors: 'Not installed → suggestions; window not seen → "couldn\'t confirm".', tested: 'fixture tests; Windows NOT RUN here' },
  { id: 'windows', name: 'Move and arrange windows', does: 'Moves the window you mean to another monitor or arranges it, then checks', inputs: 'which window, where', outputs: 'final monitor/bounds', tool: 'window.move', needs: ['Windows'], errors: 'Reports when it can\'t confirm the final position.', tested: 'fixture tests; Windows NOT RUN here' },
  { id: 'screen', name: 'Read your screen', does: 'UI text of the window in front, then a screenshot read by OCR or a vision model', inputs: 'your question', outputs: 'description, selected text, found buttons', needs: ['Windows', 'your consent (asked once or each time)'], errors: 'Never reads password fields or hidden content; screen text can\'t give her orders.', tested: 'fixture tests; Windows NOT RUN here' },
  { id: 'control', name: 'Type and press buttons for you', does: 'Types text and presses buttons by name, with one approval per task', inputs: 'what to type/press', outputs: 'verified result', tool: 'control.type', needs: ['Windows', 'an approval card'], errors: 'Pauses when you move the mouse or type; Stop releases every key.', tested: 'fixture tests; Windows NOT RUN here' },
  { id: 'answers', name: 'Answers from a language model', does: 'Answers questions, writes and translates, with reasoning modes', inputs: 'question', outputs: 'streamed answer', needs: ['an Anthropic or OpenAI key, or the free on-device brain'], errors: 'Timeouts and missing keys fail cleanly; no fake answers.', tested: 'mock-provider tests; live providers NOT RUN (no keys)' },
  { id: 'research', name: 'Web research with sources', does: 'Searches keyless sources, keeps evidence records, flags conflicts', inputs: 'question', outputs: 'cited answer, saved report', needs: ['internet'], errors: 'Says when search failed; never hides gaps.', tested: 'fixture-web tests; live search blocked by this build environment\'s network' },
  { id: 'documents', name: 'Documents and tables', does: 'Writes CSV, Excel, Word, PDF, Markdown, SVG charts and checks each file', inputs: 'an answer or a request', outputs: 'a validated file in Documents\\Nova', needs: ['a language model for new content'], errors: 'A file that fails its check is deleted and reported.', tested: 'format tests + openpyxl/python-docx/pypdf cross-checks, 2026-11-09' },
  { id: 'files', name: 'Files: duplicates, moves, Recycle Bin', does: 'Finds duplicates by content, previews moves, undo, Recycle Bin only', inputs: 'folder', outputs: 'previews and per-file results', needs: ['approved folders'], errors: 'Locked files and partial results are listed per file.', tested: 'temp-folder tests, 2026-11-09' },
  { id: 'projects', name: 'Projects and references', does: 'Opens a project\'s listed tools/files, keeps its notes and references separate', inputs: 'project name', outputs: 'status card, opened items', needs: ['a project profile you create'], errors: 'Unknown projects are never guessed.', tested: 'tests, 2026-11-09' },
  { id: 'routines', name: 'Routines and modes', does: 'Gaming / Study / Development / Wind down and your own, with preview and undo', inputs: 'routine name', outputs: 'per-step results', needs: [], errors: 'Partial results are reported; only reversible settings are restored.', tested: 'tests, 2026-11-09' },
  { id: 'reminders', name: 'Reminders', does: 'Durable reminders (restart/sleep safe, daylight-saving aware)', inputs: 'when + what', outputs: 'bubble reminder', needs: [], errors: 'Late ones are marked late; each fires once.', tested: 'tests incl. America/New_York DST, 2026-11-09' },
  { id: 'notifications', name: 'What did I miss', does: 'Digest of Nova\'s own events; important first', inputs: '—', outputs: 'digest', needs: ['Windows notifications: not available in this build'], errors: 'Unavailable sources are named; never replies.', tested: 'tests, 2026-11-09' },
  { id: 'troubleshoot', name: 'Troubleshooting', does: 'Runs a project\'s check, shows the real error, verifies fixes', inputs: 'project', outputs: 'evidence, explanation, verified result', needs: ['a project with a check command'], errors: 'Remembers tried fixes; "fixed" only after the check passes.', tested: 'tests, 2026-11-09' },
  { id: 'discord-open', name: 'Discord: open a channel', does: 'Opens a saved place in your Discord app', inputs: 'place name', outputs: 'opened', needs: ['the place added in Settings'], errors: 'Unknown names are never guessed.', tested: 'mock tests' },
  { id: 'discord-post', name: 'Discord: post as the Nova bot', does: 'Posts exact, approved text as YOUR bot (never as you)', inputs: 'channel + text', outputs: 'sent once (nonce)', needs: ['your own bot token'], errors: 'Timeouts are checked by nonce, never resent.', tested: 'mock + real adapter with fake network' },
  { id: 'discord-voice', name: 'Discord: talk in a voice call', does: '—', needs: ['a voice bot + text to speech'], errors: '—', tested: 'not built', fixed: { status: 'blocked', why: 'Needs a bot with voice and text-to-speech; Nova has no voice yet.' } },
  { id: 'jobs-cli', name: 'Jobs: Claude Code CLI', does: 'Runs Claude Code in a job\'s project folder as implementer', inputs: 'job card', outputs: 'changes checked by Nova', needs: ['Claude Code installed', 'a job approval'], errors: 'Unconfirmable handoffs block instead of resending.', tested: 'adapter + coordinator tests; not run against a real project (paid loop needs your approval)' },
  { id: 'jobs-chats', name: 'Jobs: your existing ChatGPT/Claude chats', does: '—', needs: [], errors: '—', tested: 'n/a', fixed: { status: 'blocked', why: 'Neither app lets another program post into a chat; Nova won\'t scrape sessions.' } },
  { id: 'game-fixture', name: 'Games: Nova\'s test game', does: 'Plays to a verified goal from screen observations; routines', inputs: 'goal', outputs: 'progress from the game\'s own counter', needs: ['one game approval'], errors: 'Focus loss, takeover, menus and Stop release every key.', tested: 'Chromium + live app 5/5 coins, 2026-11-09' },
  { id: 'game-coach', name: 'Games: research and coaching', does: 'Looks up mechanics and explains; works without automated play', inputs: 'question', outputs: 'cited explanation', needs: ['internet (and a model for explanations)'], errors: 'Community sources are labelled.', tested: 'fixture tests' },
  { id: 'roblox', name: 'Games: Roblox', does: 'Opens an experience through roblox.com; advice only', inputs: 'experience link or saved name', outputs: 'opened page', needs: [], errors: 'Refuses automation, exploits and anti-cheat evasion.', tested: 'tests (link only); nothing Roblox-specific live-tested', fixed: { status: 'experimental', why: 'Launch + advice only; Roblox\'s rules don\'t allow automated play.' } },
  { id: 'phone', name: 'Phone dashboard', does: 'Tasks, approvals, Stop and jobs from your phone\'s browser', inputs: 'paired phone', outputs: 'same task system', needs: ['pairing from this PC', 'same Wi-Fi'], errors: 'Expired/revoked devices are refused; stale data is labelled.', tested: 'see docs/phase2 (browser simulation; no physical iPhone test here)' },
];

function createCapabilities(probe) {
  // probe(id) -> { ok, why, experimental } from the live setup
  function list() {
    return DEFS.map(d => {
      if (d.fixed) return { ...d, status: d.fixed.status, why: d.fixed.why };
      const p = (probe && probe(d.id)) || { ok: true };
      return { ...d, status: p.ok ? (p.experimental ? 'experimental' : 'ready') : 'unavailable', why: p.ok ? (p.why || '') : (p.why || `Needs ${d.needs.join(', ')}`) };
    });
  }
  return { list, get: (id) => list().find(c => c.id === id) };
}

module.exports = { createCapabilities, DEFS };
