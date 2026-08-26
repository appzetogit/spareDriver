import { useCallback, useEffect, useState } from 'react';
import useAppResumeSync from '../hooks/useAppResumeSync';
import { reportDriverLocation, useDriverLocation } from '../hooks/useDriverLocation';
import { useDriverOnlineStore } from '../store/driver/useDriverOnlineStore';
import useDriverActiveTripStore from '../store/driver/useDriverActiveTripStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { onAuthTokensChanged } from '../utils/authTokens';
import {
  getNativeLastLocation,
  hasNativeTracking,
  nativeTrackingStatus,
  startNativeTracking,
  stopNativeTracking,
  TRACKING_MODE,
} from '../utils/nativeTracking';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus';

function coordsFromNativePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const src = payload.location && typeof payload.location === 'object'
    ? payload.location
    : payload;
  const lat = Number(src.lat ?? src.latitude);
  const lng = Number(src.lng ?? src.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    accuracy: Number.isFinite(Number(src.accuracy)) ? Number(src.accuracy) : null,
    heading: Number.isFinite(Number(src.heading)) ? Number(src.heading) : null,
    speed: Number.isFinite(Number(src.speed)) ? Number(src.speed) : null,
    timestamp: src.timestamp ?? src.capturedAt ?? src.fetchedAt,
  };
}

const ONLINE_CACHE_KEY = 'driver-online-status';

const ON_TRIP_STATUSES = new Set(
  ACTIVE_BOOKING_STATUSES.filter(
    (s) =>
      s !== BOOKING_STATUS.NO_DRIVERS_FOUND &&
      s !== BOOKING_STATUS.PENDING_ASSIGNMENT &&
      s !== BOOKING_STATUS.SEARCHING,
  ),
);

/**
 * Decides who is reporting the driver's position, and tells them when to start.
 *
 * Two possible producers:
 *
 *   - Native (inside the Flutter wrapper) — a foreground service that keeps
 *     running when the app is backgrounded. This is the real one.
 *   - Browser `watchPosition` — only survives while the page is visible, so it
 *     freezes the moment the driver opens Maps or locks the screen.
 *
 * Native owns the *upload* (it survives backgrounding). The trip UI still
 * needs a local lat/lng for the map pin and the "I've arrived" geofence, so
 * while a trip is active we keep a browser watch for the WebView only and
 * stop emitting on the socket. Idle-online stays native-only.
 *
 * Merge note: this replaced `syncNativeBackgroundLocation`, which pushed the
 * access and refresh tokens into native and let it drive its own polling loop.
 * The contract here is deliberately narrower — the web app says only *when* to
 * track and at what cadence, and native authenticates with its own long-lived,
 * per-device, revocable credential instead of borrowing the session's.
 */
export function DriverLocationBridge() {
  const authOnline = useDriverAuthStore((s) => s.driver?.isOnline === true);
  const onlineEntry = useDriverOnlineStore((s) => s.entries[ONLINE_CACHE_KEY]);
  const storeOnline = onlineEntry?.data?.isOnline === true;
  const bookingStatus = useDriverActiveTripStore((s) => s.booking?.status);
  const onTrip = Boolean(bookingStatus && ON_TRIP_STATUSES.has(bookingStatus));

  const shouldTrack = authOnline || storeOnline || onTrip;

  /** True once native has confirmed it is doing the tracking. */
  const [nativeTracking, setNativeTracking] = useState(false);

  /**
   * Forces the sync effect to re-run when none of its inputs changed value —
   * specifically after the session's tokens rotate.
   */
  const [syncNonce, setSyncNonce] = useState(0);

  const refreshDriverState = useCallback(async () => {
    await Promise.allSettled([
      useDriverOnlineStore.getState().refresh(ONLINE_CACHE_KEY, {}),
      useDriverActiveTripStore.getState().fetchActive?.(),
    ]);
  }, []);

  useEffect(() => {
    useDriverOnlineStore.getState().fetch(ONLINE_CACHE_KEY, {}).catch(() => {});
    useDriverActiveTripStore.getState().fetchActive?.().catch(() => {});
  }, []);

  // Back from the background: re-read online / trip state. A trip may have
  // started or ended while the app was frozen, and the tracking cadence has to
  // follow it. The effect below re-issues start/stop from whatever this finds.
  useAppResumeSync(refreshDriverState);

  // Tokens rotated — login, logout, or a refresh. Minting a tracking token
  // needs a live access token, so a start that failed for want of one has to be
  // retried once the session is good again. (Kept from the `main` side of this
  // merge; it is the one piece of that approach that still applies.)
  useEffect(() => onAuthTokensChanged(() => setSyncNonce((n) => n + 1)), []);

  useEffect(() => {
    if (!hasNativeTracking()) return undefined;

    let cancelled = false;

    if (!shouldTrack) {
      stopNativeTracking().finally(() => {
        if (!cancelled) setNativeTracking(false);
      });
      return () => {
        cancelled = true;
      };
    }

    // Re-sent whenever `onTrip` flips so the service switches cadence:
    // 5 s / 20 m on a trip, 30 s / 100 m while idle-online.
    const mode = onTrip ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE;
    startNativeTracking(mode).then(async (result) => {
      if (cancelled) return;
      const tracking = result?.tracking === true;
      setNativeTracking(tracking);
      if (!tracking) return;
      const fromStart = coordsFromNativePayload(result);
      if (fromStart) {
        reportDriverLocation(fromStart, { source: 'native' });
        return;
      }
      const lastRaw =
        (await getNativeLastLocation()) || (await nativeTrackingStatus());
      const last = coordsFromNativePayload(lastRaw);
      if (!cancelled && last) reportDriverLocation(last, { source: 'native' });
    });

    return () => {
      cancelled = true;
    };
  }, [shouldTrack, onTrip, syncNonce]);

  // Leaving the driver area entirely: stand native tracking down rather than
  // leave a foreground service running with nothing watching it.
  useEffect(() => {
    return () => {
      if (hasNativeTracking()) stopNativeTracking();
    };
  }, []);

  // Native uploads in the background. The trip screens still need a local
  // fix (map + 100 m arrival gate), so keep the browser watch on-trip and
  // only suppress socket publishes when native is confirmed.
  useDriverLocation({
    enabled: shouldTrack && (!nativeTracking || onTrip),
    publish: !nativeTracking,
  });

  return null;
}

export default DriverLocationBridge;
