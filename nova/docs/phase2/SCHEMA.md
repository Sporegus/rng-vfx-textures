# Unified schema: tasks, jobs, projects, capabilities (and migrations)

Everything lives in one SQLite database, `%APPDATA%\Nova\nova.db` (`core/store.js`, WAL, migrations in transactions). There's one store for the desktop and the phone: the phone reads and writes through the PC.

## Tables

| Table | Holds | Notes |
|---|---|---|
| `tasks` | one row per request | `id, request_id, source (typed/voice/remote/routine), text, kind (route), state, intent, created, updated, result, error`; newest 500 kept |
| `grants` | approvals | `scope_kind (task/job), scope_id, categories, targets, effects, expires, revoked, persistent`; checked in code before every tool |
| `jobs` | long-running jobs | `goal, state, contract, plan, budgets, usage, checkpoint, next_action, stop_reason, version` + **v2:** `priority, notes, context` |
| `job_events` | job history | append-only, 2000 per job |
| `outbox` | every handoff, written before sending | unique `(job_id, iteration, destination)`; states `intent → sending → sent / failed / unknown`; detail includes the result and attachment hashes |
| `leases` | who owns what | `job:<id>`, `workspace:<path>`, `desktop-input`, `reminder-fire:<id>`, `schedule:<id>:<due>`; expiry for crashed owners |
| `memory` | things you saved | `key, kind, value` (see kinds below); inspectable, exportable and deletable in the panel |
| `schedules` | scheduled job resumes | with `schedule_meta` memory for repeat/due |

### `memory` kinds

| Kind | Holds | Kind | Holds |
|---|---|---|---|
| `project` | project profiles | `notif` | Nova's notification feed (newest 300) |
| `reference` | the reference inbox | `trouble` | troubleshooting records per project+error |
| `workflow` | routines with version and history | `remote_device` | paired phones (secret stored hashed) |
| `workflow_undo` | what to restore on "end" | `remote_audit` | what phones did (newest 500) |
| `reminder` | durable reminders | `remote_req` | phone request IDs for dedupe (newest 1000) |
| `app_alias` | your app names (with provenance) | `game_goal` | your game goals |
| `discord_target` | confirmed Discord places | `game_routine` | recorded game routines |
| `roblox_place` | saved experiences | `file_undo` | file move journals |

## Migrations

| Version | Change |
|---|---|
| 1 | The first schema (Phase 1) |
| 2 | `jobs.priority`, `jobs.notes`, `jobs.context` |

Upgrades run automatically on start, inside a transaction. An existing v1 database keeps its jobs; this is tested in "an existing v1 database upgrades in place".

## Job record (contract excerpt)

```jsonc
{ "goal": "...", "state": "draft|queued|running|waiting_on_assistant|verifying|paused|blocked|completed|cancelled|failed",
  "priority": "high|normal|low", "notes": "...",
  "contract": { "workspace", "criteria": [], "files": [], "testCommand": [], "participants": [{ "id", "role" }], "constraints": [], "deadline", "restartResume", "sharing", "testEnv" },
  "budgets": { "maxHours": 8, "maxCycles": 20, "maxRetries": 2, "noProgressCycles": 3, "maxSpendUsd": null },
  "usage": { "cycles", "noProgress", "replans", "contradictions", "spendUsd", "tokens", "started", "startRev" },
  "context": { "goal", "criteria", "constraints", "done", "open", "checks", "next" },     // what a fresh session continues from
  "checkpoint": { "review", "fingerprint", "verdicts": { "<revision>": "accept|reject" }, "finalCheck" } }
```

## Project profile

```jsonc
{ "id", "name", "aliases": [], "folders": ["C:\\..."], "launch": [{ "kind": "app", "name" } | { "kind": "folder|file", "path" } | { "kind": "url", "url": "https://..." }],
  "constraints": [], "decisions": [], "task", "next", "blockers": [], "notes": [{ "text", "kind", "source", "at" }],
  "checks": [{ "name", "command": [], "cwd" }] }
```

Permissions are never stored in a profile.

## Capability entry (`core/capabilities.js`)

```jsonc
{ "id", "name", "does", "inputs", "outputs", "tool", "needs": [], "errors": "how it fails / stops",
  "tested": "last real evidence", "status": "ready|unavailable|experimental|blocked", "why": "live reason" }
```
