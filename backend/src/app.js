import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { getCorsOptions } from './config/cors.config.js';

import commonRoutes from './routes/common.route.js';
import driverRoutes from './routes/driver.route.js';
import adminRoutes from './routes/admin.route.js';
import authRoutes from './routes/user.routes.js';
import webhookRoutes from './routes/webhook.route.js';
import sosRoutes from './routes/sos.route.js';
import supportRoutes from './routes/support.route.js';

// Dev-only routes — imported lazily so they are fully tree-shaken in production.
const loadDevRoutes = () => import('./routes/dev.route.js').then((m) => m.default);

const app = express();

// We sit behind a TLS-terminating proxy on Vercel/Render/Heroku/etc. Without
// this Express thinks the request is HTTP, which leads to "Secure" cookies
// being set against a perceived-insecure connection in some flows and breaks
// `req.secure`, `req.protocol`, and `req.ip`.
app.set('trust proxy', 1);

app.use(cors(getCorsOptions()));
app.use(cookieParser());
app.use('/api/v1/webhooks', webhookRoutes);
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/common', commonRoutes);
app.use('/api/v1/driver', driverRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/sos', sosRoutes);
app.use('/api/v1/support', supportRoutes);

// Mount dev test routes in non-production environments only.
if (process.env.NODE_ENV !== 'production') {
  loadDevRoutes().then((devRouter) => {
    app.use('/api/v1/dev', devRouter);
    console.log('[dev] Test routes mounted at /api/v1/dev');
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.send('SpareDriver API');
});

app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  console.error(`[ERROR] ${req.method} ${req.url} - ${err.stack}`);
  res.status(statusCode).json({
    status: statusCode,
    message,
    ...(err.data != null ? { data: err.data } : {}),
  });
});

export default app;
