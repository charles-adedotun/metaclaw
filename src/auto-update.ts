import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

import { logger } from './logger.js';

export interface AutoUpdateDeps {
  notifyMainChannel: (text: string) => Promise<void>;
}

let updateInProgress = false;

/** Run a command safely using execFileSync (no shell injection). */
function run(cmd: string, args: string[], timeoutMs = 60000): string {
  return execFileSync(cmd, args, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: 'pipe',
  }).trim();
}

/** Attempt rollback to a previous commit. Returns true if successful. */
function rollback(headBefore: string, restoreDeps: boolean): boolean {
  try {
    run('git', ['reset', '--hard', headBefore]);
    if (restoreDeps) {
      run('npm', ['install', '--production=false'], 120000);
      run('npm', ['run', 'build'], 120000);
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'Auto-update: ROLLBACK FAILED');
    return false;
  }
}

/**
 * Attempt an automatic update from upstream MetaClaw.
 * Safety guarantees:
 * - Never force-merges (aborts on conflict)
 * - Runs build + tests before restarting
 * - Rolls back on any failure, notifies if rollback itself fails
 * - Notifies user of outcome
 *
 * On success, calls process.exit(0) — systemd restarts the service.
 */
export async function performAutoUpdate(deps: AutoUpdateDeps): Promise<void> {
  if (updateInProgress) {
    logger.info('Auto-update already in progress, skipping');
    return;
  }
  updateInProgress = true;

  try {
    // 1. Fetch upstream
    run('git', ['fetch', 'origin']);

    // 2. Compare local vs upstream versions
    const localPkg = JSON.parse(readFileSync('package.json', 'utf-8'));

    // 2a. Read upstream package.json (git failure = skip)
    let raw: string;
    try {
      raw = run('git', ['show', 'origin/main:package.json']);
    } catch {
      logger.info('Auto-update: could not read upstream package.json, skipping');
      return;
    }

    // 2b. Parse upstream package.json (parse failure = real problem)
    let upstreamPkg: { version: string };
    try {
      upstreamPkg = JSON.parse(raw);
    } catch (parseErr) {
      logger.error({ parseErr }, 'Auto-update: upstream package.json is malformed');
      return;
    }

    if (upstreamPkg.version === localPkg.version) {
      logger.info('Auto-update: already up to date');
      return;
    }

    logger.info(
      { current: localPkg.version, upstream: upstreamPkg.version },
      'Auto-update: new version available, attempting merge',
    );

    // 3. Save current HEAD for rollback
    const headBefore = run('git', ['rev-parse', 'HEAD']);

    // 4. Check for uncommitted changes
    const status = run('git', ['status', '--porcelain']);
    if (status) {
      await deps.notifyMainChannel(
        `⚠️ Auto-update skipped — uncommitted changes detected. Clean working tree needed.`,
      );
      return;
    }

    // 5. Attempt merge
    try {
      run('git', ['merge', 'origin/main', '--no-edit']);
    } catch (mergeErr) {
      // Could be conflict or other git error — attempt abort
      try {
        run('git', ['merge', '--abort']);
      } catch (abortErr) {
        logger.error({ abortErr }, 'Auto-update: merge --abort also failed');
        await deps.notifyMainChannel(
          `🚨 Auto-update merge failed AND abort failed. Git may be in a broken state. Manual intervention required.`,
        );
        return;
      }
      await deps.notifyMainChannel(
        `⚠️ Auto-update ${localPkg.version} → ${upstreamPkg.version} merge failed. Manual resolution needed.`,
      );
      logger.warn({ mergeErr }, 'Auto-update: merge failed, aborted');
      return;
    }

    // 6. Install dependencies
    try {
      run('npm', ['install', '--production=false'], 120000);
    } catch {
      const ok = rollback(headBefore, false);
      await deps.notifyMainChannel(
        ok
          ? `❌ Auto-update failed during npm install. Rolled back to ${localPkg.version}.`
          : `🚨 Auto-update failed during npm install AND rollback failed. Manual intervention required.`,
      );
      return;
    }

    // 7. Build
    try {
      run('npm', ['run', 'build'], 120000);
    } catch {
      const ok = rollback(headBefore, true);
      await deps.notifyMainChannel(
        ok
          ? `❌ Auto-update failed during build. Rolled back to ${localPkg.version}.`
          : `🚨 Auto-update failed during build AND rollback failed. Manual intervention required.`,
      );
      return;
    }

    // 8. Run tests
    try {
      run('npm', ['test'], 180000);
    } catch {
      const ok = rollback(headBefore, true);
      await deps.notifyMainChannel(
        ok
          ? `❌ Auto-update failed tests. Rolled back to ${localPkg.version}.`
          : `🚨 Auto-update failed tests AND rollback failed. Manual intervention required.`,
      );
      return;
    }

    // 9. Success — notify and restart
    await deps.notifyMainChannel(
      `✅ Auto-updated MetaClaw ${localPkg.version} → ${upstreamPkg.version}. Restarting...`,
    );
    logger.info(
      { from: localPkg.version, to: upstreamPkg.version },
      'Auto-update successful, restarting',
    );

    // Give the notification time to send before exiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
    process.exit(0); // systemd restarts the service
  } catch (err) {
    logger.error({ err }, 'Auto-update: unexpected error');
    try {
      await deps.notifyMainChannel(
        `❌ Auto-update encountered an unexpected error. Check VPS logs.`,
      );
    } catch { /* notification channel itself failed — nothing left to do */ }
  } finally {
    updateInProgress = false;
  }
}
