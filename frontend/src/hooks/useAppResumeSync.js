import { useEffect } from 'react';
import { onAppResume } from '../utils/appResume';
import useSocketStore from '../store/useSocketStore';

/**
 * Bring the app back in sync after it returns to the foreground.
 *
 * Recovery used to be implicit: whenever socket.io's reconnect backoff
 * happened to fire, and whenever the geolocation watch happened to deliver.
 * Both can take tens of seconds, during which the customer is looking at a
 * stale map and the driver is not reporting.
 *
 * @param {() => void | Promise<void>} [refetch]
 *   Screen-specific reload — the active booking, the trip, whatever this
 *   screen would be wrong about after a gap. Runs after the socket is kicked.
 */
export function useAppResumeSync(refetch) {
  useEffect(() => {
    return onAppResume(() => {
      // Socket.IO's own backoff can be seconds away from its next attempt.
      // Asking directly turns that into an immediate reconnect.
      const { socket, isConnected, connect } = useSocketStore.getState();
      if (!isConnected) {
        if (socket && !socket.connected) socket.connect();
        else connect();
      }

      Promise.resolve(refetch?.()).catch(() => {
        /* best-effort — a failed refetch must not break the resume path */
      });
    });
  }, [refetch]);
}

export default useAppResumeSync;
