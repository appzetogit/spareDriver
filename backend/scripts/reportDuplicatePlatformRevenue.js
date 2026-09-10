/**
 * Audit (and optionally repair) duplicated booking-scoped platform revenue.
 *
 * Why these exist: `settleCompletedTripPayouts` advertised itself as safe to
 * call more than once, but only `settleDriverEarning` actually was.
 * `recordPlatformRevenue` was a plain insert, so every re-settle of the same
 * booking wrote a second commission / platform-fee / coupon-discount row and
 * the Revenue page counted the money twice. Re-settles were reachable because
 * the admin status override had no source-state validation — an admin could
 * rewind a COMPLETED booking to STARTED and let it complete again.
 *
 * Both holes are now closed (a partial unique index on `dedupeKey`, plus an
 * allowed-transition matrix on the override), but rows written before that
 * are still in the ledger. This script finds them.
 *
 * It is deliberately conservative:
 *
 *   - Reporting is the default. Nothing is written without `--apply`.
 *   - `--apply` stamps `dedupeKey` on the row it keeps and deletes only the
 *     EXTRA rows in each duplicate group. The kept row is the earliest by
 *     `occurredAt` (then `_id`), so the ledger keeps the entry that matched
 *     the trip's own timeline.
 *   - Groups whose duplicates disagree on amount are never auto-repaired.
 *     A differing amount means the two settles priced the booking
 *     differently, and picking one is a finance decision, not a cleanup.
 *     They are listed under NEEDS REVIEW for a human.
 *
 * Deleting a revenue row changes reported income for the period it sits in.
 * Read the dry-run output before applying, and take a database backup first.
 *
 *   node scripts/reportDuplicatePlatformRevenue.js            # report only
 *   node scripts/reportDuplicatePlatformRevenue.js --apply    # repair safe groups
 *   node scripts/reportDuplicatePlatformRevenue.js --stamp    # only backfill dedupeKey
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import PlatformRevenue from '../src/models/platformRevenue.model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const STAMP_ONLY = args.includes('--stamp');

const inr = (n) => `₹${Number(n || 0).toFixed(2)}`;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;
  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set in backend/.env');
  }
  await mongoose.connect(uri, { dbName });
  console.log(`Connected to MongoDB (database: ${dbName})`);
  if (STAMP_ONLY) {
    console.log('\n*** STAMP MODE — backfilling dedupeKey on unique rows only ***\n');
  } else {
    console.log(
      APPLY
        ? '\n*** APPLY MODE — deleting duplicate rows ***\n'
        : '\n--- DRY RUN (pass --apply to repair) ---\n',
    );
  }

  // Booking-scoped rows only. Subscription income and admin refunds carry no
  // bookingId and are legitimately unbounded.
  const groups = await PlatformRevenue.aggregate([
    { $match: { bookingId: { $ne: null } } },
    {
      $group: {
        _id: { bookingId: '$bookingId', source: '$source' },
        count: { $sum: 1 },
        rows: {
          $push: {
            _id: '$_id',
            amountRupees: '$amountRupees',
            occurredAt: '$occurredAt',
            bookingNumber: '$bookingNumber',
            dedupeKey: '$dedupeKey',
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const dupes = groups.filter((g) => g.count > 1);
  const singles = groups.filter((g) => g.count === 1);

  console.log(
    `Scanned ${groups.length} booking/source groups — `
      + `${singles.length} clean, ${dupes.length} duplicated.`,
  );

  /* ---- 1. Backfill dedupeKey on rows that are already unique --------- */
  // Safe unconditionally: these groups have exactly one row, so stamping
  // them cannot collide with the partial unique index. Doing it means the
  // index starts protecting historical bookings too, not just new ones.
  let stamped = 0;
  if (APPLY || STAMP_ONLY) {
    for (const g of singles) {
      const row = g.rows[0];
      if (row.dedupeKey) continue;
      const key = `${String(g._id.bookingId)}:${g._id.source}`;
      try {
        await PlatformRevenue.updateOne({ _id: row._id }, { $set: { dedupeKey: key } });
        stamped += 1;
      } catch (err) {
        console.warn(`  ! could not stamp ${row._id}: ${err?.message}`);
      }
    }
    console.log(`Stamped dedupeKey on ${stamped} previously-unique rows.`);
  } else {
    const unstamped = singles.filter((g) => !g.rows[0].dedupeKey).length;
    console.log(`Would stamp dedupeKey on ${unstamped} previously-unique rows.`);
  }

  if (STAMP_ONLY) {
    console.log('\nStamp-only run complete. Duplicate groups left untouched.');
    return;
  }

  if (!dupes.length) {
    console.log('\nNo duplicated revenue rows. Nothing to repair.');
    return;
  }

  /* ---- 2. Classify duplicate groups ---------------------------------- */
  const repairable = [];
  const needsReview = [];

  for (const g of dupes) {
    const amounts = new Set(g.rows.map((r) => round2(r.amountRupees)));
    (amounts.size === 1 ? repairable : needsReview).push(g);
  }

  let overstated = 0;
  console.log(`\n${'='.repeat(64)}\nDUPLICATE GROUPS\n${'='.repeat(64)}`);

  for (const g of dupes) {
    const sorted = [...g.rows].sort(
      (a, b) =>
        new Date(a.occurredAt || 0) - new Date(b.occurredAt || 0)
        || String(a._id).localeCompare(String(b._id)),
    );
    const [keep, ...extra] = sorted;
    const extraSum = extra.reduce((acc, r) => acc + Number(r.amountRupees || 0), 0);
    overstated += extraSum;

    const identical = new Set(g.rows.map((r) => round2(r.amountRupees))).size === 1;
    console.log(
      `\n${g.rows[0].bookingNumber || String(g._id.bookingId)}  [${g._id.source}]  `
        + `${g.count} rows  ${identical ? '' : '<- NEEDS REVIEW (amounts differ) '}`
        + `overstated by ${inr(extraSum)}`,
    );
    console.log(`   keep   ${keep._id}  ${inr(keep.amountRupees)}  ${keep.occurredAt?.toISOString?.() || ''}`);
    for (const r of extra) {
      console.log(`   drop   ${r._id}  ${inr(r.amountRupees)}  ${r.occurredAt?.toISOString?.() || ''}`);
    }
  }

  console.log(`\n${'='.repeat(64)}`);
  console.log(`Repairable groups (identical amounts): ${repairable.length}`);
  console.log(`Needs human review (amounts differ):   ${needsReview.length}`);
  console.log(`Total revenue overstatement:           ${inr(overstated)}`);

  /* ---- 3. Repair the unambiguous ones -------------------------------- */
  if (!APPLY) {
    console.log('\n--- DRY RUN — nothing written. Re-run with --apply to repair. ---');
    return;
  }

  let deleted = 0;
  let keptStamped = 0;
  for (const g of repairable) {
    const sorted = [...g.rows].sort(
      (a, b) =>
        new Date(a.occurredAt || 0) - new Date(b.occurredAt || 0)
        || String(a._id).localeCompare(String(b._id)),
    );
    const [keep, ...extra] = sorted;
    const key = `${String(g._id.bookingId)}:${g._id.source}`;
    try {
      // Drop the extras first — stamping the keeper while duplicates still
      // carry the same key would trip the unique index.
      const res = await PlatformRevenue.deleteMany({
        _id: { $in: extra.map((r) => r._id) },
      });
      deleted += res?.deletedCount || 0;
      await PlatformRevenue.updateOne({ _id: keep._id }, { $set: { dedupeKey: key } });
      keptStamped += 1;
    } catch (err) {
      console.warn(`  ! repair failed for ${key}: ${err?.message}`);
    }
  }

  console.log(`\nDeleted ${deleted} duplicate rows across ${keptStamped} groups.`);
  if (needsReview.length) {
    console.log(
      `${needsReview.length} group(s) left untouched because their amounts disagree — `
        + 'decide which row is correct and remove the other by hand.',
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
