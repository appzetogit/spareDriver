/**
 * Short two-tone notification beep generated with Web Audio (no asset needed).
 * Browsers block audio until the first user gesture, so the context is
 * unlocked on the first pointerdown/keydown and beeps before that are dropped.
 */
let ctx = null;
let lastBeepAt = 0;

function getCtx() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

function unlock() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => null);
}

if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }),
  );
}

export function playBeep({ volume = 0.35, minGapMs = 700 } = {}) {
  const now = Date.now();
  if (now - lastBeepAt < minGapMs) return;
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  lastBeepAt = now;

  [[880, 0], [1175, 0.16]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + offset;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  });
}
