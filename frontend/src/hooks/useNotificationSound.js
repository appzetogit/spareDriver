import { useCallback, useEffect, useRef } from 'react';

/** Temporary kill-switch — notifications/popups unchanged; rings only. */
export const NOTIFICATION_SOUND_MUTED = true;

/**
 * Reusable notification-sound hook.
 *
 *   const { play, stop, prime } = useNotificationSound('/audio/alert_.mp3', {
 *     loop: true,
 *     volume: 0.9,
 *   });
 *
 * Why a custom hook instead of inline `new Audio(...)`?
 *   - Mobile/desktop browsers BLOCK programmatic playback that isn't tied
 *     to a user gesture. The first `play()` will reject with a
 *     `NotAllowedError` if the user hasn't tapped the page yet. We catch
 *     that silently so callers don't have to.
 *   - We share one `<Audio>` element per hook instance — playing the same
 *     sound twice in a row doesn't allocate a second file or restart from
 *     mid-track.
 *   - Cleanup on unmount is automatic.
 *
 * The `prime()` helper exists for callers who want to opt in to "unlock"
 * audio playback on a known user gesture (e.g. inside a login button's
 * onClick). It plays + immediately pauses to satisfy the autoplay policy.
 *
 * @param {string} src                URL of the audio asset
 * @param {object} [opts]
 * @param {boolean} [opts.loop=false] Loop the track
 * @param {number} [opts.volume=1]    0–1
 */
export function useNotificationSound(src, { loop = false, volume = 1 } = {}) {
  const audioRef = useRef(null);

  // Allocate + configure once on mount. We do this inside an effect rather
  // than during render so React-Compiler doesn't see a ref read during a
  // render pass (which it (correctly) flags as a smell). Subsequent
  // `loop` / `volume` changes flow through the dedicated sync effect below.
  useEffect(() => {
    if (audioRef.current || typeof window === 'undefined') return undefined;
    const audio = new Audio(src);
    audio.preload = 'auto';
    audioRef.current = audio;
    return undefined;
  }, [src]);

  // Keep `loop` / `volume` in sync if a caller swaps them at runtime, and
  // apply the latest values once the audio element is ready.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = loop;
    audio.volume = volume;
  }, [loop, volume]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  /**
   * Lazy-init helper so `play()` works even when invoked in the same render
   * pass that mounted the hook (before the create-effect fires).
   */
  const ensureAudio = useCallback(() => {
    if (audioRef.current || typeof window === 'undefined') return audioRef.current;
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.loop = loop;
    audio.volume = volume;
    audioRef.current = audio;
    return audio;
  }, [src, loop, volume]);

  const play = useCallback(() => {
    if (NOTIFICATION_SOUND_MUTED) return;
    const audio = ensureAudio();
    if (!audio) return;
    // Always rewind so a back-to-back trigger starts from 0 rather than
    // resuming mid-track from where the previous play left off.
    try {
      audio.currentTime = 0;
    } catch {
      /* iOS occasionally throws if the element hasn't loaded; ignore */
    }
    const result = audio.play();
    // `audio.play()` returns a promise in all modern browsers. Swallow
    // autoplay-blocked rejections — the modal/visual UI is the primary
    // affordance; the sound is enhancement only.
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  }, [ensureAudio]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      /* same defensive guard as in play() */
    }
  }, []);

  /**
   * Opt-in helper to "unlock" audio playback on the first user gesture
   * after mount. Call this from a known click handler (login, "go online")
   * so subsequent automatic `play()` calls aren't blocked by the browser's
   * autoplay policy. No-op if already unlocked.
   */
  const prime = useCallback(() => {
    if (NOTIFICATION_SOUND_MUTED) return;
    const audio = ensureAudio();
    if (!audio) return;
    const previousVolume = audio.volume;
    audio.volume = 0;
    const result = audio.play();
    const settle = () => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      audio.volume = previousVolume;
    };
    if (result && typeof result.then === 'function') {
      result.then(settle).catch(settle);
    } else {
      settle();
    }
  }, [ensureAudio]);

  return { play, stop, prime };
}

export default useNotificationSound;
