/**
 * Should native tracking be running right now, and in which mode?
 *
 * Pure and React-free so the rule can be tested directly. `DriverLocationBridge`
 * owns the wiring; this owns the decision.
 *
 * The asymmetry between starting and stopping is the whole point. Starting is
 * cheap and idempotent — a redundant `startTracking` re-applies the cadence and
 * costs nothing. Stopping is destructive: it tears down the Android foreground
 * service, and Android 14 refuses to start a location-typed service again from
 * the background. A wrong stop while the app is backgrounded therefore does not
 * heal on the next render; tracking stays dead until the driver reopens the app.
 *
 * So the rule is: start on any hint of work, stop only on evidence of none, and
 * do nothing at all while we are still finding out.
 */

/** Cadence names — must match `TrackingMode` in the Flutter wrapper. */
export const TRACKING_INTENT = Object.freeze({
  /** Begin, or re-aim, the native service. */
  START: 'start',
  /** Tear the native service down. */
  STOP: 'stop',
  /** Not enough information yet — leave whatever is running alone. */
  HOLD: 'hold',
});

/**
 * @param {object} state
 * @param {boolean} state.authOnline
 *   `driver.isOnline` from the auth store. Reflects the toggle immediately, but
 *   is also rehydrated from storage on launch, so on its own a `false` here is
 *   not proof of anything.
 * @param {boolean} state.storeOnline
 *   `isOnline` from the server's status response.
 * @param {boolean} state.onTrip
 *   A booking is in a phase that requires tracking. Outranks both flags: a ride
 *   in progress is tracked even if the online toggle says otherwise.
 * @param {boolean} state.statusFetched
 *   Whether the status request has actually completed. False while it is in
 *   flight, and again after the cache is invalidated — in both cases we know
 *   nothing, which is different from knowing the driver is off.
 * @returns {{ intent: 'start'|'stop'|'hold', mode: 'onTrip'|'idle'|null }}
 */
export function resolveTrackingIntent({
  authOnline = false,
  storeOnline = false,
  onTrip = false,
  statusFetched = false,
} = {}) {
  if (onTrip) {
    return { intent: TRACKING_INTENT.START, mode: 'onTrip' };
  }

  if (authOnline || storeOnline) {
    return { intent: TRACKING_INTENT.START, mode: 'idle' };
  }

  // Nothing says the driver is working. Only stand the service down once the
  // server has actually said so — a stale persisted flag or an in-flight
  // request must not be mistaken for confirmation.
  if (statusFetched) {
    return { intent: TRACKING_INTENT.STOP, mode: null };
  }

  return { intent: TRACKING_INTENT.HOLD, mode: null };
}

export default resolveTrackingIntent;
