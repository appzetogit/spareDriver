import PlatformRevenue, { PLATFORM_REVENUE_SOURCE } from '../models/platformRevenue.model.js';
import {
  round2,
  resolveDateRange,
  resolvePreviousRange,
  mongoDateRange,
  percentChange,
  fillDailyTrend,
  buildFiltersMeta,
  mongoDayBucket
} from '../utils/reportDateRange.js';

const SOURCE_LABELS = {
  [PLATFORM_REVENUE_SOURCE.COMMISSION]: 'Commission',
  [PLATFORM_REVENUE_SOURCE.PLATFORM_FEE]: 'Platform fee',
  [PLATFORM_REVENUE_SOURCE.COUPON_DISCOUNT]: 'Coupon discount (absorbed)',
  [PLATFORM_REVENUE_SOURCE.CANCELLATION_FEE]: 'Cancellation fee',
  [PLATFORM_REVENUE_SOURCE.DRIVER_PENALTY]: 'Driver penalty',
  [PLATFORM_REVENUE_SOURCE.SUBSCRIPTION]: 'Subscription',
  [PLATFORM_REVENUE_SOURCE.ADMIN_REFUND]: 'Admin refund',
};

function buildRevenueMatch(query, dateRange) {
  const match = {
    ...mongoDateRange(dateRange, 'occurredAt'),
    source: { $ne: PLATFORM_REVENUE_SOURCE.SUBSCRIPTION },
  };
  if (query.serviceType) match.serviceType = query.serviceType;
  return match;
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function getAdminRevenueReportsService(query = {}) {
  const dateRange = resolveDateRange(query);
  const prevRange = resolvePreviousRange(dateRange);
  const revenueMatch = buildRevenueMatch(query, dateRange);
  const prevMatch = buildRevenueMatch(query, prevRange);

  const [totalAgg, prevTotalAgg, sourceAgg, trendRaw] = await Promise.all([
    PlatformRevenue.aggregate([
      { $match: revenueMatch },
      { $group: { _id: null, total: { $sum: '$amountRupees' } } },
    ]),
    PlatformRevenue.aggregate([
      { $match: prevMatch },
      { $group: { _id: null, total: { $sum: '$amountRupees' } } },
    ]),
    PlatformRevenue.aggregate([
      { $match: revenueMatch },
      {
        $group: {
          _id: '$source',
          total: { $sum: '$amountRupees' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
    PlatformRevenue.aggregate([
      { $match: revenueMatch },
      {
        $group: {
          _id: mongoDayBucket('$occurredAt'),
          amount: { $sum: '$amountRupees' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const total = round2(totalAgg[0]?.total || 0);
  const prevTotal = round2(prevTotalAgg[0]?.total || 0);
  const bySource = sourceAgg.map((row) => ({
    source: row._id,
    label: SOURCE_LABELS[row._id] || row._id,
    amount: round2(row.total),
    /** Coupons are stored negative — expose absolute cost for UI cards. */
    displayAmount:
      row._id === PLATFORM_REVENUE_SOURCE.COUPON_DISCOUNT
        ? round2(Math.abs(row.total))
        : round2(row.total),
    count: row.count,
  }));
  const couponsAbsorbed = round2(
    Math.abs(
      sourceAgg.find((r) => r._id === PLATFORM_REVENUE_SOURCE.COUPON_DISCOUNT)
        ?.total || 0,
    ),
  );
  const commission = round2(
    sourceAgg.find((r) => r._id === PLATFORM_REVENUE_SOURCE.COMMISSION)?.total ||
      0,
  );
  const platformFee = round2(
    sourceAgg.find((r) => r._id === PLATFORM_REVENUE_SOURCE.PLATFORM_FEE)
      ?.total || 0,
  );

  return {
    filters: buildFiltersMeta(query, dateRange),
    summary: {
      totalRevenue: total,
      trend: percentChange(total, prevTotal),
      previousPeriodTotal: prevTotal,
      commission,
      platformFee,
      couponsAbsorbed,
    },
    breakdown: {
      bySource,
    },
    trends: {
      revenue: fillDailyTrend(
        trendRaw.map((r) => ({ _id: r._id, amount: round2(r.amount) })),
        'amount',
        dateRange,
      ),
    },
  };
}

export async function exportAdminRevenueReportsCsv(query = {}) {
  const dateRange = resolveDateRange(query);
  const revenueMatch = buildRevenueMatch(query, dateRange);

  const rows = await PlatformRevenue.find(revenueMatch)
    .select('source amountRupees occurredAt bookingNumber serviceType bookingId userId driverId')
    .sort({ occurredAt: -1 })
    .lean();

  const header = [
    'Date',
    'Source',
    'Amount (INR)',
    'Booking Number',
    'Service Type',
    'Booking ID',
    'User ID',
    'Driver ID',
  ].join(',');

  const lines = rows.map((row) =>
    [
      row.occurredAt ? new Date(row.occurredAt).toISOString() : '',
      SOURCE_LABELS[row.source] || row.source,
      round2(row.amountRupees),
      csvEscape(row.bookingNumber),
      csvEscape(row.serviceType),
      row.bookingId || '',
      row.userId || '',
      row.driverId || '',
    ].join(','),
  );

  return [header, ...lines].join('\n');
}
