import PlatformRevenue, {
  PLATFORM_REVENUE_SOURCE,
} from '../models/platformRevenue.model.js';
import { ApiError } from '../utils/apiError.js';
import { buildCommissionRevenueMeta } from './bookingExtension.service.js';

/**
 * Platform revenue service.
 *
 * Single chokepoint for writing rows to the `PlatformRevenue`
 * ledger and reading paginated lists for the admin "Revenue"
 * page. The writers are deliberately fire-and-forget friendly —
 * callers in the booking pipeline can `recordPlatformRevenue(...).catch(noop)`
 * without wedging the user-facing transition on a ledger hiccup.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Net platform take on a completed booking from its fare snapshot.
 *
 *   commission (pre-coupon) + platform fee − admin-absorbed coupon
 *
 * Drivers are paid on the pre-coupon subtotal; admin-created coupons
 * are a platform cost, not a driver haircut.
 */
export function netPlatformRevenueFromFareSnapshot(fareSnapshot = {}) {
  const snap = fareSnapshot || {};
  const bd = snap.breakdown || {};
  const commission = Number(bd.platformCommission ?? snap.platformCommission) || 0;
  const platformFee =
    Number(bd.platformFee ?? bd.serviceCharge ?? snap.platformFee ?? snap.serviceCharge) || 0;
  const couponDiscount = Number(bd.couponDiscount ?? snap.couponDiscount) || 0;
  return {
    commission: round2(commission),
    platformFee: round2(platformFee),
    couponDiscount: round2(couponDiscount),
    gross: round2(commission + platformFee),
    net: round2(commission + platformFee - couponDiscount),
  };
}

/**
 * Book commission + platform fee + coupon absorption for a completed trip.
 * Used by normal completion and no-show auto-complete so every path
 * writes the same ledger shape. Best-effort — never throws to callers.
 */
export async function recordCompletedTripPlatformRevenue(booking, extraMeta = {}) {
  if (!booking?._id) return;

  const snap = booking.fareSnapshot || {};
  const bd = snap.breakdown || {};
  const { commission, platformFee, couponDiscount } =
    netPlatformRevenueFromFareSnapshot(snap);
  const revenueMeta = {
    ...buildCommissionRevenueMeta(booking),
    ...extraMeta,
  };

  const base = {
    bookingId: booking._id,
    bookingNumber: booking.bookingNumber || '',
    serviceType: booking.serviceType || '',
    userId: booking.userId,
    driverId: booking.driverId || null,
  };

  const writes = [];

  if (commission > 0) {
    writes.push(
      recordPlatformRevenue({
        ...base,
        source: PLATFORM_REVENUE_SOURCE.COMMISSION,
        amountRupees: commission,
        meta: revenueMeta,
      }),
    );
  }

  if (platformFee > 0) {
    writes.push(
      recordPlatformRevenue({
        ...base,
        source: PLATFORM_REVENUE_SOURCE.PLATFORM_FEE,
        amountRupees: platformFee,
        meta: {
          ...revenueMeta,
          platformFeeType: bd.platformFeeType || null,
          platformFeeAmount: bd.platformFeeAmount ?? bd.serviceChargePercent ?? null,
        },
      }),
    );
  }

  if (couponDiscount > 0) {
    writes.push(
      recordPlatformRevenue({
        ...base,
        source: PLATFORM_REVENUE_SOURCE.COUPON_DISCOUNT,
        amountRupees: -round2(couponDiscount),
        meta: {
          ...revenueMeta,
          couponCode: snap.couponCode || bd.couponCode || null,
          couponId: snap.couponId ? String(snap.couponId) : null,
          couponDiscount,
          subtotal: round2(bd.subtotal || 0),
          netSubtotal: round2(bd.netSubtotal || 0),
          totalPayable: round2(bd.totalPayable || snap.total || 0),
          driverEarning: round2(bd.driverEarning || 0),
        },
      }),
    );
  }

  await Promise.allSettled(writes);
}

/**
 * Persist a single revenue line. Returns the inserted document.
 *
 *   @param {object} params
 *   @param {string} params.source           PLATFORM_REVENUE_SOURCE.*
 *   @param {number} params.amountRupees     ₹ kept by the platform.
 *                                           Positive for income; negative
 *                                           allowed only for COUPON_DISCOUNT
 *                                           (admin-absorbed coupon cost).
 *   @param {string|ObjectId} params.bookingId
 *   @param {string} [params.bookingNumber]
 *   @param {string} [params.serviceType]
 *   @param {string|ObjectId} [params.userId]
 *   @param {string|ObjectId} [params.driverId]
 *   @param {object} [params.meta]           source-specific blob
 *   @param {Date}   [params.occurredAt]     defaults to now
 *
 * Zero amounts are dropped silently. Negative amounts are rejected
 * except for `coupon_discount` (and admin refunds via the debit helper).
 */
export async function recordPlatformRevenue({
  source,
  amountRupees,
  bookingId = null,
  userSubscriptionId = null,
  bookingNumber = '',
  serviceType = '',
  userId = null,
  driverId = null,
  meta = {},
  occurredAt = null,
}) {
  if (!Object.values(PLATFORM_REVENUE_SOURCE).includes(source)) {
    throw new ApiError(400, `Invalid platform revenue source: ${source}`);
  }
  const amt = round2(Number(amountRupees) || 0);
  const allowNegative = source === PLATFORM_REVENUE_SOURCE.COUPON_DISCOUNT;
  if (amt === 0) return null;
  if (amt < 0 && !allowNegative) return null;
  if (source === PLATFORM_REVENUE_SOURCE.SUBSCRIPTION) {
    if (!userSubscriptionId) {
      throw new ApiError(400, 'userSubscriptionId is required for subscription revenue');
    }
  } else if (source === PLATFORM_REVENUE_SOURCE.ADMIN_REFUND) {
    // Admin refunds are not tied to a booking.
  } else if (!bookingId) {
    throw new ApiError(400, 'bookingId is required');
  }

  const row = {
    source,
    amountRupees: amt,
    bookingId: bookingId || null,
    userSubscriptionId: userSubscriptionId || null,
    bookingNumber: bookingNumber ? String(bookingNumber).slice(0, 80) : '',
    serviceType: serviceType ? String(serviceType).slice(0, 40) : '',
    userId: userId || null,
    driverId: driverId || null,
    meta: meta && typeof meta === 'object' ? meta : {},
    occurredAt: occurredAt || new Date(),
  };

  // Rows with no booking (subscription income, admin refunds) are genuinely
  // unbounded — nothing to deduplicate against.
  if (!bookingId) {
    return PlatformRevenue.create(row);
  }

  // Booking-scoped: at most one row per source. `settleCompletedTripPayouts`
  // advertises itself as safe to call more than once, but only the driver
  // earning was actually idempotent — this write was a plain insert, so a
  // re-settle (an admin rewinding a completed booking and it completing
  // again) silently double-booked the platform's revenue.
  const dedupeKey = `${String(bookingId)}:${source}`;
  try {
    return await PlatformRevenue.findOneAndUpdate(
      { dedupeKey },
      // `dedupeKey` is omitted here deliberately: the filter's equality
      // supplies it on insert, and naming it again is a conflicting path.
      { $setOnInsert: row },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Two concurrent upserts on one key: MongoDB lets both through the
    // lookup and rejects the loser's insert. The winner's row is what we
    // wanted, so return it rather than surfacing the collision.
    if (err?.code === 11000) {
      return PlatformRevenue.findOne({ dedupeKey });
    }
    throw err;
  }
}

/**
 * Record a platform-revenue debit (admin refund paid from company funds).
 * Stored as a negative `amountRupees` row so revenue totals net correctly.
 */
export async function recordPlatformRevenueDebit({
  amountRupees,
  userId = null,
  driverId = null,
  meta = {},
  occurredAt = null,
}) {
  const amt = round2(Number(amountRupees) || 0);
  if (amt <= 0) throw new ApiError(400, 'Debit amount must be positive');

  return PlatformRevenue.create({
    source: PLATFORM_REVENUE_SOURCE.ADMIN_REFUND,
    amountRupees: -amt,
    bookingId: null,
    userSubscriptionId: null,
    bookingNumber: '',
    serviceType: '',
    userId: userId || null,
    driverId: driverId || null,
    meta: meta && typeof meta === 'object' ? meta : {},
    occurredAt: occurredAt || new Date(),
  });
}

/**
 * Paginated admin list with filters + at-a-glance summary aggregates.
 *
 * Returns `{ rows, total, page, limit, totals }` where `totals` covers
 * the entire matching set (not just the current page) so the summary
 * cards on the admin page stay accurate as the admin browses.
 */
export async function listPlatformRevenueService({
  page = 1,
  limit = 20,
  source = '',
  search = '',
  serviceType = '',
  from = '',
  to = '',
  forExport = false,
} = {}) {
  const maxLimit = forExport ? 10000 : 100;
  const safeLimit = Math.max(1, Math.min(maxLimit, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const filter = {};
  if (source && Object.values(PLATFORM_REVENUE_SOURCE).includes(source)) {
    filter.source = source;
  } else {
    filter.source = { $ne: PLATFORM_REVENUE_SOURCE.SUBSCRIPTION };
  }
  if (serviceType) filter.serviceType = String(serviceType).trim();
  if (search) {
    filter.$or = [
      { bookingNumber: { $regex: new RegExp(String(search).trim(), 'i') } },
      { 'meta.planName': { $regex: new RegExp(String(search).trim(), 'i') } },
    ];
  }
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from);
    if (to) filter.occurredAt.$lte = new Date(to);
  }

  const [rows, total, aggregates] = await Promise.all([
    PlatformRevenue.find(filter)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone_no')
      .lean(),
    PlatformRevenue.countDocuments(filter),
    PlatformRevenue.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
          amount: { $sum: '$amountRupees' },
        },
      },
    ]),
  ]);

  const totals = aggregates.reduce(
    (acc, row) => {
      acc.bySource[row._id] = {
        count: row.count,
        amount: round2(row.amount),
      };
      acc.totalAmount = round2(acc.totalAmount + row.amount);
      acc.totalCount += row.count;
      return acc;
    },
    { bySource: {}, totalAmount: 0, totalCount: 0 },
  );

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
    totals,
  };
}

export { PLATFORM_REVENUE_SOURCE };
