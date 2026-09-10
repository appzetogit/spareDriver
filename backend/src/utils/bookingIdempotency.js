import crypto from 'crypto';

/**
 * Duplicate-submit protection for booking creation.
 *
 * `createBookingService` debits the customer's wallet before it inserts the
 * booking row, and the only thing standing between a double-submit and a
 * double charge was `assertCarAvailableForWindow` — a read-then-create
 * check that two concurrent requests both pass, because neither has
 * written anything by the time the other reads. The result was two
 * bookings and two debits for one tap.
 *
 * Rather than require every client to start sending an idempotency key
 * (which would mean a coordinated app release before the backend is safe),
 * we derive a fingerprint from the request itself. Two requests that name
 * the same customer, car, route and time window ARE the same booking
 * attempt — a customer cannot legitimately hold one car for one window
 * twice, which is exactly what `assertCarAvailableForWindow` already
 * enforces once a row exists. A client-supplied `Idempotency-Key` header
 * is honoured when present and simply wins over the fingerprint.
 *
 * Deliberately excludes the fare: pricing is recomputed server-side and can
 * legitimately differ between two attempts (a surge window ticking over,
 * an admin editing pricing), and a replay must still be recognised as the
 * same attempt.
 */

/** Milliseconds a fingerprint stays claimed. */
export const IDEMPOTENCY_TTL_MS = 10 * 60_000;

function isoOrEmpty(value) {
  if (!value) return '';
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? String(t) : '';
}

function coordsOf(place) {
  const c = place?.location?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return '';
  // Round to ~1 m so an insignificant GPS jitter between two taps of the
  // same button does not read as two different bookings.
  const round = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(5) : '');
  return `${round(c[0])},${round(c[1])}`;
}

/**
 * Stable fingerprint for a booking-create request.
 *
 * Field selection is explicit rather than hashing the whole body: clients
 * send incidental extras (analytics ids, UI state) that vary between two
 * taps and would silently defeat the dedupe if they were hashed in.
 *
 * @param {string} userId
 * @param {object} body  the validated create payload
 * @returns {string} hex sha256
 */
export function bookingFingerprint(userId, body = {}) {
  const { serviceType, bookingType, carId, pickup, dropoff, hourly, outstation, couponCode } =
    body;

  const parts = [
    String(userId || ''),
    String(serviceType || ''),
    String(bookingType || ''),
    String(carId || ''),
    coordsOf(pickup),
    coordsOf(dropoff),
    // Hourly window
    isoOrEmpty(hourly?.scheduledStartAt),
    String(hourly?.durationHours ?? ''),
    String(hourly?.slabId || ''),
    hourly?.isCustomDuration ? '1' : '0',
    // Outstation window — accept either the new or the legacy date pair,
    // the same way validateCreateInput does.
    isoOrEmpty(outstation?.pickupAt || outstation?.startDate),
    isoOrEmpty(outstation?.expectedReturnAt || outstation?.endDate),
    String(outstation?.destinationAddress || '').trim().toLowerCase(),
    outstation?.needsStay === false ? '0' : '1',
    outstation?.needsFood === false ? '0' : '1',
    String(couponCode || '').trim().toUpperCase(),
  ];

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Resolve the key for a create request: an explicit client key wins,
 * otherwise the derived fingerprint.
 *
 * The client key is namespaced per user so one customer cannot claim (or
 * collide with) another customer's key.
 *
 * @param {string} userId
 * @param {object} body
 * @param {string} [clientKey]  value of the `Idempotency-Key` header
 * @returns {string}
 */
export function resolveIdempotencyKey(userId, body, clientKey) {
  const supplied = String(clientKey || '').trim();
  if (supplied) {
    return crypto
      .createHash('sha256')
      .update(`client|${String(userId || '')}|${supplied.slice(0, 200)}`)
      .digest('hex');
  }
  return bookingFingerprint(userId, body);
}
