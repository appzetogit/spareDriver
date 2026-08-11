import { useEffect } from 'react';
import useDriverAuthStore from '../store/useDriverAuthStore';
import useDriverIncomingOfferStore from '../store/driver/useDriverIncomingOfferStore';
import useDriverIncomingScheduledStore from '../store/driver/useDriverIncomingScheduledStore';
import {
  invalidateDriverDashboardCaches,
} from '../store/driver/useDriverActiveTripStore';
import { useSocket, useSocketEvent } from '../hooks/useSocket';
import { S2C_EVENTS } from '../constants/socketEvents';
import { BOOKING_STATUS, BOOKING_TYPE } from '../constants/bookingStatus';
import {
  applyDriverOfferFcmAction,
  parseDriverOfferFcmData,
} from '../utils/fcmOfferPayload';

/** Trip ended / unassigned for this driver — refresh home Active trips. */
const DRIVER_HOME_REFRESH_STATUSES = new Set([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.PENDING_ASSIGNMENT,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
]);

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
        payload.kind === 'inbox_offer'
        || payload.inbox === '1'
        || payload.inbox === true
        || payload.inbox === 'true'
        || payload.bookingType === BOOKING_TYPE.SCHEDULED
        || payload.bookingType === BOOKING_TYPE.OUTSTATION
        || payload.kind === 'subscription'
        || payload.bookingType === 'subscription'
      ) {
        if (
          msg.action === 'withdraw'
          || payload.withdrawn
          || payload.kind === 'booking_offer_withdrawn'
        ) {
          removeByBookingId(payload.bookingId || payload.subscriptionId);
        } else {
          upsertFromOffer(payload);
        }
        return;
      }
      const action = parseDriverOfferFcmData(payload);
      if (action) {
        if (action.type === 'inbox') {
          upsertFromOffer(action.offer);
          return;
        }
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
    // Drop stale "Active trips" on /driver/home after customer cancel,
    // complete, or outstation re-dispatch (driver unassigned).
    if (payload.status && DRIVER_HOME_REFRESH_STATUSES.has(payload.status)) {
      invalidateDriverDashboardCaches();
    }
  });

  return null;
}
