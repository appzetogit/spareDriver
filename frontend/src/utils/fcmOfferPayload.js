import { DRIVER_NOTIFICATION } from '../constants/notificationTypes';

/**
 * Parse FCM `data` (all string values) into a booking-offer action for the
 * driver incoming-offer store.
 *
 * @returns {{ type: 'offer', offer: object } | { type: 'withdrawn', bookingId: string } | null}
 */
export function parseDriverOfferFcmData(data = {}) {
  if (!data || typeof data !== 'object') return null;

  const kind = data.kind || data.type || '';

  if (
    kind === DRIVER_NOTIFICATION.BOOKING_OFFER_WITHDRAWN ||
    kind === 'booking_offer_withdrawn'
  ) {
    const bookingId = data.bookingId ? String(data.bookingId) : null;
    if (!bookingId) return null;
    return { type: 'withdrawn', bookingId, reason: data.reason || '' };
  }

  if (
    kind === DRIVER_NOTIFICATION.BOOKING_OFFER ||
    kind === DRIVER_NOTIFICATION.NEW_BOOKING_REQUEST ||
    kind === 'booking_offer'
  ) {
    let offer = null;
    if (typeof data.offer === 'string' && data.offer) {
      try {
        offer = JSON.parse(data.offer);
      } catch {
        offer = null;
      }
    } else if (data.offer && typeof data.offer === 'object') {
      offer = data.offer;
    }

    if (!offer?.bookingId && data.bookingId) {
      // Minimal fallback — resume API should fill the rest if needed.
      offer = {
        bookingId: String(data.bookingId),
        bookingNumber: data.bookingNumber || '',
        offerExpiresAt: data.offerExpiresAt || null,
      };
    }

    if (!offer?.bookingId) return null;
    if (data.offerExpiresAt && !offer.offerExpiresAt) {
      offer.offerExpiresAt = data.offerExpiresAt;
    }
    return { type: 'offer', offer };
  }

  return null;
}

/** Apply a parsed FCM offer action against the incoming-offer store. */
export function applyDriverOfferFcmAction(store, action) {
  if (!store || !action) return false;
  if (action.type === 'withdrawn') {
    const current = store.getState?.().offer ?? store.offer;
    if (!current || String(current.bookingId) === String(action.bookingId)) {
      if (typeof store.getState === 'function') {
        store.getState().clearOffer();
      } else {
        store.clearOffer();
      }
      return true;
    }
    return false;
  }
  if (action.type === 'offer') {
    if (typeof store.getState === 'function') {
      return store.getState().hydrateOffer(action.offer);
    }
    return store.hydrateOffer(action.offer);
  }
  return false;
}
