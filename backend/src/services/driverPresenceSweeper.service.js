import { Driver } from '../models/driverModels/driver.model.js';
import { markDriverOfflineLive } from './driverLocation.service.js';

/**
 * Periodic reconciliation of "who is actually online".
 *
 * A socket disconnect alone is not proof a driver has gone: with native
 * background tracking the app backgrounds, the websocket drops, and location
 * keeps flowing. So the disconnect handler only tears presence down when it
 * has ALSO heard nothing from the GPS uploader.
 *
 * That leaves one hole, and it is the common one. A driver who force-quits
 * mid-shift has a fresh `lastFixAt` at the moment their socket dies, so the
 * disconnect check spares them — and nothing ever looks again. They stayed
 * "online" indefinitely: on the admin live map, in the dispatch pool, and
 * frozen on a customer's map.
 *
 * This sweeper is the thing that looks again. It is deliberately dumb and
 * idempotent, so running it on several instances at once is harmless.
 */

/** Nothing heard for this long means gone. */
const STALE_FIX_MS = 5 * 60_000;

/**
 * Allowance for a driver who has just toggled online and whose first fix has
 * not landed yet. Without it, going online would be undone seconds later.
 */
const WARMUP_MS = 5 * 60_000;

const SWEEP_INTERVAL_MS = 60_000;

let timer = null;

/**
 * Mark every driver who has stopped reporting as offline.
 * Exported separately so it can be triggered from a test or an admin action.
 *
 * @returns {Promise<{ sweptCount: number }>}
 */
export async function sweepStalePresence() {
  const now = Date.now();
  const staleBefore = new Date(now - STALE_FIX_MS);
  const warmupBefore = new Date(now - WARMUP_MS);

  const stale = await Driver.find({
    isOnline: true,
    isDeleted: false,
    $or: [
      // Reporting, then stopped.
      { lastFixAt: { $lt: staleBefore } },
      // Never reported at all, and past the warm-up allowance.
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

  const ids = stale.map((d) => d._id);

  await Driver.updateMany(
    { _id: { $in: ids } },
    { $set: { isOnline: false, isOnTrip: false } },
  );

  // Firebase teardown one at a time — the writes are independent and a single
  // failure should not strand the rest.
  await Promise.allSettled(ids.map((id) => markDriverOfflineLive(String(id))));

  console.log(`[presenceSweeper] marked ${ids.length} stale driver(s) offline`);
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
