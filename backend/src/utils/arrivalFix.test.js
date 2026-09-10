import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseArrivalFix, coordsFromDriverLocation } from './arrivalFix.js';
import { LOCATION_STALE_AFTER_MS } from '../constants/driverTracking.js';

/**
 * The arrival check has to fail in the right direction. Trusting the request
 * body lets anyone claim arrival from anywhere; refusing to fall back strands
 * a driver standing at the pickup whose uploader has stalled. These cover
 * both edges of that trade.
 */

const NOW = Date.UTC(2026, 2, 1, 10, 0, 0);
const AT_PICKUP = { lat: 12.9716, lng: 77.5946 };
const ACROSS_TOWN = { lat: 13.1, lng: 77.7 };

const freshAt = new Date(NOW - 10_000); // one on-trip upload cycle ago
const staleAt = new Date(NOW - 5 * 60_000);

test('prefers the server fix whenever it is recent', async (t) => {
  await t.test('a fresh server fix decides, not the request body', () => {
    const fix = chooseArrivalFix({
      serverCoords: ACROSS_TOWN,
      serverFixAt: freshAt,
      clientCoords: AT_PICKUP,
      now: NOW,
    });
    assert.equal(fix.source, 'server');
    // The forged "I'm at the pickup" body must not survive.
    assert.deepEqual(fix.coords, ACROSS_TOWN);
  });

  await t.test('a fix at the staleness boundary still counts as fresh', () => {
    const fix = chooseArrivalFix({
      serverCoords: AT_PICKUP,
      serverFixAt: new Date(NOW - LOCATION_STALE_AFTER_MS),
      clientCoords: ACROSS_TOWN,
      now: NOW,
    });
    assert.equal(fix.source, 'server');
  });

  await t.test('reports how old the server fix was', () => {
    const fix = chooseArrivalFix({
      serverCoords: AT_PICKUP,
      serverFixAt: freshAt,
      clientCoords: null,
      now: NOW,
    });
    assert.equal(fix.serverAgeMs, 10_000);
  });

  await t.test('a slightly future timestamp is tolerated as clock skew', () => {
    const fix = chooseArrivalFix({
      serverCoords: AT_PICKUP,
      serverFixAt: new Date(NOW + 5_000),
      clientCoords: ACROSS_TOWN,
      now: NOW,
    });
    assert.equal(fix.source, 'server');
  });

  await t.test('a wildly future timestamp is not trusted', () => {
    const fix = chooseArrivalFix({
      serverCoords: AT_PICKUP,
      serverFixAt: new Date(NOW + 10 * 60_000),
      clientCoords: ACROSS_TOWN,
      now: NOW,
    });
    assert.equal(fix.source, 'client');
  });
});

test('falls back to the client fix rather than stranding a driver', async (t) => {
  await t.test('a stale server fix hands over to the request body', () => {
    const fix = chooseArrivalFix({
      serverCoords: ACROSS_TOWN,
      serverFixAt: staleAt,
      clientCoords: AT_PICKUP,
      now: NOW,
    });
    assert.equal(fix.source, 'client');
    assert.equal(fix.coords.lat, AT_PICKUP.lat);
  });

  await t.test('a driver who has never reported has no server fix', () => {
    const fix = chooseArrivalFix({
      serverCoords: null,
      serverFixAt: null,
      clientCoords: AT_PICKUP,
      now: NOW,
    });
    assert.equal(fix.source, 'client');
    assert.equal(fix.serverAgeMs, null);
  });

  await t.test('the unset [0,0] default is never treated as a position', () => {
    // Otherwise every driver who has never reported "is" off West Africa,
    // and the check would compare the pickup against the Gulf of Guinea.
    const fix = chooseArrivalFix({
      serverCoords: { lat: 0, lng: 0 },
      serverFixAt: freshAt,
      clientCoords: AT_PICKUP,
      now: NOW,
    });
    assert.equal(fix.source, 'client');
  });

  await t.test('the client fix carries its accuracy through', () => {
    const fix = chooseArrivalFix({
      serverCoords: null,
      serverFixAt: null,
      clientCoords: { ...AT_PICKUP, accuracy: 42 },
      now: NOW,
    });
    assert.equal(fix.coords.accuracy, 42);
  });
});

test('refuses when neither source is usable', async (t) => {
  await t.test('no server fix and no body', () => {
    assert.equal(
      chooseArrivalFix({ serverCoords: null, serverFixAt: null, clientCoords: null, now: NOW }),
      null,
    );
  });

  await t.test('non-numeric body coordinates', () => {
    assert.equal(
      chooseArrivalFix({
        serverCoords: null,
        serverFixAt: null,
        clientCoords: { lat: 'here', lng: 'there' },
        now: NOW,
      }),
      null,
    );
  });

  await t.test('called with nothing at all', () => {
    assert.equal(chooseArrivalFix(), null);
  });
});

test('coordsFromDriverLocation', async (t) => {
  await t.test('reads GeoJSON [lng, lat] in the right order', () => {
    assert.deepEqual(coordsFromDriverLocation({ coordinates: [77.5946, 12.9716] }), {
      lat: 12.9716,
      lng: 77.5946,
    });
  });

  await t.test('returns null for the unset default', () => {
    assert.equal(coordsFromDriverLocation({ coordinates: [0, 0] }), null);
  });

  await t.test('returns null for malformed input', () => {
    assert.equal(coordsFromDriverLocation(null), null);
    assert.equal(coordsFromDriverLocation({}), null);
    assert.equal(coordsFromDriverLocation({ coordinates: [1] }), null);
  });
});
