import { useEffect, useState } from 'react';

/**
 * Wait for a Zustand persist store to finish rehydrating from localStorage.
 * Without this, auth guards see the default `isAuthenticated: false` on the
 * first paint and bounce the user to login even though a session exists.
 */
export function useStoreHydration(store) {
  const [hydrated, setHydrated] = useState(() => store.persist?.hasHydrated?.() ?? true);

  useEffect(() => {
    if (!store.persist?.onFinishHydration) {
      setHydrated(true);
      return undefined;
    }
    setHydrated(store.persist.hasHydrated());
    return store.persist.onFinishHydration(() => setHydrated(true));
  }, [store]);

  return hydrated;
}
