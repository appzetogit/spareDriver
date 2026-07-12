import { useEffect } from 'react';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useDriverIncomingOfferStore from '../store/driver/useDriverIncomingOfferStore';
import { useSocket } from '../hooks/useSocket';
import {
  applyDriverOfferFcmAction,
  parseDriverOfferFcmData,
} from '../utils/fcmOfferPayload';

/**
 * Driver-side offer resume + FCM service-worker bridge.
 *
 * - On login / visibility / socket reconnect → fetch pending-offer
 * - Listens for SW `postMessage` from notification click / withdraw
 */
export function DriverOfferResumeBridge() {
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  const fetchPendingOffer = useDriverIncomingOfferStore((s) => s.fetchPendingOffer);
  const syncExpiry = useDriverIncomingOfferStore((s) => s.syncExpiry);
  const { isConnected } = useSocket();

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refresh = () => {
      syncExpiry();
      void fetchPendingOffer();
    };

    refresh();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== 'SD_BOOKING_OFFER_FCM') return;
      const action = parseDriverOfferFcmData(msg.payload || {});
      if (action) {
        applyDriverOfferFcmAction(useDriverIncomingOfferStore, action);
        return;
      }
      // Click with incomplete payload → ask server for the live offer.
      void fetchPendingOffer();
    };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [isAuthenticated, fetchPendingOffer, syncExpiry]);

  // Socket came back — we may have missed BOOKING_OFFERED while offline.
  useEffect(() => {
    if (!isAuthenticated || !isConnected) return undefined;
    void fetchPendingOffer();
    return undefined;
  }, [isAuthenticated, isConnected, fetchPendingOffer]);

  return null;
}
