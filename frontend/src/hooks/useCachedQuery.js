import { useEffect, useCallback, useRef } from 'react';

/**
 * Subscribe to a cached query entry and fetch only when needed.
 *
 * @param {import('zustand').StoreApi} store - Store from createQueryStore()
 * @param {string} cacheKey - From buildCacheKey()
 * @param {object} params - Passed to store.fetch / fetcher
 * @param {{ enabled?: boolean }} options
 */
export function useCachedQuery(store, cacheKey, params, options = {}) {
  const { enabled = true } = options;

  const entry = store((state) => state.entries[cacheKey]);
  const fetch = store((state) => state.fetch);
  const refresh = store((state) => state.refresh);

  // Latest-params ref: update during render so the fetch effect below never
  // races a separate "sync ref" effect and fires with a stale `{}`
  // (nearby-drivers home widget was hitting the API before lat/lng arrived).
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Track `isFetched` in the dep array so that when an external caller
  // wipes the entry via `store.invalidate(...)`, every still-mounted
  // subscriber automatically re-fires the fetch. Without this, the entry
  // disappears, `isLoading` flips to true forever, and the UI hangs on a
  // spinner (the original kit-purchase infinite-loader bug).
  const entryIsFetched = !!entry?.isFetched;
  useEffect(() => {
    if (!enabled || !cacheKey) return;
    if (entryIsFetched) return;
    fetch(cacheKey, paramsRef.current ?? {}).catch(() => {});
  }, [cacheKey, enabled, fetch, entryIsFetched]);

  const refetch = useCallback(() => {
    if (!cacheKey) return Promise.resolve(null);
    return refresh(cacheKey, paramsRef.current ?? {});
  }, [cacheKey, refresh]);

  const isLoading = enabled && (entry?.loading || (!entry?.isFetched && !entry?.error));

  return {
    data: entry?.data ?? null,
    loading: isLoading,
    error: entry?.error ?? null,
    isFetched: entry?.isFetched ?? false,
    fetchedAt: entry?.fetchedAt ?? null,
    refetch,
    refresh: refetch,
  };
}
