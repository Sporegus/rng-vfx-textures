# Phase 2 requirements matrix

**Statuses:**
- **VERIFIED**: real behavior was exercised (real app, real browser, real recognizer, real files).
- **MOCK**: the code was tested with fakes; the real integration wasn't.
- **BLOCKED**: a named external dependency is missing here.
- **PARTIAL**: some of it is done, and the missing part is named.
- **NOT DONE**: work remains.

**Automated:** `npm run test:core` → **151 passed, 0 failed** (19 files), which includes every Phase 1 test. "Real app" means Nova (Electron 45) under a Linux virtual display, driven by Playwright.

## Sections of the brief

| § | Requirement | Status | Where / evidence |
|---|---|---|---|
| 1 | Phase 1 gate before Phase 2 | VERIFIED | `PHASE1_COMPLETION_GATE.md` (passed, with external blockers recorded), checkpoint commit `25e5036` |
| 2 | Capability registry: does, needs, inputs/outputs, live status, last tested, error behavior | VERIFIED | `core/capabilities.js`; Tasks panel > What works (real app) |
| 2 | Says "not integrated" instead of inventing results | VERIFIED | Honest replies for no model, no writer, no Windows, Roblox, existing chats (tests) |
| 2 | Character/idle/transparency preserved | VERIFIED | Same art, size and position; drag and click-through at 100%/150% (real app) |
| 3 | Reuse, one coherent app (one pipeline, store, permissions, mic service, dashboard) | VERIFIED | Everything plugs into `core/pipeline.js` + `core/store.js`; the phone uses the same task/job store |
| 4 | Routing: direct path, model for language, deeper route for complex, escalation, same permissions | VERIFIED (logic) / BLOCKED (live models) | `core/modes.js`, router; bench 37/37; escalation test with a mock provider; no keys here |
| 4 | Reusable versioned workflows: preconditions, verified steps, provenance, edit/revert/delete, no inferred authorization | VERIFIED | `core/workflows.js`, Routines tab; tests |
| 4 | Context: only relevant notes of the active project; exact constraints; fresh screen; preferences separate from guesses | VERIFIED (fixture) | Project context test (no cross-project leak); screen is read fresh each time |
| 4 | Deterministic tools for calculation and files | VERIFIED | Math via her own brain; file hashes; document validation |
| 5 | Profile, then budgets from measurements | VERIFIED | `PERFORMANCE_BASELINE_AND_RESULTS.md` |
| 5 | Immediate feedback, local Stop, streaming, bounded queues, cancellation | VERIFIED | Stop median 0.8 ms; status pill; 8-request cap; streaming in `answer()` (mock) |
| 5 | Caches bounded; no perpetual capture; no worker/tab/log proliferation | VERIFIED | Caps everywhere; process count flat across the soak |
| 5 | On-demand load/unload of large components with an idle grace period | PARTIAL | The chat model loads only when turned on; **no idle unload**; the voice service starts with the app (about 108 MB) |
| 5 | Backoff under pressure with clear status; locks for input/audio/workspace | VERIFIED (logic) | `core/resources.js` tests; desktop/workspace leases; mic has a single owner |
| 5 | Runtime-sized animation buffers; visual quality measured | VERIFIED | Renderer 650 → 163 MB; visual check at 1x/1.5x |
| 5 | Benchmark suite of 30+ requests, cold/warm, p95, accuracy, soak, before/after | VERIFIED | `bench/`; results in `bench/results/` |
| 6 | References/corrections ("wait", "actually", "cancel that", "the second option"), editable transcript | VERIFIED (fixture) | Router + pipeline tests; "Fix what I heard" on approval cards |
| 6 | Concise answers with expandable detail; status separate from chat | VERIFIED (logic) | Long answers show a short version with the full one in `detail`; status pill vs bubble |
| 6 | Background jobs don't mix permissions/context with chat | VERIFIED | Job grants are job-scoped; Stop keeps them; "wait" doesn't touch jobs |
| 6 | Don't respond to TV/Discord/TTS as you | PARTIAL | Wake word + push-to-talk only; Nova has no voice yet; loopback isn't captured (mic only). No speaker check (not identity) |
| 6 | Future voice interface: synthesis, playback, interruption, lip-sync events; not faked | VERIFIED (interface) | `core/speech-out.js` (off; 4 tests) |
| 7 | Project profiles: verified resolution, status, open only configured items, permissions separate, isolation | VERIFIED (fixture + real app) | `core/projects.js`; "let's work on black sun" in the real app |
| 7 | Reference inbox: explicit sources only, metadata, search, no drive indexing | VERIFIED (fixture) | `core/references.js`; clipboard/file only |
| 7 | Memory: inspect, correct, export, delete; provenance | VERIFIED (inspect/delete) / MOCK (export) | Memory tab inspect/delete/forget conversation; aliases and workflows keep provenance; "Export everything Nova remembers…" writes one JSON (save dialog not exercised headless) |
| 8 | Presets Gaming/Study/Development/Wind down; preview; reversible restore | VERIFIED | Tests + real-app preview card |
| 8 | Music → dance animation | NOT DONE | No music detection; art untouched as instructed |
| 8 | Notification triage from authorized sources; never replies | VERIFIED (Nova events) / BLOCKED (Windows notifications) | `core/notifications.js`; Windows notifications need a packaged app identity and user consent |
| 8 | Timers/reminders: timezone, DST, missed runs, duplicates, cancellation; calendars | VERIFIED (reminders) / NOT DONE (calendars) | `core/reminders.js` incl. an America/New_York DST test; no calendar adapter |
| 9 | Troubleshooting: evidence, research, inference marked, scoped fix, rerun check, no repeated fixes, nothing destructive | VERIFIED (fixture) | `core/troubleshoot.js` tests |
| 9 | Files: approved folders, previews, hash duplicates, conflicts, Recycle Bin, real undo, partial failure, space, locks | VERIFIED (fixture) | `core/files.js` tests |
| 9 | Content: drafting/translation (model), documents/PDF/tables/charts in real validated formats | VERIFIED (formats) / BLOCKED (model writing) | `core/content.js` + openpyxl/python-docx/pypdf cross-checks |
| 9 | Reading/summarizing your PDFs, Word files, spreadsheets, CSV, text | VERIFIED (reading) / BLOCKED (model summary) | `core/readers.js`: exact table totals/averages computed by Nova, formulas listed, scanned/encrypted PDFs reported; read a reportlab-made compressed PDF; "summarize <path>" / "the file I copied" |
| 9 | Image understanding / generation | PARTIAL / BLOCKED | Screen vision via a vision model when one is configured; no image-generation provider |
| 10 | Phone dashboard: state, instructions, pause/cancel/resume, approvals, artifacts, digest, connection state | VERIFIED (browser simulation) | Real app + emulated iPhone 13 (screens 12-14) |
| 10 | Pairing from the PC, short single-use code, revocable, expiry, server-side auth, CSRF/origin/replay, rate limits, dedupe, approval revision binding, no caching, audit, honest stale/offline, local Stop wins, no streaming | VERIFIED | `core/test/remote.test.js` (7, over real HTTPS) + e2e |
| 10 | Encrypted transport | VERIFIED | Self-signed ECDSA TLS made natively; checked by OpenSSL; fingerprint shown when pairing |
| 10 | Outside-home transport | PARTIAL | "Another address" mode binds to e.g. a Tailscale IP you set up; not tested here (no VPN) |
| 10 | Real iPhone test | BLOCKED | No physical device here; browser simulation is labelled as such |
| 11 | Coordinator: identity binding, no existing-chat assumption, streaming vs done, attachments delivered, contract validation, evidence before "done", exact constraints, checkpoints, reconcile, stall/contradiction detection, independent branches, stop when criteria pass | VERIFIED (fixture) / BLOCKED (live assistants) | `core/jobs.js` (25 tests); attachments with hashes; contradiction detection; safe resend only after a clear refusal |
| 11 | Phone controls the same job system | VERIFIED | Phone job actions call the same `jobs` |
| 12 | Games: launch official, research/coach, goals, routines, bounded control, stop on menus/spending | VERIFIED (fixture) / PARTIAL (real games) | Coaching without play (test); goals; shop menu stops play; Roblox link-only |
| 13 | Right-click: Talk, Reasoning, Performance, Tasks, Pause/Resume, Microphone, Settings, Hide, Quit; tray kept | VERIFIED (built) / PARTIAL (exercised) | Native menu built from IPC; the native popup wasn't clicked headless; the same actions are verified via tray/panel |
| 13 | Reasoning and performance modes, independent, mapped to real settings | VERIFIED | Tests: token budgets, escalation, job concurrency |
| 13 | Settings: appearance, voice, projects, memory, integrations, limits, devices, privacy, notifications, diagnostics | VERIFIED | Across panel tabs; bubble text size verified in the real app (normal and extra large, kept on screen) |
| 14 | Sequence P2-A … P2-H | VERIFIED | Commits `4a8d646` … this one |

## Phase 2 acceptance tests (§15)

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Simple → direct path, complex/uncertain → escalate | PASS | bench direct 12/12; modes/escalation tests |
| 2 | Faster routing doesn't bypass permissions/verification | PASS | Routing changes go through the same `pageStep`/tools; vague and low-confidence requests ask |
| 3 | Benchmarks: cold/warm, accuracy, memory, rendering | PASS | `PERFORMANCE_BASELINE_AND_RESULTS.md` |
| 4 | Repeated cycles don't grow memory/workers unbounded | PASS (menus/tasks) / NOT RUN (mic, screenshot cycles: no device/Windows) | soak rounds |
| 5 | Stop responsive under model delays and pressure | PASS | Stop while the model is thinking; Stop with 8 requests pending |
| 6 | Relevant context without mixing projects or stale screen facts | PASS | project context test |
| 7 | Corrections persist appropriately; one-time ≠ permanent | PASS | workflow/alias tests |
| 8 | References keep source and project | PASS | references test |
| 9 | Voice correction/interruption doesn't duplicate actions | PASS (fixture + real recognizer) | "wait" test; utterance IDs; speech check |
| 10 | Routine applies changes, restores only reversible ones | PASS | workflows test |
| 11 | Notification summaries from real authorized sources, no replies | PASS (Nova's own events + fixture source) | notifications test; Windows source unavailable |
| 12 | File previews, duplicates, collisions, undo, locked errors | PASS | files tests |
| 13 | Document/table produced and validated in its real format | PASS | content tests + Python cross-check |
| 14 | Troubleshooting verifies the fix against the original failure | PASS | troubleshoot tests |
| 15 | Right-click/tray/settings don't break animation, drag, transparency, focus | PASS (panel tabs, drag, look) / PARTIAL (native right-click popup not clicked) | real app |
| 16 | Reasoning and resource modes distinct and real | PASS | modes/resources tests |
| 17 | Pairing expires, single use, revocable | PASS | remote tests (real HTTPS) |
| 18 | Unauthenticated/wrong device can't read/approve/run | PASS | remote tests |
| 19 | Cross-site, replay, stale approval, reconnect duplicates rejected | PASS | remote tests |
| 20 | Remote Stop acknowledged; local revocation wins | PASS | remote tests + e2e |
| 21 | Mobile: small screens, offline, stale, host sleep/lock | PASS (320 px, offline, stale) / MOCK (lock: state flag only) | e2e screenshots |
| 22 | Browser simulation vs real device labelled | PASS | All phone results say "browser simulation" |
| 23 | Coordinator revision cycle with verified evidence and delivered attachments | PASS | jobs tests (attachments with hashes) |
| 24 | Crash/restart and missing acknowledgements: no duplicate side effects | PASS | jobs + remote dedupe tests |
| 25 | Limits and no-progress stop a stalled workflow, not unrelated work | PASS | independent-jobs test |
| 26 | Research cites sources, separates claims from inference | PASS (fixture web) | research tests; Thorough mode review prompt |
| 27 | Coaching works without autonomous play; fixture control reaches a goal | PASS | coaching test; fixture 5/5 |
| 28 | Focus loss/cancel/error release inputs and pause | PASS | game tests (Chromium) |
| 29 | Provider outage degrades without losing durable state | PASS | outage-then-resume test |
| 30 | Phase 1 regression suite still passes | PASS | all 151 |
