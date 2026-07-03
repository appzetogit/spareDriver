import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiny wrapper around `navigator.geolocation.getCurrentPosition` that:
 *
 *  – is cached in module scope so opening the home screen, then the booking
 *    flow, then the home screen again doesn't ask three times.
 *  – exposes a `refresh()` for the user to retry on failure.
 *  – returns serialisable `{ lat, lng, accuracy }` (no GeolocationCoordinates).
 *
 *   const { coords, loading, error, refresh } = useGeolocation();
 */

const FRESH_FOR_MS = 5 * 60 * 1000; // 5 min — good enough for "your location"
let cache = null;

function readCoords(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    fetchedAt: Date.now(),
  };
}

export function useGeolocation({ enabled = true, options } = {}) {
  const [coords, setCoords] = useState(() =>
    cache && Date.now() - cache.fetchedAt < FRESH_FOR_MS ? cache : null,
  );
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchPosition = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelledRef.current) return;
        const next = readCoords(pos);
        cache = next;
        setCoords(next);
        setLoading(false);
      },
      (err) => {
        if (cancelledRef.current) return;
        setLoading(false);
        if (err?.code === 1) setError('Allow location access to see places near you');
        else if (err?.code === 3) setError('Location request timed out');
        else setError(err?.message || 'Could not get your location');
      },
      {
        enableHighAccuracy: false,
        timeout: 8_000,
        maximumAge: 30_000,
        ...(options || {}),
      },
    );
  }, [options]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return undefined;
    // Cache is already reflected via the useState lazy initializer; only kick
    // off a fresh fetch when we don't have anything usable yet.
    const fresh = cache && Date.now() - cache.fetchedAt < FRESH_FOR_MS;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical mount-fetch
    if (!fresh) fetchPosition();
    return () => {
      cancelledRef.current = true;
    };
  }, [enabled, fetchPosition]);

  return { coords, loading, error, refresh: fetchPosition };
}
