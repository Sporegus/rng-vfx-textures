# Nova

A pixel-art holographic AI assistant that lives on your Windows desktop. She
walks around, sits on top of your windows, falls off when you close them, can
be grabbed and thrown, and does real chores with a little animation for each one.

## Run it (Windows)

1. Install **Node.js** (the LTS version) from https://nodejs.org
2. Open a terminal in this `nova` folder and run:

   ```
   npm install
   npm start
   ```

Nova teleports in at the bottom-right of your screen and introduces herself.

To make a real installer (`.exe`), run `npm run dist`. The output lands in `nova/dist`.

## Using Nova

| Do this | What happens |
|---|---|
| Click Nova | Opens the menu |
| Double-click Nova | Pets Nova (hearts!) |
| Drag Nova | Picks Nova up; let go to throw |
| `Ctrl+Alt+Space` | Opens the menu from anywhere |
| `Ctrl+Alt+Z` | Hides / shows Nova |
| Tray icon (by the clock) | Skin, accessory, size, sound, wander, sit on windows, start with Windows |

### The menu

- **Clean up**: scans temp files, the Recycle Bin, and old installers in Downloads, shows sizes, and cleans only what you tick. Nova sweeps across the screen while she works.
- **Organize**: sorts Downloads, Desktop, Documents or any folder into Images / Videos / Music / Documents / Archives / Installers / Code / 3D, or A to Z, or by month if you ask. Nova shows the plan first, carries boxes while it works, and can **undo**.
- **Find files**: searches Desktop, Documents, Downloads, Pictures, Videos, Music and OneDrive. Pick a result and Nova opens it in Explorer, runs over and points at it.
- **Wallpaper**: paints a new wallpaper in your Nova's colors (Synthwave, Space, Pixel hills, Glitch), picks a random photo from Pictures, or lets you choose one. **Put old back** restores your original.
- **My PC**: CPU / RAM / disk / battery check, dark or light mode, screenshot, open apps, lock the PC.
- **Tools**: timers, 25-minute focus timer, quick notes (saved to `Documents\Nova Notes.txt`), Google / YouTube search.
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
`brain/intents.js` and run `npm test` (which also runs requests she was never
trained on, and what the speech models actually heard when saying her name).

Apps open by their name in your Start menu, so anything installed works. Music
opens Spotify on your song (or its website if the app isn't installed); hit
play on the top result. Starting songs by itself needs Spotify Premium and is
coming next.

She also answers everyday questions straight away: "what time is it",
"what's 15% of 80", "what's the weather" (she asks your city once and
remembers it).

### Talk to her

Say **"Nova"** and then what you want, like Siri:

```
Nova, play God Did by DJ Khaled         Nova, open Roblox
Hey Nova, what's the weather tomorrow?  Nova, remind me at 5pm to call mom
Nova… (she says "Yes?") …what time is it?
```

She answers out loud in her own voice, **Nova**, with feeling: excited when she
finds something, sad when she can't, shy when you thank her, pouty when you
throw her around. After she answers she keeps listening
for a few seconds so you can reply without saying her name again. Turn it on
from **Voice & chat** in her menu or **Voice** in the tray. Other ways to talk:
**Ctrl+Alt+V** listens once without her name (push to talk), and "stop talking"
or "stop listening" do what they say.

The first time, she downloads her ears and voice (about 650 MB, once). They are
free, open models that run on your PC, so nothing you say is sent anywhere:

| Part | Model | Notes |
|---|---|---|
| Notices talking | Silero VAD | Tiny; only listens for when speech starts and stops |
| Ears | NVIDIA Parakeet TDT 0.6B (int8) | The most accurate one we tested; a 3 s request takes about 0.4 s. **Smaller speech model** in the tray switches to Moonshine tiny for slow PCs |
| Voice | ZipVoice (distilled, int8) + Vocos | **Nova**, her own voice: it copies the voice and mood of the clips in `voice/nova` (a voice made on ElevenLabs), free and offline. About 1 s to start talking on a typical PC |
| Other voices (optional) | Kokoro v1.0 | Six steady stock voices; downloaded (350 MB) only if you pick one |
| Extra expressive voices (optional) | Kyutai Pocket TTS | **Sparkle, Mochi, Luna**: more feeling, but the voice drifts a little between sentences. Downloaded (98 MB) only if you pick one |

**Pixie** was made for Nova: a search over blends of Kokoro's 54 voices for the one
that sounds most like a real speaker with a bright, cute voice (EARS speaker
p062), scored by a speaker-identity model plus a bright pitch (240 Hz or more),
lively intonation and every word understood, at a 10% quicker pace. On
sentences it was never tuned on, graded by a second, independent speaker model:

| | Pitch | Same person every sentence | Sounds like the real speaker | Words heard right |
|---|---|---|---|---|
| Pixie | 222 Hz | 0.85 | 0.74 | 98% |
| First Pixie (too low and slow) | 164 Hz | 0.88 | 0.69 | 98% |
| Expressive (Pocket TTS) | – | 0.54 | 0.58 | 95% |
| Stock Kokoro voice | 171 Hz | 0.89 | 0.55 | 98% |

**Your own ElevenLabs voice (online).** If you made a voice on ElevenLabs, Nova
can use it: **Voice & chat → Change my voice → Use my ElevenLabs voice**, or
**Voice → Set up my ElevenLabs voice…** in the tray. Paste your API key (ElevenLabs
→ My Account → API Keys) and the voice's ID, and pick a model: *Quick* starts
talking fastest, *Natural* is smoother, *Expressive (v3)* has the most feeling and
turns her giggles and sighs into real ones. The key is encrypted with Windows'
own protection and kept out of settings.json and Nova's page. Only what she
*says* is sent to ElevenLabs (it uses your character credits); listening and
thinking stay on your PC. If ElevenLabs can't be reached or the credits run out,
she says it in her own free voice instead.

**Natural voices (Orpheus, needs a graphics card).** Tara, Leah, Jess, Mia and Zoe
use Orpheus TTS, a 3B voice model that sounds far more natural and can giggle,
laugh, sigh and gasp (the chat brain adds those where they fit). It runs on the
graphics card through llama.cpp, needs about 2.5 GB of downloads, and has to make
84 sound tokens a second to talk without pausing; an RTX 2070 or better should
manage. Try them first with:

```
npm run voice-check
```

It downloads the models, measures your graphics card, and saves a sample of each
voice to "Nova voice check" on your Desktop. Pick one under **Voice** in the tray.
If a natural voice can't keep up on your PC, Nova says so; her own voice is the quick one.

Moods (cute, happy, excited, sad, calm, confused, proud, pouty, shy, love) change
how she says things: a little faster, higher and louder when excited, slower and
softer when sad, quieter when shy. It stays one voice, so it's seamless. She
picks the mood from what she's saying ("Sorry, I couldn't find it" is sad, "All
sorted!" is proud); with the chat brain on, it chooses a mood for every
sentence. Her animation follows the mood too. Voice files live in
`voice/styles` (one 510 x 256 Kokoro voice each); add one and it appears as a
voice of that name.

Pixie and the expressive voices' mood clips come from the EARS dataset, which is
licensed for **non-commercial use only** (see `voice/emotions/LICENSE.md`). Nova
can't be sold with them; to sell her, use the stock voices or make a voice from
recordings you own.

While she listens, Windows shows its microphone icon in the taskbar. The sound
stays in memory just long enough to be turned into text, and is never saved.

### Chat brain (optional)

With the chat brain on, she can actually hold a conversation, answer general
questions, remember things you tell her ("my name is Sam", "I love DJ Khaled"),
and work out trickier requests ("do I need an umbrella?" checks the weather).
It's a free open AI model (Qwen) that runs on your PC through llama.cpp, a
one-time download of about 1 GB, or 2.5 GB on PCs with 12 GB of memory or more.
It uses your graphics card if it can and the processor if not.

The chat brain can't do anything by itself: when it wants something done, it
writes a plain request ("open roblox") that goes through the same command brain
and safety rules as anything you type. Simple commands skip it entirely, so they
stay instant. Turn it on in **Voice & chat**; **Forget what I told her** in the
tray clears her memory. Tinkerers can set `chatModel` in `settings.json` to any
`.gguf` file or `hf:` model name.

## Safety rules built in

- The page that draws Nova can only ask for the named actions in `actions/index.js`. It can't run commands.
- Cleaning, organizing and clearing old files always show you what will happen first.
- Old files only ever go to the Recycle Bin, and only from your own folders.
- She asks before closing apps or shutting down, restarting or sleeping the PC.
- Old installers go to the Recycle Bin. Only temp files older than a day are deleted outright, and files in use are skipped.
- Every organize writes an undo log, so **Undo** puts files back.
- Paths and text are passed to PowerShell as environment variables, never pasted into the script.
- Voice and chat run on your PC. The only things that go online are the one-time model downloads and, when you ask about the weather, the name of your city.

## How it's built

| File | Job |
|---|---|
| `main.js` | The see-through, click-through, always-on-top window covering the screen; tray menu; hotkeys; settings |
| `preload.js` | The bridge between the page and the PC (named actions only) |
| `src/sprites.js` | The pixel-art engine. Every frame of every animation is drawn in code, so skins and hats are just data |
| `brain/` | Understands typed requests: `intents.js` is everything she can do, `brain.js` works out which one you mean |
| `src/renderer.js` | Physics, walking, sitting on windows, drag-and-throw, menus, the action "shows", and running typed requests |
| `voice/` | Her voice: `wake.js` spots her name, `speech.js` is her ears and mouth, `mind.js` the chat brain, `service.js` runs them in a background process, `models.js` downloads them |
| `src/voice.js` | Microphone in and speaker out for the page |
| `actions/*.js` | The real work: files, organize, clean, wallpaper, system, apps, music, volume, power, weather, active-window tracking (PowerShell + Win32) |
| `demo/` | A browser version on a fake desktop (`node demo/build.js` builds `demo/nova-demo.html`) |

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
- Multi-monitor support.
- Reacting to Claude Code hooks like the TikTok helper does (a tiny local server Nova listens on).
- More props: watering can for "clean", rocket for "speed up my PC".
