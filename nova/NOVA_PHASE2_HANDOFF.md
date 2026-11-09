# Nova Phase 2: handoff

**Phase 1 gate: PASSED**, with external blockers recorded (`PHASE1_COMPLETION_GATE.md`, checkpoint `25e5036`). Before passing it, I fixed the Phase 1 defects I found. The most important was a real crash when quitting: a `will-quit` error that kept Nova running behind an error dialog, on Windows too. Then Phase 2 ran from P2-A to P2-H.

**Tests:** `npm run test:core` → **151 passed, 0 failed**, including every Phase 1 test. The full status of each requirement is in `PHASE2_REQUIREMENTS_MATRIX.md`, and speed and memory are in `PERFORMANCE_BASELINE_AND_RESULTS.md`.

## What Phase 2 actually does now

**Verified in the real app or with real files** (Linux, virtual display):
- **Routing:**
  - Simple commands take a direct path ("mute" just mutes).
  - Vague ones ("send it", "open the thing") get a question.
  - Uncertain guesses are confirmed and never reported as done.
  - Writing and translating go to a model.
  - The benchmark went from 26/37 to 37/37 correct; the scorer change is disclosed.
- **Modes:** reasoning modes (Auto/Quick/Think/Thorough) and performance profiles (Gaming/Balanced/Overnight), mapped to real settings, plus backoff under memory/CPU pressure.
- **Memory fix:** her hologram renderer went from about 650 MB to 163 MB, with the same art and drag and click-through still working. The whole app at idle went from 903 to 752 MB.
- **Right-click menu, Pause/Resume, bubble text size.** Panel tabs: Routines, Projects, References, Phone, What works (capability registry).
- **Projects:** "let's work on X" opens only what the profile lists. Each project's notes and references stay separate, and answers get only the active project's context.
- **Reference inbox:** saves the clipboard's image, link or text, or a file, with its source, tag and project.
- **Routines and presets** (Gaming, Study, Development, Wind down), plus "save that as …". Each run previews its steps and asks once; "end" restores only reversible settings.
- **Reminders:** durable, aware of daylight-saving changes, fire once, and are marked late if missed while asleep.
- **"What did I miss?":** a digest from authorized sources only, never replying to anyone.
- **Files:** duplicates found by content, previewed moves with no overwrites, undo, Recycle Bin only, and per-file reporting of locked files.
- **Documents:** CSV, Excel, Word, PDF, Markdown and SVG charts, each validated after writing. They were cross-checked with openpyxl, python-docx and pypdf, which caught and fixed a Word table bug.
- **Reading your files:** Word, Excel (with formulas), PDF and CSV, with exact table totals. Scanned or encrypted PDFs are reported as unreadable.
- **Troubleshooting:** runs the project's own check, shows the real error, remembers fixes already tried, and says "fixed" only when the check passes again.
- **Phone dashboard:**
  - HTTPS pairing confirmed on the PC; every request authorized on the server.
  - Resends never act twice; approvals bind to the exact card; a Stop on the PC wins.
  - Tested over real HTTPS, and end to end with an emulated iPhone 13 (browser simulation, not a physical phone).
- **Coordinator:**
  - The reviewer gets the actual files with hashes.
  - A self-contradicting reviewer is caught.
  - A stalled job blocks while independent jobs continue.
  - After a provider outage the job blocks and can be resumed, and handoffs the provider clearly refused are safely resent.
- **Games:** coaching works without automated play; game goals; a shop or menu stops play.
- **Voice:** the future voice-output interface exists but is off. The real recognizer was checked on synthetic speech: 6/6 commands.

**Mocked or blocked (exact reasons in the matrix):**
- **Windows UI automation** (no Windows here): run `npm run check-windows` on your PC.
- **Live microphone** (no device here).
- **Model answers, writing and summaries** (no API keys).
- **Live web research** (this build environment's proxy blocks Wikipedia and DuckDuckGo).
- **Discord bot** (no token, by your instruction).
- **Live assistant jobs** (a paid loop needs your approval).
- **Windows notifications** (they need a packaged app identity).
- **Real iPhone** (no device).
- **Away-from-home access** (needs your VPN).

## Most meaningful numbers

| | Before | After |
|---|---|---|
| Benchmark accuracy (37 requests) | 26/37 | 37/37 |
| Hologram renderer memory | ~650 MB | 163 MB |
| Whole app after a soak | 1298 MB | 811 MB |
| Stop round trip (median / p95) | 0.7 / 4.4 ms | 0.8 / 2.0 ms |
| Typed request to answer visible (median) | 40 ms | 40 ms |

All measured on the Linux build machine, not your PC.

## Try these

1. Right-click Nova > Performance profile > **Gaming**, then say "start study mode" and look at the preview card.
2. Tasks panel > Projects > add **Black Sun** (its folder, apps and a check command), then say "let's work on black sun".
3. Copy an image, then say "save this image as an armour reference". Later: "find the armour reference".
4. "remind me in 2 minutes to stretch", then "what reminders do I have".
5. "find duplicate files in my downloads".
6. Pair your phone (below), then press Stop on the phone while Nova is doing something.

## Pairing your phone

Tasks panel > **Phone** > Listen on **My home network** > **Pair a phone**. On the phone (same Wi-Fi), open the address shown, accept the self-signed certificate warning after checking the fingerprint, and type the code. Then **Allow** it on the PC. Full steps: `docs/phase2/GUIDE.md`.

**Not tested:** a physical iPhone (I only had browser simulation) and away-from-home access through a VPN.

## Setup for the remaining live parts

1. `npm run check-windows` (it only looks; never clicks).
2. Add an API key in Settings for model answers, writing and summaries.
3. Her Voice menu > Microphone > test.
4. The phone pairing above.

## Rollback

| Back to | Command |
|---|---|
| Before Phase 2 | `git checkout 25e5036 -- .` (the Phase 1 gate) |
| Before Phase 1 | `git checkout 6112ee0 -- .` |

The database upgrades itself (v1 → v2, adding columns only). An older build ignores the extra columns.

## Remaining work, in order

1. Run the Windows check and acceptance list on your PC.
2. Unload the local chat model when idle. (The voice service already starts only on demand: idle 752 → 644 MB.)
3. A longer soak on Windows, to confirm the small residual renderer growth isn't a leak.
4. A calendar adapter.
5. Music-triggered dance (art untouched).
6. A real iPhone test.
7. Clicking the native right-click popup in an automated test.
