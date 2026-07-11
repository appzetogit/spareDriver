import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import {
  round2,
  resolveDateRange,
  mongoDateRange,
  fillDailyTrend,
  bookingGstExpr,
  subscriptionGstExpr,
  buildFiltersMeta,
} from '../utils/reportDateRange.js';

const BOOKING_FILTER = { isDeleted: false };

const SUBSCRIPTION_PAID_MATCH = { paidAt: { $ne: null } };

function buildBookingMatch(query, dateRange) {
  const match = {
    ...BOOKING_FILTER,
    status: BOOKING_STATUS.COMPLETED,
    ...mongoDateRange(dateRange),
  };
  if (query.serviceType && query.serviceType !== 'subscription') {
    match.serviceType = query.serviceType;
  }
  return match;
}

function buildSubscriptionMatch(dateRange) {
  return {
    ...SUBSCRIPTION_PAID_MATCH,
    ...mongoDateRange(dateRange, 'paidAt'),
  };
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resolveSubscriptionGst(sub) {
  const stored = Number(sub.gstAmount) || 0;
  if (stored > 0) return round2(stored);
  const base = Number(sub.netBasePrice ?? sub.basePrice) || 0;
  const svc = Number(sub.serviceCharge) || 0;
  const amt = Number(sub.amount) || 0;
  return round2(Math.max(0, amt - base - svc));
}

function mapBookingLineItem(booking) {
  const gst = round2(
    booking.fareSnapshot?.gst || booking.fareSnapshot?.breakdown?.gst || 0,
  );
  const serviceCharge = round2(
    booking.fareSnapshot?.serviceCharge ||
      booking.fareSnapshot?.breakdown?.serviceCharge ||
      0,
  );
  const base = round2(
    booking.fareSnapshot?.baseFare || booking.fareSnapshot?.breakdown?.subtotal || 0,
  );
  const gstPercent = booking.fareSnapshot?.breakdown?.gstPercent ?? 18;
  return {
    type: 'booking',
    ref: booking.bookingNumber,
    date: booking.createdAt,
    serviceType: booking.serviceType,
    base,
    serviceCharge,
    gstAmount: gst,
    gstPercent,
    total: round2(booking.fareSnapshot?.total || 0),
  };
}

function mapSubscriptionLineItem(sub) {
  return {
    type: 'subscription',
    ref: String(sub._id),
    date: sub.paidAt || sub.createdAt,
    serviceType: 'subscription',
    planName: sub.planNameSnapshot || '',
    base: round2(sub.netBasePrice || sub.basePrice || 0),
    serviceCharge: round2(sub.serviceCharge || 0),
    gstAmount: resolveSubscriptionGst(sub),
    gstPercent: sub.gstPercent || 18,
    total: round2(sub.amount || 0),
  };
}

function mergeTrendRows(bookingRows, subscriptionRows) {
  const map = new Map();
  bookingRows.forEach((row) => {
    map.set(row._id, (map.get(row._id) || 0) + (Number(row.amount) || 0));
  });
  subscriptionRows.forEach((row) => {
    map.set(row._id, (map.get(row._id) || 0) + (Number(row.amount) || 0));
  });
  return Array.from(map.entries())
    .map(([_id, amount]) => ({ _id, amount: round2(amount) }))
    .sort((a, b) => a._id.localeCompare(b._id));
}

export async function getAdminGstReportService(query = {}) {
  const dateRange = resolveDateRange(query);
  const bookingMatch = buildBookingMatch(query, dateRange);
  const subscriptionMatch = buildSubscriptionMatch(dateRange);
  const includeBookings = query.serviceType !== 'subscription';
  const includeSubscriptions = !query.serviceType || query.serviceType === 'subscription';

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(50, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [
    bookingGstAgg,
    subscriptionGstAgg,
    serviceTypeAgg,
    monthlyBookingAgg,
    bookingTrendRaw,
    subscriptionTrendRaw,
    bookingLineCount,
    bookingLines,
    subscriptionLines,
  ] = await Promise.all([
    includeBookings
      ? Booking.aggregate([
          { $match: bookingMatch },
          { $group: { _id: null, total: { $sum: bookingGstExpr() } } },
        ])
      : Promise.resolve([]),
    includeSubscriptions
      ? UserSubscription.aggregate([
          { $match: subscriptionMatch },
          { $group: { _id: null, total: { $sum: subscriptionGstExpr() } } },
        ])
      : Promise.resolve([]),
    includeBookings
      ? Booking.aggregate([
          { $match: bookingMatch },
          {
            $group: {
              _id: '$serviceType',
              gst: { $sum: bookingGstExpr() },
              count: { $sum: 1 },
            },
          },
          { $sort: { gst: -1 } },
        ])
      : Promise.resolve([]),
    includeBookings
      ? Booking.aggregate([
          { $match: bookingMatch },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              bookingGst: { $sum: bookingGstExpr() },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
      : Promise.resolve([]),
    includeBookings
      ? Booking.aggregate([
          { $match: bookingMatch },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              amount: { $sum: bookingGstExpr() },
            },
          },
          { $sort: { _id: 1 } },
        ])
      : Promise.resolve([]),
    includeSubscriptions
      ? UserSubscription.aggregate([
          { $match: subscriptionMatch },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } },
              amount: { $sum: subscriptionGstExpr() },
            },
          },
          { $sort: { _id: 1 } },
        ])
      : Promise.resolve([]),
    includeBookings ? Booking.countDocuments(bookingMatch) : Promise.resolve(0),
    includeBookings
      ? Booking.find(bookingMatch)
          .select(
            'bookingNumber serviceType createdAt fareSnapshot.gst fareSnapshot.serviceCharge fareSnapshot.baseFare fareSnapshot.total fareSnapshot.breakdown',
          )
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    includeSubscriptions
      ? UserSubscription.find(subscriptionMatch)
          .select(
            '_id paidAt createdAt amount basePrice netBasePrice serviceCharge gstAmount gstPercent planNameSnapshot',
          )
          .sort({ paidAt: -1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const bookingGst = round2(bookingGstAgg[0]?.total || 0);
  const subscriptionGst = round2(subscriptionGstAgg[0]?.total || 0);
  const subscriptionLineCount = subscriptionLines.filter(
    (sub) => resolveSubscriptionGst(sub) > 0,
  ).length;

  const subscriptionMonthly = includeSubscriptions
    ? await UserSubscription.aggregate([
        { $match: subscriptionMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
            subscriptionGst: { $sum: subscriptionGstExpr() },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
    : [];

  const monthMap = new Map();
  monthlyBookingAgg.forEach((row) => {
    monthMap.set(row._id, {
      month: row._id,
      bookingGst: round2(row.bookingGst),
      subscriptionGst: 0,
      totalGst: round2(row.bookingGst),
      bookingCount: row.count,
      subscriptionCount: 0,
    });
  });
  subscriptionMonthly.forEach((row) => {
    const existing = monthMap.get(row._id) || {
      month: row._id,
      bookingGst: 0,
      subscriptionGst: 0,
      totalGst: 0,
      bookingCount: 0,
      subscriptionCount: 0,
    };
    existing.subscriptionGst = round2(row.subscriptionGst);
    existing.subscriptionCount = row.count;
    existing.totalGst = round2(existing.bookingGst + existing.subscriptionGst);
    monthMap.set(row._id, existing);
  });

  const mergedLineItems = [
    ...bookingLines.map(mapBookingLineItem),
    ...subscriptionLines.map(mapSubscriptionLineItem),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalLineItems = mergedLineItems.length;
  const pagedLineItems = mergedLineItems.slice(skip, skip + limit);

  const byServiceType = [
    ...serviceTypeAgg.map((row) => ({
      serviceType: row._id || 'unknown',
      gst: round2(row.gst),
      count: row.count,
    })),
  ];
  if (includeSubscriptions && subscriptionGst > 0) {
    byServiceType.push({
      serviceType: 'subscription',
      gst: subscriptionGst,
      count: subscriptionLineCount,
    });
  }

  const combinedTrend = mergeTrendRows(bookingTrendRaw, subscriptionTrendRaw);

  return {
    filters: buildFiltersMeta(query, dateRange),
    summary: {
      totalGst: round2(bookingGst + subscriptionGst),
      bookingGst,
      subscriptionGst,
      defaultGstPercent: 18,
      lineItemCounts: {
        bookings: bookingLineCount,
        subscriptions: subscriptionLineCount,
      },
    },
    breakdown: {
      byServiceType,
      byMonth: Array.from(monthMap.values()).sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    },
    trends: {
      gst: fillDailyTrend(combinedTrend, 'amount', dateRange),
      bookingGst: fillDailyTrend(
        bookingTrendRaw.map((r) => ({ _id: r._id, amount: round2(r.amount) })),
        'amount',
        dateRange,
      ),
      subscriptionGst: fillDailyTrend(
        subscriptionTrendRaw.map((r) => ({ _id: r._id, amount: round2(r.amount) })),
        'amount',
        dateRange,
      ),
    },
    lineItems: {
      items: pagedLineItems,
      pagination: {
        page,
        limit,
        total: totalLineItems,
        pages: Math.ceil(totalLineItems / limit) || 1,
      },
    },
  };
}

export async function exportAdminGstReportCsv(query = {}) {
  const dateRange = resolveDateRange(query);
  const bookingMatch = buildBookingMatch(query, dateRange);
  const subscriptionMatch = buildSubscriptionMatch(dateRange);
  const includeBookings = query.serviceType !== 'subscription';
  const includeSubscriptions = !query.serviceType || query.serviceType === 'subscription';

  const [bookings, subscriptions] = await Promise.all([
    includeBookings
      ? Booking.find(bookingMatch)
          .select(
            'bookingNumber serviceType createdAt fareSnapshot.gst fareSnapshot.serviceCharge fareSnapshot.baseFare fareSnapshot.total fareSnapshot.breakdown',
          )
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    includeSubscriptions
      ? UserSubscription.find(subscriptionMatch)
          .select(
            '_id paidAt createdAt amount basePrice netBasePrice serviceCharge gstAmount gstPercent planNameSnapshot',
          )
          .sort({ paidAt: -1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const header = [
    'Date',
    'Type',
    'Reference',
    'Service Type',
    'Base (INR)',
    'Service Charge (INR)',
    'GST %',
    'GST Amount (INR)',
    'Total (INR)',
  ].join(',');

  const bookingCsvLines = bookings.map((booking) => {
    const item = mapBookingLineItem(booking);
    return [
      item.date ? new Date(item.date).toISOString().slice(0, 10) : '',
      'booking',
      csvEscape(item.ref),
      csvEscape(item.serviceType),
      item.base,
      item.serviceCharge,
      item.gstPercent,
      item.gstAmount,
      item.total,
    ].join(',');
  });

  const subscriptionCsvLines = subscriptions
    .map(mapSubscriptionLineItem)
    .filter((item) => item.gstAmount > 0)
    .map((item) =>
      [
        item.date ? new Date(item.date).toISOString().slice(0, 10) : '',
        'subscription',
        csvEscape(item.ref),
        csvEscape(item.planName || 'subscription'),
        item.base,
        item.serviceCharge,
        item.gstPercent,
        item.gstAmount,
        item.total,
      ].join(','),
    );

  return [header, ...bookingCsvLines, ...subscriptionCsvLines].join('\n');
}
