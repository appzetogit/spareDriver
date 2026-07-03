/** Single map of Firebase client config keys → VITE_* env var names. */
export const FIREBASE_ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'VITE_FIREBASE_DATABASE_URL',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

/** FCM service worker uses the web-app subset (no Realtime Database URL). */
const FCM_SW_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

export function resolveFirebaseConfig(getEnvValue) {
  const config = {};
  const missing = [];
  for (const [key, envName] of Object.entries(FIREBASE_ENV_KEYS)) {
    const value = getEnvValue(envName);
    if (!value) {
      missing.push(key);
    }
    config[key] = value ?? '';
  }
  return { config, missing };
}

/** Service workers cannot read import.meta.env — Vite serves this at /firebase-messaging-sw.js. */
export function buildFcmMessagingSwSource(config) {
  const fcmConfig = Object.fromEntries(
    FCM_SW_CONFIG_KEYS.map((key) => [key, config[key] ?? '']),
  );
  return `/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(fcmConfig, null, 2)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'SpareDriver';
  const options = {
    body: payload?.notification?.body || '',
    data: payload?.data || {},
  };
  self.registration.showNotification(title, options);
});
`;
}
