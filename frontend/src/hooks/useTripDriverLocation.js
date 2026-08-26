import { useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, off } from 'firebase/database';
import { getRealtimeDb, isFirebaseConfigured } from '../config/firebase';
import { ensureFirebaseAuth } from '../config/firebaseAuth';
import { onAppResume } from '../utils/appResume';
import useSocketStore from '../store/useSocketStore';
import { useSocket, useSocketEvent } from './useSocket';
import { C2S_EVENTS, S2C_EVENTS } from '../constants/socketEvents';

/**
 * Live driver position for ONE booking.
 *
 * Replaces `useFirebaseDriverLocations` on every customer surface. That hook
 * subscribed to the root `/drivers` node, so a customer watching a single ride
 * received an event every time any driver anywhere moved — cost that scaled
 * with fleet size instead of with one, on top of handing every client the
 * whole fleet's positions.
 *
 * Two channels, same shape:
 *   - Firebase RTDB `/trips/{bookingId}/driver` — primary, authenticated.
 *   - Socket `trip:location:updated` / `driverLocationUpdate` — fallback
 *     for when RTDB is unreachable or Firebase is not configured at all.
 *
 * Freshness is first-class. The backend stamps `staleAfter` on every write, so
 * a position that stopped updating is reported as `isStale` rather than
 * pretending to be live. A frozen car that still claims "5 min away" is worse
 * than an honest "reconnecting".
 */

/** Fallback when the server did not stamp `staleAfter` (older payloads). */
const DEFAULT_STALE_AFTER_MS = 45_000;

/** How often to re-evaluate staleness while no new fix arrives. */
const STALE_TICK_MS = 5_000;

function readCoord(raw, ...keys) {
  for (const key of keys) {
    const n = Number(raw?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalize(raw, bookingId) {
  if (!raw) return null;
  const lat = readCoord(raw, 'lat', 'latitude');
  const lng = readCoord(raw, 'lng', 'longitude');
  if (lat == null || lng == null) return null;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : null;
  return {
    bookingId,
    lat,
    lng,
    accuracy: raw.accuracy ?? null,
    heading: typeof raw.heading === 'number' ? raw.heading : null,
    speed: typeof raw.speed === 'number' ? raw.speed : null,
    updatedAt,
    staleAfter:
      typeof raw.staleAfter === 'number'
        ? raw.staleAfter
        : updatedAt
          ? updatedAt + DEFAULT_STALE_AFTER_MS
          : null,
  };
}

function payloadMatchesBooking(payload, bookingId) {
  if (!payload || !bookingId) return false;
  const ids = [payload.bookingId, payload.tripId].filter(Boolean).map(String);
  if (ids.length === 0) return true;
  return ids.includes(String(bookingId));
}

/**
 * @param {string|null} bookingId
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{
 *   driver: object|null,      position, or null when nothing has arrived
 *   isStale: boolean,         true when the last fix is past its freshness window
 *   ageMs: number|null,       how old the last fix is
 *   source: 'firebase'|'socket'|null,
 *   disabled: boolean,        Firebase not configured
 * }}
 */
export function useTripDriverLocation(bookingId, { enabled = true } = {}) {
  const [fix, setFix] = useState(null);
  const [source, setSource] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [resumeNonce, setResumeNonce] = useState(0);
  const latestRef = useRef(null);
  const { emit, isConnected } = useSocket();

  const active = Boolean(enabled && bookingId);

  // Join the booking room so the socket fallback can reach us. The server
  // checks membership, so this is a no-op for a booking that is not ours.
  // Re-sent on reconnect: room membership does not survive a dropped socket.
  useEffect(() => {
    if (!active || !isConnected) return undefined;
    emit(C2S_EVENTS.BOOKING_JOIN, { bookingId });
    return () => {
      emit(C2S_EVENTS.BOOKING_LEAVE, { bookingId });
    };
  }, [active, isConnected, bookingId, emit]);

  // WebView freeze / lock screen does not unmount this hook, so a failed
  // first Firebase sign-in (or a dropped socket) would otherwise sit forever.
  // Resume re-mints the RTDB session and kicks Socket.IO immediately.
  useEffect(() => {
    if (!active) return undefined;
    return onAppResume(() => {
      setResumeNonce((n) => n + 1);
      const { socket, isConnected: connected, connect } = useSocketStore.getState();
      if (!connected) {
        if (socket && !socket.connected) socket.connect();
        else connect();
      }
    });
  }, [active]);

  /* ---- Firebase: the primary channel ------------------------------ */

  useEffect(() => {
    if (!active) {
      setFix(null);
      setSource(null);
      latestRef.current = null;
      return undefined;
    }
    if (!isFirebaseConfigured()) return undefined;

    let cancelled = false;
    let detach = null;

    (async () => {
      // Rules require an identity carrying this bookingId. Without a session
      // the read is denied, and we fall through to the socket channel.
      // Retry a couple of times: a 404/deploy race or a brief network blip
      // must not leave the customer map stuck on the last pin.
      let authed = false;
      for (let attempt = 0; attempt < 3 && !cancelled && !authed; attempt += 1) {
        authed = await ensureFirebaseAuth('user', {
          bookingId,
          force: attempt > 0,
        });
        if (!authed && attempt < 2) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (cancelled || !authed) return;

      const db = getRealtimeDb();
      if (!db) return;

      const node = ref(db, `trips/${bookingId}/driver`);
      const handler = (snapshot) => {
        const next = normalize(snapshot.val(), bookingId);
        if (!next) return;
        latestRef.current = next;
        setFix(next);
        setSource('firebase');
      };
      const onError = (err) => {
        if (import.meta.env.DEV) {
          console.warn('[useTripDriverLocation] RTDB error', err?.message || err);
        }
      };

      onValue(node, handler, onError);
      detach = () => off(node, 'value', handler);
    })();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [active, bookingId, resumeNonce]);

  /* ---- Socket: fallback ------------------------------------------- */

  const applySocketFix = (payload) => {
    if (!active) return;
    if (!payloadMatchesBooking(payload, bookingId)) return;

    const next = normalize(payload, bookingId);
    if (!next) return;

    // Never let a socket packet move the marker backwards past a newer
    // Firebase fix — the two channels race, and out-of-order is worse than
    // slightly late.
    const current = latestRef.current;
    if (current?.updatedAt && next.updatedAt && next.updatedAt <= current.updatedAt) {
      return;
    }

    latestRef.current = next;
    setFix(next);
    setSource((prev) => (prev === 'firebase' ? prev : 'socket'));
  };

  useSocketEvent(S2C_EVENTS.TRIP_LOCATION_UPDATED, applySocketFix);
  useSocketEvent(S2C_EVENTS.DRIVER_LOCATION_UPDATE, applySocketFix);

  /* ---- Staleness --------------------------------------------------- */

  // Staleness is a function of elapsed time, so it has to be re-evaluated
  // even when nothing arrives — that silence is exactly the signal.
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), STALE_TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  const { isStale, ageMs } = useMemo(() => {
    if (!fix?.updatedAt) return { isStale: false, ageMs: null };
    const age = now - fix.updatedAt;
    const limit = fix.staleAfter ? fix.staleAfter - fix.updatedAt : DEFAULT_STALE_AFTER_MS;
    return { isStale: age > limit, ageMs: age };
  }, [fix, now]);

  return {
    driver: fix,
    isStale,
    ageMs,
    source,
    disabled: !isFirebaseConfigured(),
  };
}

export default useTripDriverLocation;
