import { Driver } from '../models/driverModels/driver.model.js';
import {
  markDriverOfflineLive,
  listLiveFirebaseDriverIds,
} from './driverLocation.service.js';

/**
 * Periodic reconciliation of live map presence — not the driver's online toggle.
 *
 * A socket disconnect alone is not proof a driver has gone: with native
 * background tracking the app backgrounds, the websocket drops, and location
 * keeps flowing. The disconnect handler already keys off a recent fix.
 *
 * When GPS itself goes quiet (force-quit, native killed by the OS, permission
 * revoked), we still need to clear the Firebase live node so admin maps and
 * customer tracking do not show a frozen car. We deliberately do NOT flip
 * Mongo `isOnline` here: that flag is owned by the driver's explicit toggle.
 * Flipping it after ~5 minutes of silence was marking minimized drivers
 * offline, and the next native upload then received `stopTracking` and shut
 * itself down for good.
 *
 * Dispatch safety does not depend on this sweeper — `driverFinder` already
 * refuses drivers whose `lastLocationAt` is stale.
 */

/** Nothing heard for this long → clear live Firebase presence. */
const STALE_FIX_MS = 5 * 60_000;

/**
 * Allowance for a driver who has just toggled online and whose first fix has
 * not landed yet.
 */
const WARMUP_MS = 5 * 60_000;

const SWEEP_INTERVAL_MS = 60_000;

let timer = null;

/**
 * Tear down live presence for every driver who has stopped reporting.
 * Leaves Mongo `isOnline` alone so a minimized / briefly-silent app stays
 * online until the driver toggles off.
 *
 * @returns {Promise<{ sweptCount: number }>}
 */
export async function sweepStalePresence() {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_FIX_MS);
  const warmupBefore = new Date(now - WARMUP_MS);

  const stale = await Driver.find({
    isOnline: true,
    isOnTrip: { $ne: true },
    isDeleted: false,
    $or: [
      { lastFixAt: { $lt: staleBefore } },
      {
        lastFixAt: null,
        $or: [
          { lastOnlineAt: { $lt: warmupBefore } },
          { lastOnlineAt: null },
        ],
      },
    ],
  })
    .select('_id')
    .limit(500)
    .lean();

  if (stale.length === 0) return { sweptCount: 0 };

  // Only touch drivers who still have an RTDB node. Idle-online drivers with
  // a stale Mongo flag otherwise get "cleared" every minute forever — noisy
  // logs, and a risk of racing a driver who just started a trip.
  const liveIds = new Set(await listLiveFirebaseDriverIds());
  const ids = stale
    .map((d) => String(d._id))
    .filter((id) => liveIds.has(id));

  if (ids.length === 0) return { sweptCount: 0 };

  await Promise.allSettled(ids.map((id) => markDriverOfflineLive(id)));

  console.log(`[presenceSweeper] cleared live presence for ${ids.length} stale driver(s)`);
  return { sweptCount: ids.length };
}

/** Start the background sweep. Safe to call twice. */
export function startPresenceSweeper() {
  if (timer) return;
  timer = setInterval(() => {
    sweepStalePresence().catch((err) =>
      console.warn('[presenceSweeper] sweep failed:', err?.message),
    );
  }, SWEEP_INTERVAL_MS);

  // Never hold the process open for a sweep.
  timer.unref?.();
  console.log('[presenceSweeper] started');
}

export function stopPresenceSweeper() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
