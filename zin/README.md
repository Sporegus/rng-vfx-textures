# Zin

A pixel-art holographic AI assistant that lives on your Windows desktop. She
walks around, sits on top of your windows, falls off when you close them, can
be grabbed and thrown, and does real chores with a little animation for each one.

## Run it (Windows)

1. Install **Node.js** (the LTS version) from https://nodejs.org
2. Open a terminal in this `zin` folder and run:

   ```
   npm install
   npm start
   ```

Zin teleports in at the bottom-right of your screen and introduces herself.

To make a real installer (`.exe`), run `npm run dist`. The output lands in `zin/dist`.

## Using Zin

| Do this | What happens |
|---|---|
| Click Zin | Opens the menu |
| Double-click Zin | Pets Zin (hearts!) |
| Drag Zin | Picks Zin up; let go to throw |
| `Ctrl+Alt+Space` | Opens the menu from anywhere |
| `Ctrl+Alt+Z` | Hides / shows Zin |
| Tray icon (by the clock) | Skin, accessory, size, sound, wander, sit on windows, start with Windows |

### The menu

- **Clean up**: scans temp files, the Recycle Bin, and old installers in Downloads, shows sizes, and cleans only what you tick. Zin sweeps across the screen while she works.
- **Organize**: sorts Downloads, Desktop, Documents or any folder into Images / Videos / Music / Documents / Archives / Installers / Code / 3D, or A to Z, or by month if you ask. Zin shows the plan first, carries boxes while it works, and can **undo**.
- **Find files**: searches Desktop, Documents, Downloads, Pictures, Videos, Music and OneDrive. Pick a result and Zin opens it in Explorer, runs over and points at it.
- **Wallpaper**: paints a new wallpaper in your Zin's colors (Synthwave, Space, Pixel hills, Glitch), picks a random photo from Pictures, or lets you choose one. **Put old back** restores your original.
- **My PC**: CPU / RAM / disk / battery check, dark or light mode, screenshot, open apps, lock the PC.
- **Tools**: timers, 25-minute focus timer, quick notes (saved to `Documents\Zin Notes.txt`), Google / YouTube search.
- **Fun**: dance, chase your mouse, hide and seek, jokes, magic 8-ball, coin flip, dice, teleport.
- **My look**: 6 skins (Hologram, Arctic, Noir, Rose, Matrix, Gold), 5 accessories (headset, tiara, halo, cap, witch hat), 4 sizes.

### Just tell her

The menu has a text box. Type requests the way you'd say them, typos and slang
included, and several at once:

```
where tf is my resume              open spotify and play drake
organize my downloads A to Z       now do the desktop
what's hogging my disk space       find old junk in my downloads
open discord                       close chrome
go to reddit                       google how to tie a tie
turn the volume down a bit         skip this song
remind me at 5pm to pick up the kids
set a timer for 10 min             shut down my pc in 30 minutes
dark mode                          roll a d20
```

Her brain (`brain/`) is built in, free and works offline: no account, no API
key, nothing leaves your PC. It fixes typos, learns from the example phrasings
in `brain/intents.js`, pulls out the details (which folder, which song, how
long), asks when something is missing ("Which folder?"), and asks before
anything risky (closing apps, shutting down). If she isn't sure what you mean,
she says so and suggests what you might have meant instead of guessing.

To teach her a new phrasing, add an example to that ability in
`brain/intents.js` and run `node brain/test.js` (plus `brain/fresh.js` and
`brain/fresh2.js`, which are requests she was never trained on).

Apps open by their name in your Start menu, so anything installed works. Music
opens Spotify on your song (or its website if the app isn't installed); hit
play on the top result. Starting songs by itself needs Spotify Premium and is
coming next.

## Safety rules built in

- The page that draws Zin can only ask for the named actions in `actions/index.js`. It can't run commands.
- Cleaning, organizing and clearing old files always show you what will happen first.
- Old files only ever go to the Recycle Bin, and only from your own folders.
- She asks before closing apps or shutting down, restarting or sleeping the PC.
- Old installers go to the Recycle Bin. Only temp files older than a day are deleted outright, and files in use are skipped.
- Every organize writes an undo log, so **Undo** puts files back.
- Paths and text are passed to PowerShell as environment variables, never pasted into the script.

## How it's built

| File | Job |
|---|---|
| `main.js` | The see-through, click-through, always-on-top window covering the screen; tray menu; hotkeys; settings |
| `preload.js` | The bridge between the page and the PC (named actions only) |
| `src/sprites.js` | The pixel-art engine. Every frame of every animation is drawn in code, so skins and hats are just data |
| `brain/` | Understands typed requests: `intents.js` is everything she can do, `brain.js` works out which one you mean |
| `src/renderer.js` | Physics, walking, sitting on windows, drag-and-throw, menus, the action "shows", and running typed requests |
| `actions/*.js` | The real work: files, organize, clean, wallpaper, system, apps, music, volume, power, active-window tracking (PowerShell + Win32) |
| `demo/` | A browser version on a fake desktop (`node demo/build.js` builds `demo/zin-demo.html`) |

### Animations

`idle walk run wave talk point think search sweep paint carry cheer sleep dance
dangle fall land sit work shrug love angry dizzy folder`

To add one, add an entry to `ANIMS` in `src/sprites.js`. Each frame is a pose
(arm and leg presets, eyes, mouth, prop, effects), not a hand-drawn image. To
add a skin, add an entry to `SKINS` with light/mid/shadow colors for her skin,
hair, suit, panel and boots plus a glow color (`holo: true` makes it see-through).

## Ideas for later

- Spotify Premium: start songs straight away through the Spotify Web API.
- Email alerts, and moving new downloads to a folder you choose.
- An optional local AI model (runs on your PC, still free) for requests the built-in brain can't handle.
- Multi-monitor support.
- Reacting to Claude Code hooks like the TikTok helper does (a tiny local server Zin listens on).
- More props: watering can for "clean", rocket for "speed up my PC".
