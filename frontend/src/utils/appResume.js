/**
 * "The app came back" — one signal, three sources.
 *
 * Inside the Flutter wrapper the page is not unloaded when the app is
 * backgrounded; it is frozen. On the way back nothing tells it that time has
 * passed, so it waits on whatever socket reconnect backoff happens to fire
 * next. On a driver's phone that is the difference between the customer's map
 * updating in a second and updating in thirty.
 *
 * Sources, in order of reliability:
 *   1. `window.__spareOnAppResume()` — called by the native wrapper's
 *      lifecycle observer. The only one that fires when the WebView was
 *      genuinely suspended.
 *   2. `visibilitychange` → visible — browsers, and some WebView states.
 *   3. `online` — network came back, which is a resume for our purposes.
 *
 * Handlers are deduped inside a short window so one resume does not trigger
 * three refetch storms.
 */

const handlers = new Set();

/** Collapse near-simultaneous signals from several sources. */
const DEDUPE_MS = 1_000;

let lastFiredAt = 0;
let installed = false;

function fire(reason) {
  const now = Date.now();
  if (now - lastFiredAt < DEDUPE_MS) return;
  lastFiredAt = now;

  for (const handler of handlers) {
    try {
      handler({ reason, at: now });
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[appResume] handler failed', err);
    }
  }
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // The native bridge. Flutter evaluates this on AppLifecycleState.resumed.
  window.__spareOnAppResume = (reason = 'native') => fire(String(reason));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fire('visibility');
  });

  window.addEventListener('online', () => fire('online'));
}

/**
 * Run `handler` whenever the app comes back to the foreground.
 * @param {(info: { reason: string, at: number }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onAppResume(handler) {
  install();
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Manually signal a resume (tests, or an explicit "refresh" affordance). */
export function signalAppResume(reason = 'manual') {
  fire(reason);
}
