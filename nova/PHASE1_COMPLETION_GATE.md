# Phase 1 completion gate

**Brief:** `docs/phase2/PHASE1_PROMPT_REV2.txt`, the overnight brain build, REVISION 2. That's the revision actually received; REVISION 3 was never received, so its extra items are carried into Phase 2 as that prompt instructs.
**Checkpoint:** the commit that adds this file on `zinx-desktop-helper` (its message starts "Phase 1 completion gate"). The rollback point from before Phase 1 is `6112ee0`.
**Automated suite at the gate:** `npm run test:core` → **97 passed, 0 failed** (11 files). The older `npm test` suites also pass; their one `✗` line predates this work.

## Gate result: PASSED, with external blockers recorded

Every requirement that can be built and run here has been built and exercised. Every remaining item is blocked only by something this cloud environment doesn't have: Windows, a microphone, API keys, a Discord bot, or open internet. The brief explicitly allows that case: *"If this environment cannot run Windows UI tests, provide a runnable test harness and record those tests as NOT RUN, with exact reasons"* and *"A dependency-dependent feature may be marked blocked only after its surrounding code, validation, tests, and configuration path are implemented."* For each blocked item the surrounding code, tests and configuration path exist, plus a way to run it on your PC (below). No item is FAILED and no item is NOT_IMPLEMENTED.

Fixable defects found during the gate audit and fixed before passing:
- Quit hang: a `will-quit` handler threw "Object has been destroyed", which opens Electron's error dialog and keeps the process alive. This also affects Windows. Fixed, and quit now completes in about 300 ms.
- No microphone selection, meter, mute, test recording, or unplug handling: built.
- Shortcuts were fixed and conflicts were silent: they're now configurable, and conflicts are reported.
- Bubble text couldn't be copied, links weren't clickable, and long answers overflowed: fixed.
- The "find the X button" highlight was dropped: she now points at it.
- No speech-output interface for the future voice: built (off).
- The game controller had no stalled-perception or unexpected-menu stop, and routines had no recording in the app: built and tested.
- Jobs lacked priority, answers to routine questions, a context summary, notes/search, a diff view, and a guard against editing Nova herself: built, with a schema v2 migration.
- Discord had no disconnect or permission-denied handling: built and tested.
- No app names (aliases): built.
- Quiet hours had no effect, and the screen-consent "always" option was hidden: fixed earlier.

## Requirement map

Statuses:
- **VERIFIED** (IMPLEMENTED_AND_VERIFIED): real behavior was exercised.
- **MOCK** (IMPLEMENTED_MOCK_TESTED): the code was tested with fakes, not the real integration.
- **BLOCKED** (BLOCKED_EXTERNAL): needs something this environment doesn't have.

"Real app" means Nova running under Electron 45 on a Linux virtual display, driven by Playwright.

| # | Requirement (brief section) | Status | Evidence |
|---|---|---|---|
| 1 | Character preserved: approved hologram idle, no halo, no nose dot, no fake mouth (§2) | VERIFIED | Real app: video time advances, screens `docs/screenshots/01*`. Art untouched (`art/idle` keyed from the MP4). |
| 2 | One pipeline: request/task IDs, states, cancellation, typed schemas (§3) | VERIFIED | Real app typed requests; `pipeline.test.js`, `foundation.test.js` |
| 3 | Typed input fallback, same pipeline (§4) | VERIFIED | Real app (bubble box, panel box) |
| 4 | Speech recognition, wake word, final-only execution, dedupe, corrections (§4) | VERIFIED (recognizer) / BLOCKED (live mic) | `scripts/speech-check.js`: real VAD + recognizer + wake parser + pipeline on synthetic spoken commands, 6/6 (`docs/speech-check-results.json`). Live microphone: no audio device here. |
| 5 | Mic selection, meter, status, mute, test recording, unplug/permission errors (§4) | MOCK (code) / BLOCKED | Voice menu > Microphone; mic status in What works and Diagnostics. Needs a real audio device. |
| 6 | Push-to-talk default, configurable shortcuts, conflict handling (§4) | VERIFIED (indicator timing) / MOCK (conflicts) | Listening indicator median 10 ms (`docs/measured-timings.json`). Conflicts are reported in Settings. A real conflicting app wasn't available here. |
| 7 | Stop button + global shortcut + spoken "stop", local and immediate (§4, §11) | VERIFIED | Real app: Stop round trip median 1.1 ms. Spoken "Nova, stop" through the recognizer (speech check). |
| 8 | Conversation context, "that/the other one", corrections, honest unavailable answers (§5) | VERIFIED (local) / BLOCKED (model) | Real app answers and honest no-brain reply; tests for corrections and window references. Model answers need an API key or the local brain. |
| 9 | Inspectable/deletable memory (§5) | VERIFIED | Real app Memory tab (forget, forget conversation) |
| 10 | Bubble: follows her, status, heard text, buttons, history, copy, links, no focus stealing, no fake mouth (§6) | VERIFIED | Real app screens 02/03; drag/hit-test at 100% and 150% |
| 11 | Bubble on other monitors / negative coordinates / display changes (§6) | MOCK / BLOCKED | Tray > Monitor moves her overlay to any display (bounds may be negative). Real multi-monitor not available here. |
| 12 | TTS output interface for later (§6) | VERIFIED (interface) | `core/speech-out.js`, 4 tests. Off by default, so no fake speech. |
| 13 | Screen context: consent, indicator, UIA, targeted screenshot, OCR/vision, never Nova's own overlay, data-not-instructions (§7) | MOCK / BLOCKED | `screen.test.js` (4). Needs Windows: `npm run check-windows` |
| 14 | Computer control: task-scoped approval, expiry, revoke on Stop, change invalidates, narrow tools, pause on takeover/focus/lock, release keys (§8) | MOCK / BLOCKED | `foundation`, `desktop` tests; the game controller does real takeover, focus and Stop in Chromium. Windows input needs your PC. |
| 15 | Reliable execution: tool declarations, verify postconditions, serialized input, honest partial results (§9) | VERIFIED (executor) / BLOCKED (Windows tools) | `foundation.test.js`; the real game controller verifies via the HUD |
| 16 | Discord Afterparty: grounded targets, identity, honest call limits, approval, nonce dedupe, mock overnight (§10) | MOCK / BLOCKED (bot) | `discord.test.js` (11, including the real bot adapter with a fake network: 403 and dropped connection). A live bot needs your token; creating one tonight was prohibited. |
| 17 | Performance targets measured, not invented (§11) | VERIFIED | `docs/measured-timings.json` (Linux virtual display) |
| 18 | Resilience: offline, provider errors, missing keys, app missing, restart, expired approvals (§11) | VERIFIED (fixture + real app) | Tests plus real-app missing-key behavior; quit fixed |
| 19 | Diagnostics: mic, recognition, providers, permissions, active task, last tool, latency, redacted log, export (§12) | VERIFIED | Real app Diagnostics tab (screen 09). Export uses a save dialog, not exercised headless. |
| 20 | Secrets in an OS-backed store, never logged (§12) | MOCK | DPAPI (`safeStorage`) on Windows. Redaction test, and a bot-token-never-logged test. |
| 21 | Durable jobs: contract, plan, budgets, states, checkpoints, history (§13) | VERIFIED | Real app: coordination demo with real SQLite, real files, the real test command run by Nova; `jobs.test.js` (20) |
| 22 | One job approval, scope checks, never new recipients/secrets/purchases (§13) | VERIFIED (fixture) | jobs tests 26/27/33 |
| 23 | Live assistant routes (Claude Code CLI, APIs) (§14) | BLOCKED | No API keys. Running Claude Code against a real project would be the unapproved paid live loop the brief forbids. Adapters, probe and tests exist. |
| 24 | Existing ChatGPT/Claude chats (§14) | BLOCKED (not possible) | No supported interface; scraping is refused (stated in the app) |
| 25 | Outbox before send, leases, reconcile, no duplicate handoffs, "done" verified (§14) | VERIFIED (fixture) | jobs tests 29/30 |
| 26 | Loop control: budgets, no-progress replan then block, routine questions from contract, stop when done (§15) | VERIFIED (fixture) | jobs tests (budget, no-progress, question answered/blocked) |
| 27 | Pause, resume, cancel, finish-step, priority; restart-resume only with grant (§15) | VERIFIED (fixture + real app) | jobs tests; real-app panel controls |
| 28 | Compact context summary with exact constraints (§15) | VERIFIED (fixture) | "the planner gets a compact summary" test |
| 29 | Research with evidence records, kinds, conflicts, gaps (§16) | MOCK / BLOCKED (live) | `research.test.js`. This environment's proxy blocks Wikipedia/DuckDuckGo (403). Works on an open network. |
| 30 | Games: graduated capabilities, policy, Roblox official links only (§17) | VERIFIED (policy) / MOCK (Roblox link) | `games.test.js` |
| 31 | Local fixture played to a verified objective from real observations (§17) | VERIFIED | Chromium and the real app: 5/5 coins, HUD "won" |
| 32 | Focus loss, takeover, Stop, stalled perception, unexpected menu release all inputs (§17) | VERIFIED | Browser tests (Chromium) |
| 33 | Scoped routine recording, review, stop condition, bounded test (§17) | VERIFIED | Real app: recorded in Nova's own game window (typed keys dropped), replayed with approval, stopped at its limit; tests |
| 34 | Roblox Studio test place (§17) | BLOCKED | No owned Studio test place available. BLACK SUN is off-limits by instruction. |
| 35 | Tasks panel: approvals inbox, queue/priority, controls, artifacts, blocked reasons, digest, notes/search, diff (§18) | VERIFIED | Real app panel (screens 06/07) |
| 36 | "What are you doing / what have you finished / pause everything / resume" (§18) | VERIFIED (fixture) | router and pipeline tests |
| 37 | Presets, capability page, quiet hours, scheduling (timezone, missed runs, no duplicates) (§18) | VERIFIED | `schedule.test.js`, real-app panel |
| 38 | Resource monitoring; locks for desktop, workspace and mic (§18) | VERIFIED | Diagnostics resource use. Desktop and workspace leases are tested. The mic has a single owner by design (only the voice service listens). |
| 39 | No self-editing of Nova by jobs (§18) | VERIFIED (fixture) | "jobs can't target Nova's own running folder" |
| 40 | Deliverables: checklist, architecture, config, install, tests, report, morning report, coordinator schema, fixtures, presets, guide (§22) | VERIFIED | `docs/`, `NOVA_MORNING_REPORT.md` |

## Resumable blocker record (to run on your Windows PC)

1. `npm run check-windows`: the Windows helper (windows, UI Automation, screenshot, OCR). It only looks; never clicks or types.
2. Her Voice menu > Microphone > pick your mic > Test it: the real mic, meter and transcription.
3. Ctrl+Alt+V then say "what time is it": live push-to-talk.
4. "open notepad", then "put that window on my other monitor": real launch and move with verification.
5. "what's on my screen?": consent card, then real UIA/OCR.
6. Optional: an API key (Settings) for model answers; your own Discord bot token for bot posts; Claude Code installed for real assistant jobs, with a job card you approve.

Mark each result in `docs/TEST_REPORT.md`, or paste the output into a chat.
