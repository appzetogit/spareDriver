/**
 * One-time backfill: assigns a human-readable driverNumber
 * (DR-YYYYMMDD-XXXXXX, dated by createdAt) to existing Driver docs
 * that predate the field.
 *
 * Run from backend/: npm run backfill:driver-numbers
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { Driver } from '../src/models/driverModels/driver.model.js';
import { generateDriverNumber } from '../src/utils/orderNumber.util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;
  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set in backend/.env');
  }
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to MongoDB (database: ${dbName})`);

  const missing = await Driver.find({
    $or: [{ driverNumber: { $exists: false } }, { driverNumber: null }, { driverNumber: '' }],
  })
    .select('_id createdAt')
    .lean();

  console.log(`Found ${missing.length} driver(s) without a driver number`);

  let updated = 0;
  for (const driver of missing) {
    const created = driver.createdAt ? new Date(driver.createdAt) : new Date();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const driverNumber = generateDriverNumber(created);
      try {
        await Driver.updateOne({ _id: driver._id }, { $set: { driverNumber } });
        updated += 1;
        break;
      } catch (err) {
        if (err?.code !== 11000 || attempt === 7) throw err;
      }
    }
  }

  console.log(`Backfilled ${updated}/${missing.length} driver(s)`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
