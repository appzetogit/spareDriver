import dns from 'node:dns/promises';
import dotenv from 'dotenv';

// The local resolver can refuse MongoDB's SRV query. Use public resolvers
// before Mongoose starts resolving the mongodb+srv connection string.
dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config();

import { createServer } from 'node:http';
import { connectDB } from './config/connectDB.js';
import { warnIfTestOtpSuppressed } from './config/sms.config.js';
import { initSuperAdmin } from './utils/initAdmin.js';
import { initializeSocket } from './config/socket.js';
import { initializeFirebase } from './config/firebase.js';
import { startScheduledBookingWorker } from './queues/scheduledBooking.worker.js';
import { startPresenceSweeper } from './services/driverPresenceSweeper.service.js';
import app from './app.js';

const PORT = process.env.PORT || 9000;

async function bootstrap() {
  warnIfTestOtpSuppressed();
  await connectDB();
  await initSuperAdmin();
  await initializeFirebase();

  // Drop inbox rows older than 7 days immediately (TTL index also enforces this).
  try {
    const { purgeExpiredNotificationsService } = await import(
      './services/notification.service.js'
    );
    const { deletedCount } = await purgeExpiredNotificationsService();
    if (deletedCount > 0) {
      console.log(`[notifications] purged ${deletedCount} expired inbox row(s)`);
    }
  } catch (err) {
    console.warn('[notifications] purge failed:', err?.message);
  }

  const httpServer = createServer(app);
  initializeSocket(httpServer);

  // Scheduled-ride dispatcher + emergency-pool escalator. No-ops with
  // a warning when REDIS_URL is unset so dev/CI boots without Redis.
  await startScheduledBookingWorker();

  // Reconcile driver presence. A socket disconnect is not proof a driver has
  // gone (background tracking outlives the websocket), so someone has to
  // notice when the GPS stream itself goes quiet.
  startPresenceSweeper();

  httpServer.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Server bootstrap failed:', err);
  process.exit(1);
});
