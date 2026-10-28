# Zinx

A pixel-art holographic AI assistant that lives on your Windows desktop. She
walks around, sits on top of your windows, falls off when you close them, can
be grabbed and thrown, and does real chores with a little animation for each one.

## Run it (Windows)

1. Install **Node.js** (the LTS version) from https://nodejs.org
2. Open a terminal in this `zinx` folder and run:

   ```
   npm install
   npm start
   ```

Zinx teleports in at the bottom-right of your screen and introduces herself.

To make a real installer (`.exe`), run `npm run dist`. The output lands in `zinx/dist`.

## Using Zinx

| Do this | What happens |
|---|---|
| Click Zinx | Opens the menu |
| Double-click Zinx | Pets Zinx (hearts!) |
| Drag Zinx | Picks Zinx up; let go to throw |
| `Ctrl+Alt+Space` | Opens the menu from anywhere |
| `Ctrl+Alt+Z` | Hides / shows Zinx |
| Tray icon (by the clock) | Skin, accessory, size, sound, wander, sit on windows, start with Windows |

### The menu

- **Clean up**: scans temp files, the Recycle Bin, and old installers in Downloads, shows sizes, and cleans only what you tick. Zinx sweeps across the screen while she works.
- **Organize**: sorts Downloads, Desktop, Documents or any folder into Images / Videos / Music / Documents / Archives / Installers / Code / 3D. Zinx shows the plan first, carries boxes while it works, and can **undo**.
- **Find files**: searches Desktop, Documents, Downloads, Pictures, Videos, Music and OneDrive. Pick a result and Zinx opens it in Explorer, runs over and points at it.
- **Wallpaper**: paints a new wallpaper in your Zinx's colors (Synthwave, Space, Pixel hills, Glitch), picks a random photo from Pictures, or lets you choose one. **Put old back** restores your original.
- **My PC**: CPU / RAM / disk / battery check, dark or light mode, screenshot, open apps, lock the PC.
- **Tools**: timers, 25-minute focus timer, quick notes (saved to `Documents\Zinx Notes.txt`), Google / YouTube search.
- **Fun**: dance, chase your mouse, hide and seek, jokes, magic 8-ball, coin flip, dice, teleport.
- **My look**: 6 skins (Hologram, Arctic, Noir, Rose, Matrix, Gold), 5 accessories (headset, tiara, halo, cap, witch hat), 4 sizes.

### Typing commands

The menu has a text box. Examples:

```
find resume            timer 5 min            organize downloads
clean up               remind me in 10 min to stretch
synthwave wallpaper    note buy more snacks   dark mode
open calculator        youtube lofi beats     how's my pc
dance                  should I play games?   help
```

These are matched by simple patterns (no AI, free, works offline).

## Safety rules built in

- The page that draws Zinx can only ask for the named actions in `actions/index.js`. It can't run commands.
- Cleaning and organizing always show you what will happen first.
- Old installers go to the Recycle Bin. Only temp files older than a day are deleted outright, and files in use are skipped.
- Every organize writes an undo log, so **Undo** puts files back.
- Paths and text are passed to PowerShell as environment variables, never pasted into the script.

## How it's built

| File | Job |
|---|---|
| `main.js` | The see-through, click-through, always-on-top window covering the screen; tray menu; hotkeys; settings |
| `preload.js` | The bridge between the page and the PC (named actions only) |
| `src/sprites.js` | The pixel-art engine. Every frame of every animation is drawn in code, so skins and hats are just data |
| `src/renderer.js` | Zinx's brain: physics, walking, sitting on windows, drag-and-throw, menus, the action "shows" |
| `actions/*.js` | The real work: files, organize, clean, wallpaper, system, active-window tracking (PowerShell + Win32) |
| `demo/` | A browser version on a fake desktop (`node demo/build.js` builds `demo/zinx-demo.html`) |

### Animations

`idle walk run wave talk point think search sweep paint carry cheer sleep dance
dangle fall land sit work shrug love angry dizzy folder`

To add one, add an entry to `ANIMS` in `src/sprites.js`. Each frame is a pose
(arm and leg presets, eyes, mouth, prop, effects), not a hand-drawn image. To
add a skin, add an entry to `SKINS` with light/mid/shadow colors for her skin,
hair, suit, panel and boots plus a glow color (`holo: true` makes it see-through).

## Ideas for later

- Ask in plain English using Claude (needs an API key): plug it into `command()` in `src/renderer.js` and let it pick from the same named actions.
- Multi-monitor support.
- Reacting to Claude Code hooks like the TikTok helper does (a tiny local server Zinx listens on).
- More props: watering can for "clean", rocket for "speed up my PC".
