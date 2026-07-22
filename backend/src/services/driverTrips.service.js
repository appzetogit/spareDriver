import Booking from '../models/booking.model.js';
import mongoose from 'mongoose';
import {Driver} from '../models/driverModels/driver.model.js';
import Payment from '../models/payment.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import PlatformRevenue, {
  PLATFORM_REVENUE_SOURCE,
} from '../models/platformRevenue.model.js';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
  TERMINAL_BOOKING_STATUSES,
} from '../constants/bookingStatus.js';
import { PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { sanitizeBookingForDriver } from './booking.service.js';
import {
  loadCancellationPolicy,
  evaluateDriverCancelChance,
} from './bookingCancellation.service.js';

/**
 * Driver-facing analytics + history.
 *
 * Everything in this file is read-only and scoped to a single `driverId`.
 *
 * Money-source policy:
 *   - Trip earnings (today/week/month tiles, 7-day chart, ledger "trip"
 *     rows, "recent payouts" feed) are sourced from the `Payment`
 *     ledger (`trip_fare` + `trip_allowance` + `trip_waiting`). A
 *     Payment row only exists when the wallet `$inc` succeeded, so
 *     every rupee shown here was actually credited.
 *   - Cancellation share is read from `Booking.cancellation.driverShare`
 *     because the credit path does a direct `$inc` on the driver doc
 *     (no Payment row is written).
 *   - Subscription driver payouts are read from
 *     `UserSubscription.driverPayouts` (admin credits the wallet on pay;
 *     no Payment row is written).
 *   - Penalty deductions are read from `PlatformRevenue` (source =
 *     `driver_penalty`) which is also the source-of-truth across the
 *     re-dispatch flow.
 *
 * Result: the sum of every credit row visible in the driver UI
 * matches `Driver.wallet.totalEarnings`, and the dashboard cannot
 * out-pace the wallet ever again.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Time helpers                                                        */
/* ------------------------------------------------------------------ */

/** Local-time start-of-day (server TZ) — fine for the demo. */
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday-anchored week start (ISO-ish, sufficient for the dashboard). */
function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

/* ------------------------------------------------------------------ */
/* Earnings helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Set of `Payment.purpose` values that represent a driver wallet
 * credit at trip completion. The wallet $inc + a `Payment` row are
 * written together by `settleDriverEarning` / `settleWaitingBuffer`,
 * so summing these rows is the only source-of-truth that always
 * matches `wallet.totalEarnings`.
 *
 * Trip rows we count:
 *   trip_fare       — post-commission daily-rate share
 *   trip_allowance  — food/stay allowance (outstation, net of commission)
 *   trip_waiting    — waiting charge (100% to driver under current policy)
 *
 * Critically we DO NOT aggregate over completed Booking docs anymore:
 * dev/admin tooling can force a booking to COMPLETED without crediting
 * the wallet (e.g. `/dev/bookings/:id/force-status`) and a fire-and-
 * forget wallet write can silently fail. The Payment ledger only
 * exists when the credit actually landed, so the invariant
 *
 *   Σ earnings aggregation == wallet.totalEarnings
 *
 * holds forever — modulo cancellation shares, which are tracked
 * separately from Bookings (they don't flow through Payment).
 */
const TRIP_PAYMENT_PURPOSES = [
  PAYMENT_PURPOSE.TRIP_FARE,
  PAYMENT_PURPOSE.TRIP_ALLOWANCE,
  PAYMENT_PURPOSE.TRIP_WAITING,
];

/** Subscription stint payouts credited by admin from the driver-share pool. */
async function aggregateSubscriptionPayouts(driverId, gte, lte) {
  const driverOid = new mongoose.Types.ObjectId(String(driverId));
  const rows = await UserSubscription.aggregate([
    { $unwind: '$driverPayouts' },
    {
      $match: {
        'driverPayouts.driverId': driverOid,
        'driverPayouts.paidAt': { $gte: gte, $lte: lte },
      },
    },
    {
      $group: {
        _id: null,
        earnings: { $sum: '$driverPayouts.amountRupees' },
        payouts: { $sum: 1 },
      },
    },
  ]);
  const agg = rows?.[0] || { earnings: 0, payouts: 0 };
  return {
    earnings: round2(agg.earnings || 0),
    payouts: agg.payouts || 0,
  };
}

async function listSubscriptionPayoutRows(driverId) {
  const driverOid = new mongoose.Types.ObjectId(String(driverId));
  const rows = await UserSubscription.aggregate([
    { $unwind: '$driverPayouts' },
    { $match: { 'driverPayouts.driverId': driverOid } },
    {
      $project: {
        payoutId: '$driverPayouts._id',
        subscriptionId: '$_id',
        planName: '$planNameSnapshot',
        amountRupees: '$driverPayouts.amountRupees',
        paidAt: '$driverPayouts.paidAt',
        workingDays: '$driverPayouts.workingDays',
        assignedAt: '$driverPayouts.assignedAt',
        releasedAt: '$driverPayouts.releasedAt',
      },
    },
  ]);
  return rows;
}

/**
 * Sum the driver's net earnings in a window. Combines:
 *
 *   trip earnings        Σ Payment.amount over driver-side trip credits
 *                        (trip_fare + trip_allowance + trip_waiting)
 *                        within the window. Each booking contributes 1-3
 *                        Payment rows that together equal exactly what
 *                        landed in the wallet.
 *   cancellation shares  Σ cancellation.driverShare over user-cancelled
 *                        bookings where this driver was the mobilised
 *                        driver — credited via `Driver.updateOne` on
 *                        cancel (no Payment row; we still source from
 *                        Booking).
 *
 * `trips` counts distinct booking IDs in the Payment rows so a trip
 * with both fare + waiting credits counts once, not twice.
 *
 * `Payment.createdAt` is the time anchor — that's the instant the
 * wallet was credited. We avoid `meta.completedAt` so a back-dated
 * settle (rare) still shows up in the right window.
 */
async function aggregateEarnings(driverId, gte, lte) {
  const [trips, cancels, subscription] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          driverId,
          purpose: { $in: TRIP_PAYMENT_PURPOSES },
          status: 'captured',
          createdAt: { $gte: gte, $lte: lte },
        },
      },
      {
        $group: {
          _id: null,
          earnings: { $sum: '$amount' },
          bookings: { $addToSet: '$referenceId' },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          driverId,
          status: BOOKING_STATUS.CANCELLED,
          isDeleted: false,
          'cancellation.driverShare': { $gt: 0 },
          'timeline.cancelledAt': { $gte: gte, $lte: lte },
        },
      },
      {
        $group: {
          _id: null,
          earnings: { $sum: { $ifNull: ['$cancellation.driverShare', 0] } },
        },
      },
    ]),
    aggregateSubscriptionPayouts(driverId, gte, lte),
  ]);
  const tripsAgg = trips?.[0] || { earnings: 0, bookings: [] };
  const cancelsAgg = cancels?.[0] || { earnings: 0 };
  return {
    earnings: round2(
      (tripsAgg.earnings || 0)
      + (cancelsAgg.earnings || 0)
      + (subscription.earnings || 0),
    ),
    trips: tripsAgg.bookings?.length || 0,
    subscriptionPayouts: subscription.payouts || 0,
  };
}

/* ------------------------------------------------------------------ */
/* Home summary                                                        */
/* ------------------------------------------------------------------ */

/**
 * Drives the "today's earnings + trips + rating + active trip" tile on
 * `/driver/home`. Cheap enough to be re-queried on every dashboard load.
 */
export async function getDriverHomeSummaryService(driverId) {
  if (!driverId) return null;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [today, driver, activeBookingsRaw] = await Promise.all([
    aggregateEarnings(driverId, todayStart, todayEnd),
    Driver.findById(driverId)
      .select('rating ratingCount cancellationChances')
      .lean(),
    Booking.find({
      driverId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name phone phone_no profilePicture')
      .lean(),
  ]);

  const activeBookingRaw = activeBookingsRaw[0] || null;

  // Cancellation budget for today. We hand the driver-side UI a
  // structured snapshot so it can render "2/3 free cancels left today"
  // on the home page even before they tap into an active trip. The
  // policy load is best-effort — if pricing isn't configured we
  // fall back to schema defaults so the tile keeps rendering.
  let cancellationChances = null;
  try {
    const fallbackService = activeBookingRaw?.serviceType || null;
    const policy = await loadCancellationPolicy(fallbackService);
    const chance = evaluateDriverCancelChance(driver, activeBookingRaw, policy);
    cancellationChances = {
      dailyLimit: chance.dailyLimit,
      usedToday: chance.usedToday,
      chancesLeft: chance.chancesLeft,
      graceMinutes: chance.graceMinutes,
      // When there's an active booking, also surface the live grace
      // window state so the home tile can show a "free cancel: 1m 24s
      // left" countdown alongside the chances chip.
      inGrace: activeBookingRaw ? chance.inGrace : false,
      remainingMinutes: activeBookingRaw
        ? Math.max(0, chance.graceMinutes - chance.elapsedMinutes)
        : null,
    };
  } catch (err) {
    console.warn(
      '[driverTrips] cancellation-chance hydration failed:',
      err?.message,
    );
  }

  const activeBookings = activeBookingsRaw
    .map((b) => sanitizeBookingForDriver(b))
    .filter(Boolean);

  return {
    today,
    rating: {
      value: Number(driver?.rating || 0),
      count: Number(driver?.ratingCount || 0),
    },
    // Keep singular field for older clients; prefer `activeBookings`.
    activeBooking: activeBookings[0] || null,
    activeBookings,
    cancellationChances,
  };
}

/* ------------------------------------------------------------------ */
/* Trips list                                                          */
/* ------------------------------------------------------------------ */

const TRIPS_TAB_FILTERS = {
  all: () => ({}),
  ongoing: () => ({ status: { $in: ACTIVE_BOOKING_STATUSES } }),
  completed: () => ({ status: BOOKING_STATUS.COMPLETED }),
  cancelled: () => ({ status: BOOKING_STATUS.CANCELLED }),
};

/**
 * Driver trip history.
 *
 *   GET /driver/trips?tab=all|ongoing|completed|cancelled&page=&limit=
 */
export async function getDriverTripsListService(driverId, query = {}) {
  const tab = String(query.tab || 'all').toLowerCase();
  const filterBuilder = TRIPS_TAB_FILTERS[tab] || TRIPS_TAB_FILTERS.all;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 15));
  const skip = (page - 1) * limit;

  const filter = {
    driverId,
    isDeleted: false,
    ...filterBuilder(),
  };

  const [total, rows] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name phone profilePicture')
      .lean(),
  ]);

  const data = rows.map((b) => sanitizeBookingForDriver(b));

  return {
    data,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Earnings page                                                       */
/* ------------------------------------------------------------------ */

/** Server-local YYYY-MM-DD key for a Date. */
function localDateKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Per-day earnings for the last N days, oldest → newest. Each bucket
 * carries its ISO date so the frontend can render the chart
 * deterministically.
 *
 * Sums:
 *   - trip earnings:        Σ Payment.amount (trip_fare + trip_allowance
 *                           + trip_waiting) on the same local date
 *   - cancellation shares:  Σ cancellation.driverShare on the same date
 *
 * Trip earnings come from the Payment ledger (same source as
 * `aggregateEarnings`) so the chart can never exceed
 * `wallet.totalEarnings` — i.e. the chart never claims you earned
 * money you didn't actually receive.
 *
 * Bucketing is done in JS using server-local time. Doing it in Mongo
 * via `$dateToString` would default to UTC and drift the bucket
 * boundary by ~5.5h for IST servers, putting late-evening credits
 * into the wrong day. (`timezone` could be passed to `$dateToString`
 * but the server's actual TZ varies by deployment — easier to keep
 * the math here.)
 */
async function buildDailyBuckets(driverId, fromDate, days = 7) {
  const start = startOfDay(fromDate);
  const end = endOfDay(addDays(start, days - 1));

  const [paymentRows, cancelBookings, subscriptionPayouts] = await Promise.all([
    Payment.find({
      driverId,
      purpose: { $in: TRIP_PAYMENT_PURPOSES },
      status: 'captured',
      createdAt: { $gte: start, $lte: end },
    })
      .select('amount referenceId createdAt')
      .lean(),
    Booking.find({
      driverId,
      status: BOOKING_STATUS.CANCELLED,
      isDeleted: false,
      'cancellation.driverShare': { $gt: 0 },
      'timeline.cancelledAt': { $gte: start, $lte: end },
    })
      .select('cancellation.driverShare timeline.cancelledAt')
      .lean(),
    UserSubscription.aggregate([
      { $unwind: '$driverPayouts' },
      {
        $match: {
          'driverPayouts.driverId': new mongoose.Types.ObjectId(String(driverId)),
          'driverPayouts.paidAt': { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          amount: '$driverPayouts.amountRupees',
          paidAt: '$driverPayouts.paidAt',
        },
      },
    ]),
  ]);

  const byDate = new Map();
  // Track distinct booking IDs per day so a trip with both fare + waiting
  // Payment rows counts as one trip on that day.
  const tripsByDate = new Map();

  for (const row of paymentRows) {
    const key = localDateKey(row.createdAt);
    const cur = byDate.get(key) || { earnings: 0 };
    cur.earnings += Number(row.amount) || 0;
    byDate.set(key, cur);
    const refKey = String(row.referenceId);
    const set = tripsByDate.get(key) || new Set();
    set.add(refKey);
    tripsByDate.set(key, set);
  }
  for (const b of cancelBookings) {
    const key = localDateKey(b.timeline?.cancelledAt);
    const cur = byDate.get(key) || { earnings: 0 };
    cur.earnings += Number(b.cancellation?.driverShare) || 0;
    byDate.set(key, cur);
  }
  for (const p of subscriptionPayouts) {
    const key = localDateKey(p.paidAt);
    const cur = byDate.get(key) || { earnings: 0 };
    cur.earnings += Number(p.amount) || 0;
    byDate.set(key, cur);
  }

  const buckets = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDays(start, i);
    const iso = localDateKey(d);
    const row = byDate.get(iso) || { earnings: 0 };
    const trips = tripsByDate.get(iso)?.size || 0;
    buckets.push({
      date: iso,
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      earnings: round2(row.earnings),
      trips,
    });
  }
  return buckets;
}

/**
 * Drives `/driver/earnings`. Returns:
 *  - today / week / month aggregates
 *  - last-7-days bar chart buckets
 *  - last 10 completed trips for the "recent payouts" feed
 */
export async function getDriverEarningsService(driverId) {
  if (!driverId) return null;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const sevenDaysAgo = addDays(startOfDay(now), -6); // last 7 days inclusive

  // "Recent payouts" is sourced from the Payment ledger so we never
  // surface a force-completed/un-credited booking under "payouts".
  // We dedupe by bookingId because each completed trip may have up
  // to three Payment rows (fare + allowance + waiting).
  const recentPaymentIds = await Payment.aggregate([
    {
      $match: {
        driverId,
        purpose: { $in: TRIP_PAYMENT_PURPOSES },
        status: 'captured',
      },
    },
    {
      $group: {
        _id: '$referenceId',
        latest: { $max: '$createdAt' },
      },
    },
    { $sort: { latest: -1 } },
    { $limit: 10 },
  ]);
  const recentBookingIds = recentPaymentIds.map((r) => r._id);

  const [today, week, month, daily, recentBookings] = await Promise.all([
    aggregateEarnings(driverId, todayStart, todayEnd),
    aggregateEarnings(driverId, weekStart, todayEnd),
    aggregateEarnings(driverId, monthStart, todayEnd),
    buildDailyBuckets(driverId, sevenDaysAgo, 7),
    recentBookingIds.length
      ? Booking.find({ _id: { $in: recentBookingIds } })
          .populate('userId', 'name')
          .lean()
      : Promise.resolve([]),
  ]);

  // Preserve the Payment-ledger ordering (most-recent credit first).
  const bookingById = new Map(recentBookings.map((b) => [String(b._id), b]));
  const recentSorted = recentBookingIds
    .map((id) => bookingById.get(String(id)))
    .filter(Boolean);

  const peak = daily.reduce(
    (m, b) => (b.earnings > m ? b.earnings : m),
    0,
  );

  return {
    summary: { today, week, month },
    daily: {
      buckets: daily,
      peak: round2(peak),
    },
    recent: recentSorted.map((b) => sanitizeBookingForDriver(b)),
  };
}

/* ------------------------------------------------------------------ */
/* Earnings ledger (paginated)                                         */
/* ------------------------------------------------------------------ */

const LEDGER_KIND = Object.freeze({
  TRIP: 'trip',
  CANCELLATION_SHARE: 'cancellation_share',
  SUBSCRIPTION_PAYOUT: 'subscription_payout',
  PENALTY: 'penalty',
});

/**
 * Paginated, unified ledger of EVERY rupee that moved the driver's
 * wallet — credits (trip payouts, cancellation shares) AND debits
 * (penalty deductions when the driver cancels outside the grace
 * window). Used by the driver Earnings page's "All earnings" feed.
 *
 *   GET /driver/earnings/ledger?page=1&limit=20
 *
 * Returns: `{ rows, total, page, limit, pages, totals }`
 *   rows: most-recent-first ledger lines with `{ kind, direction,
 *         amountRupees, occurredAt, bookingNumber, serviceType, meta }`.
 *         `direction` is 'credit' for trip/cancellation_share rows and
 *         'debit' for penalty rows so the UI can render the sign +
 *         colour deterministically.
 *   totals: lifetime summary split by kind plus a NET total (credits −
 *           debits).
 *
 * Implementation note: we union three sources before paginating:
 *   - Payment (trip_fare + trip_allowance + trip_waiting) grouped by
 *     bookingId → one trip row per booking with a per-component
 *     breakdown. Payment is the source-of-truth: rows exist only
 *     when the wallet credit landed, so the ledger always matches
 *     `wallet.totalEarnings` regardless of dev tooling or failed
 *     fire-and-forget writes.
 *   - Booking.CANCELLED w/ share → cancellation share (positive).
 *     Cancellation share is credited via a direct `$inc` on the
 *     driver doc (no Payment row), so we still source from Booking.
 *   - PlatformRevenue.DRIVER_PENALTY for this driver → penalty
 *     (negative). PlatformRevenue is the source-of-truth for
 *     penalties because the booking's `driverId` is cleared on the
 *     re-dispatch path, but the revenue row keeps `driverId` set to
 *     whoever was penalised.
 */
export async function listDriverEarningsLedgerService(
  driverId,
  { page = 1, limit = 20 } = {},
) {
  if (!driverId) {
    return {
      rows: [],
      total: 0,
      page: 1,
      limit: 20,
      pages: 1,
      totals: {
        tripEarnings: 0,
        cancellationEarnings: 0,
        penaltyDeductions: 0,
        tripCount: 0,
        cancellationCount: 0,
        penaltyCount: 0,
        netEarnings: 0,
        total: 0,
      },
    };
  }
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  // Three sources unioned in parallel:
  //
  //   1. Payment rows (trip_fare + trip_allowance + trip_waiting)
  //      grouped by `referenceId` (bookingId) — each group is one
  //      trip row with a per-component breakdown (fare / allowance /
  //      waiting). Sourcing from Payment guarantees every row in the
  //      ledger corresponds to an actual wallet credit, so the
  //      invariant `Σ ledger trips == wallet.totalEarnings` holds.
  //
  //   2. Booking docs (cancellation share) — when the user cancels
  //      after the driver was mobilised and the admin split routed
  //      some of the fee to the driver. Cancellation shares don't
  //      flow through `Payment` (they're a direct `$inc` on the
  //      Driver doc), so we still source these from Booking.
  //
  //   3. PlatformRevenue penalty rows — driver cancelled out of
  //      grace, wallet debited, revenue booked.
  //
  // Extension info on the trip row (count + additional hours) needs
  // the original Booking — so we run a single $lookup on the grouped
  // payments. Only `accepted` extensions are surfaced (paid intents);
  // open OTP rows aren't earnings.
  const [paymentTripRows, cancellationRows, penaltyRows, subscriptionPayoutRows] =
    await Promise.all([
    Payment.aggregate([
      {
        $match: {
          driverId,
          purpose: { $in: TRIP_PAYMENT_PURPOSES },
          status: 'captured',
        },
      },
      {
        $group: {
          _id: '$referenceId',
          bookingId: { $first: '$referenceId' },
          bookingNumber: { $first: '$meta.bookingNumber' },
          serviceType: { $first: '$meta.serviceType' },
          occurredAt: { $max: '$meta.completedAt' },
          createdAt: { $max: '$createdAt' },
          total: { $sum: '$amount' },
          fareEarning: {
            $sum: {
              $cond: [
                { $eq: ['$purpose', PAYMENT_PURPOSE.TRIP_FARE] },
                '$amount',
                0,
              ],
            },
          },
          allowanceEarning: {
            $sum: {
              $cond: [
                { $eq: ['$purpose', PAYMENT_PURPOSE.TRIP_ALLOWANCE] },
                '$amount',
                0,
              ],
            },
          },
          waitingEarning: {
            $sum: {
              $cond: [
                { $eq: ['$purpose', PAYMENT_PURPOSE.TRIP_WAITING] },
                '$amount',
                0,
              ],
            },
          },
          waitingMinutes: {
            $max: { $ifNull: ['$meta.billableMinutes', 0] },
          },
          waitingNoShow: {
            $max: { $ifNull: ['$meta.noShow', false] },
          },
        },
      },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking',
          pipeline: [
            {
              $project: {
                extensions: {
                  $let: {
                    vars: {
                      accepted: {
                        $filter: {
                          input: { $ifNull: ['$extensions', []] },
                          as: 'e',
                          cond: { $eq: ['$$e.status', 'accepted'] },
                        },
                      },
                    },
                    in: {
                      count: { $size: '$$accepted' },
                      additionalHours: {
                        $sum: {
                          $map: {
                            input: '$$accepted',
                            as: 'e',
                            in: { $ifNull: ['$$e.additionalHours', 0] },
                          },
                        },
                      },
                      driverEarning: {
                        $sum: {
                          $map: {
                            input: '$$accepted',
                            as: 'e',
                            in: { $ifNull: ['$$e.breakdown.driverEarning', 0] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]),
    Booking.find({
      driverId,
      status: BOOKING_STATUS.CANCELLED,
      isDeleted: false,
      'cancellation.driverShare': { $gt: 0 },
    })
      .select('bookingNumber serviceType cancellation timeline createdAt')
      .lean(),
    PlatformRevenue.find({
      driverId,
      source: PLATFORM_REVENUE_SOURCE.DRIVER_PENALTY,
    })
      .select('_id bookingId bookingNumber serviceType amountRupees occurredAt meta')
      .lean(),
    listSubscriptionPayoutRows(driverId),
  ]);

  // Normalise the three sources into a single ledger-row shape, then
  // sort + paginate together. Trip rows carry the per-component
  // breakdown the breakdown sheet renders; cancellation rows carry
  // their fee + reason; penalty rows their cancel reason.
  const normalisedBookings = [];
  for (const r of paymentTripRows) {
    const ext = r.booking?.[0]?.extensions || { count: 0, additionalHours: 0, driverEarning: 0 };
    const total = round2(r.total || 0);
    if (!(total > 0)) continue;
    normalisedBookings.push({
      _id: r.bookingId,
      kind: LEDGER_KIND.TRIP,
      direction: 'credit',
      bookingNumber: r.bookingNumber || null,
      bookingId: r.bookingId,
      serviceType: r.serviceType || null,
      amountRupees: total,
      occurredAt: r.occurredAt || r.createdAt,
      status: BOOKING_STATUS.COMPLETED,
      meta: {
        // `fareEarning` includes paid extension uplifts already (the
        // engine bumps `breakdown.driverEarning` at acceptance time,
        // which is what TRIP_FARE was credited from), so the
        // `extensionDriverEarning` field is a subset for display only,
        // not an additional amount.
        fareEarning: round2(r.fareEarning || 0),
        allowanceEarning: round2(r.allowanceEarning || 0),
        waitingChargeRupees: round2(r.waitingEarning || 0),
        waitingMinutes: Number(r.waitingMinutes) || 0,
        waitingNoShow: !!r.waitingNoShow,
        extensionsCount: Number(ext.count) || 0,
        extensionAdditionalHours: round2(ext.additionalHours || 0),
        extensionDriverEarning: round2(ext.driverEarning || 0),
      },
    });
  }
  for (const b of cancellationRows) {
    const amount = round2(Number(b.cancellation?.driverShare) || 0);
    if (!(amount > 0)) continue;
    normalisedBookings.push({
      _id: b._id,
      kind: LEDGER_KIND.CANCELLATION_SHARE,
      direction: 'credit',
      bookingNumber: b.bookingNumber || null,
      bookingId: b._id,
      serviceType: b.serviceType || null,
      amountRupees: amount,
      occurredAt: b.timeline?.cancelledAt || b.createdAt,
      status: BOOKING_STATUS.CANCELLED,
      meta: {
        reason: b.cancellation?.reason || null,
        cancelledBy: b.cancellation?.cancelledBy || null,
        feeCharged: round2(b.cancellation?.feeCharged || 0),
      },
    });
  }

  for (const p of subscriptionPayoutRows) {
    const amount = round2(Number(p.amountRupees) || 0);
    if (!(amount > 0)) continue;
    normalisedBookings.push({
      _id: p.payoutId || `${p.subscriptionId}-${p.paidAt}`,
      kind: LEDGER_KIND.SUBSCRIPTION_PAYOUT,
      direction: 'credit',
      bookingNumber: null,
      bookingId: null,
      serviceType: null,
      amountRupees: amount,
      occurredAt: p.paidAt,
      status: null,
      meta: {
        subscriptionId: p.subscriptionId,
        planName: p.planName || 'Subscription',
        workingDays: p.workingDays || 0,
        assignedAt: p.assignedAt || null,
        releasedAt: p.releasedAt || null,
      },
    });
  }

  const normalisedPenalties = penaltyRows.map((r) => ({
    _id: r._id,
    kind: LEDGER_KIND.PENALTY,
    direction: 'debit',
    bookingNumber: r.bookingNumber || null,
    bookingId: r.bookingId || null,
    serviceType: r.serviceType || null,
    amountRupees: round2(r.amountRupees || 0),
    occurredAt: r.occurredAt,
    status: null,
    meta: {
      reason: r.meta?.reason || 'cancelled_by_driver',
      bookingStatus: r.meta?.status || null,
    },
  }));

  const merged = [...normalisedBookings, ...normalisedPenalties].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const total = merged.length;
  const rows = merged.slice(skip, skip + safeLimit);

  // Lifetime totals are computed across the FULL merged list (not the
  // paginated slice) so the breakdown card matches reality regardless
  // of which page the driver is on.
  let tripEarnings = 0;
  let cancellationEarnings = 0;
  let subscriptionEarnings = 0;
  let penaltyDeductions = 0;
  let tripCount = 0;
  let cancellationCount = 0;
  let subscriptionCount = 0;
  let penaltyCount = 0;
  for (const row of merged) {
    if (row.kind === LEDGER_KIND.TRIP) {
      tripEarnings += row.amountRupees;
      tripCount += 1;
    } else if (row.kind === LEDGER_KIND.CANCELLATION_SHARE) {
      cancellationEarnings += row.amountRupees;
      cancellationCount += 1;
    } else if (row.kind === LEDGER_KIND.SUBSCRIPTION_PAYOUT) {
      subscriptionEarnings += row.amountRupees;
      subscriptionCount += 1;
    } else if (row.kind === LEDGER_KIND.PENALTY) {
      penaltyDeductions += row.amountRupees;
      penaltyCount += 1;
    }
  }

  const totalCredits = tripEarnings + cancellationEarnings + subscriptionEarnings;

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit) || 1,
    totals: {
      tripEarnings: round2(tripEarnings),
      cancellationEarnings: round2(cancellationEarnings),
      subscriptionEarnings: round2(subscriptionEarnings),
      penaltyDeductions: round2(penaltyDeductions),
      tripCount,
      cancellationCount,
      subscriptionCount,
      penaltyCount,
      // Total CREDITS (kept under `total` for back-compat with the FE
      // card that read this field directly).
      total: round2(totalCredits),
      // Net = credits − debits, the actual rupee change for the driver.
      netEarnings: round2(totalCredits - penaltyDeductions),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Re-exports (lets the controller import everything from one path).   */
/* ------------------------------------------------------------------ */

export const __EXPORTED_STATUSES__ = {
  ACTIVE_BOOKING_STATUSES,
  TERMINAL_BOOKING_STATUSES,
};
