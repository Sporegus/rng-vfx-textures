# Performance: baseline and results (Phase 2)

All numbers below are **measured**. They come from runs on the machine described next, and the raw data is in `bench/results/`. Nothing is estimated unless it's labelled as an estimate.

**Machine:** Intel Xeon @ 2.10 GHz, 4 cores, 17 GB RAM, Linux 6.18, Node 22.22 / Electron 45.1 (Node 24.22). The display is virtual (Xvfb) with software rendering (`--disable-gpu`). **This is not your Windows PC**, so absolute numbers will differ there. The point is the before/after comparison on the same machine.

**Not measured here:** real model providers (no keys), the microphone path (no audio device), Windows automation (no Windows) and GPU rendering.

## How to reproduce

```
node --expose-gc bench/core-bench.js <label>          # in-process: 37 requests, accuracy, warm/cold, 600-request soak
xvfb-run node bench/app-bench.js <label>              # the real app: cold start, warm answers, Stop, memory, per-look memory
```

The second command needs Playwright and a display. On Windows, run it without `xvfb-run` and with Playwright installed.

## 1. Accuracy and routing (37 representative requests)

The set is in `bench/requests.js` and covers direct commands, conversation, ambiguous requests, projects, research, screen, longer workflows and control. Each request has a *correct* expected outcome (for example "asks instead of guessing"), written down before the baseline was run.

| Category | Baseline | After |
|---|---|---|
| Direct commands | 11/12 | **12/12** |
| Conversation | 5/7 | **7/7** |
| Ambiguous (must clarify, never guess) | 1/5 | **5/5** |
| Project / reference | 0/2 | **2/2** |
| Research | 1/2 | **2/2** |
| Screen | 3/3 | 3/3 |
| Longer workflows | 2/3 | **3/3** |
| Control | 3/3 | 3/3 |
| **All** | **26/37** | **37/37** |

**Scorer change, stated plainly.** After the code changes, the original scorer gave **34/37**. I then corrected two scorer limits, and the corrected scorer gave 37/37. The corrections were:
1. Her answer can be a question card, such as "Search the web instead?", and the scorer now counts that.
2. "open spot" → Spotify, a unique prefix of an installed app, now counts as correct alongside asking.

Neither correction was re-applied to the baseline file. My estimate (not measured) is that the baseline would score about 28/37 under the corrected scorer.

**What the baseline got wrong, and was fixed:**
- **"mute"** replied "Muted 🔇" without muting anything. That was a real honesty bug.
- **"send it"** → close-app.
- **"write me a short poem"** → saved a note.
- **"let's work on black sun"** → dance.
- **"open the thing"** → searched for an app called "thing".
- **Research phrased around Roblox** → the game route instead of research.

## 2. Speed

| | Baseline | After | Notes |
|---|---|---|---|
| Nova's own routing + pipeline, warm (median of 37 request medians) | 0.76 ms | 0.63 ms | in-process, fake PC; 7 runs each |
| Same, slowest request (median) | 1.63 ms | 1.26 ms | |
| Cold: fresh process to first request handled (median / p95) | 50 / 63 ms | 50 / 72 ms | p95 rose slightly: more modules load at startup |
| Real app, launch to first answer visible (median of 3) | 788 ms | 788 ms | |
| Real app, typed request to answer visible (median / p95, n=30) | 40.2 / 46.2 ms | 40.2 / 48.2 ms | |
| Real app, Stop round trip (median / p95, n=15) | 0.7 / 4.4 ms | 0.8 / 2.0 ms | target < 250 ms |
| Hotkey to "Listening" painted (median / p95, n=15) | 10 / 35 ms | — | Phase 1 run; target < 150 ms |
| Spoken command to text, real recognizer (moonshine-tiny, per utterance) | — | 82 to 129 ms | synthetic speech, `docs/speech-check-results.json` |

Model first-token and total latency are **not measured** (no provider configured). Nova records them in Diagnostics as `first-token` once a key is added.

## 3. Memory

| | Baseline | After |
|---|---|---|
| Whole app at idle (all Electron processes, working set) | 903 MB | **752 MB**; **644 MB** with the voice service now started on demand (voice off) |
| Whole app after a soak (150 requests, 50 menus, 10 Stops) | 1298 MB | **811 MB** |
| Renderer (her overlay) with the hologram look, steady | ~650 MB | **163 MB** |
| Renderer with the pixel look (for comparison) | 142 MB | 142 MB |

**The fix.** Her hologram video was being drawn into a canvas every frame. In this software-rendered environment that cost about 500 MB. Isolated test page measurements:
- video only: 105 MB
- video as a page element: 113 MB
- drawn to a canvas: 604 MB
- drawn to a canvas from a 360p copy: 267 MB

She now plays as a video element. Grab and click-through use a 5 KB silhouette mask, the union of all 480 frames. Her art and size are unchanged, and the result was verified visually at 100% and 150% scaling.

**Leak check** (`bench/results/soak-rounds-app.json`): three rounds of 150 requests, 50 menus and 10 Stops, with forced garbage collection between rounds.

| | Renderer | Total | JS heap | DOM nodes | Processes |
|---|---|---|---|---|---|
| Start | 167 MB | 756 MB | 10 MB | 36 | 7 |
| Round 1 | 200 | 753 | 10 | 36 | 6 |
| Round 2 | 205 | 755 | 10 | 36 | 6 |
| Round 3 | 210 | 762 | 10 | 36 | 6 |

The JS heap, DOM and process count stay flat. A small residual renderer growth of about 5 MB per round remains after the first round. That isn't proof of a leak in three rounds, but it's worth re-checking with a longer soak on Windows.

**Core soak** (in-process, 600 mixed requests, a Stop every 25): the heap went from 7.6 to 8.2 MB, and 0 tasks were left active.

## 4. Resource behavior added in Phase 2

- **Memory/CPU pressure:** under 8% free RAM (minimum 800 MB), or CPU at 92% or more for two 15-second samples in a row, new background jobs wait and the status says why. Your requests and Stop are never held back. Tested.
- **Performance profiles:** Gaming starts no background jobs and turns off wandering and effects. Balanced allows 1 job at a time; Overnight allows 2. Job helper processes (test commands, Claude Code) run at below-normal OS priority.
- **Bounded:** at most 8 open requests (more are refused with a message); research cache of 100 entries; outbox, events, notifications, audit and request IDs are all capped.
- **On demand:** the voice service (speech models) starts the first time voice is used, or at launch only if voice, listening or the chat brain is on. **Not done:** unloading the on-device chat model after an idle period.

## 5. Remaining bottlenecks

1. Cold app start is about 0.8 s here. Most of that is Electron itself; not optimized.
2. The base cost of Electron's processes (browser, GPU, network, audio) is about 480 MB here and dominates total memory. The voice service (about 108 MB) now starts only when voice is used: idle went from 752 to 644 MB, and push-to-talk still starts it (verified with the speech model present).
3. The small residual renderer growth under heavy menu use; recheck on Windows.
4. Model latency depends on the provider. Thorough mode makes up to 2 calls plus research, by design.
