/**
 * Backfill unique referral codes for existing users and drivers.
 *
 * Usage: node backend/scripts/backfillReferralCodes.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../src/models/user.model.js';
import { Driver } from '../src/models/driverModels/driver.model.js';
import {
  generateUniqueDriverReferralCode,
  generateUniqueUserReferralCode,
} from '../src/utils/referralCode.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function backfillUsers() {
  const users = await User.find({
    isDeleted: false,
    role: 'user',
    $or: [{ referralCode: { $exists: false } }, { referralCode: '' }, { referralCode: null }],
  }).select('_id');

  let updated = 0;
  for (const user of users) {
    const code = await generateUniqueUserReferralCode();
    await User.updateOne({ _id: user._id }, { $set: { referralCode: code } });
    updated += 1;
  }
  return updated;
}

async function backfillDrivers() {
  const drivers = await Driver.find({
    isDeleted: false,
    $or: [{ referralCode: { $exists: false } }, { referralCode: '' }, { referralCode: null }],
  }).select('_id');

  let updated = 0;
  for (const driver of drivers) {
    const code = await generateUniqueDriverReferralCode();
    await Driver.updateOne({ _id: driver._id }, { $set: { referralCode: code } });
    updated += 1;
  }
  return updated;
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const userCount = await backfillUsers();
  const driverCount = await backfillDrivers();
  console.log(`Backfilled referral codes: ${userCount} users, ${driverCount} drivers`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
