# Understanding and speed repair: what was wrong, what changed, measured results

All numbers below were measured in this repair, on this build machine (Linux, no GPU), unless a line says otherwise. Your Windows PC will differ: run `npm run speed-check` there (see the end) and Tasks panel > Diagnostics > **Speed of recent requests** shows the same breakdown for everything you ask.

## Confirmed root causes

| # | Problem | Evidence | Fix |
|---|---|---|---|
| 1 | Every sentence was forced into a command: no step decided whether it was an instruction, a "don't", a question, or chat. | Benchmark before the fix: "I don't want you to open Spotify" opened Spotify; "does spotify have a free plan" started music; "ugh fine, open discord" searched files. | `core/acts.js` reads the sentence kind clause by clause, before any command matching. |
| 2 | A question that also looked like a confident command was carried out. | The question path ran the command brain's match whenever it was 90%+ sure. | Questions can only be answered directly with information (time, math, weather, help, PC stats); they never open, close or change anything. |
| 3 | Polite requests in words the command brain doesn't know ("could you deal with that") were treated as questions and sent to plain chat, so they could never become an action. | Traced in the pipeline. | They're treated as requests. With a chat brain on, the whole sentence goes to it for interpretation. |
| 4 | With the on-device chat brain on, the core sent it only your words: the instructions for interpreting a command and the conversation so far were dropped. So "what did you mean" mostly failed. | `core/llm.js` local provider ignored the `system` prompt and history. | New one-call `decide` on the device: JSON-constrained (always valid), fixed instructions that are processed once and reused, last 6 turns included. |
| 5 | The first "open X" after a start could take over 15 s and report "That took too long". | Your screenshot; the window helper and the Start-menu list both started cold inside one 15 s limit, before launching. | Launch first; the app list is saved to disk and refreshed in the background; the helper warms up at start; a slow check means "unconfirmed", never a failure. |
| 6 | Each launch searched the whole app list, nothing remembered which app a name meant, and an app that was already open got started again. | Code review. | Names that launched and showed a window are remembered exactly; already-open apps are brought to the front instead. |
| 7 | A browser tab titled "Discord" counted as the Discord app's window. | Code review (title match on any window). | Titles only count outside browsers and Explorer. |
| 8 | Launch checks looked every 500 ms. | Code. | Every 120 ms for the first 3 s, then every 400 ms. |
| 9 | Voice: 0.6 s of silence ended a phrase, and microphone audio arrived in 100 ms pieces. | Measured below. | 0.5 s and 32 ms pieces (the silence detector's own window). |
| 10 | A finished action was reported done only after her speech bubble finished its typing pause (up to 1.2 s). | Trace: "what time is it" showed 469 ms of "do" that was only the bubble. | The core no longer waits for the typing pause; the reply still shows the same way. |
| 11 | Closing an app started PowerShell once to find it and once more for each process. | Code. | One start for all of them. |

## Understanding: measured

`node bench/understanding.js` runs every phrase through the real request pipeline (fake apps, no model): paraphrases, negation, questions and chat that mention apps, mixed chat and requests, corrections, and ambiguity. The held-out set was frozen in a commit (`2fba6ad`) before any fix and never used to tune.

| | Before | After |
|---|---|---|
| Tuning set (55) | 42 | **55** |
| Held-out set (25) | 17 | **25** (24, then 25 once the test's fake app list used the real name matching: "chrome" means Google Chrome) |
| Older benchmark (37) | 37 | 37 |
| Command-brain test sets | 138/138, 61/62, 40/40 | unchanged |

**Real build, typed, multi-turn** (Electron on a virtual display, real apps; the last column counts actual windows):

| You | Nova | Understood / done | Windows |
|---|---|---|---|
| hey nova | Hey hey! | 13 / 7 ms | — |
| how's it going | I'm doing great, thanks for asking! How about you? | 12 / 2 ms | — |
| could you pull up xterm for me | Opened XTerm. ✅ | 6 / 157 ms (the app's own window: 138 ms) | xterm 0 → 1 |
| thanks! ok close it | Closed xterm. | 4 / 25 ms | xterm 1 → 0 |
| don't open it again | Okay, I won't open it again. | 2 / 1 ms | none opened |
| lol fine. open xterm, no wait, libreoffice writer | Opened LibreOffice Writer. ✅ | 4 / 150 ms | xterm stays 0 |
| what time is it | It's 8:13 PM | 17 / 12 ms | — |
| why is xterm so slow though | (no chat brain here) offers a web search | — | none opened |

## Speed: measured

**Typed app launch, real build, by hand vs through Nova.** "By hand" is the OS starting the same app directly, timed until its window appears with the same 120 ms checks. Through Nova, the time runs from the typed request until she has confirmed the window. The app was closed before every try (`--speed-check=xterm`):

| | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| By hand | 138 ms | 137 ms | 138 ms | 138 ms |
| Through Nova ("open xterm" / "could you pull up xterm for me" / "open xterm") | 169 ms | 147 ms | 149 ms | **149 ms (+11 ms)** |
| Of which: request → dispatch | 22 ms | 3 ms | 2 ms | **3 ms** (target 250 ms) |
| Already open: brought to the front | | | | **23 ms** |

So on this machine Nova adds about 10–35 ms on top of the app's own start-up. Before this repair, the Linux build couldn't launch apps at all, so there's no Linux "before". On Windows, the "before" was the >15 s / "That took too long" failure (cause 5).

**Voice** (`npm run voice-timing <models>`): the real silence detector and Parakeet recognizer, audio fed in real time, then the real pipeline. The test speech is a synthetic Piper voice, not a person:

| | Old settings (0.6 s silence, 100 ms pieces) | New (0.5 s, 32 ms) |
|---|---|---|
| End of speech → final text (median) | 895 ms | **~770–790 ms** |
| Final text → dispatch (median) | 3 ms | 2–3 ms |
| Right (10 spoken requests incl. "don't open Discord", mixed, correction) | 10/10 | 10/10 |
| Sentences cut in two at a pause | 0 | 0 |

Most of what's left is the 0.5 s of silence she waits for (so she doesn't cut you off) plus about 250 ms of recognition on this CPU.

**Chat brain (model path):** at most one model call per request. On the real llama.cpp runtime, using a tiny test model because real models can't be downloaded here, the fixed instructions were read once (1,713 tokens with that model's tokenizer) and later requests read only 33–82 new tokens each. Real response times with a real model are **not measured** here.

## How each request is handled now

1. **Clear, familiar task** ("open Spotify", "could you pull up Spotify", "Spotify please"): sentence kind, then the command brain, then the launcher. No model, no screenshots, no research. Measured 2–22 ms to dispatch.
2. **Conversation or question** (including ones that mention apps): answered. Mentioning an app never opens it. With a chat brain, it answers; without one, built-in replies or a web-search offer.
3. **Unfamiliar or complex** ("my downloads are a disaster, could you deal with that"): the chat brain reads the whole sentence once and returns one instruction; the usual permission checks and verification apply.
4. **Ambiguous** ("open it" with nothing to refer to): one short question. "Close it" right after opening something means that thing.

## Remaining limitations

- **Windows timings weren't measured by me.** This environment can't run Windows. `npm run speed-check` measures it on your PC.
- **On-device chat brain speed is unmeasured.** No real model could be downloaded here. Its first answer after start-up waits for the model to load.
- **Without a chat brain, open-ended chat is pattern-based** ("pretty good, just got home" gets a generic reply). Natural multi-turn conversation needs the chat brain on.
- **0.5 s of silence** may cut someone who pauses mid-sentence. "Nova" alone still opens an 8-second listening window for the rest.
- **Closing an app on Windows** still starts PowerShell (twice instead of more). I didn't change the Windows window helper because there's no way to test PowerShell here.
- **"Is Discord open?"** is answered by the chat brain or a web-search offer, not yet from the window list.
- Voice timings used synthetic speech; real voices, accents and mics will differ.

## Run it yourself

- `npm run speed-check`: opens and closes Notepad and Calculator 3 times each, both ways, and writes `speed-check.json` in Nova's settings folder. It skips apps that are already open.
- Tasks panel > Diagnostics > **Speed of recent requests**: every request you make, split into speech / understand / do / total, with the app's own start-up shown on its own.
- `npm run understanding`: the understanding benchmark.
