/**
 * Real-MongoDB verification for the booking concurrency guards.
 *
 * The unit suite covers the pure decision logic; this covers the half that
 * only a real server can answer — whether an index actually builds, whether
 * Mongo accepts a particular update shape, and who wins a genuine race. Every
 * assertion here corresponds to a guard that money or double-booking depends
 * on:
 *
 *   - the partial unique index that stops platform revenue double-counting
 *   - the idempotency claim that stops a double wallet debit on double-submit
 *   - the conditional driver lock that stops one driver taking two rides
 *   - the cancel claim that stops a double refund, and stops a cancel
 *     overwriting a trip the driver just completed
 *   - the coupon stamp that stops a limited-use code being burnt twice
 *
 * SAFETY: connects to the configured cluster but always in a scratch database
 * (`<DB_NAME>__racecheck`), refuses to run if that resolves to the app's own
 * database, and drops the scratch database on the way out. It never reads or
 * writes application data.
 *
 *   node scripts/verifyConcurrencyGuards.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const APP_DB = process.env.DB_NAME;
const SCRATCH_DB = `${APP_DB || 'spareDriver'}__racecheck`;

if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing');
if (SCRATCH_DB === APP_DB) throw new Error('refusing to run against the app database');

let pass = 0;
let fail = 0;
const results = [];

function check(name, ok, detail = '') {
  if (ok) { pass += 1; results.push(`  PASS  ${name}`); }
  else { fail += 1; results.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const { default: Booking } = await import('../src/models/booking.model.js');
const { default: PlatformRevenue } = await import('../src/models/platformRevenue.model.js');
const { BookingIdempotency } = await import('../src/models/bookingIdempotency.model.js');
const { Driver } = await import('../src/models/driverModels/driver.model.js');
const { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS } = await import(
  '../src/constants/bookingStatus.js'
);

await mongoose.connect(process.env.MONGO_URI, { dbName: SCRATCH_DB });
console.log(`Connected to scratch database: ${SCRATCH_DB}`);
console.log(`(app database "${APP_DB}" is untouched)\n`);

const oid = () => new mongoose.Types.ObjectId();

try {
  /* =============== 1. PlatformRevenue partial unique index =============== */
  await PlatformRevenue.syncIndexes();
  const revIdx = await PlatformRevenue.collection.indexes();
  const dedupeIdx = revIdx.find((i) => i.key?.dedupeKey === 1);
  check('revenue: partial unique index built', Boolean(dedupeIdx?.unique && dedupeIdx?.partialFilterExpression));

  const bId = oid();
  const key = `${bId}:commission`;
  await PlatformRevenue.create({
    source: 'commission', amountRupees: 100, bookingId: bId, dedupeKey: key,
  });
  let dupBlocked = false;
  try {
    await PlatformRevenue.create({
      source: 'commission', amountRupees: 100, bookingId: bId, dedupeKey: key,
    });
  } catch (e) { dupBlocked = e?.code === 11000; }
  check('revenue: duplicate dedupeKey rejected', dupBlocked);

  // Rows with no dedupeKey (subscription income, admin refunds) stay unbounded.
  await PlatformRevenue.create({ source: 'subscription', amountRupees: 50, userSubscriptionId: oid() });
  await PlatformRevenue.create({ source: 'subscription', amountRupees: 50, userSubscriptionId: oid() });
  const nullCount = await PlatformRevenue.countDocuments({ dedupeKey: null });
  check('revenue: partial index still allows many null keys', nullCount === 2, `got ${nullCount}`);

  /* --- the $setOnInsert shape I could not test statically ---------------- */
  const key2 = `${oid()}:platform_fee`;
  let upsertShapeOk = true;
  let upsertErr = '';
  try {
    for (let i = 0; i < 2; i += 1) {
      await PlatformRevenue.findOneAndUpdate(
        { dedupeKey: key2 },
        { $setOnInsert: { source: 'platform_fee', amountRupees: 25, bookingId: oid() } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
  } catch (e) { upsertShapeOk = false; upsertErr = e?.message || String(e); }
  const upsertRows = await PlatformRevenue.countDocuments({ dedupeKey: key2 });
  check('revenue: upsert without key in $setOnInsert is accepted', upsertShapeOk, upsertErr);
  check('revenue: repeated upsert writes exactly one row', upsertRows === 1, `got ${upsertRows}`);

  /* =============== 2. BookingIdempotency index =============== */
  await BookingIdempotency.syncIndexes();
  const idemIdx = await BookingIdempotency.collection.indexes();
  check('idempotency: unique index on key', Boolean(idemIdx.find((i) => i.key?.key === 1 && i.unique)));
  check('idempotency: TTL index on expiresAt',
    Boolean(idemIdx.find((i) => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0)));

  const dedupe = 'fingerprint-abc';
  const uid = oid();
  await BookingIdempotency.create({ key: dedupe, userId: uid, expiresAt: new Date(Date.now() + 60000) });
  let idemBlocked = false;
  try {
    await BookingIdempotency.create({ key: dedupe, userId: uid, expiresAt: new Date(Date.now() + 60000) });
  } catch (e) { idemBlocked = e?.code === 11000; }
  check('idempotency: concurrent duplicate claim rejected', idemBlocked);

  // Concurrent, not sequential — the real double-submit shape.
  const raceKey = 'fingerprint-race';
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      BookingIdempotency.create({ key: raceKey, userId: uid, expiresAt: new Date(Date.now() + 60000) })),
  );
  const won = attempts.filter((r) => r.status === 'fulfilled').length;
  check('idempotency: exactly one of 8 concurrent claims wins', won === 1, `${won} won`);

  /* =============== 3. Driver conditional lock (P0-2) =============== */
  const drv = await Driver.collection.insertOne({ isOnTrip: false, name: 'race-probe' });
  const drvId = drv.insertedId;
  const lockRace = await Promise.all(
    Array.from({ length: 8 }, () =>
      Driver.findOneAndUpdate(
        { _id: drvId, isOnTrip: false },
        { $set: { isOnTrip: true } },
        { new: true, projection: { _id: 1 } },
      )),
  );
  const lockWinners = lockRace.filter(Boolean).length;
  check('driver lock: exactly one of 8 concurrent accepts acquires it', lockWinners === 1, `${lockWinners} won`);

  // Release must hand it back for the next accept.
  await Driver.updateOne({ _id: drvId }, { $set: { isOnTrip: false } });
  const reacquired = await Driver.findOneAndUpdate(
    { _id: drvId, isOnTrip: false }, { $set: { isOnTrip: true } }, { new: true },
  );
  check('driver lock: released lock can be re-acquired', Boolean(reacquired));

  /* =============== 4. Cancel claim (P0-3 / P0-4) =============== */
  async function seedBooking(status) {
    const doc = {
      bookingNumber: `RC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: oid(), carId: oid(), serviceType: 'hourly', bookingType: 'instant',
      status,
      pickup: { address: 'x', location: { type: 'Point', coordinates: [77.5, 12.9] } },
      fareSnapshot: { total: 500 },
      isDeleted: false,
    };
    const res = await Booking.collection.insertOne(doc);
    return res.insertedId;
  }

  const activeId = await seedBooking(BOOKING_STATUS.DRIVER_ASSIGNED);
  const cancelRace = await Promise.all(
    Array.from({ length: 8 }, () =>
      Booking.findOneAndUpdate(
        { _id: activeId, isDeleted: false, status: { $in: [...ACTIVE_BOOKING_STATUSES] } },
        { $set: { status: BOOKING_STATUS.CANCELLED, 'timeline.cancelledAt': new Date() } },
        { new: true, projection: { _id: 1 } },
      )),
  );
  const cancelWinners = cancelRace.filter(Boolean).length;
  check('cancel claim: exactly one of 8 concurrent cancels wins (no double refund)',
    cancelWinners === 1, `${cancelWinners} won`);

  // The P0-4 shape: a completed booking must not be cancellable.
  const doneId = await seedBooking(BOOKING_STATUS.COMPLETED);
  const clobber = await Booking.findOneAndUpdate(
    { _id: doneId, isDeleted: false, status: { $in: [...ACTIVE_BOOKING_STATUSES] } },
    { $set: { status: BOOKING_STATUS.CANCELLED } },
    { new: true },
  );
  check('cancel claim: cannot overwrite a COMPLETED booking', clobber === null);
  const stillDone = await Booking.findById(doneId).select('status').lean();
  check('cancel claim: completed booking still COMPLETED',
    stillDone?.status === BOOKING_STATUS.COMPLETED, `is ${stillDone?.status}`);

  /* =============== 5. Coupon count-once stamp (P1-5b) =============== */
  const couponBookingId = await seedBooking(BOOKING_STATUS.COMPLETED);
  const stampRace = await Promise.all(
    Array.from({ length: 6 }, () =>
      Booking.updateOne(
        { _id: couponBookingId, couponCountedAt: null },
        { $set: { couponCountedAt: new Date() } },
      )),
  );
  const stampWinners = stampRace.filter((r) => r.modifiedCount === 1).length;
  check('coupon: exactly one of 6 concurrent settles counts the coupon',
    stampWinners === 1, `${stampWinners} counted`);

  /* =============== 6. Booking schema additions =============== */
  const fieldCheckId = await seedBooking(BOOKING_STATUS.ARRIVED);
  await Booking.updateOne({ _id: fieldCheckId }, {
    $set: {
      'rideStartOtp.lockedUntil': new Date(Date.now() + 300000),
      'arrivalFix.source': 'server',
      'stuckRecovery.kind': 'assigned_past_pickup',
    },
  });
  const fieldDoc = await Booking.findById(fieldCheckId)
    .select('rideStartOtp arrivalFix stuckRecovery').lean();
  check('schema: rideStartOtp.lockedUntil persists', Boolean(fieldDoc?.rideStartOtp?.lockedUntil));
  check('schema: arrivalFix.source persists', fieldDoc?.arrivalFix?.source === 'server');
  check('schema: stuckRecovery accepts the new assigned_past_pickup kind',
    fieldDoc?.stuckRecovery?.kind === 'assigned_past_pickup');
} finally {
  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await mongoose.connection.dropDatabase();
  console.log(`Scratch database ${SCRATCH_DB} dropped.`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}
