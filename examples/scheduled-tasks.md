# Example Scheduled Tasks

MetaClaw supports scheduling recurring tasks that run Claude agents automatically. Tasks are created via the IPC protocol from within agent containers.

## Task Types

| Type | Format | Example |
|------|--------|---------|
| `cron` | Standard cron expression | `0 8 * * *` (daily at 8 AM) |
| `interval` | Milliseconds | `3600000` (every hour) |
| `once` | ISO timestamp | `2025-03-15T09:00:00Z` |

## Example Configurations

### Morning Briefing (Daily at 8 AM)
```json
{
  "type": "schedule_task",
  "task_id": "morning-briefing",
  "targetJid": "tg:YOUR_CHAT_ID",
  "prompt": "Give me a morning briefing. Cover today's calendar, pending tasks, and anything I should know about.",
  "schedule_type": "cron",
  "schedule_value": "0 8 * * *",
  "context_mode": "isolated"
}
```

### Weekly Recap (Sundays at 5 PM)
```json
{
  "type": "schedule_task",
  "task_id": "weekly-recap",
  "targetJid": "tg:YOUR_CHAT_ID",
  "prompt": "Weekly recap: summarize this week's activity, open items, and preview next week.",
  "schedule_type": "cron",
  "schedule_value": "0 17 * * 0",
  "context_mode": "isolated"
}
```

### Health Check (Every 6 Hours)
```json
{
  "type": "schedule_task",
  "task_id": "health-check",
  "targetJid": "tg:YOUR_CHAT_ID",
  "prompt": "Run a system health check. Only message me if something is concerning (disk >80%, memory >85%, errors in logs).",
  "schedule_type": "cron",
  "schedule_value": "0 */6 * * *",
  "context_mode": "isolated"
}
```

## Context Modes

- **`isolated`** — Fresh container for each run. No conversation history. Best for independent, repeatable tasks.
- **`group`** — Reuses the group's existing session. Has access to conversation history. Best for tasks that need context.

## Managing Tasks

From your main channel, talk to your assistant:
```
@Andy list all scheduled tasks
@Andy pause the morning briefing
@Andy resume the health check
@Andy cancel the weekly recap
```
