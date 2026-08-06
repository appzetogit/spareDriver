import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the camera should auto-follow the driver.
 * User pan / pinch / rotate disables follow and surfaces Recenter.
 *
 *   const { following, showRecenter, onUserGesture, recenter } =
 *     useMapFollowControl({ enabled: followDriver, onRecenter });
 *
 * `onRecenter` runs when the user taps Recenter (e.g. reset map heading).
 */
export function useMapFollowControl({ enabled = false, onRecenter } = {}) {
  const [following, setFollowing] = useState(Boolean(enabled));
  const suppressGestureRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onRecenterRef = useRef(onRecenter);
  onRecenterRef.current = onRecenter;

  useEffect(() => {
    enabledRef.current = enabled;
    setFollowing(Boolean(enabled));
  }, [enabled]);

  const onUserGesture = useCallback(() => {
    if (!enabledRef.current) return;
    if (suppressGestureRef.current) return;
    setFollowing(false);
  }, []);

  const recenter = useCallback(() => {
    suppressGestureRef.current = true;
    setFollowing(true);
    try {
      onRecenterRef.current?.();
    } catch {
      // ignore recenter side-effect errors
    }
    window.setTimeout(() => {
      suppressGestureRef.current = false;
    }, 450);
  }, []);

  const withProgrammaticCamera = useCallback((fn) => {
    suppressGestureRef.current = true;
    try {
      fn?.();
    } finally {
      window.setTimeout(() => {
        suppressGestureRef.current = false;
      }, 350);
    }
  }, []);

  return {
    following: Boolean(enabled) && following,
    showRecenter: Boolean(enabled) && !following,
    onUserGesture,
    recenter,
    withProgrammaticCamera,
    /** True while our own camera writes should ignore gesture listeners. */
    isGestureSuppressed: () => suppressGestureRef.current,
  };
}

export default useMapFollowControl;
