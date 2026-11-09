# Test report: overnight brain build

Run on 2026-11-09 in a Linux cloud container (no Windows, no microphone, no GPU, no API keys).

**Automated:** `npm run test:core` → **79 passed, 0 failed** (8 files). The existing suites (`npm test`: brain + voice) still pass; their one `✗` line ("passport photo" → wallpaper) predates this work and the suite allows it.
**Real app:** Nova (Electron 45) was launched under a virtual display and driven with Playwright. The screenshots in `docs/screenshots/` come from those runs.

What the words mean:
- **PASS (fixture)**: Nova's real code ran with a fake PC, app, assistant or Discord. It proves the logic, not the outside service.
- **PASS (browser)**: the real controller played the real fixture game in real Chromium.
- **PASS (live app)**: observed in the running Nova app (Linux, virtual display).
- **NOT RUN**: the code and a way to run it exist, but it couldn't run here, for the reason given.
- **PARTIAL / NOT BUILT**: said plainly.

| # | Matrix item | Result | Evidence |
|---|---|---|---|
| 1 | Typed and mic commands reach the same pipeline | PASS (fixture) + PASS (live app, typed) | `pipeline.test.js` "typed and voice commands go through the same pipeline". In the app, typed requests run through `core:input` (screens 02, 06). Mic path NOT RUN live: no microphone or speech model here. |
| 2 | Silence/noise don't trigger actions | PASS (fixture) | "silence and noise do nothing" |
| 3 | Partial/final ASR executes once | PASS (fixture) | "partial transcripts never act; a final one acts exactly once" |
| 4 | Prerecorded spoken command transcribed and routed | **NOT RUN** | Needs the offline speech model (downloads on first use on your PC) and an audio device. The routing half is covered by #1 and #3. Manual check in the morning checklist. |
| 5 | Misrecognized destination requires correction | PASS (fixture) | "an uncertain app name asks instead of guessing; the correction is used" |
| 6 | "Open Notepad" really launches/focuses | PASS (fixture) / **NOT RUN live** | Fixture: "open app is verified by finding its window". Live needs Windows; run `npm run check-windows`, then try it (checklist). |
| 7 | Not-installed app → helpful error | PASS (fixture) | "an app that is not installed gets a helpful answer" |
| 8 | "Open X — actually Y" cancels/replaces | PASS (fixture) | "open Discord, actually Spotify", "No, Spotify replaces a pending request" |
| 9 | Missing/denied/expired approval prevents injection | PASS (fixture) | `foundation.test.js` permissions tests; "typing needs a control grant" |
| 10 | Approval permits only intended operations | PASS (fixture) | "control needs a grant bound to that task" |
| 11 | Changed destination invalidates approval | PASS (fixture) | "changed message invalidates"; Discord "a changed message or channel is not covered" |
| 12 | Stop while model pending / tool waiting / multi-step | PASS (fixture) + PASS (live app) | "stop works while the model is thinking", "…while waiting on approval and during a multi-step page task". Live: 15 Stops, median 1.1 ms round trip (`docs/measured-timings.json`). |
| 13 | No queued input after cancel | PASS (fixture) + PASS (browser) | "cancel mid-run stops it and no queued input follows"; game "Stop mid-hold releases the key at once" (frame unchanged 200 ms later) |
| 14 | User input/focus change pauses automation | PASS (fixture) + PASS (browser) | "automation pauses when you type or the window changes"; game "your own input takes over". Live Windows input detection NOT RUN. |
| 15 | Screen understanding uses fresh context | PASS (fixture) | "screen access asks first… uses fresh window context" |
| 16 | Malicious screen text can't change policy | PASS (fixture) | "malicious screen text is only data"; "a model plan that tries something risky still needs your approval" |
| 17 | Multi-monitor/DPI bubble and clicks | **PARTIAL** | Moving a window to another monitor is verified in the fixture. At 150% scaling she draws at device pixels and grabbing her hits correctly (live app). The overlay covers the **primary** monitor only, as before. Real multi-monitor NOT RUN: one virtual display here. |
| 18 | Provider timeout/rate limit/missing key don't freeze | PASS (fixture) + PASS (live app) | "provider timeout / missing key do not freeze". Live with no key: an honest reply plus a search offer (screen 03 shows the flow). |
| 19 | Discord ambiguity, missing bot, joining as you | PASS (mock adapter) | 5 tests in `discord.test.js` |
| 20 | Discord timeout never duplicates | PASS (mock adapter) | "a send that times out is checked, not resent", "…recognized by its nonce" |
| 21 | Tool success with failed postcondition → unverified | PASS (fixture) | "tool executor: … verifies postcondition" |
| 22 | Restart never replays unapproved side effects | PASS (fixture) | `jobs.test.js` restart test; tasks are never re-run after restart |
| 23 | Idle, transparency, dragging, click-through still work | PASS (live app) | Her approved idle plays (video time advanced 1.00 s per 1 s) on the transparent overlay (screen 01). At 100% and 150% scaling: grabbing her body hits, a transparent corner doesn't (so the click passes through), and a drag-throw moved her about 575 px. A HiDPI hit-test bug was found and fixed tonight. The OS-level click forwarding wasn't exercised under the virtual display. |
| 24 | Audio/screenshot/token retention | PASS (fixture) + by design | Log redaction test. Screenshots stay in memory only and are never written to disk. The mic streams to the speech model and isn't recorded. Keys are DPAPI-encrypted, never in settings, logs or the page. |
| 25 | Full coordination cycle | PASS (fixture) + PASS (live app) | "a review rejection goes back as a correction, then the fix is verified". In the app, "Run the coordination demo" went reject → fix → Nova's checks pass → completed (screen 07). |
| 26 | In-scope relays under one job grant | PASS (fixture) | "one job approval; reviewed and checked work completes": no second prompt |
| 27 | Changed destination/project and out-of-scope prompts blocked before sending | PASS (fixture) | "an out-of-scope handoff is not sent" (secrets, other assistant, paths outside the project) |
| 28 | Streaming/active work isn't mistaken for done | PASS (fixture) | "an assistant that is still working is not treated as done" |
| 29 | Missing/stale artifacts prevent false success | PASS (fixture) | "'done' from an assistant is checked, not trusted" (revision hashes and test command) |
| 30 | Lost ack/crash → no duplicate handoff | PASS (fixture) | "a lost acknowledgement is reconciled, never resent"; "an interruption that can't be reconciled blocks" |
| 31 | Restart resumes only eligible jobs | PASS (fixture) | "after a restart, a job without restart-resume waits; with it, it continues" |
| 32 | Budget, usage limit, deadline, no-progress | PASS (fixture) | cycle budget, usage limit, no-progress tests. The deadline, hour and spend limits share the same `overBudget` check but aren't separately tested. |
| 33 | Malicious instructions from another assistant | PASS (fixture) | "instructions injected by another assistant cannot widen the job" |
| 34 | Two jobs can't share desktop input or workspace | PASS (fixture) | "two tasks cannot hold desktop input at once"; "two jobs can't change the same project folder" |
| 35 | Research keeps sources, flags conflicts | PASS (fixture web) | `research.test.js` (3 tests). Live search runs in the app (Wikipedia/DuckDuckGo); answers depend on your network. |
| 36 | Fixture game controlled to a verified objective | PASS (browser) + PASS (live app) | 5/5 coins from screen observation in Chromium, about 7.7 s and 19 moves (`games/fixture/results.json`). In Nova's own window: HUD "Coins: 5/5 · Lives: 3 · State: won" (screens 04, 05). |
| 37 | Focus loss, cancel, stalled perception, menus release keys | PASS (browser) for focus loss, cancel and takeover; **PARTIAL** for the rest | The stalled-perception stop ("my moves stopped changing anything") is implemented but not exercised. Unexpected menus are handled only as a focus or pause state. |
| 38 | Recorded routine: scope, stop condition, credentials | PASS (fixture + browser) | "recording keeps only the game's keys" (typed text and passwords are dropped); the routine replays only in its own game until `coins ≥ 1`. **No recording button in the app yet.** |
| 39 | Prohibited automation blocked, coaching still offered | PASS (fixture) | policy test; Roblox test (link only, "won't play", exploit refused) |
| 40 | Scheduled/recovered jobs don't duplicate; dashboard truthful | **PARTIAL** | Recovery: PASS. **Scheduling is not built** (a table exists, no scheduler). The Tasks panel shows the real stored state (live). |

## Not run here, and how to run them on your PC

| What | Why not here | How |
|---|---|---|
| Windows helper (windows, UI Automation, screenshots, OCR, input) | No Windows/PowerShell in the container | `npm run check-windows`. It only looks, never types or clicks, and prints PASS/FAIL per check. |
| Microphone and push-to-talk | No audio device or speech model | Tray > Voice > "Listen for Nova", or Ctrl+Alt+V |
| Claude/OpenAI answers | No keys (and I won't ask for them in chat) | Tasks panel > Settings > paste a key |
| Discord bot posting | No bot (making one tonight wasn't allowed) | Settings > Discord bot token, then add a place |
| Claude Code CLI as a job participant | Present in this container, but not run against a real project (that would be a paid live loop with no grant) | Create a job, choose `claude-cli` as implementer, approve the card |
| Roblox | Not touched, by design | "open roblox.com/games/<id>" opens the official page |

## Measured responsiveness (real app, Linux virtual display, software rendering)

From `docs/measured-timings.json`. These are not Windows numbers.

| What | Samples | Median | p95 | Target |
|---|---|---|---|---|
| Hotkey → "Listening" indicator painted | 15 | 10 ms | 35 ms | < 150 ms |
| Stop button → everything cancelled (round trip) | 15 | 1.1 ms | 3.5 ms | < 250 ms |
| Typed request → first status | 10 | 2.4 ms | 5.3 ms | — |
| Typed "what is 7 times 3" → answer visible | 10 | 139 ms | 143 ms | — |
| Game: Stop mid key-hold → key released | 1 | < 250 ms (asserted) | — | < 250 ms |
