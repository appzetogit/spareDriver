/**
 * Tracking start/stop decision rules.
 * Run: node --test src/utils/trackingDecision.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrackingIntent, TRACKING_INTENT } from './trackingDecision.js';

describe('resolveTrackingIntent', () => {
  it('tracks at trip cadence whenever a ride is in progress', () => {
    assert.deepEqual(
      resolveTrackingIntent({ onTrip: true, statusFetched: true }),
      { intent: TRACKING_INTENT.START, mode: 'onTrip' },
    );
  });

  it('lets an in-progress ride outrank an offline toggle', () => {
    // A driver who somehow reads as offline mid-ride still has a customer
    // watching their marker. The ride wins.
    assert.deepEqual(
      resolveTrackingIntent({
        onTrip: true,
        authOnline: false,
        storeOnline: false,
        statusFetched: true,
      }),
      { intent: TRACKING_INTENT.START, mode: 'onTrip' },
    );
  });

  it('tracks at idle cadence when online but not on a trip', () => {
    assert.deepEqual(
      resolveTrackingIntent({ storeOnline: true, statusFetched: true }),
      { intent: TRACKING_INTENT.START, mode: 'idle' },
    );
  });

  it('starts on the local toggle before the server has confirmed', () => {
    // The tap updates the auth store first. Waiting for the round trip would
    // leave the driver untracked for the length of a request.
    assert.deepEqual(
      resolveTrackingIntent({ authOnline: true, statusFetched: false }),
      { intent: TRACKING_INTENT.START, mode: 'idle' },
    );
  });

  it('stops once the server confirms the driver is offline', () => {
    assert.deepEqual(
      resolveTrackingIntent({ statusFetched: true }),
      { intent: TRACKING_INTENT.STOP, mode: null },
    );
  });

  it('holds while the status request is still in flight', () => {
    // This is the launch case that caused the flapping: a persisted
    // `isOnline: false` used to be treated as confirmation, so an online
    // driver got stopTracking on boot and startTracking a moment later.
    assert.deepEqual(
      resolveTrackingIntent({ authOnline: false, statusFetched: false }),
      { intent: TRACKING_INTENT.HOLD, mode: null },
    );
  });

  it('holds after the cache is invalidated rather than standing down', () => {
    // Invalidation wipes the entry, so `statusFetched` drops back to false.
    // That means "ask again", not "the driver went offline".
    assert.deepEqual(
      resolveTrackingIntent({
        authOnline: false,
        storeOnline: false,
        onTrip: false,
        statusFetched: false,
      }),
      { intent: TRACKING_INTENT.HOLD, mode: null },
    );
  });

  it('holds on a bare call, so an empty first render never stops anything', () => {
    assert.deepEqual(resolveTrackingIntent(), {
      intent: TRACKING_INTENT.HOLD,
      mode: null,
    });
  });

  it('never reports stop while any signal says the driver is working', () => {
    for (const authOnline of [true, false]) {
      for (const storeOnline of [true, false]) {
        for (const onTrip of [true, false]) {
          for (const statusFetched of [true, false]) {
            const { intent } = resolveTrackingIntent({
              authOnline,
              storeOnline,
              onTrip,
              statusFetched,
            });
            const working = authOnline || storeOnline || onTrip;
            if (working) {
              assert.equal(
                intent,
                TRACKING_INTENT.START,
                `expected start for ${JSON.stringify({ authOnline, storeOnline, onTrip, statusFetched })}`,
              );
            } else {
              assert.equal(
                intent,
                statusFetched ? TRACKING_INTENT.STOP : TRACKING_INTENT.HOLD,
              );
            }
          }
        }
      }
    }
  });
});
