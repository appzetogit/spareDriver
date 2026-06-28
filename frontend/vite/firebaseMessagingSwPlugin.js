import { loadEnv } from 'vite';
import { buildFcmMessagingSwSource, resolveFirebaseConfig } from '../src/config/firebaseEnv.js';

const SW_PATH = '/firebase-messaging-sw.js';

function swSourceFromMode(mode, root) {
  const env = loadEnv(mode, root, '');
  const { config } = resolveFirebaseConfig((key) => env[key]);
  return buildFcmMessagingSwSource(config);
}

export function firebaseMessagingSwPlugin() {
  let resolvedConfig;

  return {
    name: 'firebase-messaging-sw',
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== SW_PATH) return next();
        res.setHeader('Content-Type', 'application/javascript');
        res.end(swSourceFromMode(server.config.mode, server.config.root));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: swSourceFromMode(resolvedConfig.mode, resolvedConfig.root),
      });
    },
  };
}
