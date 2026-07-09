import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Car from '../models/user/car.model.js';
import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import WalletTransaction from '../models/walletTransaction.model.js';
import SupportTicket from '../models/supportTicket.model.js';
import SosAlert from '../models/sosAlert.model.js';
import Refund from '../models/refund.model.js';
import { ApiError } from '../utils/apiError.js';
import { USER_ROLES } from '../constants/roles.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SUBSCRIPTION_STATUS } from '../constants/serviceTypes.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

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

function bookingFareExpr() {
  return {
    $cond: [
      { $gt: [{ $ifNull: ['$payment.amountPaidRupees', 0] }, 0] },
      '$payment.amountPaidRupees',
      { $ifNull: ['$fareSnapshot.total', 0] },
    ],
  };
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

async function assertCustomerUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, 'Invalid user id');
  }
  const user = await User.findOne({
    _id: userId,
    role: USER_ROLES.USER,
    isDeleted: false,
  })
    .select(
      'name phone_no email profilePicture isActive isPhoneVerified isEmailVerified createdAt wallet savedLocations',
    )
    .lean();
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

export async function listAdminUserWalletTransactionsService(userId, query = {}) {
  const user = await assertCustomerUser(userId);
  const { page = 1, limit = 10, direction, source, from, to, search } = query;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = { userId: new mongoose.Types.ObjectId(userId) };
  if (direction) filter.direction = direction;
  if (source) filter.source = source;

  const createdRange = buildDateRangeFilter(from, to);
  if (createdRange) filter.createdAt = createdRange;

  if (search) {
    const q = String(search).trim();
    filter.$or = [
      { description: { $regex: q, $options: 'i' } },
      { refId: { $regex: q, $options: 'i' } },
      { 'razorpay.orderId': { $regex: q, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    WalletTransaction.countDocuments(filter),
  ]);

  return {
    user,
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

/**
 * Aggregated analytics for a single customer — trips, subscriptions,
 * wallet activity, and support signals. All metrics respect the
 * requested date / service / status filters.
 */
export async function getAdminUserAnalyticsService(userId, query = {}) {
  const user = await assertCustomerUser(userId);
  const { serviceType, status, subscriptionStatus } = query;
  const dateRange = resolveDateRange(query);
  const createdAtFilter = mongoDateRange(dateRange);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const bookingMatch = { userId: userObjectId, isDeleted: false };
  if (serviceType) bookingMatch.serviceType = serviceType;
  if (status) bookingMatch.status = status;
  if (createdAtFilter) bookingMatch.createdAt = createdAtFilter;

  const subscriptionMatch = { userId: userObjectId };
  if (subscriptionStatus) subscriptionMatch.status = subscriptionStatus;
  if (createdAtFilter) subscriptionMatch.createdAt = createdAtFilter;

  const walletMatch = { userId: userObjectId };
  if (createdAtFilter) walletMatch.createdAt = createdAtFilter;

  const [
    carsCount,
    activeCarsCount,
    bookingStatusAgg,
    serviceTypeAgg,
    spendingAgg,
    subscriptionStatusAgg,
    subscriptionSpendingAgg,
    tripTrendRaw,
    spendTrendRaw,
    walletSummary,
    supportCount,
    sosCount,
    refundCount,
  ] = await Promise.all([
    Car.countDocuments({ userId }),
    Car.countDocuments({ userId, isActive: true }),
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
          spending: { $sum: bookingFareExpr() },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...bookingMatch,
          status: BOOKING_STATUS.COMPLETED,
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: bookingFareExpr() },
        },
      },
    ]),
    UserSubscription.aggregate([
      { $match: subscriptionMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    UserSubscription.aggregate([
      {
        $match: {
          ...subscriptionMatch,
          status: { $ne: SUBSCRIPTION_STATUS.PENDING_PAYMENT },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$amount', 0] } } } },
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
    Booking.aggregate([
      { $match: { ...bookingMatch, status: BOOKING_STATUS.COMPLETED } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: bookingFareExpr() },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    WalletTransaction.aggregate([
      { $match: walletMatch },
      {
        $group: {
          _id: '$direction',
          total: { $sum: { $ifNull: ['$amountRupees', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
    SupportTicket.countDocuments({
      userId: userObjectId,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    }),
    SosAlert.countDocuments({
      userId: userObjectId,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    }),
    Refund.countDocuments({
      userId: userObjectId,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    }),
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
    searching: tripStatusCounts[BOOKING_STATUS.SEARCHING] || 0,
  };

  const subStatusCounts = subscriptionStatusAgg.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const subscriptions = {
    total: Object.values(subStatusCounts).reduce((a, b) => a + b, 0),
    active: subStatusCounts[SUBSCRIPTION_STATUS.ACTIVE] || 0,
    pendingPayment: subStatusCounts[SUBSCRIPTION_STATUS.PENDING_PAYMENT] || 0,
    expired: subStatusCounts[SUBSCRIPTION_STATUS.EXPIRED] || 0,
    cancelled: subStatusCounts[SUBSCRIPTION_STATUS.CANCELLED] || 0,
  };

  const tripSpending = round2(spendingAgg[0]?.total || 0);
  const subscriptionSpending = round2(subscriptionSpendingAgg[0]?.total || 0);

  const walletActivity = walletSummary.reduce(
    (acc, row) => {
      if (row._id === 'credit') {
        acc.credits = round2(row.total);
        acc.creditCount = row.count;
      } else if (row._id === 'debit') {
        acc.debits = round2(row.total);
        acc.debitCount = row.count;
      }
      return acc;
    },
    { credits: 0, debits: 0, creditCount: 0, debitCount: 0 },
  );

  return {
    user,
    profile: {
      carsCount,
      activeCarsCount,
      savedLocationsCount: user.savedLocations?.length || 0,
      joinedAt: user.createdAt,
      wallet: {
        balance: round2(user.wallet?.balance || 0),
        totalCredited: round2(user.wallet?.totalCredited || 0),
        totalSpent: round2(user.wallet?.totalSpent || 0),
        heldRupees: round2(user.wallet?.heldRupees || 0),
      },
    },
    filters: {
      period: query.period || (query.from || query.to ? 'custom' : '30d'),
      from: dateRange.from?.toISOString() || null,
      to: dateRange.to?.toISOString() || null,
      serviceType: serviceType || null,
      status: status || null,
      subscriptionStatus: subscriptionStatus || null,
    },
    summary: {
      trips,
      subscriptions,
      spending: {
        trips: tripSpending,
        subscriptions: subscriptionSpending,
        total: round2(tripSpending + subscriptionSpending),
      },
      walletActivity,
      support: {
        tickets: supportCount,
        sosAlerts: sosCount,
        refunds: refundCount,
      },
    },
    breakdown: {
      byServiceType: serviceTypeAgg.map((row) => ({
        serviceType: row._id || 'unknown',
        count: row.count,
        spending: round2(row.spending),
      })),
      byTripStatus: bookingStatusAgg.map((row) => ({
        status: row._id,
        count: row.count,
      })),
      bySubscriptionStatus: subscriptionStatusAgg.map((row) => ({
        status: row._id,
        count: row.count,
      })),
    },
    trends: {
      trips: fillDailyTrend(tripTrendRaw, 'count', dateRange),
      spending: fillDailyTrend(
        spendTrendRaw.map((p) => ({ _id: p._id, amount: p.amount })),
        'amount',
        dateRange,
      ),
    },
  };
}
