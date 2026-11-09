# Local game fixture and controller profile

**Fixture:** `games/fixture/index.html` is a local, deterministic browser game with no network. Hold the arrow keys or WASD to move the cyan square and collect 5 gold coins. The red pit costs a life and sends you back to the start, which is the failure and recovery case. The game pauses when its window loses focus. `?seed=N` changes the coin layout. The HUD is plain text (`Coins: 2/5 · Lives: 3 · State: playing`), so it can be read the way any game's UI would be.

**Controller profile** (`PROFILES['nova-fixture']` in `core/games.js`):

```js
{
  id: 'nova-fixture', online: false, automation: true,
  capabilities: ['observe', 'advise', 'assist', 'play'],
  keys: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' },
  speed: 220,          // px/s while a key is held (used to size each hold)
  maxHoldMs: 400,      // no key is ever held longer; a watchdog releases it 150 ms after that
  colors: { player: [0,229,255], coin: [255,210,63], hazard: [208,52,44] },   // what she looks for in the frame
  hud: /Coins:\s*(\d+)\/(\d+).*Lives:\s*(\d+).*State:\s*(\w+)/,             // the evidence of progress
}
```

**Loop:** take a screenshot, decode the PNG and find colour blobs (player, coins, pit), and read the HUD. Plan one axis move toward the nearest coin and around the pit. Hold that one key for a bounded time, then release it. Look again and check that the counter or position changed. If six moves change nothing, it stops. After a fall it switches to safe paths. Focus loss, a paused game, user input and Stop each release every key.

**Measured results** (`games/fixture/results.json`, real Chromium, headless):

| Case | Result |
|---|---|
| Seed 7, from the start | completed: 5/5 coins, 19 moves, 7.7 s, 0 falls |
| A gust shoves her into the pit mid-run | completed: 1 fall noticed, switched to safe paths, finished with Lives 2 |
| Window loses focus after 3 moves | paused, every key released |
| Stop during a key hold | stopped, key released in < 250 ms, frame unchanged afterwards |
| Recorded routine until coins ≥ 1 | completed: stopped as soon as the HUD said 1 |

In the real Nova app (Electron window she opens herself), the result was "Done. Collected 5/5 coins (read from the game's own counter). (19 moves, 7.2 s)", with HUD `Coins: 5/5 · Lives: 3 · State: won`.

**Routines:** `recordRoutine(events, profile)` keeps only the profile's own keys, so typed text, passwords, Enter and shortcuts are dropped. `controller.routine()` replays only in the game it was recorded for, in bounded holds, until a HUD condition is met or a loop or time limit is hit. There's no "record" button in the app yet.

**Real games:** none are automated. Roblox is launch and advice only (official `roblox.com/games/<id>` links), and nothing Roblox-specific was live-tested.
