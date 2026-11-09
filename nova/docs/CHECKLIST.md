# Implementation checklist

✅ done and tested · 🟡 partly done (what's missing is named) · ⛔ blocked by something outside this build (code and setup path exist) · ❌ not built

## A. Pipeline and safety core
- ✅ One pipeline for typed and spoken input (`core/pipeline.js`), with request and task IDs, cancellation and typed tool schemas
- ✅ Task states: understanding, awaiting_permission, executing, verifying, completed, cancelled, failed, blocked. `listening`/`transcribing` are shown by the status pill only, not stored as task states.
- ✅ Corrections, dedupe of final transcripts, partial transcripts never acted on, clarification instead of guessing
- ✅ Permissions outside the model: task/job scoped, exact targets and effects, expiry, revoke on Stop, never-categories
- ✅ Tool declarations with validation, timeout, retry only when safe, postcondition verification, honest "unverified"
- ✅ Durable store (SQLite), structured redacted logs, diagnostics panel with export

## B. Input and the bubble
- ✅ Typed input: bubble menu box, Tasks panel box
- ⛔ Microphone: the existing offline wake word and push-to-talk now feed the core. Not run here (no audio device or model). Utterance IDs from the voice service aren't passed yet, so dedupe relies on the service sending final text only.
- ✅ Stop: bubble button, Ctrl+Alt+X, tray, spoken "stop". Measured 1.1 ms median round trip.
- ✅ Bubble: what she heard (editable on approval cards), replies, Retry on errors, Allow once / Cancel, choices, history (≡). It doesn't take focus except when you type.
- ✅ Status pill above her head (Thinking, Working, Needs your OK, Listening)
- 🟡 TTS: no voice by request. The speech output path from before is untouched and the bubble works without it. There's no new TTS interface module beyond the existing voice service.

## C. Character
- ✅ Approved hologram idle (your MP4), background keyed to alpha with the art untouched: default look "Nova (hologram)". No halo, no mouth movement, not flipped.
- ✅ Older looks still in tray > Skin

## D. Screen understanding
- ✅ Consent (once, or always, revocable), targeted window, Nova hidden from captures, UIA text first, then screenshot → vision/OCR, screen text treated as data. Fixture tests only.
- ⛔ Live on Windows: needs `npm run check-windows` on your PC

## E. Computer control
- ✅ App launch with window verification; window move, arrange and focus with monitor verification; type (refuses password fields); press a button by name
- ✅ Pauses on your input, focus change or lock; releases keys on Stop; serialized input lease
- ⛔ Live on Windows: not run (helper never executed here)

## F. Discord
- ✅ Confirmed targets only, duplicate names asked, "open X on Discord", honest "can't join as you", bot posts with exact-text approval, nonce dedupe and timeout reconcile. Mock adapter tests.
- ⛔ Bot posting live: needs your own bot token (not created tonight, by instruction)
- ❌ Voice calls (needs a voice bot and TTS)

## G. Long-running jobs and coordination
- ✅ Durable jobs, job card with one approval, contract validation, outbox before send, leases, budgets, no-progress with one replan, Nova's own checks decide "done", pause, resume, cancel, finish-step, restart recovery, digest
- ✅ Jobs tab: draft editing, approve, controls, events, coordination demo (completed live in the app)
- 🟡 Claude Code CLI adapter: present and probed, but not run against a real project tonight (it would be a paid live loop without a grant)
- ⛔ API participants: need keys
- ❌ Existing ChatGPT/Claude chats: not possible without scraping, so refused

## H. Research
- ✅ Keyless sources, evidence records, community or official kinds, conflicts, gaps, Markdown reports, cited answers

## I. Games
- ✅ Graduated capabilities, prohibited-automation policy, local fixture played to 5/5 from real observations (Chromium and Nova's own window), recovery after a fall, focus-loss/takeover/Stop release, routines with key filtering and stop condition
- ✅ Roblox: official link only, refuses play and exploits
- 🟡 Routine recording: engine and tests only, no record button in the app
- 🟡 Stalled-perception and unexpected-menu handling: code paths exist but aren't exercised

## J. Dashboard and everyday
- ✅ Tasks panel: approval inbox, requests, active permissions (revocable), conversation, jobs, memory (delete), settings (keys, brain order, screen consent, quiet hours, Discord, Roblox), What works, Diagnostics
- ✅ Quiet hours: she sits still and doesn't pop up on her own
- ✅ Presets: "New job from a preset…" in the Jobs tab (`core/presets.json`, copy in `docs/jobs/presets.json`)
- ✅ Scheduling: "Resume at HH:MM, once or daily" on paused/blocked jobs. Each due time fires at most once, even after a restart. Missed times are skipped. A schedule never grants permission.
- ✅ Resource monitoring: Nova's CPU and memory per process in Diagnostics

## Known defects
- Under the Linux test harness the app doesn't exit on quit. The pre-brain version (6112ee0) does the same there, so it predates tonight. Not checked on Windows.
- A task that finishes within milliseconds of Stop shows "completed" (it really did complete).
