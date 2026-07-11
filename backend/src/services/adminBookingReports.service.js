import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Zone from '../models/zone.model.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import {
  round2,
  resolveDateRange,
  fillDailyTrend,
  bookingFareExpr,
  buildFiltersMeta,
} from '../utils/reportDateRange.js';

const BOOKING_FILTER = { isDeleted: false };

function buildBookingMatch(query, dateRange) {
  const match = { ...BOOKING_FILTER };
  if (dateRange.from || dateRange.to) {
    match.createdAt = {};
    if (dateRange.from) match.createdAt.$gte = dateRange.from;
    if (dateRange.to) match.createdAt.$lte = dateRange.to;
  }
  if (query.serviceType) match.serviceType = query.serviceType;
  if (query.status) match.status = query.status;
  if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
    match.zoneIds = new mongoose.Types.ObjectId(query.zoneId);
  }
  return match;
}

export async function getAdminBookingReportsService(query = {}) {
  const dateRange = resolveDateRange(query);
  const bookingMatch = buildBookingMatch(query, dateRange);

  const [
    totalBookings,
    statusAgg,
    serviceTypeAgg,
    completedFareAgg,
    zoneBreakdownRaw,
    bookingTrendRaw,
    revenueTrendRaw,
  ] = await Promise.all([
    Booking.countDocuments(bookingMatch),
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
          completed: {
            $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0] },
          },
          revenue: {
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
          totalFare: { $sum: bookingFareExpr() },
        },
      },
    ]),
    Booking.aggregate([
      { $match: bookingMatch },
      { $unwind: { path: '$zoneIds', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$zoneIds',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0] },
          },
          revenue: {
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
      { $sort: { count: -1 } },
      { $limit: 20 },
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
      {
        $match: {
          ...bookingMatch,
          status: BOOKING_STATUS.COMPLETED,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: bookingFareExpr() },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const statusCounts = statusAgg.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const completed = statusCounts[BOOKING_STATUS.COMPLETED] || 0;
  const cancelled = statusCounts[BOOKING_STATUS.CANCELLED] || 0;
  const terminal = completed + cancelled;
  const cancellationRate = terminal > 0 ? round2((cancelled / terminal) * 100) : 0;

  const completedCount = completedFareAgg[0]?.count || 0;
  const totalFare = round2(completedFareAgg[0]?.totalFare || 0);
  const avgFare = completedCount > 0 ? round2(totalFare / completedCount) : 0;

  const zoneIds = zoneBreakdownRaw.map((r) => r._id).filter(Boolean);
  const zones = zoneIds.length
    ? await Zone.find({ _id: { $in: zoneIds } }).select('name').lean()
    : [];
  const zoneMap = new Map(zones.map((z) => [String(z._id), z]));

  return {
    filters: buildFiltersMeta(query, dateRange),
    summary: {
      totalBookings,
      completed,
      cancelled,
      active:
        (statusCounts[BOOKING_STATUS.SEARCHING] || 0) +
        (statusCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) +
        (statusCounts[BOOKING_STATUS.EN_ROUTE] || 0) +
        (statusCounts[BOOKING_STATUS.ARRIVED] || 0) +
        (statusCounts[BOOKING_STATUS.STARTED] || 0) +
        (statusCounts[BOOKING_STATUS.PENDING_ASSIGNMENT] || 0) +
        (statusCounts[BOOKING_STATUS.IN_EMERGENCY_POOL] || 0),
      cancellationRate,
      avgFare,
      grossRevenue: totalFare,
      revenuePerBooking: totalBookings > 0 ? round2(totalFare / totalBookings) : 0,
    },
    trends: {
      bookings: fillDailyTrend(bookingTrendRaw, 'count', dateRange),
      revenue: fillDailyTrend(
        revenueTrendRaw.map((r) => ({ _id: r._id, amount: round2(r.amount) })),
        'amount',
        dateRange,
      ),
    },
    breakdown: {
      byStatus: statusAgg.map((row) => ({
        status: row._id,
        count: row.count,
      })),
      byServiceType: serviceTypeAgg.map((row) => ({
        serviceType: row._id || 'unknown',
        count: row.count,
        completed: row.completed,
        revenue: round2(row.revenue),
      })),
      byZone: zoneBreakdownRaw.map((row) => ({
        zoneId: row._id,
        zoneName: zoneMap.get(String(row._id))?.name || 'Unknown',
        count: row.count,
        completed: row.completed,
        revenue: round2(row.revenue),
      })),
    },
  };
}
