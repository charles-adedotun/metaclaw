# Message Flow: How Multiple Messages Are Handled

This document explains what happens from the moment a Telegram message arrives to the agent responding, including how concurrent and batched messages are handled.

---

## Overview

```
Telegram → SQLite → Poll Loop → GroupQueue → Agent Container
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
               Path A:         Path B:         Path C:
           No container    Container       At concurrency
             → spawn        active           limit
                           → pipe           → queue
```

---

## Step 1: Message Arrives (Instant)

The Telegram bot handler (grammy) fires immediately when a message is received. It calls `storeMessage()` which writes the message to SQLite synchronously. The message is persisted before the bot handler returns.

This means **no messages are ever lost at ingestion** — they hit the database before any processing begins.

---

## Step 2: Poll Loop (every 2 seconds)

`startMessageLoop()` in `src/index.ts` runs an infinite loop with a 2-second sleep between iterations (`POLL_INTERVAL = 2000ms`).

Each iteration:
1. Calls `getNewMessages()` — fetches all messages with timestamp > `lastTimestamp` across all registered groups
2. Advances `lastTimestamp` to the latest message seen (the "seen" cursor)
3. Groups messages by `chat_jid`
4. For each group, checks whether any message contains the trigger word (`@Assistant`)
5. Non-trigger messages are stored but skipped — they will be included as context when the next trigger arrives

**Key detail:** There are two cursors:
- `lastTimestamp` — "what the poll loop has seen" — advances immediately
- `lastAgentTimestamp[chatJid]` — "what an agent has processed" — advances only after a successful agent run

If two messages arrive within the same 2-second poll window, they are fetched together and treated as a batch.

---

## Step 3: Three Paths

### Path A — No active container → Spawn

```
queue.sendMessage(chatJid, text) → returns false (no active container)
→ queue.enqueueMessageCheck(chatJid)
→ GroupQueue.runForGroup()
→ processGroupMessages()
→ runContainerAgent() [docker run ...]
```

`processGroupMessages()` fetches all messages since `lastAgentTimestamp` (not just the current batch), so any context that accumulated since the last agent run is included.

The cursor (`lastAgentTimestamp`) is advanced **before** the agent runs. If the agent fails without sending any output, the cursor is **rolled back** so the next retry can re-process the messages.

### Path B — Container already running → Pipe

```
queue.sendMessage(chatJid, text) → returns true
→ Writes JSON file to data/ipc/<group-folder>/input/<timestamp>.json
→ Container reads it via IPC watcher (1s poll inside container)
→ Agent receives it as a new user turn
```

The IPC write uses an atomic `rename()` (write to `.tmp` then rename) so the container never reads a half-written file.

When piping succeeds, `lastAgentTimestamp` is also advanced immediately (no rollback path here — the message is already delivered to the container's stdin).

### Path C — At concurrency limit → Queue

```
queue.enqueueMessageCheck(chatJid)
→ activeCount >= MAX_CONCURRENT_CONTAINERS (default: 5)
→ state.pendingMessages = true
→ groupJid added to waitingGroups[]
```

When any container finishes, `drainGroup()` checks `pendingMessages` and `waitingGroups`, then runs the next group's container.

---

## Container Lifetime

Once spawned, a container stays alive for up to 30 minutes after its last result (`IDLE_TIMEOUT = 1800000ms = 30min`). During this window:

- New messages to the same group are **piped** (Path B), not spawned fresh
- The idle timer resets each time a result arrives from the agent
- When the idle timer fires, a `_close` sentinel file is written to the IPC input directory, signaling the container to wind down gracefully

This 30-minute window is why a quick follow-up message (like "actually, can you also…") gets processed by the same container without spawning overhead.

`CONTAINER_TIMEOUT` is also 30 minutes — a hard SIGKILL safety net in case the container hangs. Currently both timers fire at the same time (Known Issue #2 in DEBUG_CHECKLIST.md).

---

## Startup Recovery

On startup, `recoverPendingMessages()` runs before the message loop starts:

```
for each registered group:
  fetch messages since lastAgentTimestamp[chatJid]
  if any found → queue.enqueueMessageCheck(chatJid)
```

This handles the crash scenario where `lastTimestamp` was advanced (messages "seen") but the agent never ran (power loss, OOM kill, etc.). The agent cursor (`lastAgentTimestamp`) is behind, so those messages are re-queued automatically.

---

## Error Handling and Retries

If `processGroupMessages()` returns `false` (agent error):
- `GroupQueue.scheduleRetry()` is called
- Retry uses **exponential backoff**: `5s × 2^(retryCount-1)`
- Max 5 retries, then the messages are dropped (they'll be re-queued on the next incoming message)
- The cursor is rolled back before retry (see Path A above)

---

## Key Config Values

| Variable | Default | Effect |
|----------|---------|--------|
| `POLL_INTERVAL` | `2000ms` | How often the message loop checks SQLite |
| `IDLE_TIMEOUT` | `1800000ms` (30min) | How long container stays alive after last result |
| `CONTAINER_TIMEOUT` | `1800000ms` (30min) | Hard kill timeout for stuck containers |
| `MAX_CONCURRENT_CONTAINERS` | `5` | Max simultaneous Docker containers |
| `IPC_POLL_INTERVAL` | `1000ms` | How often the container checks for piped messages |

All are configurable via environment variables in `.env`.

---

## SQLite as the Buffer

Because all messages are written to SQLite immediately (Step 1) and the agent cursor (`lastAgentTimestamp`) only advances after successful processing, SQLite acts as a durable queue. Even if the Node.js process crashes between receiving a message and processing it, the message survives in the database and is recovered on next startup.
