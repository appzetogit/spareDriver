import { useEffect } from 'react';

/**
 * Fills #root / body gutters outside the max-w-lg phone column with brand
 * yellow while mounted. Layout unchanged — tablet-only visual bleed.
 */
export function usePrimaryBleedBg() {
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.backgroundColor;
    const prevHtml = html.style.backgroundColor;
    body.style.backgroundColor = 'var(--color-primary)';
    html.style.backgroundColor = 'var(--color-primary)';
    return () => {
      body.style.backgroundColor = prevBody;
      html.style.backgroundColor = prevHtml;
    };
  }, []);
}
