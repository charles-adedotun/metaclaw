# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# MetaClaw

AI Chief of Staff framework. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to WhatsApp and/or Telegram, routes messages to Claude Agent SDK running in Docker containers. Each registered group gets an isolated container with its own filesystem and memory (session ID). The main group (`groups/main/`) has elevated access — its container gets the project root mounted read-only at `/workspace/project`.

## Development Commands

```bash
npm run dev          # Run with hot reload (tsx, no compile step)
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting
npm test             # Run all tests (vitest)
npm run format       # Prettier format src/**/*.ts
./container/build.sh # Rebuild agent container image (metaclaw-agent:latest)
```

Run a single test file:
```bash
npx vitest run src/db.test.ts
```

Run skill tests (separate config):
```bash
npx vitest run --config vitest.skills.config.ts
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.metaclaw.plist
launchctl kickstart -k gui/$(id -u)/com.metaclaw  # restart

# Linux (systemd)
sudo systemctl restart metaclaw
```

## Architecture

### Host process (`src/`)

`src/index.ts` is the orchestrator. On startup it:
1. Calls `initDatabase()` → creates SQLite tables in `store/messages.db`
2. Loads state (last seen timestamp, session IDs, registered groups) from DB
3. Connects channels (Telegram via grammy, WhatsApp via Baileys)
4. Starts three concurrent loops: message poller, IPC watcher, task scheduler

**Message flow:**
1. Channel receives message → stored in `store/messages.db` via `storeMessage()`
2. Poll loop (`startMessageLoop`) picks up new messages every 2s
3. If group has an active container, message is piped to its stdin via `GroupQueue`
4. Otherwise, `GroupQueue` spawns a new container via `runContainerAgent()`
5. Container output is streamed back and sent to the user via the channel

**Key modules:**
| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp via Baileys |
| `src/channels/telegram.ts` | Telegram via grammy |
| `src/group-queue.ts` | Serializes per-group container lifecycle; pipes stdin to active containers |
| `src/container-runner.ts` | Builds docker run args, volume mounts, streams output |
| `src/container-runtime.ts` | Docker/Apple Container abstraction, orphan cleanup |
| `src/ipc.ts` | Polls `data/ipc/{group}/` for agent-written commands (send_message, send_file, register_group, schedule_task) |
| `src/task-scheduler.ts` | Cron/interval task runner — fires scheduled prompts as container invocations |
| `src/db.ts` | All SQLite ops against `store/messages.db` |
| `src/router.ts` | Message formatting (XML prompt construction) and channel routing |
| `src/mount-security.ts` | Validates extra volume mounts against an allowlist |
| `src/config.ts` | All config values; reads `.env` via `src/env.ts` |

### Container agent (`container/`)

The Docker image (`metaclaw-agent:latest`) runs Claude Code via `@anthropic-ai/claude-code`. The agent-runner (`container/agent-runner/`) wraps Claude Code, reading a JSON prompt from stdin and streaming results back via stdout using sentinel markers (`---METACLAW_OUTPUT_START---` / `---METACLAW_OUTPUT_END---`).

**Container volume mounts (per group):**
- `/workspace/project` — project root, read-only (main group only)
- `/workspace/group` — `groups/{name}/` — writable group workspace
- `/workspace/ipc` — `data/ipc/{name}/` — agent writes IPC commands here
- `/workspace/uploads` — `data/uploads/{name}/` — incoming file attachments
- `/home/node/.claude` — `data/sessions/{name}/.claude` — Claude session persistence
- `/home/node/.claude/skills` — `skills/` — read-only skill mount (overlays session dir)
- Extra mounts declared in `groups/{name}/config.json` (validated by allowlist)

**Container skills** (`skills/`): mounted read-only into containers at `/home/node/.claude/skills/`. Claude Code SDK auto-discovers them. Single source of truth — no separate `container/skills/` directory.

### IPC protocol

Agents communicate back to the host by writing JSON files to `/workspace/ipc/messages/`. The host polls this directory every 1s. Supported commands: `send_message`, `send_file`, `register_group`, `schedule_task`, `get_task_result`, `list_groups`, `sync_groups`.

**Task outcomes:** After each scheduled task run, the host writes `data/ipc/{group}/task_outcomes.json` with recent outcomes and stats. Agents read this from `/workspace/ipc/task_outcomes.json`. Main group sees all outcomes; other groups see only their own.

**IPC dedup:** When a container sends an IPC `send_message` targeting its own group's chat, the message is suppressed — stdout streaming already delivers output to the user. IPC `send_message` only fires for cross-group messaging (e.g., main group sending to a different chat).

### Groups and skills (`groups/`, `skills/`)

- `groups/{name}/CLAUDE.md` — per-group system prompt (the agent's identity and instructions)
- `groups/{name}/config.json` — optional extra volume mounts for this group
- `skills/{name}/SKILL.md` — skill definitions (mounted into containers at `/home/node/.claude/skills/`, also readable by main group via `/workspace/project/skills/`)

### Database

Single SQLite file at `store/messages.db`. Key tables: `messages`, `chats`, `registered_groups`, `sessions`, `scheduled_tasks`, `task_run_logs`, `router_state`.

The `scheduled_tasks` table uses `schedule_type` of `cron` (cron expression), `interval` (ms), or `once` (ISO timestamp). `context_mode` is `isolated` (fresh container) or `continuous` (reuses session).

## Container Build Cache

`--no-cache` alone does NOT invalidate COPY steps — buildkit's volume retains stale files. To force a clean rebuild:
```bash
docker buildx prune -f && ./container/build.sh
```

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update` | Pull upstream MetaClaw changes, merge with customizations, run migrations |

## Environment

Config is read from `.env` (project root) via `src/env.ts`. Key variables: `ASSISTANT_NAME`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ONLY`, `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `IDLE_TIMEOUT`, `MAX_CONCURRENT_CONTAINERS`. Secrets (API keys passed into containers) are read from `.env` only in `container-runner.ts` — not exported to child processes.
