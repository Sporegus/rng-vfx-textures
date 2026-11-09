# Nova: morning report

Good morning! Nova has a real brain now. Every request goes through one pipeline: what you typed or said, what she understood, a permission check, the action, a check that it worked, then the answer in her bubble. She's in her approved hologram idle look. There's a Tasks panel for approvals, jobs and settings, and Stop works everywhere. I couldn't run anything Windows-specific here (no Windows, microphone or keys in the cloud box), so those parts have tests and a one-command check for your PC.

Screenshots from the real app: `docs/screenshots/`.

## 1. What actually works live now

Seen working in the real running app (Linux virtual display):
- **Her approved idle** plays as her default look on the transparent overlay. Dragging and throwing her still work, including at 150% Windows scaling. It's your MP4 with the navy background keyed out; the art itself is unchanged. There's no halo and no fake mouth movement.
- **Typed requests** from her menu box or the Tasks panel. Example: "what is 12 times 7" → "That's 84!" in about 140 ms.
- **Status pill** (Thinking / Working / Needs your OK / Listening), a **■ STOP** button in the bubble, **Ctrl+Alt+X**, and tray > Stop everything.
- **Approval cards** with Allow once / Cancel, which you can also answer from the panel's inbox.
- **Honest answers when nothing is set up.** With no brain configured she says so and offers a web search; she doesn't pretend.
- **Playing her test game** in a window she opens: one approval, then 5/5 coins from what she sees on screen, verified by the game's own counter.
- **The coordination demo** in the Jobs tab: plan → build → review **rejects** → fix → **Nova runs the tests herself** → completed.
- **Tasks panel**: approval inbox, recent requests, active permissions (revocable), conversation, jobs (presets, scheduled resumes), memory (deletable), settings, What works, Diagnostics (measured timings, resource use, redacted log, export).
- **Research with sources** (Wikipedia/DuckDuckGo, no account), when the network allows.

Built and tested with fakes, but **not run live** (needs your PC): opening and verifying apps, moving windows between monitors, reading the screen (UI text/OCR), typing and pressing buttons, microphone input, Claude/ChatGPT answers (need keys), Discord bot posts (need your bot).

## 2. How to launch

```
cd <your clone>\nova
git pull origin zinx-desktop-helper
npm install
npm start
```
`npm run panel` starts with the Tasks panel open. Details: `docs/INSTALL.md`.

## 3. Microphone

- **Ctrl+Alt+V**: push-to-talk. She listens for a few seconds with no name needed, and the pill shows *Listening* (median 10 ms after the hotkey, measured here).
- Tray > Voice > **Listen for "Nova"**: hands-free with the wake word. This uses the offline speech model you already had (downloads on first use).
- What she heard shows in the bubble. On approval cards you can **fix what I heard** before it runs. Only final transcripts act, never partial ones, and a spoken "stop" stops everything.

## 4. Five commands to try

1. `what is 12 times 7` (instant, her own brain)
2. `play the test game for 1 minute` → **Allow once** → watch her collect the coins, then press ■ STOP once to see her let go
3. `open notepad` (verified by finding its window), then `put that window on my other monitor` if you have two
4. `what's on my screen?` (asks permission first; works without any key using Windows OCR)
5. Tasks panel > Jobs > **Run the coordination demo** → **Approve once and start**

## 5. Mocked, blocked or not tested

- **Mocked (tests only):** Discord (mock adapter), assistants in the coordinator tests (scripted), the PC in the pipeline/desktop/screen tests.
- **Not run here:** everything Windows (helper, UIA, OCR, input), the microphone, live model APIs, Discord bot, Claude Code against a real project, multi-monitor/DPI. Exact reasons are in `docs/TEST_REPORT.md`.
- **Not built:** a "record routine" button (the engine is tested), Discord voice calls, TTS (by request).
- Full list: `docs/CHECKLIST.md`.

## 6. Setup you might want (all optional, all in Tasks panel > Settings)

1. Run `npm run check-windows` once. It only looks, never clicks. If anything FAILs, paste the output to me.
2. For everyday questions: paste an Anthropic or OpenAI key (stored encrypted, never shown again), or turn on tray > Voice > Chat brain (free, large download).
3. Discord: add "Afterparty" with its server and channel IDs. For bot posts, make your own bot and paste its token.
4. Roblox: save experience names with their place IDs.

## 7. Measured responsiveness and known defects

Real app, Linux virtual display, software rendering. **Not your PC**, so recheck in Diagnostics.

| | median | p95 |
|---|---|---|
| Hotkey → "Listening" shown | 10 ms | 35 ms |
| Stop → everything cancelled | 1.1 ms | 3.5 ms |
| Typed request → status shown | 2.4 ms | 5.3 ms |
| Typed math → answer visible | 139 ms | 143 ms |
| Game Stop → key released | < 250 ms | |

Known defects:
- Under the Linux harness the app doesn't exit on quit. The version from before tonight does the same there, so it isn't new; not checked on Windows.
- Nova lives on the primary monitor only, as before.

## 8. Changed files, checkpoint and rollback

- Branch `zinx-desktop-helper`. Commits: `7521b62` (core), `e6c7682` (Discord, research, jobs, games), `dc76bcb` (app integration, idle look, panel), `a7398c6` (tests and docs), `3e85452` (scheduling, presets, resources), plus a final small voice commit on top.
- About 50 files and 5k lines: `core/` (new), `games/fixture/`, `art/idle/`, `src/novaidle.js`, `src/panel.*`, `panel-preload.js`, `scripts/check-windows.js`, `docs/`. Small edits to `main.js`, `preload.js`, `src/renderer.js`, `src/sprites.js`, `src/style.css`, `src/index.html`, `voice/index.js`, `package.json`.
- **Rollback** to before the brain: `git checkout 6112ee0 -- .` inside the repo, or `git revert` the commits above. Your old data is untouched. The brain adds only `%APPDATA%\Nova\nova.db`, `logs\` and `keys\`. To get the old look back without rolling back: tray > Skin > any other look.

## 9. Manual acceptance checklist (about 10 minutes)

- [ ] `npm start`: she appears in the hologram idle, it loops smoothly, and there's no halo
- [ ] Drag her and throw her; clicks pass through the empty overlay to your desktop
- [ ] Ctrl+Alt+Space → type `what is 2+2` → answer in the bubble
- [ ] `open notepad` → "Opened Notepad ✅"; `open fakeapp123` → a helpful "not installed"
- [ ] `open notepad, actually calculator` → only Calculator opens
- [ ] `play the test game for 1 minute` → card → Allow → she plays; press Ctrl+Alt+X mid-run → she stops and the square stops moving
- [ ] Ctrl+Alt+V, say "what time is it" → you see what she heard plus the answer
- [ ] `what's on my screen?` → permission card → she reads back what's there (a real description if a brain is set up)
- [ ] Tasks panel → What works: matches your setup; Diagnostics shows timings
- [ ] `npm run check-windows` → all PASS

## 10. Next useful improvement

Run the Windows check and the acceptance list on your PC. Those are the parts I couldn't run, and they're what makes her "fully functional" on your desktop. After that: a routine "record" button in the panel, and her voice (TTS) through the existing speech service when you're ready.

## 11. Assistant routes

| Route | State |
|---|---|
| Claude Code CLI (`claude`) as implementer | **Experimental.** Code and probe are in place; not run against a real project tonight (that would be an unapproved paid loop) |
| Claude via Anthropic API | Ready; needs your key |
| ChatGPT models via OpenAI API | Ready; needs your key |
| On-device chat brain | Ready if you turn it on (tray) |
| Scripted demo assistants | Live in the app, labelled "(fixture)" |
| **Your existing ChatGPT/Claude conversations** | **Can't be used.** Neither app lets another program post into a chat, and Nova won't scrape your login to fake it. Jobs start fresh conversations through the API or CLI. |

## 12. Coordination evidence

- **Cycles:** the in-app demo ran 2 cycles: i1 reject (Nova's test failed, since add() subtracted) → i2 fix → Nova's test passed on a new revision → accept → completed. The test suite covers the same loop plus "done" claims that Nova's checks overrule.
- **Dedupe and recovery:** an outbox row is written before every send, with one row per (job, step, recipient). After a simulated crash the step was **reconciled from the assistant, not resent** (sends = 0). If the assistant can't confirm, the job **blocks** instead of guessing. Discord uses nonces for the same reason.
- **Budgets:** the cycle limit pauses the job ("Used all 2 cycles"). After 3 no-progress cycles it tries one new approach, then **blocks**. A usage limit pauses the job. Deadline, hours and spend use the same check.
- **Done criteria:** files exist + your test command passes on the current revision + the reviewer accepts (or has only non-critical notes).

## 13. Games

- Demonstrated: the local fixture played to 5/5 coins from real screen observation (Chromium and Nova's own window). Also demonstrated: recovery after a fall; pausing on focus loss or when you take over; releasing keys on Stop; a routine replay stopping at its HUD goal.
- Rules: exploits, injectors, cheats, memory or packet tampering, anti-cheat/AFK evasion, duplication, and editing or publishing games are all refused (tested).
- **Roblox:** opens through official roblox.com links only. She won't play or press keys there. **Nothing Roblox-specific was live-tested.** I didn't touch BLACK SUN or your other chat.

## 14. Outstanding approvals and resuming

- Nothing is waiting on you. No live jobs were started; the demo job finished.
- To resume a blocked or paused job: Tasks panel > Jobs > open it > **Resume**, or say "resume the last job". Finished steps aren't redone, because the outbox remembers them. If it says *not sure whether X got step N*, check that assistant first. If the job's approval expired, Resume asks for a fresh OK.

More: `docs/USER_GUIDE.md` · `docs/ARCHITECTURE.md` (pipeline, permissions, coordinator schema, adapter matrix, recovery) · `docs/TEST_REPORT.md` · `docs/GAME_FIXTURE.md` · `docs/jobs/` (example job contract and presets) · `docs/config.example.json`
