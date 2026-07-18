import { useEffect } from 'react';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useDriverIncomingOfferStore from '../store/driver/useDriverIncomingOfferStore';
import useDriverIncomingScheduledStore from '../store/driver/useDriverIncomingScheduledStore';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import { S2C_EVENTS } from '../constants/socketEvents';
import { BOOKING_TYPE } from '../constants/bookingStatus';
import {
  applyDriverOfferFcmAction,
  parseDriverOfferFcmData,
} from '../utils/fcmOfferPayload';

/**
 * Driver-side offer resume + FCM bridge + scheduled inbox hydration.
 *
 * - On login / visibility / socket reconnect → pending-offer + inbox count
 * - Listens for SW `postMessage` from notification click / withdraw
 * - Routes scheduled BOOKING_OFFERED into the inbox store
 */
export function DriverOfferResumeBridge() {
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  const fetchPendingOffer = useDriverIncomingOfferStore((s) => s.fetchPendingOffer);
  const syncExpiry = useDriverIncomingOfferStore((s) => s.syncExpiry);
  const fetchCount = useDriverIncomingScheduledStore((s) => s.fetchCount);
  const upsertFromOffer = useDriverIncomingScheduledStore((s) => s.upsertFromOffer);
  const removeByBookingId = useDriverIncomingScheduledStore((s) => s.removeByBookingId);
  const { isConnected } = useSocket();

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refresh = () => {
      syncExpiry();
      void fetchPendingOffer();
      void fetchCount();
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
      const payload = msg.payload || {};
      if (
        payload.inbox
        || payload.bookingType === BOOKING_TYPE.SCHEDULED
        || payload.bookingType === BOOKING_TYPE.OUTSTATION
        || payload.kind === 'subscription'
        || payload.bookingType === 'subscription'
      ) {
        if (msg.action === 'withdraw' || payload.withdrawn) {
          removeByBookingId(payload.bookingId || payload.subscriptionId);
        } else {
          upsertFromOffer(payload);
        }
        return;
      }
      const action = parseDriverOfferFcmData(payload);
      if (action) {
        applyDriverOfferFcmAction(useDriverIncomingOfferStore, action);
        return;
      }
      void fetchPendingOffer();
    };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [
    isAuthenticated,
    fetchPendingOffer,
    syncExpiry,
    fetchCount,
    upsertFromOffer,
    removeByBookingId,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !isConnected) return undefined;
    void fetchPendingOffer();
    void fetchCount();
    return undefined;
  }, [isAuthenticated, isConnected, fetchPendingOffer, fetchCount]);

  useSocketEvent(S2C_EVENTS.BOOKING_OFFERED, (payload) => {
    if (
      payload?.inbox
      || payload?.bookingType === BOOKING_TYPE.SCHEDULED
      || payload?.bookingType === BOOKING_TYPE.OUTSTATION
      || payload?.kind === 'subscription'
      || payload?.bookingType === 'subscription'
    ) {
      upsertFromOffer(payload);
    }
  });

  useSocketEvent(S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, (payload) => {
    if (payload?.bookingId || payload?.subscriptionId) {
      removeByBookingId(payload.bookingId || payload.subscriptionId, {
        reason: payload.reason,
      });
    }
  });

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    // Accept / cancel / escalate removes it from everyone's inbox.
    if (!payload?.bookingId) return;
    if (
      payload.status
      && payload.status !== 'searching'
      && payload.status !== 'pending_assignment'
    ) {
      removeByBookingId(payload.bookingId);
    }
  });

  return null;
}
