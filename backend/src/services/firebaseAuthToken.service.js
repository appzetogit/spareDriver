import { getFirebaseAdmin, isFirebaseReady } from '../config/firebase.js';
import Booking from '../models/booking.model.js';
import { ACTIVE_BOOKING_STATUSES } from '../constants/bookingStatus.js';

/**
 * Firebase custom tokens for Realtime Database reads.
 *
 * The web app used to talk to RTDB with no Firebase identity at all, which
 * meant the database rules had to allow anonymous reads of `/drivers` for the
 * customer map to work — handing every client the live position of every
 * driver in the fleet, plus the `activeTrip` block carrying customer names and
 * phone numbers.
 *
 * Now each client signs in with a token minted here, carrying claims that the
 * database rules can check:
 *
 *   customer → `{ role: 'user', bookingId }`  reads `/trips/{bookingId}/driver`
 *   staff    → `{ role: 'staff' }`            reads `/drivers`
 *   driver   → `{ role: 'driver' }`           reads nothing (it writes via API)
 *
 * `bookingId` is baked into the token rather than passed by the client, so a
 * customer cannot ask for someone else's ride. The token is short-lived and
 * re-minted when the active booking changes.
 */

/** Firebase caps custom-token lifetime at 1 hour; clients refresh before that. */
const TOKEN_TTL_MS = 55 * 60_000;

function admin() {
  const sdk = getFirebaseAdmin();
  if (!sdk) return null;
  return sdk;
}

/**
 * Mint a token for a signed-in customer, scoped to their current active ride.
 *
 * Returns `{ token: null }` when the customer has no ride in flight — there is
 * nothing for them to watch, so there is nothing to grant.
 */
export async function mintUserTripToken(userId) {
  const sdk = admin();
  if (!sdk) return { token: null, reason: 'firebase_not_configured' };

  const booking = await Booking.findOne({
    userId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  })
    .select('_id status')
    .sort({ updatedAt: -1 })
    .lean();

  if (!booking) return { token: null, reason: 'no_active_booking' };

  const uid = `user:${userId}`;
  const token = await sdk.auth().createCustomToken(uid, {
    role: 'user',
    bookingId: String(booking._id),
  });

  return {
    token,
    uid,
    bookingId: String(booking._id),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
}

/** Mint a staff token for the admin live map. */
export async function mintStaffToken(staffId) {
  const sdk = admin();
  if (!sdk) return { token: null, reason: 'firebase_not_configured' };

  const uid = `staff:${staffId}`;
  const token = await sdk.auth().createCustomToken(uid, { role: 'staff' });

  return {
    token,
    uid,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
}

/**
 * Mint a token for a driver so their own app can render its trip map from the
 * same node the customer reads, instead of a second code path.
 */
export async function mintDriverTripToken(driverId) {
  const sdk = admin();
  if (!sdk) return { token: null, reason: 'firebase_not_configured' };

  const booking = await Booking.findOne({
    driverId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  })
    .select('_id')
    .sort({ updatedAt: -1 })
    .lean();

  const uid = `driver:${driverId}`;
  const token = await sdk.auth().createCustomToken(uid, {
    role: 'driver',
    bookingId: booking ? String(booking._id) : '',
  });

  return {
    token,
    uid,
    bookingId: booking ? String(booking._id) : null,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
}

export function isFirebaseAuthReady() {
  return isFirebaseReady();
}
