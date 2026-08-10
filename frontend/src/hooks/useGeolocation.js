import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LOCATION_CACHE_TTL_MS,
  classifyAccuracy,
  classifyGeoError,
  fetchLocationWithCascade,
  geoErrorMessage,
  getCachedLocation,
  getLastKnownLocation,
  getLocationOnce,
  invalidateLocationCache,
  isGeolocationSupported,
  logGeo,
  makeGeoError,
  GEO_ERROR,
} from '../utils/geolocation';

/**
 * Shared one-shot / cascade geolocation for home + booking screens.
 *
 *  – Module cache (~45s, accuracy-gated) avoids hammering the OS.
 *  – Cascade: fast network → high accuracy → one more GPS try.
 *  – Never clears the last valid coords on a transient failure.
 *  – Refreshes only on real hidden→visible resume (WebView-safe; no focus spam).
 *  – Options are primitive deps (no unstable object identity).
 */

export function useGeolocation({
  enabled = true,
  cascade = true,
  enableHighAccuracy,
  timeout,
  maximumAge,
} = {}) {
  const [coords, setCoords] = useState(() => getCachedLocation() || getLastKnownLocation());
  const [error, setError] = useState(null);
  const [errorKind, setErrorKind] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const cancelledRef = useRef(false);
  const abortRef = useRef(null);
  const inFlightRef = useRef(false);
  const fetchGenRef = useRef(0);
  const coordsRef = useRef(coords);
  const wasHiddenRef = useRef(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );
  coordsRef.current = coords;

  const hasCustomOptions =
    enableHighAccuracy !== undefined || timeout !== undefined || maximumAge !== undefined;

  const applySuccess = useCallback((next) => {
    setCoords(next);
    setError(null);
    setErrorKind(null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const applyFailure = useCallback((err) => {
    const kind = classifyGeoError(err);
    setError(geoErrorMessage(kind));
    setErrorKind(kind);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const runFetch = useCallback(
    async ({ force = false, reason = 'mount' } = {}) => {
      if (!enabled) return;
      if (cancelledRef.current) return;

      if (!isGeolocationSupported()) {
        applyFailure(makeGeoError(GEO_ERROR.UNSUPPORTED));
        return;
      }

      if (!force) {
        const fresh = getCachedLocation();
        if (fresh) {
          logGeo('useGeolocation cache hit', {
            reason,
            accuracy: fresh.accuracy,
            ageMs: Date.now() - fresh.fetchedAt,
          });
          applySuccess(fresh);
          return;
        }
      }

      // Never abort an in-flight request for a background resume — that caused
      // Flutter WebView focus/visibility spam to loop forever on "Getting location…".
      if (inFlightRef.current) {
        logGeo('useGeolocation skip (in flight)', { reason, force });
        return;
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortRef.current = controller;
      const gen = ++fetchGenRef.current;

      inFlightRef.current = true;
      const hadCoords = Boolean(coordsRef.current);
      setLoading(!hadCoords);
      setRefreshing(hadCoords);
      if (force) {
        setError(null);
        setErrorKind(null);
      }

      const useCascade = cascade && !hasCustomOptions;
      logGeo('useGeolocation fetch start', { reason, force, cascade: useCascade, gen });

      try {
        let next;
        if (hasCustomOptions) {
          next = await getLocationOnce({
            enableHighAccuracy: enableHighAccuracy ?? false,
            timeout: timeout ?? 8_000,
            maximumAge: maximumAge ?? 30_000,
          });
        } else if (useCascade) {
          next = await fetchLocationWithCascade({
            signal: controller?.signal,
            onAttempt: (n) => {
              if (!cancelledRef.current && fetchGenRef.current === gen) setAttempt(n);
            },
            onProgress: (partial) => {
              if (cancelledRef.current || fetchGenRef.current !== gen) return;
              // Leave "Getting your location…" as soon as the first fix arrives.
              setCoords(partial);
              setError(null);
              setErrorKind(null);
              setLoading(false);
              setRefreshing(true);
              coordsRef.current = partial;
            },
          });
        } else {
          next = await getLocationOnce();
        }

        if (cancelledRef.current || fetchGenRef.current !== gen) return;
        applySuccess(next);
      } catch (err) {
        if (cancelledRef.current || fetchGenRef.current !== gen) return;
        if (err?.message === 'Location request cancelled') {
          // Only clear loading if we still have nothing to show.
          if (!coordsRef.current) {
            setLoading(false);
            setRefreshing(false);
          }
          return;
        }
        applyFailure(err);
      } finally {
        if (fetchGenRef.current === gen) inFlightRef.current = false;
      }
    },
    [
      enabled,
      cascade,
      hasCustomOptions,
      enableHighAccuracy,
      timeout,
      maximumAge,
      applySuccess,
      applyFailure,
    ],
  );

  const refresh = useCallback(() => {
    // Explicit retry may supersede an in-flight request.
    if (inFlightRef.current) {
      abortRef.current?.abort?.();
      inFlightRef.current = false;
    }
    invalidateLocationCache();
    return runFetch({ force: true, reason: 'retry' });
  }, [runFetch]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return undefined;

    runFetch({ force: false, reason: 'mount' });

    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort?.();
    };
  }, [enabled, runFetch]);

  // WebView-safe resume: only after the page was actually hidden, not on every focus.
  useEffect(() => {
    if (!enabled) return undefined;

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }
      if (!wasHiddenRef.current) return;
      wasHiddenRef.current = false;

      const fresh = getCachedLocation({ maxAgeMs: LOCATION_CACHE_TTL_MS });
      if (fresh) {
        logGeo('visibility: cache still fresh');
        applySuccess(fresh);
        return;
      }
      logGeo('visibility: refreshing stale location');
      runFetch({ force: true, reason: 'visibility' });
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, runFetch, applySuccess]);

  const accuracyQuality = coords ? classifyAccuracy(coords.accuracy) : null;
  const hasCoords = Boolean(coords);
  const hardError = error && !hasCoords ? error : null;

  return {
    coords,
    loading,
    refreshing,
    error: hardError,
    softError: error && hasCoords ? error : null,
    errorKind: hardError ? errorKind : null,
    rawError: error,
    rawErrorKind: errorKind,
    attempt,
    accuracyQuality,
    refresh,
  };
}
