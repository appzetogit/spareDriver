/**
 * Generates frontend/public/firebase-messaging-sw.js for static hosting.
 * Dev/build also serves this via vite/firebaseMessagingSwPlugin.js.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { buildFcmMessagingSwSource, resolveFirebaseConfig } from '../src/config/firebaseEnv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const env = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', root, '');
const { config: fbConfig } = resolveFirebaseConfig((key) => env[key]);
const source = buildFcmMessagingSwSource(fbConfig);
const outDir = resolve(root, 'public');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'firebase-messaging-sw.js'), source, 'utf8');
console.log('Wrote public/firebase-messaging-sw.js');
