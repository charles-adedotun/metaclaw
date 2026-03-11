import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR, STORE_DIR } from './config.js';
import { CONTAINER_RUNTIME_BIN } from './container-runtime.js';
import { logger } from './logger.js';

export interface SelfCheckDeps {
  notifyMainChannel: (text: string) => Promise<void>;
  registeredGroupCount: number;
}

/**
 * Run startup self-checks and alert on any issues found.
 * Fire-and-forget — never blocks boot, never throws.
 */
export async function runSelfCheck(deps: SelfCheckDeps): Promise<void> {
  try {
    const issues: string[] = [];

    // 1. DB file exists and is readable
    const dbPath = path.join(STORE_DIR, 'messages.db');
    try {
      const stat = fs.statSync(dbPath);
      if (stat.size === 0) issues.push('Database file is empty');
    } catch {
      issues.push('Database file not found or unreadable');
    }

    // 2. Docker/container runtime is reachable
    try {
      execFileSync(CONTAINER_RUNTIME_BIN, ['info'], { stdio: 'pipe', timeout: 5000 });
    } catch {
      issues.push('Container runtime (Docker) is not reachable');
    }

    // 3. At least one registered group exists
    if (deps.registeredGroupCount === 0) {
      issues.push('No registered groups — bot will not respond to any chats');
    }

    // 4. Groups directory exists
    if (!fs.existsSync(GROUPS_DIR)) {
      issues.push('Groups directory missing');
    }

    if (issues.length > 0) {
      const msg = `⚠️ Startup self-check found ${issues.length} issue(s):\n${issues.map((i) => `• ${i}`).join('\n')}`;
      logger.warn({ issues }, 'Self-check found issues');
      await deps.notifyMainChannel(msg);
    } else {
      logger.info('Self-check passed — all systems OK');
    }
  } catch (err) {
    logger.error({ err }, 'Self-check itself failed');
  }
}
