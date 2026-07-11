import dotenv from 'dotenv';

dotenv.config();

import { createServer } from 'node:http';
import { connectDB } from './config/connectDB.js';
import { initSuperAdmin } from './utils/initAdmin.js';
import { initializeSocket } from './config/socket.js';
import { initializeFirebase } from './config/firebase.js';
import { startScheduledBookingWorker } from './queues/scheduledBooking.worker.js';
import app from './app.js';

const PORT = process.env.PORT || 9000;

async function bootstrap() {
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

  httpServer.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Server bootstrap failed:', err);
  process.exit(1);
});
