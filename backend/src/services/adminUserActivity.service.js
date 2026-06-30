import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import { ApiError } from '../utils/apiError.js';
import { USER_ROLES } from '../constants/roles.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SUBSCRIPTION_STATUS } from '../constants/serviceTypes.js';

const CAR_POPULATE = {
  path: 'carId',
  select: 'vehicleNumber brandId modelId carTypeId isActive transmission',
  populate: [
    { path: 'brandId', select: 'name' },
    { path: 'modelId', select: 'name' },
    { path: 'carTypeId', select: 'name' },
  ],
};

async function assertCustomerUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, 'Invalid user id');
  }
  const user = await User.findOne({
    _id: userId,
    role: USER_ROLES.USER,
    isDeleted: false,
  }).select('name phone_no email');
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

function buildDateRangeFilter(from, to) {
  if (!from && !to) return null;
  const range = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    range.$gte = fromDate;
  }
  if (toDate && !Number.isNaN(toDate.getTime())) {
    toDate.setHours(23, 59, 59, 999);
    range.$lte = toDate;
  }
  return Object.keys(range).length ? range : null;
}

export async function listAdminUserTripsService(userId, query = {}) {
  const user = await assertCustomerUser(userId);
  const {
    page = 1,
    limit = 15,
    search,
    status,
    serviceType,
    bookingType,
    paymentStatus,
    from,
    to,
  } = query;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 15));
  const skip = (safePage - 1) * safeLimit;

  const filter = { userId, isDeleted: false };
  if (status) filter.status = status;
  if (serviceType) filter.serviceType = serviceType;
  if (bookingType) filter.bookingType = bookingType;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

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

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [items, total, statsRaw] = await Promise.all([
    Booking.find(filter)
      .populate('driverId', 'name phone_no')
      .populate(CAR_POPULATE)
      .populate('zoneIds', 'name city')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Booking.countDocuments(filter),
    Booking.aggregate([
      { $match: { userId: userObjectId, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = statsRaw.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const stats = {
    total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    searching: statusCounts[BOOKING_STATUS.SEARCHING] || 0,
    active:
      (statusCounts[BOOKING_STATUS.DRIVER_ASSIGNED] || 0) +
      (statusCounts[BOOKING_STATUS.EN_ROUTE] || 0) +
      (statusCounts[BOOKING_STATUS.ARRIVED] || 0) +
      (statusCounts[BOOKING_STATUS.STARTED] || 0) +
      (statusCounts[BOOKING_STATUS.PENDING_ASSIGNMENT] || 0),
    completed: statusCounts[BOOKING_STATUS.COMPLETED] || 0,
    cancelled: statusCounts[BOOKING_STATUS.CANCELLED] || 0,
  };

  return {
    user,
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
    stats,
  };
}

export async function listAdminUserSubscriptionsService(userId, query = {}) {
  const user = await assertCustomerUser(userId);
  const { page = 1, limit = 15, search, status, from, to } = query;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 15));
  const skip = (safePage - 1) * safeLimit;

  const filter = { userId };
  if (status) filter.status = status;

  const paidRange = buildDateRangeFilter(from, to);
  if (paidRange) filter.paidAt = paidRange;

  if (search) {
    const q = String(search).trim();
    filter.$or = [
      { planNameSnapshot: { $regex: q, $options: 'i' } },
    ];
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [items, total, statsRaw] = await Promise.all([
    UserSubscription.find(filter)
      .populate('zoneId', 'name city')
      .populate('assignedDriverId', 'name phone')
      .populate(CAR_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    UserSubscription.countDocuments(filter),
    UserSubscription.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = statsRaw.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const stats = {
    total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    active: statusCounts[SUBSCRIPTION_STATUS.ACTIVE] || 0,
    pendingPayment: statusCounts[SUBSCRIPTION_STATUS.PENDING_PAYMENT] || 0,
    expired: statusCounts[SUBSCRIPTION_STATUS.EXPIRED] || 0,
    cancelled: statusCounts[SUBSCRIPTION_STATUS.CANCELLED] || 0,
  };

  return {
    user,
    items,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
    stats,
  };
}
