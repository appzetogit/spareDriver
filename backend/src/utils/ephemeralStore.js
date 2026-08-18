import { getRedisConnection } from '../config/redis.js';

/**
 * Small TTL'd key-value store for hot-path coordination state.
 *
 * Backed by Redis when `REDIS_URL` is set, and by an in-process Map when it is
 * not — the same "degrade, don't crash" contract the queue and Firebase config
 * already use, so a dev machine still boots.
 *
 * This exists because the live-location pipeline kept its throttles and
 * presence bookkeeping in module-level Maps. Behind more than one Node
 * instance those desync: a 60-second Mongo throttle silently becomes
 * 60-seconds-per-instance, and a per-socket rate limit is bypassed by
 * reconnecting until you land on a different process.
 *
 * The memory fallback keeps the same semantics for a single instance. It is
 * NOT correct across instances, which is exactly why Redis should be
 * configured in production.
 */

/** key → { value, expiresAt } */
const memory = new Map();

/** Bound the fallback map so a long-running dev process cannot grow forever. */
const MEMORY_MAX_KEYS = 50_000;

function pruneMemory(now) {
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }
}

function memoryGet(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value, ttlMs) {
  if (memory.size > MEMORY_MAX_KEYS) pruneMemory(Date.now());
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Atomic "may I do this now?" gate.
 *
 * Returns true at most once per `windowMs` for a given key. Used for the Mongo
 * snapshot throttle: whichever instance wins the SET NX does the write, and
 * every other instance skips it.
 *
 * @param {string} key
 * @param {number} windowMs
 * @returns {Promise<boolean>}
 */
export async function acquireThrottle(key, windowMs) {
  const redis = await getRedisConnection();

  if (redis) {
    try {
      const res = await redis.set(key, '1', 'PX', windowMs, 'NX');
      return res === 'OK';
    } catch (err) {
      console.warn('[ephemeralStore] throttle check failed, allowing:', err.message);
      return true;
    }
  }

  if (memoryGet(key) !== null) return false;
  memorySet(key, '1', windowMs);
  return true;
}

/** @returns {Promise<string|null>} */
export async function getValue(key) {
  const redis = await getRedisConnection();
  if (redis) {
    try {
      return await redis.get(key);
    } catch (err) {
      console.warn('[ephemeralStore] get failed:', err.message);
      return null;
    }
  }
  return memoryGet(key);
}

export async function setValue(key, value, ttlMs) {
  const redis = await getRedisConnection();
  if (redis) {
    try {
      await redis.set(key, value, 'PX', ttlMs);
      return;
    } catch (err) {
      console.warn('[ephemeralStore] set failed:', err.message);
      return;
    }
  }
  memorySet(key, value, ttlMs);
}

export async function deleteKeys(...keys) {
  const flat = keys.filter(Boolean);
  if (flat.length === 0) return;

  const redis = await getRedisConnection();
  if (redis) {
    try {
      await redis.del(...flat);
      return;
    } catch (err) {
      console.warn('[ephemeralStore] delete failed:', err.message);
      return;
    }
  }
  for (const key of flat) memory.delete(key);
}

/** JSON convenience wrappers — values round-trip through JSON.stringify. */
export async function getJson(key) {
  const raw = await getValue(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setJson(key, value, ttlMs) {
  await setValue(key, JSON.stringify(value), ttlMs);
}

/** True when the store is genuinely shared (i.e. multi-instance safe). */
export async function isShared() {
  return (await getRedisConnection()) !== null;
}
