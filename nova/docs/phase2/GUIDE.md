# Settings, modes and your phone: a short guide

## Right-click Nova

**Talk** · **Reasoning mode** · **Performance profile** · **Tasks…** · **Pause / Resume Nova** · **Microphone** (push to talk, listen for "Nova", mute, pick and test a mic) · **Settings…** · **Hide** · **Quit**. The tray icon has the same modes plus Skin, Size and Monitor.

## Reasoning mode: how much effort an answer gets

| Mode | What it really changes |
|---|---|
| **Auto** (default) | Picks per request: short or direct questions get Quick; "why / how / plan / debug" get Think; "research / compare / in depth" get Thorough. If a Quick answer says it isn't sure, it gets one Think retry. |
| **Quick** | Short answers in one call (up to 500 output tokens). |
| **Think** | Step-by-step in one call (up to 1,500 tokens). |
| **Thorough** | Gathers sources first (when research is available), answers (up to 3,000 tokens), then runs one review pass that marks inference. At most 2 model calls. |

These use your configured model. They don't switch to hidden "smarter" models, and they don't change permissions. Simple commands ("mute", "open Spotify") never go to a model at all.

## Performance profile: how hard Nova works in the background

| Profile | Background jobs at once | Wandering and effects |
|---|---|---|
| **Gaming** | 0 (queued jobs wait; a running one finishes its step) | off |
| **Balanced** (default) | 1 | on |
| **Overnight** | 2 | on |

Independently of the profile, when your PC is low on memory or the CPU stays busy, new background jobs wait and the status says why. Your requests and Stop are never held back. Job helper processes always run at below-normal priority.

**Pause Nova** stops listening, starts no background jobs, pauses running ones and keeps her still. **Resume** puts it all back.

## Routines

Say "start gaming mode" / "end gaming mode" (also Study, Development, Wind down). The first card shows every step, and which ones can't be undone; you approve that run. "Always for this version" is your choice, and editing the routine cancels it. "save that as my stream setup" turns what she just did into a routine. Manage routines in Tasks panel > Routines.

## Your phone

1. **Turn it on (on the PC):** Tasks panel > **Phone** > *Listen on* > **My home network**. Windows may ask once whether to allow Nova on private networks; Nova doesn't change any firewall rules itself. Use *This PC only* to try it on the PC first.
2. **Pair:** press **Pair a phone**. It shows an address like `https://192.168.1.20:47620` and a 6-digit code (2 minutes, one use).
3. **On the phone** (same Wi-Fi), open the address in Safari. It warns that the certificate isn't trusted. That's expected for your own PC: check that the fingerprint matches the one in the panel, then continue. Enter the code.
4. **On the PC**, Nova asks "Pair … with Nova?". Choose **Allow once**.
5. **Optional:** in Safari tap Share > **Add to Home Screen** for an app-like icon.

**What the phone can do:**
- See what she's doing and the jobs.
- Send instructions.
- Answer approvals, which must match the exact card on the PC.
- Pause, resume and cancel jobs.
- Download a finished job's deliverables.
- Read "what you missed".
- Press **Stop**. It says "stopped" only after the PC confirms.

**What it can't do:** see your screen, hear your microphone, or change Nova's settings and permissions.

**Safety:**
- A Stop on the PC makes anything the phone sent based on older state stale, so you're asked to look again.
- Removing a phone (Tasks panel > Phone > Remove) cuts it off immediately.
- Pairing lasts 30 days.
- Everything phones do is listed under "What phones did".

**Away from home:** Nova doesn't create public access. If you set up a VPN such as Tailscale yourself, choose *Another address I set up* and enter its address. That path hasn't been tested yet.

## Projects and references

- **Tasks panel > Projects:** name, folders, apps/links to open, constraints, current task, next action, blockers, and a check command (used by "why isn't X working?"). Then say "let's work on X".
- **References:** copy an image or link, then say "save this image as an armour reference". Say "find the mask reference I saved" to get it back. Each project's references and notes stay separate.

## Everyday

- **Reminders:** "remind me at 5pm to …". They survive restarts and sleep. You can list and cancel them.
- **"What did I miss?"** gives a digest of Nova's own events. Set what counts as important in Settings. Windows notifications aren't readable by this build.
- **Files:** "find duplicate files in my downloads" checks by content and moves extras to the Recycle Bin only after you approve.
- **Documents:** "save that as a PDF" / Word / Excel / CSV / chart. Files go to `Documents\Nova` and are checked after writing.
- **Reading files:** "summarize C:\path\file.pdf", or copy a file in Explorer and say "summarize the file I copied". Table totals are computed exactly.
- **Troubleshooting:** "why isn't <project> working?", then "fix it" (an approved job) and "check again".
- **Settings > Appearance:** bubble text size.
- **Memory tab:** "Export everything Nova remembers…".
