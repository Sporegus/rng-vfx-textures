# Install and launch

Nova runs on **Windows 10/11**. The brain needs nothing new: no new packages, and no keys unless you want them.

## First time

1. Install **Node.js LTS** from https://nodejs.org (any 22.x or newer).
2. Get the code (branch `zinx-desktop-helper`). If you already have it:
   ```
   cd <your clone>\nova
   git pull origin zinx-desktop-helper
   ```
3. In the `nova` folder:
   ```
   npm install
   npm start
   ```
   She appears at the bottom of your main screen in her hologram look.

To launch straight into the Tasks panel too: `npm run panel`. For an installer: `npm run dist` (output in `nova\dist`).

## Check the Windows parts (2 minutes, recommended)

```
npm run check-windows
```

This only **looks**: the active window, the window list, monitors, idle time, UI Automation, a small screenshot and OCR. It never types, clicks or moves anything. Each line says PASS or FAIL. If anything fails, paste the output into a chat and it can be fixed.

## Optional setup (all in Tasks panel > Settings)

Open the panel from the tray icon (**Tasks, approvals & settings…**) or the **Tasks** button in her menu.

| To get | Do this |
|---|---|
| Answers to everyday questions | Paste an **Anthropic** or **OpenAI** API key, or turn on the free on-device brain (tray > Voice > Chat brain, a large download). |
| Voice input | tray > Voice > "Listen for Nova" (the offline speech model downloads on first use), or press **Ctrl+Alt+V** to talk once. |
| Discord posts from Nova's bot | Make your own bot in the Discord Developer Portal, invite it to your server, and paste its token. Then add each place (name + server/channel IDs). |
| Roblox experiences by name | Settings > Roblox: a name plus the place ID from the `roblox.com/games/<id>` link. |
| Assistant jobs with Claude Code | Install Claude Code so the `claude` command works in a terminal. |

Keys are encrypted with Windows DPAPI in `%APPDATA%\Nova\keys`. They never appear again in the app, and are never written to `settings.json`, the logs, or anything sent to a model.

## Where things live

| What | Where |
|---|---|
| Settings | `%APPDATA%\Nova\settings.json` (see `docs/config.example.json`) |
| Tasks, jobs, approvals, memory | `%APPDATA%\Nova\nova.db` (SQLite) |
| Logs (secrets removed) | `%APPDATA%\Nova\logs\nova-events.jsonl`; also Tasks panel > Diagnostics > Export |

## Tests

```
npm run test:core     # the brain: 79 tests (the game ones run only if Playwright is installed)
npm test              # everything, including the older brain and voice suites
```
