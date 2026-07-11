import { useEffect, useState } from 'react';

/**
 * Debounce a value — useful for map centre / search text so downstream
 * effects don't fire on every intermediate change.
 */
export function useDebouncedValue(value, delayMs = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
