/**
 * Repair backfill: pay drivers for COMPLETED trips that were never
 * settled.
 *
 * Why these exist: until the admin-complete path was fixed, completing
 * a booking from the admin panel (`PATCH /admin/bookings/:id/status`)
 * flipped the status to COMPLETED without ever running the trip-end
 * payout — no wallet credit, no `Payment` ledger rows, no platform
 * revenue. The driver was simply never paid, and because the Earnings
 * page reads the `Payment` ledger, the trip never appeared there.
 *
 * A booking is considered unsettled when ALL of:
 *   - status = completed, not deleted
 *   - has a driverId
 *   - fareSnapshot.breakdown.driverEarning > 0
 *   - has no captured trip_fare / trip_allowance Payment row
 *
 * Credits are back-dated to the booking's `completedAt`, so a trip
 * completed three weeks ago lands in that day's earnings bucket rather
 * than spiking today's tile. Today's-summary counters are deliberately
 * left alone for the same reason.
 *
 * Missing platform-revenue rows for the same bookings are written too,
 * so the commission ledger reconciles against the driver payouts.
 *
 * DRY RUN BY DEFAULT — prints what it would do and exits.
 *
 *   node scripts/backfillDriverTripEarnings.js                  # preview all
 *   node scripts/backfillDriverTripEarnings.js --booking BK-... # preview one
 *   node scripts/backfillDriverTripEarnings.js --apply          # write
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import Booking from '../src/models/booking.model.js';
import Payment from '../src/models/payment.model.js';
import PlatformRevenue from '../src/models/platformRevenue.model.js';
import { Driver } from '../src/models/driverModels/driver.model.js';
import { BOOKING_STATUS } from '../src/constants/bookingStatus.js';
import { PAYMENT_PURPOSE } from '../src/constants/kitStatus.js';
import { settleDriverEarning } from '../src/services/bookingExtension.service.js';
import { recordCompletedTripPlatformRevenue } from '../src/services/platformRevenue.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const bookingArgIndex = args.indexOf('--booking');
const ONLY_BOOKING = bookingArgIndex >= 0 ? args[bookingArgIndex + 1] : null;

const inr = (n) => `₹${Number(n || 0).toFixed(2)}`;

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;
  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set in backend/.env');
  }
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to MongoDB (database: ${dbName})`);
  console.log(APPLY ? '\n*** APPLY MODE — writing changes ***\n' : '\n--- DRY RUN (pass --apply to write) ---\n');

  const query = {
    status: BOOKING_STATUS.COMPLETED,
    isDeleted: false,
    driverId: { $ne: null },
    'fareSnapshot.breakdown.driverEarning': { $gt: 0 },
  };
  if (ONLY_BOOKING) query.bookingNumber = ONLY_BOOKING;

  const candidates = await Booking.find(query);
  console.log(`${candidates.length} completed booking(s) with a driver earning`);

  // One query for every trip ledger row, so we don't hit the DB per booking.
  const settledIds = new Set(
    (
      await Payment.find({
        purpose: { $in: [PAYMENT_PURPOSE.TRIP_FARE, PAYMENT_PURPOSE.TRIP_ALLOWANCE] },
        status: 'captured',
      })
        .select('referenceId')
        .lean()
    ).map((p) => String(p.referenceId)),
  );

  const unsettled = candidates.filter((b) => !settledIds.has(String(b._id)));
  console.log(`${unsettled.length} of them were never settled\n`);

  if (!unsettled.length) {
    console.log('Nothing to do.');
    return;
  }

  let owed = 0;
  for (const b of unsettled) {
    const amount = Number(b.fareSnapshot?.breakdown?.driverEarning) || 0;
    owed += amount;
    console.log(
      `  ${b.bookingNumber}  ${inr(amount)}  driver=${String(b.driverId).slice(-6)}`
        + `  completed=${b.timeline?.completedAt?.toISOString?.().slice(0, 10) || '?'}`,
    );
  }
  console.log(`\nTotal owed to drivers: ${inr(owed)}`);

  if (!APPLY) {
    console.log('\nDry run — no changes written. Re-run with --apply to settle.');
    return;
  }

  let settled = 0;
  let failed = 0;
  for (const b of unsettled) {
    try {
      const creditedAt = b.timeline?.completedAt || b.updatedAt || new Date();
      await settleDriverEarning(b, { creditedAt, countTowardToday: false });

      // Book the platform's cut for the same trip if it's missing, so
      // revenue reconciles against what we just paid out.
      const hasRevenue = await PlatformRevenue.exists({ bookingId: b._id });
      if (!hasRevenue) {
        await recordCompletedTripPlatformRevenue(b, { backfilled: true });
      }

      settled += 1;
      console.log(`  settled ${b.bookingNumber}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAILED ${b.bookingNumber}:`, err?.message);
    }
  }

  console.log(`\nSettled ${settled} booking(s); ${failed} failed.`);

  // Show the resulting wallet state for every driver we touched.
  const driverIds = [...new Set(unsettled.map((b) => String(b.driverId)))];
  const drivers = await Driver.find({ _id: { $in: driverIds } })
    .select('name wallet')
    .lean();
  console.log('\nDriver wallets now:');
  for (const d of drivers) {
    console.log(
      `  ${d.name || String(d._id)}  balance=${inr(d.wallet?.balance)}`
        + `  lifetime=${inr(d.wallet?.totalEarnings)}`,
    );
  }
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
