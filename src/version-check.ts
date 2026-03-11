import { readFileSync } from 'fs';
import { logger } from './logger.js';

/**
 * Check if a newer MetaClaw version is available upstream.
 * Fire-and-forget on startup — never blocks boot, never throws.
 */
export async function checkForUpdates(
  notifyMainChannel: (text: string) => Promise<void>,
  getState: (key: string) => string | undefined,
  setState: (key: string, value: string) => void,
): Promise<void> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      'https://raw.githubusercontent.com/qwibitai/MetaClaw/main/package.json',
      { signal: controller.signal },
    );
    if (!res.ok) return;

    const upstream = JSON.parse(await res.text());
    const local = JSON.parse(readFileSync('package.json', 'utf-8'));

    if (upstream.version === local.version) return;

    // Dedup: only notify once per upstream version
    const lastNotified = getState('update_notified_version');
    if (lastNotified === upstream.version) return;

    setState('update_notified_version', upstream.version);
    logger.info(
      { current: local.version, latest: upstream.version },
      'Update available',
    );

    await notifyMainChannel(
      `🔔 MetaClaw ${upstream.version} available (you're on ${local.version}). SysAdmin will auto-update Sunday 6 AM.`,
    );
  } catch {
    // Silently ignore — network issues, rate limits, etc.
  }
}
