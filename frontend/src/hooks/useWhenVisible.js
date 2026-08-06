import { useEffect, useState } from 'react';

/**
 * True once `ref` intersects the viewport (with optional rootMargin).
 * Keeps below-fold / optional sections from firing APIs until needed.
 *
 * @param {React.RefObject<Element | null>} ref
 * @param {{ rootMargin?: string, once?: boolean, enabled?: boolean }} [options]
 */
export function useWhenVisible(ref, { rootMargin = '200px 0px', once = true, enabled = true } = {}) {
  const [visible, setVisible] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setVisible(true);
      return undefined;
    }

    const node = ref?.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        if (once) observer.disconnect();
      },
      { root: null, rootMargin, threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin, once, enabled]);

  return visible;
}

export default useWhenVisible;
