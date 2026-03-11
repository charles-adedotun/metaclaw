import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { NewMessage, RegisteredGroup, ScheduledTask, TaskRunLog, TokenUsageEntry } from './types.js';

let db: Database.Database;

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );
  `);

  // Token usage tracking — API spend per invocation
  database.exec(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      total_cost_usd REAL NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      num_turns INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      duration_api_ms INTEGER NOT NULL DEFAULT 0,
      model_usage_json TEXT,
      is_scheduled_task INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_token_usage_group ON token_usage(group_folder);
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add task_class column for recurring vs ephemeral task distinction
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN task_class TEXT DEFAULT 'recurring'`,
    );
  } catch {
    /* column already exists */
  }

  // Add protected column — protected tasks cannot be modified by agent governance
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN protected INTEGER DEFAULT 0`,
    );
  } catch {
    /* column already exists */
  }

  // Add task_id, stop_reason, session_id, primary_model to token_usage
  for (const col of [
    { name: 'task_id', def: 'TEXT DEFAULT NULL' },
    { name: 'stop_reason', def: 'TEXT DEFAULT NULL' },
    { name: 'session_id', def: 'TEXT DEFAULT NULL' },
    { name: 'primary_model', def: 'TEXT DEFAULT NULL' },
  ]) {
    try {
      database.exec(
        `ALTER TABLE token_usage ADD COLUMN ${col.name} ${col.def}`,
      );
    } catch {
      /* column already exists */
    }
  }
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_token_usage_task ON token_usage(task_id)`,
  );

  // Index for ephemeral task cleanup
  database.exec(
    `CREATE INDEX IF NOT EXISTS idx_task_class ON scheduled_tasks(task_class, status)`,
  );

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database.prepare(
      `UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`,
    ).run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add files_json column for file attachments (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN files_json TEXT DEFAULT NULL`,
    );
  } catch {
    /* column already exists */
  }

  // Add channel and is_group columns if they don't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE chats ADD COLUMN channel TEXT`,
    );
    database.exec(
      `ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`,
    );
    // Backfill from JID patterns
    database.exec(`UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`);
    database.exec(`UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`);
    database.exec(`UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`);
    database.exec(`UPDATE chats SET channel = 'telegram', is_group = 1 WHERE jid LIKE 'tg:%'`);
  } catch {
    /* columns already exist */
  }
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Migrate from JSON files if they exist
  migrateJsonState();
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  const ch = channel ?? null;
  const group = isGroup === undefined ? null : isGroup ? 1 : 0;

  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, name, timestamp, ch, group);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, chatJid, timestamp, ch, group);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, files_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
    msg.files && msg.files.length > 0 ? JSON.stringify(msg.files) : null,
  );
}

/**
 * Store a message directly (for non-WhatsApp channels that don't use Baileys proto).
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp, files_json
    FROM messages
    WHERE timestamp > ? AND chat_jid IN (${placeholders})
      AND is_bot_message = 0 AND content NOT LIKE ?
      AND content != '' AND content IS NOT NULL
    ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
): NewMessage[] {
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  const sql = `
    SELECT id, chat_jid, sender, sender_name, content, timestamp
    FROM messages
    WHERE chat_jid = ? AND timestamp > ?
      AND is_bot_message = 0 AND content NOT LIKE ?
      AND content != '' AND content IS NOT NULL
    ORDER BY timestamp
  `;
  const rows = db
    .prepare(sql)
    .all(chatJid, sinceTimestamp, `${botPrefix}:%`) as Array<NewMessage & { files_json?: string | null }>;
  return rows.map(row => {
    const { files_json, ...rest } = row;
    return {
      ...rest,
      files: files_json ? JSON.parse(files_json) : undefined,
    };
  });
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at, task_class, protected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
    task.task_class || 'recurring',
    task.protected || 0,
  );
}

export function cleanupEphemeralTasks(): number {
  const result = db.prepare(
    `DELETE FROM scheduled_tasks
     WHERE task_class = 'ephemeral'
       AND (status = 'completed' OR next_run < datetime('now', '-1 day'))`,
  ).run();
  return result.changes;
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

/**
 * Get recent task run logs, optionally filtered by group folder.
 * Returns most recent runs first, up to `limit`.
 */
export function getRecentTaskRunLogs(
  groupFolder?: string,
  limit = 50,
): Array<TaskRunLog & { group_folder: string }> {
  if (groupFolder) {
    return db
      .prepare(
        `
        SELECT trl.task_id, trl.run_at, trl.duration_ms, trl.status, trl.result, trl.error,
               st.group_folder
        FROM task_run_logs trl
        JOIN scheduled_tasks st ON trl.task_id = st.id
        WHERE st.group_folder = ?
        ORDER BY trl.run_at DESC
        LIMIT ?
      `,
      )
      .all(groupFolder, limit) as Array<TaskRunLog & { group_folder: string }>;
  }
  return db
    .prepare(
      `
      SELECT trl.task_id, trl.run_at, trl.duration_ms, trl.status, trl.result, trl.error,
             st.group_folder
      FROM task_run_logs trl
      JOIN scheduled_tasks st ON trl.task_id = st.id
      ORDER BY trl.run_at DESC
      LIMIT ?
    `,
    )
    .all(limit) as Array<TaskRunLog & { group_folder: string }>;
}

/**
 * Get the last run log for a specific task.
 */
export function getLastTaskRunLog(
  taskId: string,
): (TaskRunLog & { group_folder: string }) | undefined {
  return db
    .prepare(
      `
      SELECT trl.task_id, trl.run_at, trl.duration_ms, trl.status, trl.result, trl.error,
             st.group_folder
      FROM task_run_logs trl
      JOIN scheduled_tasks st ON trl.task_id = st.id
      WHERE trl.task_id = ?
      ORDER BY trl.run_at DESC
      LIMIT 1
    `,
    )
    .get(taskId) as (TaskRunLog & { group_folder: string }) | undefined;
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? JSON.parse(row.container_config)
      : undefined,
    requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
  };
}

export function setRegisteredGroup(
  jid: string,
  group: RegisteredGroup,
): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.containerConfig ? JSON.stringify(group.containerConfig) : null,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db
    .prepare('SELECT * FROM registered_groups')
    .all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? JSON.parse(row.container_config)
        : undefined,
      requiresTrigger: row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    };
  }
  return result;
}

// --- Token usage tracking ---

/** Extract the highest-cost model name from model_usage JSON, or null. */
export function extractPrimaryModel(modelUsageJson: string | null | undefined): string | null {
  if (!modelUsageJson) return null;
  try {
    const usage = JSON.parse(modelUsageJson) as Record<string, { costUSD?: number }>;
    let maxCost = -1;
    let primary: string | null = null;
    for (const [model, data] of Object.entries(usage)) {
      const cost = data.costUSD ?? 0;
      if (cost > maxCost) {
        maxCost = cost;
        primary = model;
      }
    }
    return primary;
  } catch {
    return null;
  }
}

export function storeTokenUsage(entry: TokenUsageEntry): void {
  db.prepare(
    `INSERT INTO token_usage (group_folder, chat_jid, timestamp, total_cost_usd, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, num_turns, duration_ms, duration_api_ms, model_usage_json, is_scheduled_task, task_id, stop_reason, session_id, primary_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.group_folder,
    entry.chat_jid,
    entry.timestamp,
    entry.total_cost_usd,
    entry.input_tokens,
    entry.output_tokens,
    entry.cache_read_input_tokens,
    entry.cache_creation_input_tokens,
    entry.num_turns,
    entry.duration_ms,
    entry.duration_api_ms,
    entry.model_usage_json ?? null,
    entry.is_scheduled_task ? 1 : 0,
    entry.task_id ?? null,
    entry.stop_reason ?? null,
    entry.session_id ?? null,
    entry.primary_model ?? null,
  );
}

export function getTokenUsageRaw(since: string): TokenUsageEntry[] {
  return db
    .prepare(
      `SELECT group_folder, chat_jid, timestamp, total_cost_usd, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, num_turns, duration_ms, duration_api_ms, model_usage_json, is_scheduled_task, task_id, stop_reason, session_id, primary_model
       FROM token_usage WHERE timestamp >= ? ORDER BY timestamp DESC`,
    )
    .all(since) as TokenUsageEntry[];
}

export interface TokenUsageSummary {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  invocation_count: number;
  total_turns: number;
  total_duration_ms: number;
  total_api_duration_ms: number;
  scheduled_count: number;
  interactive_count: number;
}

export function getTokenUsageSummary(since: string): TokenUsageSummary {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(total_cost_usd), 0) as total_cost_usd,
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens,
         COALESCE(SUM(cache_read_input_tokens), 0) as total_cache_read_tokens,
         COALESCE(SUM(cache_creation_input_tokens), 0) as total_cache_creation_tokens,
         COUNT(*) as invocation_count,
         COALESCE(SUM(num_turns), 0) as total_turns,
         COALESCE(SUM(duration_ms), 0) as total_duration_ms,
         COALESCE(SUM(duration_api_ms), 0) as total_api_duration_ms,
         SUM(CASE WHEN is_scheduled_task = 1 THEN 1 ELSE 0 END) as scheduled_count,
         SUM(CASE WHEN is_scheduled_task = 0 THEN 1 ELSE 0 END) as interactive_count
       FROM token_usage WHERE timestamp >= ?`,
    )
    .get(since) as TokenUsageSummary;
  return row;
}

export interface StaffPerformanceEntry {
  group_folder: string;
  invocations: number;
  total_cost: number;
  avg_cost: number;
  avg_duration: number;
  max_cost: number;
}

export function getStaffPerformance(days: number = 7): StaffPerformanceEntry[] {
  return db
    .prepare(
      `SELECT
        group_folder,
        COUNT(*) as invocations,
        SUM(total_cost_usd) as total_cost,
        AVG(total_cost_usd) as avg_cost,
        AVG(duration_ms) as avg_duration,
        MAX(total_cost_usd) as max_cost
      FROM token_usage
      WHERE timestamp > datetime('now', '-' || ? || ' days')
      GROUP BY group_folder`,
    )
    .all(days) as StaffPerformanceEntry[];
}

// --- JSON migration ---

function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // Migrate router_state.json
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // Migrate sessions.json
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // Migrate registered_groups.json
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
}
