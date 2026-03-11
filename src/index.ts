import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  IDLE_TIMEOUT,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ONLY,
  TRIGGER_PATTERN,
} from './config.js';
import { TelegramChannel } from './channels/telegram.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
  writeTokenUsageSnapshot,
} from './container-runner.js';
import { cleanupOrphans, ensureContainerRuntimeRunning } from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  getTokenUsageRaw,
  storeChatMetadata,
  storeMessage,
  storeTokenUsage,
  extractPrimaryModel,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { runSelfCheck } from './self-check.js';
import { checkForUpdates } from './version-check.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Channel, FileAttachment, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

const TOOL_EMOJI: Record<string, [string, string]> = {
  WebSearch: ['🔍', 'Searching'],
  WebFetch: ['🌐', 'Reading'],
  Bash: ['💻', 'Running'],
  Task: ['🤖', 'Working on'],
  TeamCreate: ['🤖', 'Delegating'],
  'mcp__metaclaw__send_file': ['📎', 'Preparing file'],
  'mcp__metaclaw__schedule_task': ['⏰', 'Scheduling task'],
};

function formatProgressStatus(tool: string, detail?: string): string {
  const entry = TOOL_EMOJI[tool];
  if (!entry) return '';
  const [emoji, verb] = entry;
  if (detail) return `${emoji} ${verb}: ${detail}`;
  return `${emoji} ${verb}...`;
}

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

let whatsapp: WhatsAppChannel;
const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState(
    'last_agent_timestamp',
    JSON.stringify(lastAgentTimestamp),
  );
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(groups: Record<string, RegisteredGroup>): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
    return true;
  }

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug({ group: group.name }, 'Idle timeout, closing container stdin');
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  await channel.setTyping?.(chatJid, true);
  let typingInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
    channel.setTyping?.(chatJid, true)?.catch(() => {});
  }, 4000);

  let hadError = false;
  let outputSentToUser = false;

  // Collect file attachments from messages
  const allFiles: FileAttachment[] = missedMessages
    .filter(m => m.files && m.files.length > 0)
    .flatMap(m => m.files!);

  let progressMessageId: number | null = null;
  let progressMessageSending = false;
  const progressSteps: string[] = [];
  let progressStartTime = Date.now();

  let output: string | undefined;
  try {
    output = await runAgent(group, prompt, chatJid, allFiles, async (result) => {
      // Handle progress markers — accumulate steps into a growing log
      if ((result as any).type === 'progress') {
        const status = formatProgressStatus((result as any).tool, (result as any).detail);
        if (!status) return;

        const elapsed = ((Date.now() - progressStartTime) / 1000).toFixed(1);
        progressSteps.push(`${status} (${elapsed}s)`);

        const display = progressSteps.join('\n');
        const tgChannel = channel as any;

        if (!progressMessageId && !progressMessageSending && tgChannel.sendMessageWithId) {
          progressMessageSending = true;
          progressMessageId = await tgChannel.sendMessageWithId(chatJid, display);
          progressMessageSending = false;
        } else if (progressMessageId && tgChannel.editMessage) {
          await tgChannel.editMessage(chatJid, progressMessageId, display).catch(() => {});
        } else {
          await channel.sendMessage(chatJid, status);
        }

        // Restart typing if it was cleared by a previous text output
        if (!typingInterval) {
          channel.setTyping?.(chatJid, true)?.catch(() => {});
          typingInterval = setInterval(() => {
            channel.setTyping?.(chatJid, true)?.catch(() => {});
          }, 4000);
        }
        return;
      }

      // Streaming output callback — called for each agent result
      if (result.result) {
        const raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
        // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
        const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
        if (text) {
          // Stop typing — response is being delivered
          if (typingInterval) {
            clearInterval(typingInterval);
            typingInterval = null;
          }

          // Finalize progress message with complete trace
          if (progressMessageId) {
            const tgChannel = channel as any;
            if (tgChannel.editMessage) {
              const totalTime = ((Date.now() - progressStartTime) / 1000).toFixed(1);
              const trace = progressSteps.join('\n') + `\n✅ Done (${totalTime}s)`;
              await tgChannel.editMessage(chatJid, progressMessageId, trace).catch(() => {});
            }
            progressMessageId = null;
          }


          // Reset for next query in the same container session
          progressSteps.length = 0;
          progressStartTime = Date.now();
          await channel.sendMessage(chatJid, text);
          outputSentToUser = true;
        }
        // Only reset idle timer on actual results, not session-update markers (result: null)
        resetIdleTimer();
      }

      if (result.status === 'success') {
        queue.notifyIdle(chatJid);
      }

      if (result.status === 'error') {
        hadError = true;
      }
    });
  } finally {
    if (typingInterval) clearInterval(typingInterval);
    if (idleTimer) clearTimeout(idleTimer);
    // Clean up any lingering progress message on error
    if (progressMessageId) {
      const tgChannel = channel as any;
      if (tgChannel.editMessage) {
        const trace = progressSteps.length > 0
          ? progressSteps.join('\n') + '\n❌ Error'
          : '❌ Error';
        await tgChannel.editMessage(chatJid, progressMessageId, trace).catch(() => {});
      }
    }
  }

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn({ group: group.name }, 'Agent error after output was sent, skipping cursor rollback to prevent duplicates');
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn({ group: group.name }, 'Agent error, rolled back message cursor for retry');
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  files: FileAttachment[],
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
      protected: t.protected,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Write token usage snapshot for main group (Accountant skill reads this)
  if (isMain) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const usageEntries = getTokenUsageRaw(ninetyDaysAgo);
    writeTokenUsageSnapshot(group.folder, usageEntries);
  }

  // Wrap onOutput to track session ID and token usage from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        // Store token usage if present
        if (output.usage && output.usage.total_cost_usd > 0) {
          try {
            const modelJson = JSON.stringify(output.usage.model_usage);
            storeTokenUsage({
              group_folder: group.folder,
              chat_jid: chatJid,
              timestamp: new Date().toISOString(),
              total_cost_usd: output.usage.total_cost_usd,
              input_tokens: output.usage.input_tokens,
              output_tokens: output.usage.output_tokens,
              cache_read_input_tokens: output.usage.cache_read_input_tokens,
              cache_creation_input_tokens: output.usage.cache_creation_input_tokens,
              num_turns: output.usage.num_turns,
              duration_ms: output.usage.duration_ms,
              duration_api_ms: output.usage.duration_api_ms,
              model_usage_json: modelJson,
              is_scheduled_task: false,
              stop_reason: output.usage.stop_reason ?? null,
              session_id: output.usage.session_id ?? null,
              primary_model: extractPrimaryModel(modelJson),
            });
            // Log high-token invocations for visibility (cost is flat on Max plan)
            if (output.usage.input_tokens + output.usage.output_tokens > 200000) {
              logger.info(
                { tokens: output.usage.input_tokens + output.usage.output_tokens, group: group.folder },
                'High-token invocation',
              );
            }
          } catch (err) {
            logger.warn({ err }, 'Failed to store token usage');
          }
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
        files: files.map(f => ({
          filename: f.filename,
          mimeType: f.mimeType,
          containerPath: "/workspace/uploads/" + f.localPath.split("/").pop(),
          fileSize: f.fileSize,
        })),
      },
      (proc, containerName) => queue.registerProcess(chatJid, proc, containerName, group.folder),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`MetaClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(jids, lastTimestamp, ASSISTANT_NAME);

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
            continue;
          }

          const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const hasTrigger = groupMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel.setTyping?.(chatJid, true)?.catch((err) =>
              logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
            );
          } else {
            // No active container — enqueue for a new one
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (_chatJid: string, msg: NewMessage) => storeMessage(msg),
    onChatMetadata: (chatJid: string, timestamp: string, name?: string, channel?: string, isGroup?: boolean) =>
      storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
  };

  // Create and connect channels
  if (TELEGRAM_BOT_TOKEN) {
    const telegram = new TelegramChannel(TELEGRAM_BOT_TOKEN, {
      ...channelOpts,
      getActiveTasks: () =>
        getAllTasks()
          .filter((t) => t.status === 'active')
          .map((t) => ({
            id: t.id,
            prompt: t.prompt,
            schedule_type: t.schedule_type,
            schedule_value: t.schedule_value,
            status: t.status,
            next_run: t.next_run,
            group_folder: t.group_folder,
          })),
    });
    channels.push(telegram);
    await telegram.connect();
  }

  if (!TELEGRAM_ONLY) {
    whatsapp = new WhatsAppChannel(channelOpts);
    channels.push(whatsapp);
    await whatsapp.connect();
  }

  // Helper: send a message to the main channel (for notifications, alerts, etc.)
  const sendToMainChannel = async (text: string) => {
    const mainJid = Object.keys(registeredGroups)[0];
    if (!mainJid) {
      logger.warn({ text: text.slice(0, 80) }, 'Cannot notify: no registered groups');
      return;
    }
    const channel = findChannel(channels, mainJid);
    if (!channel) {
      logger.warn({ mainJid, text: text.slice(0, 80) }, 'Cannot notify: no channel for main JID');
      return;
    }
    await channel.sendMessage(mainJid, text);
  };

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) => queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        console.log(`Warning: no channel owns JID ${jid}, cannot send message`);
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
  });
  startIpcWatcher({
    isContainerActive: (groupFolder) => queue.isActiveForFolder(groupFolder),
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    sendFile: async (jid, buffer, filename, caption) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      if (!channel.sendFile) throw new Error(`Channel ${channel.name} does not support file sending`);
      return channel.sendFile(jid, buffer, filename, caption);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroupMetadata: (force) => whatsapp?.syncGroupMetadata(force) ?? Promise.resolve(),
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) => writeGroupsSnapshot(gf, im, ag, rj),
    notifyMainChannel: sendToMainChannel,
  });
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });

  // Fire-and-forget version check
  checkForUpdates(
    sendToMainChannel,
    (key) => getRouterState(key),
    (key, val) => setRouterState(key, val),
  ).catch((err) => logger.error({ err }, 'Version check failed'));

  // Fire-and-forget startup self-check
  runSelfCheck({
    notifyMainChannel: sendToMainChannel,
    registeredGroupCount: Object.keys(registeredGroups).length,
  }).catch((err) => logger.error({ err }, 'Startup self-check failed'));
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start MetaClaw');
    process.exit(1);
  });
}
