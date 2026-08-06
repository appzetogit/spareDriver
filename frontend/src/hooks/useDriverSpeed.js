import { useEffect, useRef, useState } from 'react';
import { speedKmhBetween } from '../utils/geo';

/**
 * Derive ground speed (km/h) from successive GPS samples.
 * Smoothed with a light EMA so zoom bands don't thrash on noisy GPS.
 */
export function useDriverSpeed(position, { emaAlpha = 0.35 } = {}) {
  const [speedKmh, setSpeedKmh] = useState(0);
  const prevRef = useRef(null);

  useEffect(() => {
    if (!position) return;

    const now = Date.now();
    const prev = prevRef.current;
    if (
      prev &&
      Number.isFinite(prev.lat) &&
      Number.isFinite(prev.lng) &&
      now > prev.ts
    ) {
      const instant = speedKmhBetween(prev, position, now - prev.ts);
      // Clamp absurd spikes (tunnel GPS jumps, etc.).
      const clamped = Math.min(140, Math.max(0, instant));
      setSpeedKmh((s) => s * (1 - emaAlpha) + clamped * emaAlpha);
    }

    prevRef.current = {
      lat: position.lat,
      lng: position.lng,
      ts: now,
    };
  }, [position, emaAlpha]);

  return speedKmh;
}

export default useDriverSpeed;
