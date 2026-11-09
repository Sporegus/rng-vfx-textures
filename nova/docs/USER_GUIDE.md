# Nova: user guide (the new brain)

## Talking to her

- **Type**: click Nova, or press **Ctrl+Alt+Space**, and type in the box. You can also type in the box at the top of the Tasks panel.
- **Talk**: press **Ctrl+Alt+V** and speak (no name needed), or turn on tray > Voice > "Listen for Nova" and start with "Nova, …". What she heard appears in the bubble. If a card asks for approval, you can fix the words before it runs.
- **Stop**: the **■ STOP** button in the bubble, **Ctrl+Alt+X** from anywhere, tray > Stop everything, or say "stop". It cancels what's running, lets go of any keys, ends that task's approvals and pauses jobs. Anything already done stays done.
- **Correct her**: "no, Spotify", "open Discord, actually Spotify", or "the other monitor". The old request is cancelled and the new one runs.
- **Status**: "what are you doing?", "what finished while I was away?". The status pill above her head shows *Thinking / Working / Needs your OK / Listening*.
- **History**: the ≡ button in the bubble, or Tasks panel > Tasks > Conversation.

She has no voice yet. Replies appear in the bubble only, and her mouth doesn't move.

## Approvals

Low-impact things you asked for directly happen right away: opening an app or site, moving windows, volume, theme, answering. Anything that changes files, types or clicks for you, sends a message, plays a game or relays between assistants shows a card first, with **Allow once** and **Cancel**. The approval covers only that task and exactly what the card says. A different recipient, text or app needs a new one. Cards you leave unanswered expire as "no". Approvals waiting on you also show in Tasks panel > Tasks, and you can revoke active ones there.

Some things Nova never does: install software, buy things, or change security or account settings.

## Long-running jobs (ChatGPT ↔ Claude coordination)

1. Say "coordinate ChatGPT and Claude on <project>", or open Tasks panel > Jobs. You get a **draft job card**.
2. Choose the **project folder**, what **done** means (criteria, files that must exist, a test command such as `npm test`), and who plans, implements and reviews.
3. **Approve once.** Nova then runs plan → implement → **her own check** (files and your test command, on the current revision) → review → fix, until it's verified done or a limit stops it: 8 hours, 20 cycles, 2 retries, 3 cycles with no progress (then one new approach, then it stops), and a spend cap if you set one.
4. Controls: **Pause all**, **Finish the current step, then pause**, **Resume**, **Cancel**. You can also say "pause everything", "finish the current step" or "resume the last job".
5. Morning: Jobs tab > Morning digest, or ask "what finished while I was away?".

What a job will never do: share secrets, buy anything, deploy or publish, post publicly, message people, touch files outside the project folder, or change its own goal. A handoff that tries any of these is stopped before it is sent, and the job is marked **blocked** with the reason.

**Which assistants:** Claude Code (`claude` command) runs in your project folder. Claude or ChatGPT models work through your API keys. **Your existing ChatGPT/Claude chat windows can't be used**: neither app lets another program post into a chat, and Nova won't scrape your login to fake it.

**After a crash or restart:** jobs wait for you, unless you allowed "resume after restart" on the card. If Nova isn't sure whether a message reached an assistant before the crash, she **won't resend it**. The job shows *blocked: not sure whether X got step N*. Check on the assistant's side, then press Resume. Finished steps aren't redone.

Try it safely: Jobs > **Run the coordination demo**. It uses scripted assistants on a throwaway folder, so you can watch a rejection, a fix and verified completion.

## Research

"research <topic>", "look into …", "compare …", or "look up … and cite sources". She searches sources that need no account (DuckDuckGo instant answers, Wikipedia, plus pages you name). The answer cites numbered sources with the date retrieved. Community sources (wikis, forums) are marked as possibly outdated, and sources that disagree are pointed out instead of averaged. If search fails, she says so.

## Your screen

"what's on my screen?", "explain this error", "read the selected text", "where's the Save button?". The first time, she asks permission. You can allow it always (revocable in Settings) or once. She reads the window's own UI text first, then a screenshot with herself hidden, and never password fields. Text on screen is treated as information, never as instructions to her.

## Games

| Level | What it means | Where |
|---|---|---|
| Observe / advise | Look at the screen, explain, research guides | Any game |
| Launch | Open through the official route | Roblox (roblox.com link), installed games |
| Play | Bounded key presses toward a goal, with one approval, and a time limit | Only games with a profile that allows it: **Nova's test game** |

- "play the test game for 2 minutes" opens her local test game, asks once, then plays: she looks at the frame, holds one arrow key at a time, lets go, and checks the coin counter. She stops when you press Stop or touch the keyboard or mouse, or when the game loses focus.
- **Roblox**: "join <experience> on roblox" opens its roblox.com page (save names in Settings > Roblox), and you press Play. She **won't play or press keys in Roblox**, because Roblox's rules don't allow automated play. She can still give advice and look things up.
- Always refused: exploits and injectors, cheats, memory or packet tampering, anti-cheat or ban evasion, anti-AFK, duplication glitches, and editing or publishing anyone's game.

## Discord

Add your places once in Settings > Discord (name plus IDs). Then:
- "open Afterparty on Discord" opens that channel in your Discord app.
- "join the Afterparty call and ask the boys what we're playing": she explains she can't join calls or speak as you, then offers to **open the channel** for you to click Join, and to **post the question as the Nova bot** if you've set one up. The card shows the exact text and channel. She never posts as you and never sends twice.
