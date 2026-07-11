import mongoose from 'mongoose';
import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import Payment from '../models/payment.model.js';
import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { WITHDRAWAL_STATUS } from '../constants/withdrawal.js';
import {
  round2,
  resolveDateRange,
  mongoDateRange,
  fillDailyTrend,
  bookingFareExpr,
  buildFiltersMeta,
} from '../utils/reportDateRange.js';

const DRIVER_FILTER = { isDeleted: false };
const BOOKING_FILTER = { isDeleted: false };

const TRIP_PAYMENT_PURPOSES = [
  PAYMENT_PURPOSE.TRIP_FARE,
  PAYMENT_PURPOSE.TRIP_ALLOWANCE,
  PAYMENT_PURPOSE.TRIP_WAITING,
];

function buildBookingMatch(query, dateRange) {
  const match = { ...BOOKING_FILTER, ...mongoDateRange(dateRange) };
  if (query.serviceType) match.serviceType = query.serviceType;
  if (query.status) match.status = query.status;
  if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
    match.zoneIds = new mongoose.Types.ObjectId(query.zoneId);
  }
  return match;
}

export async function getAdminDriverReportsService(query = {}) {
  const dateRange = resolveDateRange(query);
  const driverDate = mongoDateRange(dateRange);
  const bookingMatch = buildBookingMatch(query, dateRange);

  const [
    newSignups,
    signupTrendRaw,
    approvalFunnelAgg,
    onlineDrivers,
    earningsAgg,
    serviceTypeAgg,
    topDriversRaw,
    withdrawalsAgg,
  ] = await Promise.all([
    Driver.countDocuments({ ...DRIVER_FILTER, ...driverDate }),
    Driver.aggregate([
      { $match: { ...DRIVER_FILTER, ...driverDate } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Driver.aggregate([
      { $match: DRIVER_FILTER },
      { $group: { _id: '$approvalStatus', count: { $sum: 1 } } },
    ]),
    Driver.countDocuments({
      ...DRIVER_FILTER,
      approvalStatus: 'approved',
      isOnline: true,
    }),
    Payment.aggregate([
      {
        $match: {
          purpose: { $in: TRIP_PAYMENT_PURPOSES },
          status: 'captured',
          ...mongoDateRange(dateRange),
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...bookingMatch,
          status: BOOKING_STATUS.COMPLETED,
          driverId: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$serviceType',
          trips: { $sum: 1 },
          earnings: { $sum: bookingFareExpr() },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...bookingMatch,
          status: BOOKING_STATUS.COMPLETED,
          driverId: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$driverId',
          trips: { $sum: 1 },
          earnings: { $sum: bookingFareExpr() },
        },
      },
      { $sort: { earnings: -1 } },
      { $limit: 10 },
    ]),
    WithdrawalRequest.aggregate([
      { $match: mongoDateRange(dateRange) || {} },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amountRupees' } } },
    ]),
  ]);

  const funnel = approvalFunnelAgg.reduce(
    (acc, row) => {
      acc[row._id] = row.count;
      return acc;
    },
    {},
  );

  const topDriverIds = topDriversRaw.map((r) => r._id).filter(Boolean);
  const drivers = topDriverIds.length
    ? await Driver.find({ _id: { $in: topDriverIds } })
        .select('name phone approvalStatus isOnline')
        .lean()
    : [];

  const driverMap = new Map(drivers.map((d) => [String(d._id), d]));

  const withdrawalSummary = withdrawalsAgg.reduce(
    (acc, row) => {
      acc[row._id] = {
        count: row.count,
        total: round2(row.total),
      };
      return acc;
    },
    {},
  );

  return {
    filters: buildFiltersMeta(query, dateRange),
    summary: {
      newSignups,
      onlineDrivers,
      totalEarningsPaid: round2(earningsAgg[0]?.total || 0),
      approvalFunnel: {
        pending: funnel.pending || 0,
        under_review: funnel.under_review || 0,
        approved: funnel.approved || 0,
        rejected: funnel.rejected || 0,
        suspended: funnel.suspended || 0,
      },
      withdrawals: {
        pending: withdrawalSummary[WITHDRAWAL_STATUS.PENDING] || { count: 0, total: 0 },
        processed: withdrawalSummary[WITHDRAWAL_STATUS.PROCESSED] || { count: 0, total: 0 },
        rejected: withdrawalSummary[WITHDRAWAL_STATUS.REJECTED] || { count: 0, total: 0 },
      },
    },
    trends: {
      signups: fillDailyTrend(signupTrendRaw, 'count', dateRange),
    },
    breakdown: {
      byServiceType: serviceTypeAgg.map((row) => ({
        serviceType: row._id || 'unknown',
        trips: row.trips,
        earnings: round2(row.earnings),
      })),
    },
    topDrivers: topDriversRaw.map((row) => {
      const driver = driverMap.get(String(row._id));
      return {
        driverId: row._id,
        name: driver?.name || 'Unknown',
        phone: driver?.phone || '',
        approvalStatus: driver?.approvalStatus || '',
        isOnline: Boolean(driver?.isOnline),
        trips: row.trips,
        earnings: round2(row.earnings),
      };
    }),
  };
}
