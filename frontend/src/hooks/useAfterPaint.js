import { useEffect, useState } from 'react';

/**
 * Flip to `true` after the browser has painted at least once.
 * Use to defer non-critical work (secondary APIs, heavy SDKs) so the first
 * visible frame stays interactive — especially important inside WebViews.
 *
 * @param {{ delayMs?: number, enabled?: boolean }} [options]
 */
export function useAfterPaint({ delayMs = 0, enabled = true } = {}) {
  const [ready, setReady] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return undefined;
    }

    let timeoutId = 0;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (delayMs > 0) {
          timeoutId = window.setTimeout(() => setReady(true), delayMs);
        } else {
          setReady(true);
        }
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [delayMs, enabled]);

  return ready;
}

export default useAfterPaint;
