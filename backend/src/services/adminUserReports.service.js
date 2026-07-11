import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import WalletTransaction, { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import Zone from '../models/zone.model.js';
import { USER_ROLES } from '../constants/roles.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SUBSCRIPTION_STATUS } from '../constants/serviceTypes.js';
import {
  round2,
  resolveDateRange,
  mongoDateRange,
  fillDailyTrend,
  bookingFareExpr,
  buildFiltersMeta,
} from '../utils/reportDateRange.js';

const USER_FILTER = { role: USER_ROLES.USER, isDeleted: false };
const BOOKING_FILTER = { isDeleted: false };

function buildBookingMatch(query, dateRange) {
  const match = { ...BOOKING_FILTER, ...mongoDateRange(dateRange) };
  if (query.serviceType) match.serviceType = query.serviceType;
  if (query.status) match.status = query.status;
  if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
    match.zoneIds = new mongoose.Types.ObjectId(query.zoneId);
  }
  return match;
}

export async function getAdminUserReportsService(query = {}) {
  const dateRange = resolveDateRange(query);
  const userDate = mongoDateRange(dateRange);
  const bookingMatch = buildBookingMatch(query, dateRange);

  const [
    newSignups,
    signupTrendRaw,
    activeUsersAgg,
    tripSpendingAgg,
    subSpendingAgg,
    zoneBreakdownRaw,
    topUsersRaw,
    walletTopupsAgg,
    walletPaymentsAgg,
  ] = await Promise.all([
    User.countDocuments({ ...USER_FILTER, ...userDate }),
    User.aggregate([
      { $match: { ...USER_FILTER, ...userDate } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...bookingMatch,
          status: BOOKING_STATUS.COMPLETED,
        },
      },
      { $group: { _id: '$userId' } },
      { $count: 'count' },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...bookingMatch,
          status: BOOKING_STATUS.COMPLETED,
        },
      },
      { $group: { _id: null, total: { $sum: bookingFareExpr() } } },
    ]),
    UserSubscription.aggregate([
      {
        $match: {
          status: { $ne: SUBSCRIPTION_STATUS.PENDING_PAYMENT },
          ...mongoDateRange(dateRange),
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } },
    ]),
    Booking.aggregate([
      { $match: bookingMatch },
      { $unwind: { path: '$zoneIds', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$zoneIds',
          bookings: { $sum: 1 },
          spending: {
            $sum: {
              $cond: [
                { $eq: ['$status', BOOKING_STATUS.COMPLETED] },
                bookingFareExpr(),
                0,
              ],
            },
          },
        },
      },
      { $sort: { spending: -1 } },
      { $limit: 20 },
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
          _id: '$userId',
          tripSpending: { $sum: bookingFareExpr() },
          trips: { $sum: 1 },
        },
      },
      { $sort: { tripSpending: -1 } },
      { $limit: 10 },
    ]),
    WalletTransaction.aggregate([
      {
        $match: {
          source: WALLET_TXN_SOURCE.TOPUP,
          ...mongoDateRange(dateRange),
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
    WalletTransaction.aggregate([
      {
        $match: {
          source: WALLET_TXN_SOURCE.BOOKING_PAYMENT,
          ...mongoDateRange(dateRange),
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

  const topUserIds = topUsersRaw.map((r) => r._id).filter(Boolean);
  const zoneIds = zoneBreakdownRaw.map((r) => r._id).filter(Boolean);

  const [users, zones, subSpendingByUser] = await Promise.all([
    topUserIds.length
      ? User.find({ _id: { $in: topUserIds } })
          .select('name phone_no email')
          .lean()
      : [],
    zoneIds.length
      ? Zone.find({ _id: { $in: zoneIds } }).select('name').lean()
      : [],
    topUserIds.length
      ? UserSubscription.aggregate([
          {
            $match: {
              userId: { $in: topUserIds },
              status: { $ne: SUBSCRIPTION_STATUS.PENDING_PAYMENT },
              ...mongoDateRange(dateRange),
            },
          },
          {
            $group: {
              _id: '$userId',
              subscriptionSpending: { $sum: { $ifNull: ['$amount', 0] } },
            },
          },
        ])
      : [],
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const zoneMap = new Map(zones.map((z) => [String(z._id), z]));
  const subMap = new Map(
    subSpendingByUser.map((r) => [String(r._id), round2(r.subscriptionSpending)]),
  );

  const tripSpending = round2(tripSpendingAgg[0]?.total || 0);
  const subscriptionSpending = round2(subSpendingAgg[0]?.total || 0);

  return {
    filters: buildFiltersMeta(query, dateRange),
    summary: {
      newSignups,
      activeUsers: activeUsersAgg[0]?.count || 0,
      totalSpending: round2(tripSpending + subscriptionSpending),
      tripSpending,
      subscriptionSpending,
      walletTopups: round2(walletTopupsAgg[0]?.total || 0),
      walletTopupCount: walletTopupsAgg[0]?.count || 0,
      walletBookingPayments: round2(walletPaymentsAgg[0]?.total || 0),
      walletPaymentCount: walletPaymentsAgg[0]?.count || 0,
    },
    trends: {
      signups: fillDailyTrend(signupTrendRaw, 'count', dateRange),
    },
    breakdown: {
      byZone: zoneBreakdownRaw.map((row) => ({
        zoneId: row._id,
        zoneName: zoneMap.get(String(row._id))?.name || 'Unknown',
        bookings: row.bookings,
        spending: round2(row.spending),
      })),
    },
    topUsers: topUsersRaw.map((row) => {
      const user = userMap.get(String(row._id));
      const subSpend = subMap.get(String(row._id)) || 0;
      return {
        userId: row._id,
        name: user?.name || 'Unknown',
        phone: user?.phone_no || '',
        email: user?.email || '',
        trips: row.trips,
        tripSpending: round2(row.tripSpending),
        subscriptionSpending: subSpend,
        totalSpending: round2(row.tripSpending + subSpend),
      };
    }),
  };
}
