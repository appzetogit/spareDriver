import { Driver } from '../models/driverModels/driver.model.js';
import { recordDriverLocation } from './driverLocation.service.js';
import { normalizeFixes, trackingDirective } from '../utils/locationFix.util.js';

/**
 * Batch ingest for the native background uploader.
 *
 * The uploader buffers fixes to disk while the network is down and flushes the
 * backlog on reconnect, so this endpoint has to be idempotent: the same batch
 * may arrive twice, and two devices signed in as the same driver may overlap.
 *
 * Dedupe is a monotonic watermark on `Driver.lastFixAt`, advanced with a
 * conditional update. That makes it atomic and multi-instance safe — no
 * in-process Map to desync behind a load balancer.
 *
 * Only the newest fix in a batch reaches the live pipeline. Firebase holds a
 * current position, not a trail, so replaying eight minutes of backlog into it
 * would be eight minutes of wasted writes ending on the same coordinate.
 */

const DRIVER_STATE_FIELDS = 'isOnline isOnTrip lastFixAt approvalStatus isDeleted';

function inspectLiveLocation(event, payload) {
  console.log(`[liveLocation] ${event}`, payload);
}

function emptyResult({ driver, rejected, duplicates, deduped = 0 }) {
  return {
    accepted: 0,
    deduped,
    rejected,
    duplicates,
    watermark: driver?.lastFixAt ? driver.lastFixAt.toISOString() : null,
    ...trackingDirective(driver),
  };
}

/**
 * @param {string} driverId
 * @param {Array<object>} rawFixes
 * @returns {Promise<{
 *   accepted:number; deduped:number; rejected:number; duplicates:number;
 *   watermark:string|null; stopTracking:boolean; mode:'onTrip'|'idle'|'stopped';
 *   firebase?:boolean; mongoSnapshot?:boolean;
 * }>}
 */
export async function ingestDriverLocationBatch(driverId, rawFixes) {
  const { fixes, rejected, duplicates } = normalizeFixes(rawFixes, Date.now());
  inspectLiveLocation('server HTTP batch received', {
    driverId: String(driverId),
    rawCount: Array.isArray(rawFixes) ? rawFixes.length : 0,
    valid: fixes.length,
    rejected,
    duplicates,
  });

  if (fixes.length === 0) {
    const driver = await Driver.findById(driverId).select(DRIVER_STATE_FIELDS).lean();
    inspectLiveLocation('server HTTP batch empty after normalize', {
      driverId: String(driverId),
      rejected,
      duplicates,
      mode: trackingDirective(driver).mode,
    });
    return emptyResult({ driver, rejected, duplicates });
  }

  const newest = fixes[fixes.length - 1];
  const newestDate = new Date(newest.capturedAt);

  // Advance the watermark and read the pre-image in one atomic step. A null
  // result means every fix here is at or behind what we already accepted.
  const previous = await Driver.findOneAndUpdate(
    {
      _id: driverId,
      $or: [
        { lastFixAt: null },
        { lastFixAt: { $exists: false } },
        { lastFixAt: { $lt: newestDate } },
      ],
    },
    { $set: { lastFixAt: newestDate } },
    { new: false },
  )
    .select(DRIVER_STATE_FIELDS)
    .lean();

  if (!previous) {
    const current = await Driver.findById(driverId).select(DRIVER_STATE_FIELDS).lean();
    inspectLiveLocation('server HTTP batch deduped (already had newer fix)', {
      driverId: String(driverId),
      lat: newest.lat,
      lng: newest.lng,
      capturedAt: newestDate.toISOString(),
    });
    return emptyResult({ driver: current, rejected, duplicates, deduped: fixes.length });
  }

  const previousMs = previous.lastFixAt ? previous.lastFixAt.getTime() : 0;
  const fresh = fixes.filter((f) => f.capturedAt > previousMs);
  const directive = trackingDirective(previous);

  // The driver toggled offline — possibly from another device — while this
  // batch was in flight. Keeping the watermark is right, but writing to
  // Firebase would resurrect the presence node `markDriverOfflineLive` cleared.
  if (directive.stopTracking) {
    inspectLiveLocation('server HTTP batch ignored (stopTracking)', {
      driverId: String(driverId),
      mode: directive.mode,
      lat: newest.lat,
      lng: newest.lng,
    });
    return {
      accepted: 0,
      deduped: fixes.length - fresh.length,
      rejected,
      duplicates,
      watermark: newestDate.toISOString(),
      ...directive,
    };
  }

  inspectLiveLocation('server HTTP newest fix accepted', {
    driverId: String(driverId),
    lat: newest.lat,
    lng: newest.lng,
    heading: newest.heading,
    speed: newest.speed,
    capturedAt: newestDate.toISOString(),
    mode: directive.mode,
    accepted: fresh.length,
  });

  const result = await recordDriverLocation(
    driverId,
    {
      lat: newest.lat,
      lng: newest.lng,
      accuracy: newest.accuracy,
      heading: newest.heading,
      speed: newest.speed,
      capturedAt: newest.capturedAt,
    },
    { forceMongoSnapshot: true },
  );

  return {
    accepted: fresh.length,
    deduped: fixes.length - fresh.length,
    rejected,
    duplicates,
    watermark: newestDate.toISOString(),
    firebase: result.firebase,
    mongoSnapshot: result.mongoSnapshot,
    ...directive,
  };
}
