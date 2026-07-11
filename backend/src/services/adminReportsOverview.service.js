import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import PlatformRevenue, { PLATFORM_REVENUE_SOURCE } from '../models/platformRevenue.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import { USER_ROLES } from '../constants/roles.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import {
  round2,
  resolveDateRange,
  resolvePreviousRange,
  mongoDateRange,
  percentChange,
  fillDailyTrend,
  bookingFareExpr,
  bookingGstExpr,
  subscriptionGstExpr,
  buildFiltersMeta,
} from '../utils/reportDateRange.js';

const USER_FILTER = { role: USER_ROLES.USER, isDeleted: false };
const DRIVER_FILTER = { isDeleted: false };
const BOOKING_FILTER = { isDeleted: false };

function dateMatch(range, field = 'createdAt') {
  const m = mongoDateRange(range, field);
  return m || {};
}

export async function getAdminReportsOverviewService(query = {}) {
  const dateRange = resolveDateRange(query);
  const prevRange = resolvePreviousRange(dateRange);
  const bookingDate = dateMatch(dateRange);
  const prevBookingDate = dateMatch(prevRange);
  const revenueDate = dateMatch(dateRange, 'occurredAt');
  const prevRevenueDate = dateMatch(prevRange, 'occurredAt');

  const [
    usersInPeriod,
    usersPrevPeriod,
    driversInPeriod,
    driversPrevPeriod,
    bookingsInPeriod,
    bookingsPrevPeriod,
    tripRevenueAgg,
    tripRevenuePrevAgg,
    commissionAgg,
    commissionPrevAgg,
    gstBookingsAgg,
    gstBookingsPrevAgg,
    gstSubsAgg,
    gstSubsPrevAgg,
    bookingTrendRaw,
    revenueTrendRaw,
    gstTrendRaw,
  ] = await Promise.all([
    User.countDocuments({ ...USER_FILTER, ...dateMatch(dateRange) }),
    User.countDocuments({ ...USER_FILTER, ...prevBookingDate }),
    Driver.countDocuments({ ...DRIVER_FILTER, ...dateMatch(dateRange) }),
    Driver.countDocuments({ ...DRIVER_FILTER, ...prevBookingDate }),
    Booking.countDocuments({ ...BOOKING_FILTER, ...bookingDate }),
    Booking.countDocuments({ ...BOOKING_FILTER, ...prevBookingDate }),
    Booking.aggregate([
      {
        $match: {
          ...BOOKING_FILTER,
          status: BOOKING_STATUS.COMPLETED,
          ...bookingDate,
        },
      },
      { $group: { _id: null, total: { $sum: bookingFareExpr() } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...BOOKING_FILTER,
          status: BOOKING_STATUS.COMPLETED,
          ...prevBookingDate,
        },
      },
      { $group: { _id: null, total: { $sum: bookingFareExpr() } } },
    ]),
    PlatformRevenue.aggregate([
      { $match: { ...revenueDate } },
      { $group: { _id: null, total: { $sum: '$amountRupees' } } },
    ]),
    PlatformRevenue.aggregate([
      { $match: { ...prevRevenueDate } },
      { $group: { _id: null, total: { $sum: '$amountRupees' } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...BOOKING_FILTER,
          status: BOOKING_STATUS.COMPLETED,
          ...bookingDate,
        },
      },
      { $group: { _id: null, total: { $sum: bookingGstExpr() } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...BOOKING_FILTER,
          status: BOOKING_STATUS.COMPLETED,
          ...prevBookingDate,
        },
      },
      { $group: { _id: null, total: { $sum: bookingGstExpr() } } },
    ]),
    UserSubscription.aggregate([
      {
        $match: {
          paidAt: { $ne: null },
          ...dateMatch(dateRange, 'paidAt'),
        },
      },
      { $group: { _id: null, total: { $sum: subscriptionGstExpr() } } },
    ]),
    UserSubscription.aggregate([
      {
        $match: {
          paidAt: { $ne: null },
          ...dateMatch(prevRange, 'paidAt'),
        },
      },
      { $group: { _id: null, total: { $sum: subscriptionGstExpr() } } },
    ]),
    Booking.aggregate([
      { $match: { ...BOOKING_FILTER, ...bookingDate } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PlatformRevenue.aggregate([
      { $match: { ...revenueDate } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } },
          amount: { $sum: '$amountRupees' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...BOOKING_FILTER,
          status: BOOKING_STATUS.COMPLETED,
          ...bookingDate,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: bookingGstExpr() },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const tripRevenue = round2(tripRevenueAgg[0]?.total || 0);
  const tripRevenuePrev = round2(tripRevenuePrevAgg[0]?.total || 0);
  const commission = round2(commissionAgg[0]?.total || 0);
  const commissionPrev = round2(commissionPrevAgg[0]?.total || 0);
  const bookingGst = round2(gstBookingsAgg[0]?.total || 0);
  const subscriptionGst = round2(gstSubsAgg[0]?.total || 0);
  const gstCollected = round2(bookingGst + subscriptionGst);
  const gstPrev = round2(
    (gstBookingsPrevAgg[0]?.total || 0) + (gstSubsPrevAgg[0]?.total || 0),
  );

  return {
    filters: buildFiltersMeta(query, dateRange),
    summary: {
      users: {
        count: usersInPeriod,
        trend: percentChange(usersInPeriod, usersPrevPeriod),
      },
      drivers: {
        count: driversInPeriod,
        trend: percentChange(driversInPeriod, driversPrevPeriod),
      },
      bookings: {
        count: bookingsInPeriod,
        trend: percentChange(bookingsInPeriod, bookingsPrevPeriod),
      },
      tripRevenue: {
        amount: tripRevenue,
        trend: percentChange(tripRevenue, tripRevenuePrev),
      },
      platformCommission: {
        amount: commission,
        trend: percentChange(commission, commissionPrev),
      },
      gstCollected: {
        amount: gstCollected,
        bookingGst,
        subscriptionGst,
        trend: percentChange(gstCollected, gstPrev),
      },
    },
    trends: {
      bookings: fillDailyTrend(bookingTrendRaw, 'count', dateRange),
      revenue: fillDailyTrend(
        revenueTrendRaw.map((r) => ({ _id: r._id, amount: round2(r.amount) })),
        'amount',
        dateRange,
      ),
      gst: fillDailyTrend(
        gstTrendRaw.map((r) => ({ _id: r._id, amount: round2(r.amount) })),
        'amount',
        dateRange,
      ),
    },
  };
}
