import { DRIVER_NOTIFICATION } from '../constants/notificationTypes';

function parseOfferJson(data) {
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
  return offer;
}

function isTruthyFlag(value) {
  return value === true || value === '1' || value === 'true';
}

/**
 * Parse FCM `data` (all string values) into a booking-offer action for the
 * driver incoming-offer store / inbox store.
 *
 * @returns {{ type: 'offer' | 'inbox', offer: object } | { type: 'withdrawn', bookingId: string } | null}
 */
export function parseDriverOfferFcmData(data = {}) {
  if (!data || typeof data !== 'object') return null;

  const kind = data.kind || data.type || '';

  if (
    kind === DRIVER_NOTIFICATION.BOOKING_OFFER_WITHDRAWN ||
    kind === 'booking_offer_withdrawn'
  ) {
    const bookingId = data.bookingId || data.subscriptionId
      ? String(data.bookingId || data.subscriptionId)
      : null;
    if (!bookingId) return null;
    return { type: 'withdrawn', bookingId, reason: data.reason || '' };
  }

  const isInboxKind =
    kind === DRIVER_NOTIFICATION.INBOX_OFFER
    || kind === 'inbox_offer'
    || isTruthyFlag(data.inbox)
    || data.bookingType === 'scheduled'
    || data.bookingType === 'outstation'
    || data.bookingType === 'subscription';

  if (
    kind === DRIVER_NOTIFICATION.BOOKING_OFFER
    || kind === DRIVER_NOTIFICATION.NEW_BOOKING_REQUEST
    || kind === DRIVER_NOTIFICATION.INBOX_OFFER
    || kind === 'booking_offer'
    || kind === 'inbox_offer'
  ) {
    let offer = parseOfferJson(data);

    if (!offer?.bookingId && (data.bookingId || data.subscriptionId)) {
      offer = {
        bookingId: String(data.bookingId || data.subscriptionId),
        bookingNumber: data.bookingNumber || '',
        offerExpiresAt: data.offerExpiresAt || null,
        bookingType: data.bookingType || '',
        inbox: isInboxKind,
        subscriptionId: data.subscriptionId ? String(data.subscriptionId) : '',
      };
    }

    if (!offer?.bookingId) return null;
    if (data.offerExpiresAt && !offer.offerExpiresAt) {
      offer.offerExpiresAt = data.offerExpiresAt;
    }
    if (data.bookingType && !offer.bookingType) {
      offer.bookingType = data.bookingType;
    }
    if (isInboxKind) {
      offer.inbox = true;
    }
    return { type: isInboxKind ? 'inbox' : 'offer', offer };
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
