/**
 * Outstation day-based dispatch helpers.
 *
 * All "days" math uses local calendar midnights (same convention as
 * frontend `outstationSchedule.js` duration math). Hourly scheduled
 * rides do NOT use these helpers.
 */

export function startOfLocalDay(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addCalendarDays(day, n) {
  const base = startOfLocalDay(day);
  if (!base) return null;
  const out = new Date(base);
  out.setDate(out.getDate() + Number(n || 0));
  return out;
}

/**
 * Midnight of (pickup calendar day − visibilityDays).
 * Drivers first see the inbox offer at this instant.
 */
export function outstationAssignAt(pickupAt, visibilityDays) {
  const pickupDay = startOfLocalDay(pickupAt);
  if (!pickupDay) return null;
  const days = Math.max(0, Number(visibilityDays) || 0);
  return addCalendarDays(pickupDay, -days);
}

/**
 * Midnight of (pickup calendar day − emergencyDays).
 * Unmatched bookings escalate to the emergency pool at this instant.
 */
export function outstationEscalateAt(pickupAt, emergencyDays) {
  const pickupDay = startOfLocalDay(pickupAt);
  if (!pickupDay) return null;
  const days = Math.max(0, Number(emergencyDays) || 0);
  return addCalendarDays(pickupDay, -days);
}

/**
 * Precise map / coordinates unlock at local midnight on the pickup day.
 */
export function isOutstationLocationRevealed(pickupAt, now = new Date()) {
  const tripDay = startOfLocalDay(pickupAt);
  if (!tripDay) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  return nowMs >= tripDay.getTime();
}

/**
 * Calendar-day gap from today (local midnight) to the pickup calendar day.
 * Same-day → 0.
 */
export function calendarDaysUntilPickup(pickupAt, now = new Date()) {
  const pickupDay = startOfLocalDay(pickupAt);
  const today = startOfLocalDay(now);
  if (!pickupDay || !today) return NaN;
  return Math.round((pickupDay.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Mutates (or shallow-clones place fields on) a booking-like object:
 * keep address text, strip GeoJSON / lat-lng until trip-day midnight.
 * Sets `locationRevealed`. Non-outstation → always revealed.
 *
 * @param {object} bookingLike
 * @param {{ bookingType?: string, serviceType?: string }} [hints]
 */
export function applyOutstationLocationPrivacy(bookingLike, hints = {}) {
  if (!bookingLike || typeof bookingLike !== 'object') return bookingLike;
  const bookingType = hints.bookingType || bookingLike.bookingType;
  const serviceType = hints.serviceType || bookingLike.serviceType;
  const isOutstation =
    bookingType === 'outstation'
    || serviceType === 'outstation'
    || !!bookingLike.outstation;
  if (!isOutstation) {
    bookingLike.locationRevealed = true;
    return bookingLike;
  }
  const pickupAt =
    bookingLike.outstation?.pickupAt || bookingLike.outstation?.startDate;
  const revealed = isOutstationLocationRevealed(pickupAt);
  bookingLike.locationRevealed = revealed;
  if (revealed) return bookingLike;

  const stripCoords = (place) => {
    if (!place || typeof place !== 'object') return place;
    if (!('location' in place) && place.lat == null && place.lng == null) {
      return place;
    }
    const next = { ...place, location: null };
    if ('lat' in next) next.lat = null;
    if ('lng' in next) next.lng = null;
    if ('coordinates' in next) next.coordinates = null;
    return next;
  };
  if (bookingLike.pickup) bookingLike.pickup = stripCoords(bookingLike.pickup);
  if (bookingLike.dropoff) bookingLike.dropoff = stripCoords(bookingLike.dropoff);
  return bookingLike;
}
