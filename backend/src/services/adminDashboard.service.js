import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import PlatformRevenue, { PLATFORM_REVENUE_SOURCE } from '../models/platformRevenue.model.js';
import AdminTask from '../models/adminTask.model.js';
import SosAlert from '../models/sosAlert.model.js';
import Refund, { REFUND_STATUS } from '../models/refund.model.js';
import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import KitOrder from '../models/kitOrder.model.js';
import SupportTicket from '../models/supportTicket.model.js';
import { USER_ROLES } from '../constants/roles.js';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../constants/bookingStatus.js';
import { OPEN_TASK_STATUSES } from '../constants/adminTask.js';
import { SOS_STATUS } from '../constants/sos.js';
import { WITHDRAWAL_STATUS } from '../constants/withdrawal.js';
import { KIT_ADMIN_STATUS, PAYMENT_STATUS } from '../constants/kitStatus.js';
import { SUPPORT_TICKET_STATUS } from '../constants/supportTicket.js';
import { countEmergencyPoolBookingsService } from './bookingEmergencyPool.service.js';
import { staffAssigneeListFilter } from '../utils/staffAssignment.util.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const USER_FILTER = { role: USER_ROLES.USER, isDeleted: false };
const DRIVER_FILTER = { isDeleted: false };
const BOOKING_FILTER = { isDeleted: false };
const TRIP_REVENUE_MATCH = {
  source: { $nin: [PLATFORM_REVENUE_SOURCE.SUBSCRIPTION] },
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function percentChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function fillLast7Days(rawPoints, valueKey) {
  const map = new Map(
    rawPoints.map((p) => [p._id || p.date, Number(p[valueKey]) || 0]),
  );
  const today = startOfDay();
  const points = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = addDays(today, -i);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, [valueKey]: map.get(key) ?? 0 });
  }
  return points;
}

function reduceCounts(rows) {
  return rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});
}

/**
 * Single aggregated payload for the super-admin dashboard.
 * All counts/aggregates run in one Promise.all — one HTTP round-trip
 * from the client, no N+1 fan-out.
 */
export async function getAdminDashboardService() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);
  const monthStart = startOfMonth(now);
  const nextMonthStart = startOfMonth(addDays(monthStart, 32));
  const lastMonthStart = startOfMonth(addDays(monthStart, -1));
  const sevenDaysAgo = addDays(todayStart, -6);

  const [
    totalUsers,
    usersThisMonth,
    usersLastMonth,
    recentUsers,
    driverStatusAgg,
    onlineDrivers,
    driversThisMonth,
    driversLastMonth,
    recentDrivers,
    bookingStatusAgg,
    bookingsToday,
    bookingsYesterday,
    bookingTrendRaw,
    recentBookings,
    revenueThisMonth,
    revenueLastMonth,
    revenueTrendRaw,
    openTasks,
    unassignedTasks,
    activeSos,
    pendingRefunds,
    pendingWithdrawals,
    pendingKitOrders,
    openSupportTickets,
  ] = await Promise.all([
    User.countDocuments(USER_FILTER),
    User.countDocuments({
      ...USER_FILTER,
      createdAt: { $gte: monthStart, $lt: nextMonthStart },
    }),
    User.countDocuments({
      ...USER_FILTER,
      createdAt: { $gte: lastMonthStart, $lt: monthStart },
    }),
    User.find(USER_FILTER)
      .select('name phone_no email createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Driver.aggregate([
      { $match: DRIVER_FILTER },
      { $group: { _id: '$approvalStatus', count: { $sum: 1 } } },
    ]),
    Driver.countDocuments({
      ...DRIVER_FILTER,
      approvalStatus: 'approved',
      isOnline: true,
    }),
    Driver.countDocuments({
      ...DRIVER_FILTER,
      createdAt: { $gte: monthStart, $lt: nextMonthStart },
    }),
    Driver.countDocuments({
      ...DRIVER_FILTER,
      createdAt: { $gte: lastMonthStart, $lt: monthStart },
    }),
    Driver.find(DRIVER_FILTER)
      .select('name phone approvalStatus createdAt isOnline isOnTrip')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Booking.aggregate([
      { $match: BOOKING_FILTER },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Booking.countDocuments({
      ...BOOKING_FILTER,
      createdAt: { $gte: todayStart, $lt: tomorrowStart },
    }),
    Booking.countDocuments({
      ...BOOKING_FILTER,
      createdAt: { $gte: yesterdayStart, $lt: todayStart },
    }),
    Booking.aggregate([
      { $match: { ...BOOKING_FILTER, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.find({
      ...BOOKING_FILTER,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    })
      .select(
        'bookingNumber status serviceType bookingType createdAt updatedAt fareSnapshot userId driverId',
      )
      .populate('userId', 'name phone_no')
      .populate('driverId', 'name phone')
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    PlatformRevenue.aggregate([
      {
        $match: {
          ...TRIP_REVENUE_MATCH,
          occurredAt: { $gte: monthStart, $lt: nextMonthStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountRupees' } } },
    ]),
    PlatformRevenue.aggregate([
      {
        $match: {
          ...TRIP_REVENUE_MATCH,
          occurredAt: { $gte: lastMonthStart, $lt: monthStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountRupees' } } },
    ]),
    PlatformRevenue.aggregate([
      {
        $match: {
          ...TRIP_REVENUE_MATCH,
          occurredAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } },
          amount: { $sum: '$amountRupees' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AdminTask.countDocuments({ status: { $in: OPEN_TASK_STATUSES } }),
    AdminTask.countDocuments({
      status: { $in: OPEN_TASK_STATUSES },
      assignedTo: null,
    }),
    SosAlert.countDocuments({ status: SOS_STATUS.ACTIVE }),
    Refund.countDocuments({
      status: { $in: [REFUND_STATUS.PENDING, REFUND_STATUS.APPROVED] },
    }),
    WithdrawalRequest.countDocuments({ status: WITHDRAWAL_STATUS.PENDING }),
    KitOrder.countDocuments({
      adminStatus: KIT_ADMIN_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.PAID,
    }),
    SupportTicket.countDocuments({
      status: {
        $in: [SUPPORT_TICKET_STATUS.OPEN, SUPPORT_TICKET_STATUS.IN_PROGRESS],
      },
    }),
  ]);

  const driverCounts = reduceCounts(driverStatusAgg);
  const totalDrivers = Object.values(driverCounts).reduce((a, b) => a + b, 0);
  const bookingCounts = reduceCounts(bookingStatusAgg);

  const monthRevenue = round2(revenueThisMonth[0]?.total || 0);
  const lastMonthRevenue = round2(revenueLastMonth[0]?.total || 0);

  const emergencyPool = bookingCounts[BOOKING_STATUS.IN_EMERGENCY_POOL] || 0;

  return {
    overview: {
      users: {
        total: totalUsers,
        trend: percentChange(usersThisMonth, usersLastMonth),
        newThisMonth: usersThisMonth,
      },
      drivers: {
        total: totalDrivers,
        online: onlineDrivers,
        trend: percentChange(driversThisMonth, driversLastMonth),
        newThisMonth: driversThisMonth,
      },
      bookingsToday: {
        count: bookingsToday,
        trend: percentChange(bookingsToday, bookingsYesterday),
      },
      revenue: {
        monthTotal: monthRevenue,
        trend: percentChange(monthRevenue, lastMonthRevenue),
      },
    },
    bookings: {
      total: Object.values(bookingCounts).reduce((a, b) => a + b, 0),
      searching: bookingCounts[BOOKING_STATUS.SEARCHING] || 0,
      active:
        (bookingCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) +
        (bookingCounts[BOOKING_STATUS.AWAITING_PAYMENT] || 0) +
        (bookingCounts[BOOKING_STATUS.EN_ROUTE] || 0) +
        (bookingCounts[BOOKING_STATUS.ARRIVED] || 0) +
        (bookingCounts[BOOKING_STATUS.STARTED] || 0),
      completed: bookingCounts[BOOKING_STATUS.COMPLETED] || 0,
      cancelled: bookingCounts[BOOKING_STATUS.CANCELLED] || 0,
      emergencyPool,
      pendingAssignment: bookingCounts[BOOKING_STATUS.PENDING_ASSIGNMENT] || 0,
      noDriversFound: bookingCounts[BOOKING_STATUS.NO_DRIVERS_FOUND] || 0,
    },
    drivers: {
      total: totalDrivers,
      pending: driverCounts.pending || 0,
      underReview: driverCounts.under_review || 0,
      approved: driverCounts.approved || 0,
      rejected: driverCounts.rejected || 0,
      suspended: driverCounts.suspended || 0,
      online: onlineDrivers,
    },
    actionItems: {
      openTasks,
      unassignedTasks,
      activeSos,
      pendingRefunds,
      pendingWithdrawals,
      pendingKitOrders,
      openSupportTickets,
      emergencyPool,
    },
    trends: {
      bookingsLast7Days: fillLast7Days(bookingTrendRaw, 'count'),
      revenueLast7Days: fillLast7Days(
        revenueTrendRaw.map((row) => ({
          _id: row._id,
          amount: round2(row.amount),
        })),
        'amount',
      ),
    },
    recent: {
      users: recentUsers,
      drivers: recentDrivers,
      bookings: recentBookings.map((booking) => ({
        _id: booking._id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        serviceType: booking.serviceType,
        bookingType: booking.bookingType,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        fare: booking.fareSnapshot?.total || 0,
        user: booking.userId
          ? {
              _id: booking.userId._id,
              name: booking.userId.name,
              phone: booking.userId.phone_no,
            }
          : null,
        driver: booking.driverId
          ? {
              _id: booking.driverId._id,
              name: booking.driverId.name,
              phone: booking.driverId.phone,
            }
          : null,
      })),
    },
  };
}

/**
 * Lightweight badge counts for the admin sidebar.
 * Emergency pool is zone-scoped for team_members.
 * SOS / support counts are assignee-scoped for team_members.
 */
export async function getAdminSidebarCountsService({ staff } = {}) {
  const assigneeFilter = staffAssigneeListFilter(staff);
  const [
    emergencyPool,
    pendingDrivers,
    pendingKitOrders,
    activeSos,
    openSupportTickets,
  ] = await Promise.all([
    countEmergencyPoolBookingsService({ staff }),
    Driver.countDocuments({
      ...DRIVER_FILTER,
      approvalStatus: { $in: ['pending', 'under_review'] },
    }),
    KitOrder.countDocuments({
      adminStatus: KIT_ADMIN_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.PAID,
    }),
    SosAlert.countDocuments({ status: SOS_STATUS.ACTIVE, ...assigneeFilter }),
    SupportTicket.countDocuments({
      status: {
        $in: [SUPPORT_TICKET_STATUS.OPEN, SUPPORT_TICKET_STATUS.IN_PROGRESS],
      },
      ...assigneeFilter,
    }),
  ]);

  return {
    emergencyPool,
    pendingDrivers,
    pendingKitOrders,
    activeSos,
    openSupportTickets,
  };
}
