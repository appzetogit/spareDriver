import { useCallback, useEffect, useState } from 'react';
import useAppResumeSync from '../hooks/useAppResumeSync';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useDriverOnlineStore } from '../store/driver/useDriverOnlineStore';
import useDriverActiveTripStore from '../store/driver/useDriverActiveTripStore';
import useDriverAuthStore from '../store/useDriverAuthStore';
import { onAuthTokensChanged } from '../utils/authTokens';
import {
  hasNativeTracking,
  startNativeTracking,
  stopNativeTracking,
  TRACKING_MODE,
} from '../utils/nativeTracking';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus';

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
 * When native accepts the job the browser watch is switched off: running both
 * means two GPS consumers draining the same battery for one position. When
 * native refuses — permission not granted, location switched off — or we are
 * in a plain browser, the watch stays on so the driver is not silently
 * untracked.
 *
 * Native is reached through `window.LocationBridge` (Flutter injects it) via
 * `startNativeTracking` / `stopNativeTracking`. JWT stays in
 * `localStorage.accessToken` so the wrapper can authenticate background
 * uploads even after this page is frozen.
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
    startNativeTracking(mode).then((result) => {
      if (cancelled) return;
      setNativeTracking(result?.tracking === true);
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

  // Hand GPS duty to native only once it has actually confirmed.
  useDriverLocation({ enabled: shouldTrack && !nativeTracking });

  return null;
}

export default DriverLocationBridge;
