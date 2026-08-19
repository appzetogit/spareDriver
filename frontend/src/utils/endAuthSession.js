import { clearAuthTokens } from './authTokens';

const STEP_TIMEOUT_MS = 2500;

function withTimeout(promise, ms = STEP_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

/**
 * Tear down the client auth session completely:
 * 1. Best-effort FCM unregister (while tokens/cookies may still be valid)
 * 2. Sign out of Firebase so its Realtime Database claims die with the session
 * 3. Clear httpOnly auth cookies via POST /auth/logout
 * 4. Clear access/refresh tokens from localStorage
 *
 * Order matters: httpOnly refresh cookies alone can revive the session on the
 * next /auth/refresh-token call if they are left behind. localStorage clear is
 * always last (and always runs) so a hung network call cannot leave tokens.
 */
export async function endAuthSession(audience = 'user') {
  try {
    const { unregisterFcmToken } = await import('../hooks/useFcmRegistration.js');
    await withTimeout(unregisterFcmToken(audience));
  } catch {
    /* best-effort */
  }

  // The Firebase session carries a `bookingId` claim granting reads on that
  // ride's location node. It has its own lifetime, so signing out of the app
  // has to sign out of Firebase too or the grant outlives the session.
  try {
    const { clearFirebaseAuth } = await import('../config/firebaseAuth.js');
    await withTimeout(clearFirebaseAuth());
  } catch {
    /* best-effort */
  }

  try {
    const api = (await import('./api.js')).default;
    await withTimeout(api.post('/auth/logout'));
  } catch {
    /* best-effort — still clear local tokens below */
  }

  clearAuthTokens();
}
