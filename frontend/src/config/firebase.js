import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { resolveFirebaseConfig } from './firebaseEnv.js';

/**
 * Lazy Firebase JS SDK initializer.
 *
 * Config keys live in firebaseEnv.js (same source Vite uses for the FCM service worker).
 * If env vars are missing the helpers return `null` so the rest of the app still loads.
 */

let appInstance = null;
let dbInstance = null;
let warned = false;

function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(`[firebase] ${message}`);
}

/**
 * Returns the singleton Firebase app, or null when the config is incomplete.
 * Safe to call from any module-load context.
 */
export function getFirebaseApp() {
  if (appInstance) return appInstance;

  const { config, missing } = resolveFirebaseConfig((key) => import.meta.env[key]);
  if (missing.length) {
    warnOnce(
      `Firebase config incomplete (missing: ${missing.join(', ')}). ` +
        `Live driver location features will be disabled.`,
    );
    return null;
  }

  appInstance = getApps()[0] || initializeApp(config);
  return appInstance;
}

/**
 * Returns the singleton Realtime Database instance, or null when Firebase
 * is not configured. Subscribe to refs like:
 *
 *   import { ref, onValue } from 'firebase/database';
 *   const db = getRealtimeDb();
 *   if (db) onValue(ref(db, `drivers/${id}/location`), ...);
 */
export function getRealtimeDb() {
  if (dbInstance) return dbInstance;
  const app = getFirebaseApp();
  if (!app) return null;
  dbInstance = getDatabase(app);
  return dbInstance;
}

/** True when Firebase is fully wired. Use for feature flagging UI. */
export function isFirebaseConfigured() {
  return getFirebaseApp() !== null;
}
