/**
 * Read-only diagnosis for a booking that looks stuck.
 *
 * Prints the state that decides whether a booking can still move: its status
 * and timeline, whether the driver is still flagged on-trip, what else that
 * driver is holding, and which recovery path (if any) covers the state it is
 * sitting in.
 *
 * WRITES NOTHING. Safe against production.
 *
 * Point it at any environment without editing .env:
 *
 *   MONGO_URI="mongodb+srv://..." DB_NAME=spareDriver \
 *     node scripts/inspectStuckBooking.js BK-20260805-944001
 *
 * With no override it uses backend/.env, and with no booking number it lists
 * every booking currently parked in a state a driver has to move out of.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import Booking from '../src/models/booking.model.js';
import { Driver } from '../src/models/driverModels/driver.model.js';
import { BOOKING_STATUS } from '../src/constants/bookingStatus.js';
import { resolveBookingSearchStartAt } from '../src/utils/bookingInbox.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const bookingNumber = process.argv[2] || null;

/** Statuses that keep a driver's `isOnTrip` flag set. */
const DRIVER_HELD_STATUSES = [
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.STARTED,
];

/** What moves a booking on, and what catches it when nothing does. */
const COVERAGE = {
  [BOOKING_STATUS.DRIVER_ASSIGNED]: {
    advancedBy: 'driver taps "On the way"',
    coveredBy: 'stuck-recovery sweep (nudge, then admin escalation)',
  },
  [BOOKING_STATUS.AWAITING_PAYMENT]: {
    advancedBy: 'customer completes payment',
    coveredBy: 'payment deadline auto-cancel',
  },
  [BOOKING_STATUS.EN_ROUTE]: {
    advancedBy: 'driver marks arrival (GPS-gated)',
    coveredBy: 'stuck-recovery sweep (nudge, then admin escalation)',
  },
  [BOOKING_STATUS.ARRIVED]: {
    advancedBy: 'customer gives the OTP',
    coveredBy: 'hourly: no-show auto-complete · outstation: admin settle',
  },
  [BOOKING_STATUS.STARTED]: {
    advancedBy: 'driver completes the trip',
    coveredBy: 'ride-end timer + overtime',
  },
};

const days = (d) =>
  d ? `${((Date.now() - new Date(d).getTime()) / 86_400_000).toFixed(1)}d ago` : '—';

async function report(b) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${b.bookingNumber}   ${String(b.status).toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(`Type        : ${b.bookingType} / ${b.serviceType}`);
  console.log(`Payment     : ${b.paymentStatus}  paid=${b.payment?.amountPaidRupees ?? '-'}`);
  console.log(`Created     : ${days(b.timeline?.createdAt || b.createdAt)}`);

  const pickupAt = resolveBookingSearchStartAt(b);
  if (pickupAt) {
    const lateMin = Math.floor((Date.now() - pickupAt.getTime()) / 60_000);
    console.log(
      `Pickup      : ${pickupAt.toISOString()}  (${lateMin > 0 ? `${lateMin} min PAST` : `${-lateMin} min away`})`,
    );
  }

  console.log(
    `Timeline    : assigned=${days(b.timeline?.driverAssignedAt)}`
      + ` enRoute=${days(b.timeline?.enRouteAt)}`
      + ` arrived=${days(b.timeline?.arrivedAt)}`,
  );
  console.log(
    `              started=${days(b.timeline?.startedAt)}`
      + ` completed=${days(b.timeline?.completedAt)}`
      + ` cancelled=${days(b.timeline?.cancelledAt)}`,
  );

  const cover = COVERAGE[b.status];
  if (cover) {
    console.log(`\nMoves on when: ${cover.advancedBy}`);
    console.log(`Recovered by : ${cover.coveredBy}`);
  }

  const sr = b.stuckRecovery;
  if (sr?.kind) {
    console.log(
      `Recovery stamp: ${sr.kind} nudged=${days(sr.nudgedAt)} escalated=${days(sr.escalatedAt)}`,
    );
  } else {
    console.log('Recovery stamp: none — the sweep has not picked this up');
  }

  if (!b.driverId) {
    console.log('\nDriver      : none attached');
    return;
  }

  const d = await Driver.findById(b.driverId)
    .select('name phone isOnTrip isOnline lastLocationAt')
    .lean();
  console.log(`\nDriver      : ${d?.name || b.driverId}${d?.phone ? ` · ${d.phone}` : ''}`);
  console.log(`  isOnTrip  : ${d?.isOnTrip}`);
  console.log(`  isOnline  : ${d?.isOnline}   last fix ${days(d?.lastLocationAt)}`);

  const held = await Booking.find({
    driverId: b.driverId,
    isDeleted: false,
    status: { $in: DRIVER_HELD_STATUSES },
  })
    .select('bookingNumber status')
    .lean();

  console.log(
    `  holding   : ${held.map((h) => `${h.bookingNumber}(${h.status})`).join(', ') || 'nothing'}`,
  );

  // The self-heal in bookingDispatch only releases a driver with NO booking in
  // a held status, so a wedged booking legitimately keeps the flag set — which
  // is exactly why the driver stays undispatchable until someone intervenes.
  if (d?.isOnTrip && held.length) {
    console.log(
      `\n  -> Driver is blocked from new offers by ${held.length} booking(s) above.`,
    );
    console.log('     The dispatch self-heal will NOT clear this: the flag is');
    console.log('     backed by a real booking. It needs the booking to move on');
    console.log('     (driver action) or an admin override.');
  } else if (d?.isOnTrip && !held.length) {
    console.log('\n  -> Stale flag: on-trip with no booking behind it.');
    console.log('     The dispatch self-heal clears this on the next wave.');
  }
}

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;
  if (!uri || !dbName) throw new Error('MONGO_URI and DB_NAME are required');

  await mongoose.connect(uri, { dbName });
  console.log(`Connected (read-only) to database: ${dbName}`);

  if (bookingNumber) {
    const b = await Booking.findOne({ bookingNumber }).lean();
    if (!b) {
      console.log(`\n${bookingNumber} not found in "${dbName}".`);
      console.log('If you are looking at a different environment, re-run with that');
      console.log('environment\'s MONGO_URI / DB_NAME in front of the command.');
      return;
    }
    await report(b);
    return;
  }

  const parked = await Booking.find({
    isDeleted: false,
    status: { $in: DRIVER_HELD_STATUSES },
  })
    .select('bookingNumber status serviceType bookingType timeline hourly outstation driverId stuckRecovery payment paymentStatus createdAt')
    .lean();

  console.log(`\n${parked.length} booking(s) parked in a driver-held state.`);
  for (const b of parked) await report(b);
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
