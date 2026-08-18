import { getAuth, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseApp } from './firebase.js';
import api from '../utils/api';

/**
 * Sign this client in to Firebase so it can read the Realtime Database.
 *
 * The app used to talk to RTDB with no identity, which forced the database
 * rules open — every client could read every driver's live position. Now the
 * backend mints a short-lived custom token carrying only the claims this
 * client's rules need (`role`, and for a customer the one `bookingId` they are
 * entitled to watch), and we exchange it for a Firebase session.
 *
 * Everything degrades quietly: no Firebase config, no token, or a failed
 * sign-in all leave `ensureFirebaseAuth` returning false, and callers fall
 * back to the socket location channel.
 */

const ENDPOINT = {
  user: '/user/firebase-token',
  driver: '/driver/firebase-token',
  admin: '/admin/firebase-token',
};

/** Re-mint this long before the 1h Firebase cap. */
const REFRESH_AFTER_MS = 45 * 60_000;

let authInstance = null;
let inFlight = null;
let signedInAt = 0;
let signedInScope = null;
/** bookingId baked into the current token, so a ride change forces a re-mint. */
let signedInBookingId = null;

function auth() {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  authInstance = getAuth(app);
  return authInstance;
}

function isFresh(audience, bookingId) {
  if (!signedInScope) return false;
  if (signedInScope !== audience) return false;
  if (bookingId && signedInBookingId !== bookingId) return false;
  return Date.now() - signedInAt < REFRESH_AFTER_MS;
}

/**
 * Ensure a Firebase session exists for this audience.
 *
 * @param {'user'|'driver'|'admin'} audience
 * @param {{ bookingId?: string, force?: boolean }} [opts]
 * @returns {Promise<boolean>} true when RTDB reads are authorised
 */
export async function ensureFirebaseAuth(audience = 'user', opts = {}) {
  const { bookingId = null, force = false } = opts;

  const a = auth();
  if (!a) return false;

  if (!force && a.currentUser && isFresh(audience, bookingId)) return true;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await api.get(ENDPOINT[audience] || ENDPOINT.user);
      const data = res.data?.data;
      if (!data?.token) return false;

      await signInWithCustomToken(a, data.token);
      signedInAt = Date.now();
      signedInScope = audience;
      signedInBookingId = data.bookingId || null;
      return true;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[firebaseAuth] sign-in failed', err?.message || err);
      }
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Drop the Firebase session — call on logout so the claims do not outlive it. */
export async function clearFirebaseAuth() {
  signedInAt = 0;
  signedInScope = null;
  signedInBookingId = null;
  const a = auth();
  if (!a?.currentUser) return;
  try {
    await a.signOut();
  } catch {
    /* best-effort */
  }
}

export function onFirebaseAuthChange(handler) {
  const a = auth();
  if (!a) return () => {};
  return onAuthStateChanged(a, handler);
}
