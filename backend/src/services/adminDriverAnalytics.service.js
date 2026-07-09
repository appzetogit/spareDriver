import mongoose from 'mongoose';
import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import Payment from '../models/payment.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import PlatformRevenue, {
  PLATFORM_REVENUE_SOURCE,
} from '../models/platformRevenue.model.js';
import { ApiError } from '../utils/apiError.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SUBSCRIPTION_STATUS } from '../constants/serviceTypes.js';
import { PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { listDriverEarningsLedgerService } from './driverTrips.service.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const TRIP_PAYMENT_PURPOSES = [
  PAYMENT_PURPOSE.TRIP_FARE,
  PAYMENT_PURPOSE.TRIP_ALLOWANCE,
  PAYMENT_PURPOSE.TRIP_WAITING,
];

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

function resolveDateRange(query = {}) {
  const { period, from, to } = query;
  const now = new Date();

  if (from || to) {
    const range = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) range.from = startOfDay(fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) range.to = endOfDay(toDate);
    }
    if (range.from || range.to) {
      if (!range.to) range.to = endOfDay(now);
      if (!range.from) range.from = new Date(0);
      return range;
    }
  }

  switch (period) {
    case '7d':
      return { from: addDays(startOfDay(now), -6), to: endOfDay(now) };
    case '90d':
      return { from: addDays(startOfDay(now), -89), to: endOfDay(now) };
    case '365d':
      return { from: addDays(startOfDay(now), -364), to: endOfDay(now) };
    case 'all':
      return { from: null, to: null };
    case '30d':
    default:
      return { from: addDays(startOfDay(now), -29), to: endOfDay(now) };
  }
}

function mongoDateRange(range) {
  if (!range?.from && !range?.to) return null;
  const filter = {};
  if (range.from) filter.$gte = range.from;
  if (range.to) filter.$lte = range.to;
  return filter;
}

function buildDateRangeFilter(from, to) {
  if (!from && !to) return null;
  const range = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    range.$gte = startOfDay(fromDate);
  }
  if (toDate && !Number.isNaN(toDate.getTime())) {
    range.$lte = endOfDay(toDate);
  }
  return Object.keys(range).length ? range : null;
}

function fillDailyTrend(rawPoints, valueKey, range) {
  const map = new Map(
    rawPoints.map((p) => [p._id || p.date, Number(p[valueKey]) || 0]),
  );

  const end = range?.to ? startOfDay(range.to) : startOfDay();
  const start = range?.from ? startOfDay(range.from) : addDays(end, -29);

  const points = [];
  let cursor = new Date(start);
  const last = new Date(end);

  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    points.push({ date: key, [valueKey]: map.get(key) ?? 0 });
    cursor = addDays(cursor, 1);
  }

  if (points.length > 90) {
    return points.slice(points.length - 90);
  }
  return points;
}

async function assertDriver(driverId) {
  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    throw new ApiError(400, 'Invalid driver id');
  }
  const driver = await Driver.findOne({ _id: driverId, isDeleted: false })
    .select(
      'name phone email approvalStatus isOnline isOnTrip experienceYears rating ratingCount wallet createdAt cancellationStats approvedAt',
    )
    .lean();
  if (!driver) throw new ApiError(404, 'Driver not found');
  return driver;
}

async function aggregatePeriodEarnings(driverId, gte, lte) {
  const driverOid = new mongoose.Types.ObjectId(String(driverId));
  const dateFilter = gte && lte ? { $gte: gte, $lte: lte } : null;

  const [trips, cancels, subscriptions, penalties] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          driverId: driverOid,
          purpose: { $in: TRIP_PAYMENT_PURPOSES },
          status: 'captured',
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          bookings: { $addToSet: '$referenceId' },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          driverId: driverOid,
          status: BOOKING_STATUS.CANCELLED,
          isDeleted: false,
          'cancellation.driverShare': { $gt: 0 },
          ...(dateFilter
            ? { 'timeline.cancelledAt': dateFilter }
            : {}),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$cancellation.driverShare', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    UserSubscription.aggregate([
      { $unwind: '$driverPayouts' },
      {
        $match: {
          'driverPayouts.driverId': driverOid,
          ...(dateFilter ? { 'driverPayouts.paidAt': dateFilter } : {}),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$driverPayouts.amountRupees' },
          count: { $sum: 1 },
        },
      },
    ]),
    PlatformRevenue.aggregate([
      {
        $match: {
          driverId: driverOid,
          source: PLATFORM_REVENUE_SOURCE.DRIVER_PENALTY,
          ...(dateFilter ? { occurredAt: dateFilter } : {}),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$amountRupees', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const tripAgg = trips?.[0] || { total: 0, bookings: [] };
  const cancelAgg = cancels?.[0] || { total: 0, count: 0 };
  const subAgg = subscriptions?.[0] || { total: 0, count: 0 };
  const penaltyAgg = penalties?.[0] || { total: 0, count: 0 };

  const tripEarnings = round2(tripAgg.total || 0);
  const cancellationEarnings = round2(cancelAgg.total || 0);
  const subscriptionEarnings = round2(subAgg.total || 0);
  const penaltyDeductions = round2(penaltyAgg.total || 0);

  return {
    trips: tripAgg.bookings?.length || 0,
    tripEarnings,
    cancellationEarnings,
    cancellationCount: cancelAgg.count || 0,
    subscriptionEarnings,
    subscriptionPayouts: subAgg.count || 0,
    penaltyDeductions,
    penaltyCount: penaltyAgg.count || 0,
    net: round2(
      tripEarnings + cancellationEarnings + subscriptionEarnings - penaltyDeductions,
    ),
  };
}

/**
 * Aggregated analytics for a single driver — trips, earnings, wallet,
 * withdrawals, and cancellation signals. Metrics respect date / status filters.
 */
export async function getAdminDriverAnalyticsService(driverId, query = {}) {
  const driver = await assertDriver(driverId);
  const { serviceType, status } = query;
  const dateRange = resolveDateRange(query);
  const createdAtFilter = mongoDateRange(dateRange);
  const driverObjectId = new mongoose.Types.ObjectId(driverId);

  const bookingMatch = { driverId: driverObjectId, isDeleted: false };
  if (serviceType) bookingMatch.serviceType = serviceType;
  if (status) bookingMatch.status = status;
  if (createdAtFilter) bookingMatch.createdAt = createdAtFilter;

  const withdrawalMatch = { driverId: driverObjectId };
  if (createdAtFilter) withdrawalMatch.createdAt = createdAtFilter;

  const earningsWindow =
    dateRange.from && dateRange.to
      ? { gte: dateRange.from, lte: dateRange.to }
      : { gte: null, lte: null };

  const [
    bookingStatusAgg,
    serviceTypeAgg,
    tripTrendRaw,
    earningsTrendRaw,
    withdrawalAgg,
    activeSubscriptions,
    periodEarnings,
  ] = await Promise.all([
    Booking.aggregate([
      { $match: bookingMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: '$serviceType',
          count: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      {
        $match: {
          driverId: driverObjectId,
          purpose: { $in: TRIP_PAYMENT_PURPOSES },
          status: 'captured',
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WithdrawalRequest.aggregate([
      { $match: withdrawalMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ['$amountRupees', 0] } },
        },
      },
    ]),
    UserSubscription.countDocuments({
      assignedDriverId: driverObjectId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
    }),
    aggregatePeriodEarnings(
      driverId,
      earningsWindow.gte,
      earningsWindow.lte,
    ),
  ]);

  const tripStatusCounts = bookingStatusAgg.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const trips = {
    total: Object.values(tripStatusCounts).reduce((a, b) => a + b, 0),
    completed: tripStatusCounts[BOOKING_STATUS.COMPLETED] || 0,
    cancelled: tripStatusCounts[BOOKING_STATUS.CANCELLED] || 0,
    active:
      (tripStatusCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) +
      (tripStatusCounts[BOOKING_STATUS.EN_ROUTE] || 0) +
      (tripStatusCounts[BOOKING_STATUS.ARRIVED] || 0) +
      (tripStatusCounts[BOOKING_STATUS.STARTED] || 0) +
      (tripStatusCounts[BOOKING_STATUS.PENDING_ASSIGNMENT] || 0),
  };

  const withdrawals = withdrawalAgg.reduce(
    (acc, row) => {
      const key = String(row._id || '').toLowerCase();
      acc[key] = { count: row.count, total: round2(row.total) };
      return acc;
    },
    {},
  );

  const withdrawalSummary = {
    pending: withdrawals.pending || { count: 0, total: 0 },
    processed: withdrawals.processed || { count: 0, total: 0 },
    rejected: withdrawals.rejected || { count: 0, total: 0 },
    total: withdrawalAgg.reduce((sum, row) => sum + row.count, 0),
  };

  return {
    driver,
    profile: {
      joinedAt: driver.createdAt,
      approvedAt: driver.approvedAt || null,
      experienceYears: driver.experienceYears ?? 0,
      rating: {
        value: Number(driver.rating || 0),
        count: Number(driver.ratingCount || 0),
      },
      online: {
        isOnline: Boolean(driver.isOnline),
        isOnTrip: Boolean(driver.isOnTrip),
      },
      wallet: {
        balance: round2(driver.wallet?.balance || 0),
        totalEarnings: round2(driver.wallet?.totalEarnings || 0),
        totalWithdrawn: round2(driver.wallet?.totalWithdrawn || 0),
      },
      cancellationStats: driver.cancellationStats || {},
      activeSubscriptions,
    },
    filters: {
      period: query.period || (query.from || query.to ? 'custom' : '30d'),
      from: dateRange.from?.toISOString() || null,
      to: dateRange.to?.toISOString() || null,
      serviceType: serviceType || null,
      status: status || null,
    },
    summary: {
      trips,
      earnings: periodEarnings,
      withdrawals: withdrawalSummary,
    },
    breakdown: {
      byServiceType: serviceTypeAgg.map((row) => ({
        serviceType: row._id || 'unknown',
        count: row.count,
      })),
      byTripStatus: bookingStatusAgg.map((row) => ({
        status: row._id,
        count: row.count,
      })),
    },
    trends: {
      trips: fillDailyTrend(tripTrendRaw, 'count', dateRange),
      earnings: fillDailyTrend(
        earningsTrendRaw.map((p) => ({ _id: p._id, amount: p.amount })),
        'amount',
        dateRange,
      ),
    },
  };
}

export async function listAdminDriverTripsService(driverId, query = {}) {
  const driver = await assertDriver(driverId);
  const { page = 1, limit = 15, search, status, serviceType, from, to } = query;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 15));
  const skip = (safePage - 1) * safeLimit;

  const filter = { driverId, isDeleted: false };
  if (status) filter.status = status;
  if (serviceType) filter.serviceType = serviceType;

  const createdRange = buildDateRangeFilter(from, to);
  if (createdRange) filter.createdAt = createdRange;

  if (search) {
    const q = String(search).trim();
    if (/^[0-9a-fA-F]{24}$/.test(q)) {
      filter._id = q;
    } else {
      filter.bookingNumber = { $regex: q, $options: 'i' };
    }
  }

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .populate('userId', 'name phone_no phone profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    driver,
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function listAdminDriverWithdrawalsService(driverId, query = {}) {
  const driver = await assertDriver(driverId);
  const { page = 1, limit = 10, status, from, to } = query;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = { driverId: new mongoose.Types.ObjectId(driverId) };
  if (status) filter.status = status;

  const createdRange = buildDateRangeFilter(from, to);
  if (createdRange) filter.createdAt = createdRange;

  const [items, total] = await Promise.all([
    WithdrawalRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    WithdrawalRequest.countDocuments(filter),
  ]);

  return {
    driver,
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function listAdminDriverEarningsService(driverId, query = {}) {
  await assertDriver(driverId);
  const { page = 1, limit = 10 } = query;
  const result = await listDriverEarningsLedgerService(driverId, { page, limit });
  return {
    items: result.rows || [],
    totals: result.totals || {},
    total: result.total || 0,
    page: result.page || 1,
    limit: result.limit || 10,
    pages: result.pages || 1,
  };
}
