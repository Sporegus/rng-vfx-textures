# Nova's brain: architecture and permission model

## One pipeline

Every request goes through the same path, whether you type it in the bubble or the Tasks panel, or say it after "Nova" / push-to-talk:

```
input ─► transcript ─► route ─► task ─► (plan) ─► permission ─► tool ─► verify ─► reply
 (page)   (bubble)     router    tasks    brain/LLM  permissions  tools    postcondition  (bubble + history)
```

- **Main process owns everything that decides or acts** (`core/app.js` starts it). The page (`src/renderer.js`) only shows things and collects your answers. It forwards text with `nova.core.input()` and renders `core` events: `transcript`, `status`, `reply`, `approve`, `choose`, `page`, `stopped`.
- **Tasks** (`core/tasks.js`): one per request, each with an id, a request id and an `AbortController`. The state machine has `listening → transcribing → understanding → awaiting_permission → executing → verifying → completed | cancelled | failed | blocked`. Invalid transitions throw. A late result for a finished task is ignored and logged, and never revives the task.
- **Router** (`core/router.js`): stop, corrections ("no, Spotify", "X — actually Y"), status, jobs, panel, Discord, window tools, screen, game, research, questions and commands. Questions that her own brain answers (math, time, weather, help) skip the model.
- **Corrections** cancel the pending task and re-run with the corrected words. A window correction re-runs the last window tool with `which: 'other'`.
- **Dedupe**: a final transcript with an `utteranceId` runs once. Partial transcripts are only shown, never acted on.
- **The older page abilities** (files, organize, timers, wallpaper, music…) still exist. The core checks them first, then runs them on the page through `page.run`, and an approved step skips the page's own confirm.
- **Models are optional and only make proposals.** `core/llm.js` provides Anthropic, OpenAI and the on-device chat brain (through the voice service), streaming, with error categories. A model plan is a list of `{tool, args}` that goes through the same validation and permission checks as anything else. Screen and web text is wrapped as `<data>` and treated as untrusted.

## Permission model (`core/permissions.js`)

A **grant** is `{ scope: {kind: task|job, id}, categories, targets, effects, expires }`. It is created only by your click or spoken "yes" on an approval card, never by a model. `check()` runs in app code before every tool.

| Category | What it means | Default |
|---|---|---|
| read, launch, window, system | look things up, open an app/site, move windows, volume/theme | your direct request authorizes it |
| screen | read a window's UI text / screenshot | asks the first time (can be remembered, revocable) |
| control | type, press buttons | approval card, bound to that task and window |
| files_write, files_delete | organize, move, recycle | approval card |
| communicate, call, audio_out | post a message, join a call, play audio into a call | approval card with exact destination + text |
| relay | pass messages between assistants in a job | one job approval (job card) |
| game | press keys in a game | one game approval, bounded time |
| install, purchase, security | — | **never**, no grant can be created |

Rules enforced in code and covered by tests:
- A grant is bound to one task or job. Another task never reuses it.
- **Targets and effects must match exactly.** A changed channel, recipient, message text, app or job objective is not covered.
- Grants expire. **Stop revokes every task grant**. Job grants survive Stop and the job is paused instead, so you can resume it.
- Silence, a timeout or a denied card never counts as approval. An unanswered approval expires as "no".

## Tools (`core/tools.js`, `core/desktop.js`)

A tool declares its name, purpose, args schema, category, effect (`local`/`external`), timeout, `retrySafe`, optional `available()`, and `verify()`. `tools.run()` does the following, in order:
1. Validate the args against the schema. Unknown tools and bad args are refused.
2. Check permission (`denied`, or `blocked` for never-categories).
3. Take the `desktop-input` lease for control and game tools, so input is serialized across tasks.
4. Run with a timeout. Only `retrySafe` tools retry. An external action that times out is never retried and is reported as **unverified** (`ambiguous`).
5. Verify the postcondition (the window exists, it is on the target monitor…). A successful call whose check fails is reported as unverified, not done.

Windows tools run through one persistent PowerShell helper (`core/win/helper.ps1`: Win32 + SendInput + UI Automation + Windows OCR). There is no arbitrary PowerShell: only named commands with typed arguments. Typing refuses password fields. **Control pauses** when you move the mouse or type, when the foreground window changes, or when the PC locks (`createGuard`). Stop sends `release_all` so no key stays held.

## Coordinator: long-running jobs (`core/jobs.js`, `core/participants.js`)

### Job record (SQLite `jobs` table, JSON columns)

```jsonc
{
  "id": "job_…", "goal": "…", "state": "draft|queued|running|waiting_on_assistant|verifying|paused|blocked|completed|cancelled|failed",
  "contract": {
    "workspace": "C:\\projects\\thing",          // the only folder the job may touch
    "criteria": ["npm test passes"],              // what "done" means, in words
    "files": ["src/add.js"],                      // deliverables that must exist
    "testCommand": ["npm", "test"],               // Nova runs this herself, in the workspace
    "participants": [{"id": "openai-api", "role": "planner"}, {"id": "claude-cli", "role": "implementer"}, {"id": "openai-api", "role": "reviewer"}],
    "constraints": [], "deadline": 1794240000000, "restartResume": false,
    "sharing": "project files and test output only", "testEnv": null
  },
  "plan": {"version": 3, "steps": [{"iteration": "i2", "task": "…"}]},
  "budgets": {"maxHours": 8, "maxCycles": 20, "maxRetries": 2, "noProgressCycles": 3, "maxSpendUsd": null},
  "usage": {"cycles": 2, "spendUsd": 0, "noProgress": 0, "replans": 0, "started": 0, "tokens": 0},
  "checkpoint": {"review": {}, "fingerprint": "…", "finalCheck": {"revision": "…", "passed": true}},
  "nextAction": "…", "stopReason": "…", "version": 1
}
```

Related tables: `job_events` (append-only, bounded), `outbox` (a unique `(job_id, iteration, destination)` with states `intent → sending → sent | failed | unknown`, a payload hash and the result), `leases` (`job:<id>`, `workspace:<path>`, `desktop-input`), `grants`.

### Permission

The **job card** shows the goal, folder, participants, done criteria, what is shared, what is never allowed, and the limits. Approving it once creates `relay`+`read` grants scoped to `{kind: 'job', id}`. The targets are the approved participants and the effects pin a hash of the goal and criteria. Every handoff is checked against it **and** against `OUT_OF_SCOPE` (secrets, purchases, deploys/publishing, public posts, contacting new people, destructive commands, changing the objective), against recipients outside the job, and against absolute paths outside the workspace. An approved contract can't be edited, only a draft can.

### The cycle

1. **Planner** gets the goal, the last review and the evidence hashes. It replies with `{"task": …}` or `{"done": true}`.
2. If the planner says `done`, **Nova checks it herself**: the files exist and the test command passes on the current revision. If her checks fail, the job continues with the failures as the correction.
3. **Implementer** gets one bounded task. The handoff is recorded in the outbox **before** it is sent, and sent once.
4. **Nova verifies**: file hashes give a revision id, and the approved test command runs in the workspace. An assistant saying "it works" is not evidence.
5. **Reviewer** gets the task, the implementer's report and Nova's check results. It replies `{"verdict": "accept"|"reject", "corrections", "critical"}`.
6. **Completed** only if Nova's checks pass and the criteria hold. Otherwise the corrections become the next plan input.
7. Between steps the job checks the deadline, hours, cycles, spend, Pause and "finish this step". No progress means the same revision and test output across cycles. After `noProgressCycles` it tries **one new approach**, then blocks.

### Adapter matrix

| Participant | Kind | State | Notes |
|---|---|---|---|
| `claude-cli` | Claude Code CLI, run headless in the job's folder (`claude -p … --output-format json`) | **experimental, live where installed** | Uses Claude Code's own permission settings, with no skip flags added. A headless run leaves nothing to look up after a crash, so an interrupted handoff becomes **blocked (uncertain)** and is never resent. |
| `anthropic-api` | A new Claude conversation through the API | live when a key is saved | Not your existing chats. |
| `openai-api` | A new ChatGPT-model conversation through the API | live when a key is saved | Not your existing chats. |
| `demo-*` | Scripted fixtures | demo only, labelled "(fixture)" | Used by "Run the coordination demo" and the tests. |
| Existing ChatGPT/Claude browser or desktop chats | — | **not supported** | Neither offers an interface for another program to post into a chat. Nova won't scrape sessions or cookies, or drive the browser to fake it. |

### Recovery notes

- **Crash or restart**: `jobs.recover()` runs at startup. A job that was mid-run continues only if its contract allows `restartResume`, its grant is still valid and the deadline hasn't passed. Otherwise it is **paused** with the reason.
- **In-flight handoffs**: if an outbox row exists for the same `(job, iteration, destination)`, the coordinator never sends again. It uses the stored result, or asks the participant (`lookup`) whether the message arrived. If the answer is unknown, the job **blocks** and says so ("I'm not sure whether X got step N…"). Check on the assistant's side, then resume.
- **Leases** expire, so a crashed owner can't hold a job or workspace forever. Two jobs can't hold the same workspace.
- **Cancel** stops further handoffs at once. Anything already with an assistant may still finish on its side, and the card says so.
- **Pause everything** / **Finish the current step** are in the Jobs tab and in speech ("pause everything", "finish the current step").

## Other parts

- **Screen** (`core/screen.js`): consent first, then a targeted window (never Nova's own), UI Automation text first, then a screenshot with Nova hidden, then vision (if a model with vision is set up) or Windows OCR. With no model it reports only what it actually read.
- **Discord** (`core/discord.js`): only places you added, with confirmed IDs. Nova can **open** the channel for you (a `discord://` link; she joins nothing as you) or post as **the Nova bot** (your own bot token) with an exact-text approval, a nonce, `enforce_nonce`, and nonce reconciliation on timeout. She never posts twice. No self-bot, no token scraping, no joining calls.
- **Research** (`core/research.js`): DuckDuckGo instant answers, Wikipedia, and pages you name. Each finding is an evidence record (`url, title, retrieved, excerpt, kind: official/reference/community/web, uncertainty`). Conflicting numbers are flagged, gaps are reported, and reports can be saved as Markdown.
- **Games** (`core/games.js`): graduated capabilities (observe, advise, launch, assist, play) per profile. The controller loop is observe (PNG decode + colour blobs + HUD text) → one bounded key hold → release → verify. A watchdog releases every key. It pauses on focus loss or takeover and stops on Stop. Routines keep only the game's own keys. A policy refuses exploits, injectors, memory or packet tampering, anti-cheat or AFK evasion, duplication, and editing or publishing games. Roblox gets official links only.
- **Store** (`core/store.js`): `node:sqlite` with WAL, migrations and transactions, at `%APPDATA%\Nova\nova.db`.
- **Log** (`core/log.js`): structured JSON lines at `%APPDATA%\Nova\logs`, with keys and token-shaped values redacted. Viewable and exportable in Diagnostics.
- **Secrets**: API keys and the bot token are encrypted with Windows DPAPI (`safeStorage`) at `%APPDATA%\Nova\keys`. They are never sent to the page or a model, and never written to settings or logs.
