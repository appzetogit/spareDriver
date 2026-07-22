import useAuthSessionStore from '../store/useAuthSessionStore';

/**
 * True once JWT-based session restore has finished (logged in or not).
 * Guards/auth pages must wait for this so they don't bounce to login
 * before tokens are checked.
 *
 * The unused `store` arg is kept so existing call sites keep working.
 */
export function useStoreHydration(_store) {
  return useAuthSessionStore((s) => s.status === 'ready');
}
