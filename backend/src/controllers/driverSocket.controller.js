import {
  recordDriverLocation,
  markDriverOnlineLive,
  markDriverOfflineLive,
} from '../services/driverLocation.service.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { C2S_EVENTS, S2C_EVENTS } from '../constants/socketEvents.js';
import {
  acceptBookingService,
  rejectBookingService,
} from '../services/bookingDispatch.service.js';

/**
 * Socket-side handlers for driver-specific events.
 *
 * Registration happens in `config/socket.js` on every authenticated driver
 * connection. Non-driver principals never reach this module.
 */

/** Hard per-driver rate limit (one location every ~1.5s, allowing for jitter). */
const MIN_LOCATION_INTERVAL_MS = 1_500;

/** Grace period before marking a disconnected driver offline (handles tab reloads). */
const OFFLINE_GRACE_MS = 8_000;

/**
 * How recent a native GPS fix has to be to keep a driver present without a
 * socket. The background uploader posts at most every 60s in idle mode, so
 * this has to clear that with room for a retry.
 */
const LOCATION_GRACE_MS = 3 * 60_000;

/** driverId → last accepted location timestamp. */
const lastEventAt = new Map();

/** driverId → pending offline timeout handle. */
const offlineTimers = new Map();

function clearOfflineTimer(driverId) {
  const h = offlineTimers.get(driverId);
  if (h) {
    clearTimeout(h);
    offlineTimers.delete(driverId);
  }
}

function isThrottled(driverId) {
  const now = Date.now();
  const last = lastEventAt.get(driverId) || 0;
  if (now - last < MIN_LOCATION_INTERVAL_MS) return true;
  lastEventAt.set(driverId, now);
  return false;
}

/* ------------------------------------------------------------------ */
/* Public: register handlers on an authenticated driver socket         */
/* ------------------------------------------------------------------ */

export function attachDriverSocketHandlers(socket) {
  const { principal } = socket.data;
  if (principal?.type !== 'driver') return;
  const driverId = String(principal.id);

  // Any reconnect = cancel a pending offline sweep
  clearOfflineTimer(driverId);

  socket.on(C2S_EVENTS.DRIVER_LOCATION_UPDATE, async (payload, ack) => {
    try {
      if (isThrottled(driverId)) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'throttled' });
        return;
      }

      const { lat, lng, accuracy, heading, speed } = payload || {};
      const result = await recordDriverLocation(driverId, { lat, lng, accuracy, heading, speed });

      if (!result.accepted) {
        if (typeof ack === 'function') ack({ ok: false, reason: result.reason });
        return;
      }
      if (typeof ack === 'function') {
        ack({ ok: true, mongoSnapshot: result.mongoSnapshot, firebase: result.firebase });
      }
    } catch (err) {
      console.error('[driverSocket] location update failed:', err);
      if (typeof ack === 'function') ack({ ok: false, reason: 'server_error' });
    }
  });

  socket.on(C2S_EVENTS.DRIVER_ONLINE, async (_payload, ack) => {
    try {
      // Trust the REST endpoint as source of truth for the Mongo `isOnline`
      // flag (it runs kit-eligibility checks). We only mirror to Firebase here.
      const driver = await Driver.findById(driverId).select('isOnline approvalStatus');
      if (!driver || !driver.isOnline) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'not_online_in_db' });
        return;
      }
      await markDriverOnlineLive(driverId);
      socket.emit(S2C_EVENTS.DRIVER_STATUS_CHANGED, { isOnline: true });
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      console.error('[driverSocket] online mirror failed:', err);
      if (typeof ack === 'function') ack({ ok: false, reason: 'server_error' });
    }
  });

  socket.on(C2S_EVENTS.DRIVER_OFFLINE, async (_payload, ack) => {
    try {
      await markDriverOfflineLive(driverId);
      socket.emit(S2C_EVENTS.DRIVER_STATUS_CHANGED, { isOnline: false });
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      console.error('[driverSocket] offline mirror failed:', err);
      if (typeof ack === 'function') ack({ ok: false, reason: 'server_error' });
    }
  });

  // Booking offer accept/reject over the socket. REST endpoints exist too —
  // the socket path is just faster and avoids a round-trip on the hot path.
  socket.on(C2S_EVENTS.BOOKING_ACCEPT, async (payload, ack) => {
    try {
      const bookingId = payload?.bookingId;
      if (!bookingId) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'bookingId_required' });
        return;
      }
      const result = await acceptBookingService(bookingId, driverId);
      if (typeof ack === 'function') ack(result);
    } catch (err) {
      console.error('[driverSocket] booking accept failed:', err);
      if (typeof ack === 'function') ack({ ok: false, reason: 'server_error' });
    }
  });

  socket.on(C2S_EVENTS.BOOKING_REJECT, async (payload, ack) => {
    try {
      const bookingId = payload?.bookingId;
      if (!bookingId) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'bookingId_required' });
        return;
      }
      const result = await rejectBookingService(bookingId, driverId);
      if (typeof ack === 'function') ack(result);
    } catch (err) {
      console.error('[driverSocket] booking reject failed:', err);
      if (typeof ack === 'function') ack({ ok: false, reason: 'server_error' });
    }
  });

  // When the socket drops, schedule a delayed presence teardown. A quick
  // reload or transient network blip reconnects inside the grace period and
  // cancels it.
  //
  // The previous version only tore down when Mongo ALSO said `isOnline: false`
  // — which is the one case the REST toggle has already handled. A driver who
  // went online and then force-quit stayed online forever: still on the admin
  // live map, still winning dispatch offers, still showing a frozen car to any
  // customer watching. Presence now follows the connection, which is what
  // presence means.
  socket.on('disconnect', () => {
    clearOfflineTimer(driverId);
    const handle = setTimeout(async () => {
      offlineTimers.delete(driverId);
      try {
        // Native background tracking can outlive the socket, so a recent fix
        // is proof the driver is still there even with no websocket. Only tear
        // down presence when nothing has been heard either way.
        const driver = await Driver.findById(driverId)
          .select('isOnline lastFixAt')
          .lean();
        if (!driver) return;

        const lastFixAgeMs = driver.lastFixAt
          ? Date.now() - new Date(driver.lastFixAt).getTime()
          : Number.POSITIVE_INFINITY;

        if (lastFixAgeMs <= LOCATION_GRACE_MS) {
          return;
        }

        // Clear the Mongo flag too, otherwise the driver keeps matching
        // `$geoNear` on `isOnline: true` from a position nobody is updating.
        if (driver.isOnline) {
          await Driver.updateOne({ _id: driverId }, { $set: { isOnline: false } });
        }
        await markDriverOfflineLive(driverId);
      } catch (err) {
        console.warn('[driverSocket] post-disconnect teardown failed:', err.message);
      }
    }, OFFLINE_GRACE_MS);
    offlineTimers.set(driverId, handle);
  });
}
