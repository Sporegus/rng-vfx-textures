# Nova work queue and resume record

This file says what is being worked on, in what order, and how to pick it up after an interruption (context loss, a new session, a restart). Keep it current: update the "Now" line and the step checklist at every commit.

## Order (mandatory)

1. **Phase 1**: the overnight brain build, from `docs/phase2/PHASE1_PROMPT_REV2.txt` (REVISION 2, the version actually received; REVISION 3 was never received).
2. **Phase 1 completion gate**: map every requirement to code, test and result. Fix fixable failures. Record the evidence and a checkpoint commit in `PHASE1_COMPLETION_GATE.md`.
3. **Phase 2**: `docs/phase2/PHASE2_PROMPT.txt`. Starts only after the gate passes, then runs P2-A to P2-H without stopping for routine choices. Requirements that REVISION 3 may have added (mic selection, right-click menu, reasoning modes, resource profiles, bounded animation buffers) are done in Phase 2, as that prompt says.

## Now

- [x] Phase 1 build: commits 7521b62 → 24afa7e on `zinx-desktop-helper` (see NOVA_MORNING_REPORT.md)
- [x] Phase 1 remaining fixable items (quit crash, mic selection/test, shortcuts, bubble copy/links, speech output interface, game stalls/menus, routine recording, job priority/questions/summary/notes/diff, Discord disconnects, app names)
- [x] PHASE1_COMPLETION_GATE.md written: PASSED with external blockers recorded; checkpoint = commit "Phase 1 completion gate"
- [ ] Phase 2: P2-A audit + benchmark baseline
- [ ] P2-B routing, retrieval, cancellation, caching, resources, performance modes
- [ ] P2-C right-click menu, settings, unified task/project/reference interfaces
- [ ] P2-D conversation, project memory, workflows/routines, notifications, file/content tools
- [ ] P2-E mobile dashboard + secure local pairing
- [ ] P2-F mobile ↔ jobs, handoff/recovery evidence
- [ ] P2-G game coaching/research/capability reporting
- [ ] P2-H acceptance, security, recovery, visual, resource checks; deliverables

## How to resume

1. `git log --oneline -15` on `zinx-desktop-helper`; the newest commit message says which step it finished.
2. Read this file's "Now" list, then the newest of `PHASE1_COMPLETION_GATE.md`, `docs/phase2/PHASE2_REQUIREMENTS_MATRIX.md`, `NOVA_PHASE2_HANDOFF.md`.
3. Run `npm run test:core` in `nova/` (all must pass) before changing anything.
4. Continue with the first unchecked step. Don't restart, reset or replace the existing stack.

## Standing boundaries (both phases)

No contacting friends, real Discord messages or calls, automated real gameplay, publishing, or paid live assistant relays to demo progress. No editing BLACK SUN or other games. No secrets in chat, files, logs or commits. Never disturb the user's other Claude session (Roblox game).
