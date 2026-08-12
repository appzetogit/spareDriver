import { useCallback, useEffect, useRef } from 'react';
import { useNotificationSound } from './useNotificationSound';

const ALERT_SRC = '/audio/alert_.mp3';
/** Inbox / extend / emergency-pool: stop after this. Instant offer keeps looping. */
const RING_MS = 5_000;

/**
 * Timed in-app alert for WebView foreground (Flutter only rings when
 * the APK is backgrounded / killed). Plays then stops after 5s.
 * Prime on first tap so mobile autoplay policy does not swallow the sound.
 */
export function useInAppAlertRing({ volume = 0.9 } = {}) {
  const sound = useNotificationSound(ALERT_SRC, { loop: true, volume });
  const stopTimerRef = useRef(null);

  const stop = useCallback(() => {
    if (stopTimerRef.current != null) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    sound.stop();
  }, [sound.stop]);

  const play = useCallback(() => {
    stop();
    sound.play();
    stopTimerRef.current = setTimeout(() => {
      stopTimerRef.current = null;
      sound.stop();
    }, RING_MS);
  }, [sound.play, sound.stop, stop]);

  useEffect(() => {
    const prime = () => sound.prime();
    window.addEventListener('sd:prime-offer-audio', prime);
    window.addEventListener('pointerdown', prime, { once: true });
    return () => {
      window.removeEventListener('sd:prime-offer-audio', prime);
      window.removeEventListener('pointerdown', prime);
      if (stopTimerRef.current != null) clearTimeout(stopTimerRef.current);
      sound.stop();
    };
  }, [sound.prime, sound.stop]);

  return { play, stop, prime: sound.prime };
}
