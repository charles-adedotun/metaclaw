<p align="center">
  <img src="assets/metaclaw-logo.png" alt="MetaClaw" width="400">
</p>

<p align="center">
  Container-isolated Claude agents controlled from messaging channels.
</p>

<p align="center">
  <a href="https://github.com/charles-adedotun/metaclaw/stargazers"><img src="https://img.shields.io/github/stars/charles-adedotun/metaclaw?style=flat" alt="GitHub Stars"></a>
  <a href="https://github.com/charles-adedotun/metaclaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/charles-adedotun/metaclaw" alt="License"></a>
  <a href="https://github.com/charles-adedotun/metaclaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/charles-adedotun/metaclaw/test.yml?label=tests" alt="Tests"></a>
</p>

## What MetaClaw Does

MetaClaw is a Node.js orchestrator for Claude agents. It receives messages from configured channels, stores them in SQLite, and runs Claude Code inside per-group containers. Agents can respond to chats, process scheduled tasks, use mounted skills, and request host actions through a small filesystem IPC protocol.

The project is designed for personal or small-team agent automation where the operator wants to inspect and modify the codebase directly.

Built-in channel support:

- WhatsApp via Baileys
- Telegram via grammy
- Headless operation for scheduled or local workflows

Additional channels and integrations are intended to be added through Claude Code skills.

## Architecture

```
Messaging channel
      |
      v
SQLite message store
      |
      v
Node.js orchestrator
      |
      v
Per-group container running Claude Code
      |
      v
Filesystem IPC back to host
```

The host process is responsible for channel connections, durable message storage, group queues, container lifecycle, task scheduling, outbound routing, mount validation, and IPC authorization.

Each group has its own workspace, Claude session directory, upload directory, and IPC directory. The main group has elevated access and can receive a read-only mount of the project root. Non-main groups operate with narrower mounts and separate session state.

## Core Components

| Path | Purpose |
|------|---------|
| `src/index.ts` | Starts channels, database state, polling, IPC watcher, and scheduler |
| `src/channels/whatsapp.ts` | WhatsApp connection, authentication, send, and receive |
| `src/channels/telegram.ts` | Telegram connection, send, and receive |
| `src/group-queue.ts` | Per-group container queue and stdin piping for active containers |
| `src/container-runner.ts` | Container arguments, mounts, environment filtering, and streamed output |
| `src/container-runtime.ts` | Docker and Apple Container runtime abstraction |
| `src/ipc.ts` | Host-side IPC command processing and authorization |
| `src/task-scheduler.ts` | Cron, interval, and one-shot scheduled tasks |
| `src/db.ts` | SQLite persistence for messages, groups, sessions, state, and tasks |
| `src/mount-security.ts` | Extra mount allowlist and path validation |
| `container/agent-runner/` | Wrapper that runs Claude Code inside the agent container |
| `groups/*/CLAUDE.md` | Per-group agent instructions and memory |
| `skills/*/SKILL.md` | Claude Code skills mounted read-only into containers |

## Security Model

MetaClaw treats incoming chat messages and agent behavior as untrusted. The primary security boundary is container isolation, supported by host-side validation.

Key properties:

- Agents run in containers as the unprivileged `node` user.
- Containers receive only explicit volume mounts.
- The project root is mounted read-only for the main group.
- Each group has isolated Claude session state under `data/sessions/{group}/.claude/`.
- Extra mounts are validated against an external allowlist at `~/.config/metaclaw/mount-allowlist.json`.
- Common credential paths and filenames are blocked from mounts.
- IPC commands are authorized by group identity before the host executes them.
- Container-visible environment variables are filtered to the Claude authentication values required for agent execution.

Important limitations:

- Agent containers currently have unrestricted network access.
- Claude credentials must be available inside the agent environment so Claude Code can run.
- This is not a hardened multi-tenant service. It is intended for operator-controlled deployments.

See [docs/SECURITY.md](docs/SECURITY.md) for the full trust model, mount rules, credential handling, and IPC authorization matrix.

## Message Handling

Incoming messages are written to SQLite before processing. A polling loop groups new messages by chat and dispatches work through `GroupQueue`.

If a group's container is already running, follow-up messages are written to its IPC input directory using an atomic file rename. If no container is active, MetaClaw starts a new one. If the global concurrency limit is reached, the group waits in the queue.

The agent cursor advances only after processing is handed off. On startup, MetaClaw recovers messages that were stored but not processed before shutdown.

See [docs/MESSAGE-FLOW.md](docs/MESSAGE-FLOW.md) for the detailed flow, retry behavior, timeout values, and recovery model.

## Quick Start

```bash
git clone https://github.com/charles-adedotun/metaclaw.git
cd metaclaw
claude
```

Then run:

```text
/setup
```

The setup skill installs dependencies, checks the platform, configures the selected channel, builds the container image, and installs the local service where supported.

## Requirements

- macOS or Linux
- Node.js 20+
- Claude Code
- Docker by default, or Apple Container on macOS via `/convert-to-apple-container`

## Development

```bash
npm run dev
npm run build
npm run typecheck
npm test
./container/build.sh
```

Run a single test file:

```bash
npx vitest run src/db.test.ts
```

Run skill-engine tests:

```bash
npx vitest run --config vitest.skills.config.ts
```

## Configuration

Runtime settings are read from `.env` through `src/env.ts` and `src/config.ts`. Common values include:

- `ASSISTANT_NAME`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ONLY`
- `CONTAINER_IMAGE`
- `CONTAINER_TIMEOUT`
- `IDLE_TIMEOUT`
- `MAX_CONCURRENT_CONTAINERS`

Group-specific files live under `groups/{name}/`. Optional extra mounts are declared per group and validated by the mount allowlist before a container starts.

## Skills and Customization

MetaClaw uses Claude Code skills for installation, debugging, updates, and optional integrations.

| Skill | Purpose |
|-------|---------|
| `/setup` | Initial installation and channel authentication |
| `/customize` | Guided changes to behavior, channels, integrations, or routing |
| `/debug` | Container, service, authentication, and message-flow troubleshooting |
| `/update` | Pull upstream changes, merge local customizations, and run migrations |
| `/convert-to-apple-container` | Switch the runtime from Docker to Apple Container on macOS |

Most feature changes should be implemented as skills rather than expanding the base orchestrator.

## Contributing

The base codebase accepts security fixes, reliability fixes, test coverage, documentation improvements, and clear simplifications.

For new integrations or behavior changes, prefer a Claude Code skill that transforms an installation. This keeps the core orchestrator small and gives operators explicit control over what they add.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
