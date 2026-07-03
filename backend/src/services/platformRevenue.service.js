import PlatformRevenue, {
  PLATFORM_REVENUE_SOURCE,
} from '../models/platformRevenue.model.js';
import { ApiError } from '../utils/apiError.js';

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
 * Persist a single revenue line. Returns the inserted document.
 *
 *   @param {object} params
 *   @param {string} params.source           PLATFORM_REVENUE_SOURCE.*
 *   @param {number} params.amountRupees     ₹ kept by the platform (>0)
 *   @param {string|ObjectId} params.bookingId
 *   @param {string} [params.bookingNumber]
 *   @param {string} [params.serviceType]
 *   @param {string|ObjectId} [params.userId]
 *   @param {string|ObjectId} [params.driverId]
 *   @param {object} [params.meta]           source-specific blob
 *   @param {Date}   [params.occurredAt]     defaults to now
 *
 * Zero / negative amounts are dropped silently — there's nothing to
 * ledger and we don't want noisy no-op rows polluting the admin view.
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
  if (amt <= 0) return null;
  if (source === PLATFORM_REVENUE_SOURCE.SUBSCRIPTION) {
    if (!userSubscriptionId) {
      throw new ApiError(400, 'userSubscriptionId is required for subscription revenue');
    }
  } else if (source === PLATFORM_REVENUE_SOURCE.ADMIN_REFUND) {
    // Admin refunds are not tied to a booking.
  } else if (!bookingId) {
    throw new ApiError(400, 'bookingId is required');
  }

  return PlatformRevenue.create({
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
  });
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
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
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
