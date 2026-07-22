/**
 * One-time backfill: assigns a human-readable subscriptionNumber
 * (SUB-YYYYMMDD-XXXXX, dated by createdAt) to existing UserSubscription
 * docs that predate the field.
 *
 * Run from backend/: npm run backfill:subscription-numbers
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import UserSubscription from '../src/models/userSubscription.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

function dateStamp(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function randSuffix(n = 5) {
  const min = 10 ** (n - 1);
  return String(Math.floor(min + Math.random() * (9 * min)));
}

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;
  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set in backend/.env');
  }
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to MongoDB (database: ${dbName})`);

  const missing = await UserSubscription.find({
    $or: [{ subscriptionNumber: { $exists: false } }, { subscriptionNumber: null }, { subscriptionNumber: '' }],
  })
    .select('_id createdAt')
    .lean();

  console.log(`Found ${missing.length} subscription(s) without a subscription number`);

  let updated = 0;
  for (const sub of missing) {
    const created = sub.createdAt ? new Date(sub.createdAt) : new Date();
    // Retry on the (unlikely) unique-index collision of the random suffix.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const subscriptionNumber = `SUB-${dateStamp(created)}-${randSuffix(5)}`;
      try {
        await UserSubscription.updateOne(
          { _id: sub._id },
          { $set: { subscriptionNumber } },
        );
        updated += 1;
        break;
      } catch (err) {
        if (err?.code !== 11000 || attempt === 4) throw err;
      }
    }
  }

  console.log(`Backfilled ${updated}/${missing.length} subscription(s)`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
