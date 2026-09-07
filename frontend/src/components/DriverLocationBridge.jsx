import { useCallback, useEffect, useState } from 'react';
import useAppResumeSync from '../hooks/useAppResumeSync';
import { reportDriverLocation, useDriverLocation } from '../hooks/useDriverLocation';
import {
  useDriverOnlineStore,
  DRIVER_ONLINE_CACHE_KEY,
} from '../store/driver/useDriverOnlineStore';
import useDriverActiveTripStore from '../store/driver/useDriverActiveTripStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { onAuthTokensChanged } from '../utils/authTokens';
import {
  getNativeLastLocation,
  hasLocationBridge,
  hasNativeTracking,
  nativeTrackingStarted,
  nativeTrackingStatus,
  startNativeTracking,
  stopNativeTracking,
  TRACKING_MODE,
} from '../utils/nativeTracking';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus';
import { resolveTrackingIntent, TRACKING_INTENT } from '../utils/trackingDecision';

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

/**
 * Shared with the home page and the toggle hook. It used to be a bare
 * namespace string here while the home page used `buildCacheKey(...)`, which
 * meant this component watched a cache entry the rest of the app never wrote
 * to — so it read "offline" while the screen said "online".
 */
const ONLINE_CACHE_KEY = DRIVER_ONLINE_CACHE_KEY;

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
 * Flutter injects `window.LocationBridge` (and/or `flutter_inappwebview`
 * handlers). Session JWT stays in `localStorage.accessToken` so native can
 * authenticate background uploads. A long-lived tracking token is still
 * minted by native when it needs one; this component only says *when*.
 */
export function DriverLocationBridge() {
  const authOnline = useDriverAuthStore((s) => s.driver?.isOnline === true);
  const authOnTrip = useDriverAuthStore((s) => s.driver?.isOnTrip === true);
  const onlineEntry = useDriverOnlineStore((s) => s.entries[ONLINE_CACHE_KEY]);
  const storeOnline = onlineEntry?.data?.isOnline === true;
  const bookingStatus = useDriverActiveTripStore((s) => s.booking?.status);
  const onTrip = Boolean(
    authOnTrip || (bookingStatus && ON_TRIP_STATUSES.has(bookingStatus)),
  );

  /**
   * Has the server actually answered "is this driver online?" yet.
   *
   * False while the request is in flight, and again after the cache is
   * invalidated. Both mean "we do not know", which the decision below is
   * careful to treat differently from "the driver is off" — see
   * `resolveTrackingIntent`. A persisted `driver.isOnline === false` used to
   * count as proof here, and because that value is rehydrated from storage on
   * every launch, an online driver got `stopTracking` on boot and
   * `startTracking` a moment later. That was the flapping.
   */
  const statusFetched = Boolean(onlineEntry?.isFetched);

  const { intent, mode: trackingMode } = resolveTrackingIntent({
    authOnline,
    storeOnline,
    onTrip,
    statusFetched,
  });

  const shouldTrack = intent === TRACKING_INTENT.START;

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
  // retried once the session is good again.
  useEffect(() => onAuthTokensChanged(() => setSyncNonce((n) => n + 1)), []);

  // LocationBridge is often injected after the first WebView load. Keep
  // probing until it appears so an early flutter_inappwebview-only start
  // is re-issued through the real bridge.
  useEffect(() => {
    if (hasLocationBridge()) return undefined;
    if (!shouldTrack) return undefined;
    const id = setInterval(() => {
      if (hasLocationBridge()) {
        setSyncNonce((n) => n + 1);
        clearInterval(id);
      }
    }, 1000);
    const timeout = setTimeout(() => clearInterval(id), 20_000);
    const onReady = () => setSyncNonce((n) => n + 1);
    window.addEventListener('LocationBridgeReady', onReady);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
      window.removeEventListener('LocationBridgeReady', onReady);
    };
  }, [shouldTrack]);

  useEffect(() => {
    if (!hasNativeTracking()) return undefined;

    let cancelled = false;

    // Still finding out. Leave whatever is running alone — a remount while
    // Maps is open used to send stopTracking and kill background GPS.
    if (intent === TRACKING_INTENT.HOLD) {
      return () => {
        cancelled = true;
      };
    }

    if (intent === TRACKING_INTENT.STOP) {
      stopNativeTracking().finally(() => {
        if (!cancelled) setNativeTracking(false);
      });
      return () => {
        cancelled = true;
      };
    }

    // Re-sent whenever the cadence changes: 5 s / 20 m on a trip,
    // 30 s / 100 m while idle-online.
    const mode =
      trackingMode === 'onTrip' ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE;
    startNativeTracking(mode).then(async (result) => {
      if (cancelled) return;
      const tracking = nativeTrackingStarted(result);
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
  }, [intent, trackingMode, syncNonce]);

  // Last JS that still runs as the WebView freezes: re-assert the native
  // service so Flutter does not treat pause as stop.
  useEffect(() => {
    if (!shouldTrack || !hasNativeTracking()) return undefined;
    const mode =
      trackingMode === 'onTrip' ? TRACKING_MODE.ON_TRIP : TRACKING_MODE.IDLE;
    const keepAlive = () => {
      void startNativeTracking(mode, { forceEvent: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') keepAlive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', keepAlive);
    document.addEventListener('freeze', keepAlive);
    window.addEventListener('freeze', keepAlive);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', keepAlive);
      document.removeEventListener('freeze', keepAlive);
      window.removeEventListener('freeze', keepAlive);
    };
  }, [shouldTrack, trackingMode]);

  // Native is the background uploader. Until Flutter returns
  // `{ tracking: true }`, the WebView socket/HTTP path is the only thing
  // that reaches the server while the driver has the app open.
  // Keep publishing from the browser whenever this page is alive — if native
  // is also uploading, the backend dedupes. If native is not ready, the
  // customer map still moves.
  useDriverLocation({
    enabled: shouldTrack,
    publish: true,
  });

  return null;
}

export default DriverLocationBridge;
