import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';

const LOCATION_INTERVAL_MS = 15_000;

/**
 * Manages an active SOS session for a trip: fetches existing alert,
 * creates new ones, and streams location updates until resolved.
 */
export function useActiveSos(tripId, { enabled = true } = {}) {
  const [activeSos, setActiveSos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchActive = useCallback(async () => {
    if (!tripId || !enabled) return null;
    try {
      const res = await api.get(`/sos/trip/${tripId}/active`);
      const alert = res.data?.data?.alert || null;
      setActiveSos(alert);
      return alert;
    } catch {
      return null;
    }
  }, [tripId, enabled]);

  useEffect(() => {
    if (!tripId || !enabled) return undefined;
    fetchActive();
    return undefined;
  }, [tripId, enabled, fetchActive]);

  const sendLocation = useCallback(
    async (latitude, longitude) => {
      if (!activeSos?._id) return;
      try {
        await api.post('/sos/location', {
          sosId: activeSos._id,
          latitude,
          longitude,
        });
      } catch {
        /* best-effort streaming */
      }
    },
    [activeSos?._id],
  );

  const triggerSos = useCallback(
    async (latitude, longitude) => {
      if (!tripId) throw new Error('No active trip');
      setLoading(true);
      setError(null);
      try {
        const res = await api.post('/sos', {
          tripId,
          latitude,
          longitude,
        });
        const sosId = res.data?.data?.sosId;
        await fetchActive();
        return sosId;
      } catch (err) {
        const message = err?.response?.data?.message || 'Failed to send SOS';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tripId, fetchActive],
  );

  const startLocationStreaming = useCallback(
    (getCoords) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (!activeSos?._id || activeSos.status !== 'ACTIVE') return;

      const tick = async () => {
        const coords = await getCoords();
        if (!coords) return;
        await sendLocation(coords.lat, coords.lng);
      };

      tick();
      intervalRef.current = setInterval(tick, LOCATION_INTERVAL_MS);
    },
    [activeSos?._id, activeSos?.status, sendLocation],
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    activeSos,
    isSosActive: activeSos?.status === 'ACTIVE',
    loading,
    error,
    triggerSos,
    fetchActive,
    sendLocation,
    startLocationStreaming,
  };
}
