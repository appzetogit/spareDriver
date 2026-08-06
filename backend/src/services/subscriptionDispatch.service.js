import UserSubscription from '../models/userSubscription.model.js';
import Car from '../models/user/car.model.js';
import User from '../models/user.model.js';
import AppSettings from '../models/appSettings.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
  SUBSCRIPTION_DISPATCH,
} from '../constants/serviceTypes.js';
import { DISPATCH_RESPONSE, DISPATCH_MODE, SCHEDULED_BOOKING } from '../constants/bookingStatus.js';
import { findDriversWithinRadius } from './driverFinder.service.js';
import {
  applyBuffer,
  findConflictingDriverIds,
  getDriverConflictMap,
} from './driverConflict.service.js';
import { S2C_EVENTS } from '../constants/socketEvents.js';
import { emitToDriver, emitToAdmins } from '../utils/socketEmitters.js';
import { notifyDriverSubscriptionAssigned } from '../utils/notificationDispatch.js';

const SETTINGS_KEY = 'default';

export async function loadSubscriptionDispatchConfig() {
  try {
    const doc = await AppSettings.findOne({ key: SETTINGS_KEY })
      .select('subscriptionDispatch')
      .lean();
    return {
      ...SUBSCRIPTION_DISPATCH,
      ...(doc?.subscriptionDispatch || {}),
    };
  } catch {
    return { ...SUBSCRIPTION_DISPATCH };
  }
}

export async function getSubscriptionDispatchConfigService() {
  return loadSubscriptionDispatchConfig();
}

export async function updateSubscriptionDispatchConfigService(data, staffId) {
  const cfg = data || {};
  const $set = {
    updatedBy: staffId || null,
  };
  if (cfg.AUTO_SEARCH_ENABLED != null) {
    $set['subscriptionDispatch.AUTO_SEARCH_ENABLED'] = !!cfg.AUTO_SEARCH_ENABLED;
  }
  if (cfg.ESCALATE_MINUTES != null) {
    $set['subscriptionDispatch.ESCALATE_MINUTES'] = Math.max(
      5,
      Number(cfg.ESCALATE_MINUTES) || SUBSCRIPTION_DISPATCH.ESCALATE_MINUTES,
    );
  }
  if (cfg.INBOX_BROADCAST_LIMIT != null) {
    $set['subscriptionDispatch.INBOX_BROADCAST_LIMIT'] = Math.min(
      100,
      Math.max(1, Number(cfg.INBOX_BROADCAST_LIMIT) || 50),
    );
  }
  if (cfg.SEARCH_RADIUS_METERS != null) {
    $set['subscriptionDispatch.SEARCH_RADIUS_METERS'] = Math.max(
      1000,
      Number(cfg.SEARCH_RADIUS_METERS) || SUBSCRIPTION_DISPATCH.SEARCH_RADIUS_METERS,
    );
  }

  await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set },
    { upsert: true, new: true },
  );
  return loadSubscriptionDispatchConfig();
}

function buildSubscriptionOfferPayload(sub, driver, { customer, car, plan } = {}) {
  return {
    kind: 'subscription',
    bookingType: 'subscription',
    inbox: true,
    subscriptionId: String(sub._id),
    subscriptionNumber: sub.subscriptionNumber || '',
    bookingId: String(sub._id),
    planName: plan?.name || sub.planNameSnapshot || '',
    includedHoursPerDay: sub.includedHoursPerDay,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    dailyPickup: sub.dailyPickup || null,
    dailyDropoff: sub.dailyDropoff || null,
    pickup: sub.dailyPickup || null,
    dropoff: sub.dailyDropoff || null,
    driverShareRupees: sub.driverShareRupees ?? null,
    fare: {
      driverEarning: sub.driverShareRupees ?? null,
      currency: 'INR',
    },
    customer: customer
      ? {
          name: customer.name || '',
          profilePicture: customer.profilePicture || '',
        }
      : null,
    car: car
      ? {
          _id: String(car._id),
          vehicleNumber: car.vehicleNumber || '',
          transmission: car.transmission || '',
          carTypeName: car.carTypeId?.name || '',
          brandName: car.brandId?.name || '',
          modelName: car.modelId?.name || '',
          fuelTypeName: car.fuelTypeId?.name || '',
        }
      : null,
    offerExpiresAt: null,
    distanceMeters: driver?.distanceMeters ?? null,
    waveSize: (sub.dispatch?.pendingOfferIds || []).length,
  };
}

/**
 * Kick off dedicated-driver auto-search after a subscription is paid.
 */
export async function setupSubscriptionSearch(subscription) {
  const config = await loadSubscriptionDispatchConfig();
  if (!config.AUTO_SEARCH_ENABLED) {
    return { ok: true, skipped: true, reason: 'auto_search_disabled' };
  }
  if (!subscription) return { ok: false, reason: 'missing' };
  if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { ok: false, reason: 'not_active' };
  }
  if (subscription.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED) {
    return { ok: false, reason: 'already_assigned' };
  }

  const escalateAt = new Date(
    Date.now() + (Number(config.ESCALATE_MINUTES) || 1440) * 60_000,
  );

  subscription.assignmentStatus = SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING;
  subscription.dispatch = {
    ...(subscription.dispatch?.toObject?.() || subscription.dispatch || {}),
    mode: DISPATCH_MODE.INBOX,
    escalateAt,
    assignmentStartedAt: new Date(),
    escalatedAt: null,
    attemptsCount: 0,
  };
  await subscription.save();

  return broadcastSubscriptionInboxService(subscription._id);
}

export async function broadcastSubscriptionInboxService(subscriptionId, opts = {}) {
  const rebroadcast = !!opts.rebroadcast;
  const config = await loadSubscriptionDispatchConfig();
  if (!config.AUTO_SEARCH_ENABLED && !rebroadcast) {
    return { ok: true, skipped: true };
  }

  const sub = await UserSubscription.findById(subscriptionId);
  if (!sub) return { ok: false, reason: 'not_found' };
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    return { ok: false, reason: 'not_active' };
  }
  if (sub.assignmentStatus !== SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING) {
    return { ok: false, reason: 'not_pending' };
  }
  if (sub.dispatch?.escalatedAt) {
    return { ok: false, reason: 'escalated' };
  }

  if (
    !rebroadcast
    && (sub.dispatch?.attemptsCount || 0) >= 1
  ) {
    return {
      ok: true,
      alreadyBroadcast: true,
      driverIds: (sub.dispatch.pendingOfferIds || []).map(String),
      newDriverCount: 0,
    };
  }

  const lat = sub.dailyPickup?.lat;
  const lng = sub.dailyPickup?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { ok: false, reason: 'bad_pickup' };
  }

  const car = sub.carId
    ? await Car.findById(sub.carId)
        .populate('carTypeId', 'name')
        .populate('brandId', 'name')
        .populate('modelId', 'name')
        .populate('fuelTypeId', 'name')
        .lean()
    : null;
  const customer = await User.findById(sub.userId)
    .select('name phone_no profilePicture')
    .lean();
  const carTypeIds = car?.carTypeId?._id ? [String(car.carTypeId._id)] : [];

  // Drivers already holding another active dedicated assignment.
  const busySubs = await UserSubscription.find({
    _id: { $ne: sub._id },
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
    assignedDriverId: { $ne: null },
  })
    .select('assignedDriverId')
    .lean();
  const busyIds = new Set(busySubs.map((s) => String(s.assignedDriverId)));

  // Drivers with bookings overlapping this subscription period.
  const subStartMs = sub.startDate ? new Date(sub.startDate).getTime() : null;
  const subEndMs = sub.expiryDate ? new Date(sub.expiryDate).getTime() : null;
  let bookingBusyIds = [];
  if (Number.isFinite(subStartMs) && Number.isFinite(subEndMs)) {
    const bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
    bookingBusyIds = await findConflictingDriverIds({
      window: applyBuffer({ startMs: subStartMs, endMs: subEndMs }, bufferMinutes),
      bufferMinutes,
    });
  }

  const skipIds = new Set([
    ...(sub.dispatch?.pendingOfferIds || []).map(String),
    ...(sub.dispatch?.offers || [])
      .filter(
        (o) =>
          o.response === DISPATCH_RESPONSE.REJECTED
          || o.response === DISPATCH_RESPONSE.ACCEPTED,
      )
      .map((o) => String(o.driverId)),
    ...busyIds,
    ...bookingBusyIds,
  ]);

  const drivers = await findDriversWithinRadius({
    lat,
    lng,
    radiusMeters: config.SEARCH_RADIUS_METERS || SUBSCRIPTION_DISPATCH.SEARCH_RADIUS_METERS,
    limit: config.INBOX_BROADCAST_LIMIT || SUBSCRIPTION_DISPATCH.INBOX_BROADCAST_LIMIT,
    carTypeIds,
    excludeDriverIds: [...skipIds],
  });

  sub.dispatch = sub.dispatch || {};
  sub.dispatch.mode = DISPATCH_MODE.INBOX;
  sub.dispatch.attemptsCount = Math.max(1, sub.dispatch.attemptsCount || 0);

  const existingPending = new Set((sub.dispatch.pendingOfferIds || []).map(String));
  const alreadyOfferedRows = new Set(
    (sub.dispatch.offers || []).map((o) => String(o.driverId)),
  );

  const newDrivers = [];
  for (const driver of drivers) {
    const id = String(driver._id);
    if (existingPending.has(id)) continue;
    existingPending.add(id);
    newDrivers.push(driver);
    if (!alreadyOfferedRows.has(id)) {
      sub.dispatch.offers = sub.dispatch.offers || [];
      sub.dispatch.offers.push({
        driverId: driver._id,
        offeredAt: new Date(),
        response: null,
        distanceMeters: driver.distanceMeters ?? null,
      });
    }
  }

  sub.dispatch.pendingOfferIds = [...existingPending];
  await sub.save();

  for (const driver of newDrivers) {
    const offerPayload = buildSubscriptionOfferPayload(sub, driver, {
      customer,
      car,
      plan: { name: sub.planNameSnapshot },
    });
    emitToDriver(driver._id, S2C_EVENTS.BOOKING_OFFERED, offerPayload);
  }

  return {
    ok: true,
    empty: existingPending.size === 0,
    rebroadcast,
    newDriverCount: newDrivers.length,
    driverIds: [...existingPending],
  };
}

export async function acceptSubscriptionOfferService(subscriptionId, driverId) {
  const preview = await UserSubscription.findById(subscriptionId)
    .select('startDate expiryDate status assignmentStatus')
    .lean();
  if (!preview) throw new ApiError(404, 'Subscription not found');
  if (preview.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ApiError(409, 'Subscription is no longer active');
  }
  if (preview.assignmentStatus !== SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING) {
    throw new ApiError(409, 'Subscription offer is no longer available');
  }

  const subStartMs = preview.startDate ? new Date(preview.startDate).getTime() : null;
  const subEndMs = preview.expiryDate ? new Date(preview.expiryDate).getTime() : null;
  if (Number.isFinite(subStartMs) && Number.isFinite(subEndMs)) {
    const bufferMinutes = SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
    const conflictMap = await getDriverConflictMap({
      driverIds: [driverId],
      window: applyBuffer({ startMs: subStartMs, endMs: subEndMs }, bufferMinutes),
      bufferMinutes,
    });
    if ((conflictMap[String(driverId)] || []).length) {
      throw new ApiError(
        409,
        'You already have an overlapping booking or subscription for this period',
      );
    }
  }

  const now = new Date();
  const sub = await UserSubscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
      assignedDriverId: null,
      'dispatch.pendingOfferIds': driverId,
    },
    {
      $set: {
        assignedDriverId: driverId,
        assignedAt: now,
        assignedWorkingEndDate: null,
        assignedBy: null,
        assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
        releasedAt: null,
        releaseReason: '',
        'dispatch.pendingOfferIds': [],
      },
    },
    { new: true },
  );

  if (!sub) {
    throw new ApiError(409, 'Subscription offer is no longer available');
  }

  // Mark accept on offers + withdraw from losers.
  const pending = (sub.dispatch?.offers || [])
    .filter((o) => o.response == null)
    .map((o) => String(o.driverId));

  sub.dispatch = sub.dispatch || {};
  sub.dispatch.offers = (sub.dispatch.offers || []).map((o) => {
    if (String(o.driverId) === String(driverId)) {
      return {
        ...o.toObject?.() || o,
        response: DISPATCH_RESPONSE.ACCEPTED,
        respondedAt: now,
      };
    }
    if (o.response == null) {
      return {
        ...o.toObject?.() || o,
        response: DISPATCH_RESPONSE.CANCELLED,
        respondedAt: now,
      };
    }
    return o;
  });
  await sub.save();

  for (const id of pending) {
    if (String(id) === String(driverId)) continue;
    emitToDriver(id, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(sub._id),
      subscriptionId: String(sub._id),
      reason: 'accepted_by_other',
    });
  }

  const driver = await Driver.findById(driverId)
    .select('name phone rating profilePicture')
    .lean();

  try {
    const { sendSubscriptionDriverAssignmentEmail } = await import(
      './subscriptionAssignmentEmail.service.js'
    );
    const { getActiveLegalDocumentService } = await import('./legalDocument.service.js');
    const { LEGAL_DOCUMENT_TYPES } = await import('../models/legalDocument.model.js');
    const terms = await getActiveLegalDocumentService(LEGAL_DOCUMENT_TYPES.SUBSCRIPTION);
    await sendSubscriptionDriverAssignmentEmail({
      subscription: sub.toObject ? sub.toObject() : sub,
      driver,
      terms,
    });
  } catch (err) {
    console.warn('[subscriptionDispatch] assignment email failed:', err?.message);
  }

  const carLabel = (() => {
    // best-effort label for push
    return 'a customer vehicle';
  })();
  notifyDriverSubscriptionAssigned(driverId, {
    subscriptionId: sub._id,
    carLabel,
  }).catch(() => null);

  return { ok: true, subscription: sub };
}

export async function rejectSubscriptionOfferService(subscriptionId, driverId) {
  const sub = await UserSubscription.findOne({
    _id: subscriptionId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
    'dispatch.pendingOfferIds': driverId,
  });
  if (!sub) {
    throw new ApiError(409, 'Subscription offer is no longer available');
  }

  sub.dispatch.pendingOfferIds = (sub.dispatch.pendingOfferIds || []).filter(
    (id) => String(id) !== String(driverId),
  );
  const row = (sub.dispatch.offers || []).find(
    (o) => String(o.driverId) === String(driverId) && o.response == null,
  );
  if (row) {
    row.response = DISPATCH_RESPONSE.REJECTED;
    row.respondedAt = new Date();
  }
  await sub.save();
  return { ok: true };
}

export async function listIncomingSubscriptionsForDriverService(driverId) {
  if (!driverId) return [];

  const rows = await UserSubscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
    'dispatch.pendingOfferIds': driverId,
    'dispatch.escalatedAt': null,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!rows.length) return [];

  const carIds = [...new Set(rows.map((r) => String(r.carId || '')).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => String(r.userId || '')).filter(Boolean))];

  const [cars, customers] = await Promise.all([
    carIds.length
      ? Car.find({ _id: { $in: carIds } })
          .populate('carTypeId', 'name')
          .populate('brandId', 'name')
          .populate('modelId', 'name')
          .populate('fuelTypeId', 'name')
          .lean()
      : [],
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select('name phone_no profilePicture')
          .lean()
      : [],
  ]);

  const carById = new Map(cars.map((c) => [String(c._id), c]));
  const customerById = new Map(customers.map((u) => [String(u._id), u]));

  return rows.map((sub) => {
    const offerRow = (sub.dispatch?.offers || []).find(
      (o) => String(o.driverId) === String(driverId) && o.response == null,
    );
    return buildSubscriptionOfferPayload(
      sub,
      { _id: driverId, distanceMeters: offerRow?.distanceMeters ?? null },
      {
        customer: customerById.get(String(sub.userId)),
        car: carById.get(String(sub.carId)),
        plan: { name: sub.planNameSnapshot },
      },
    );
  });
}

export async function countIncomingSubscriptionsForDriverService(driverId) {
  if (!driverId) return 0;
  return UserSubscription.countDocuments({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
    'dispatch.pendingOfferIds': driverId,
    'dispatch.escalatedAt': null,
  });
}

export async function rebroadcastOpenSubscriptionInboxes() {
  const now = new Date();
  const rows = await UserSubscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
    assignedDriverId: null,
    $or: [
      { 'dispatch.escalateAt': { $gt: now } },
      { 'dispatch.escalateAt': { $exists: false } },
      { 'dispatch.escalateAt': null },
    ],
    'dispatch.escalatedAt': null,
  })
    .select('_id')
    .lean();

  let updated = 0;
  let newDrivers = 0;
  for (const row of rows) {
    try {
      const result = await broadcastSubscriptionInboxService(row._id, {
        rebroadcast: true,
      });
      if (result?.ok && (result.newDriverCount || 0) > 0) {
        updated += 1;
        newDrivers += result.newDriverCount;
      }
    } catch (err) {
      console.warn(
        '[subscriptionDispatch] rebroadcast failed for',
        String(row._id),
        err?.message,
      );
    }
  }
  return { ok: true, scanned: rows.length, updated, newDrivers };
}

/**
 * Stop auto-search; leave assignment PENDING for admin Manage User Subscriptions.
 */
export async function escalateSubscriptionAutoSearch(subscriptionId) {
  const sub = await UserSubscription.findById(subscriptionId);
  if (!sub) return { ok: false, reason: 'not_found' };
  if (sub.assignmentStatus !== SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING) {
    return { ok: false, reason: 'not_pending' };
  }
  if (sub.dispatch?.escalatedAt) return { ok: true, already: true };

  const pending = (sub.dispatch?.pendingOfferIds || []).map(String);
  sub.dispatch = sub.dispatch || {};
  sub.dispatch.pendingOfferIds = [];
  sub.dispatch.escalatedAt = new Date();
  await sub.save();

  for (const id of pending) {
    emitToDriver(id, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(sub._id),
      subscriptionId: String(sub._id),
      reason: 'subscription_manual_queue',
    });
  }

  emitToAdmins(S2C_EVENTS.ADMIN_ALERT, {
    kind: 'subscription_manual_queue',
    severity: 'warn',
    message: `Subscription ${sub.planNameSnapshot || sub._id} needs manual driver assignment`,
    data: { subscriptionId: String(sub._id) },
  });

  return { ok: true };
}

export async function runSubscriptionEscalateBatch() {
  const now = new Date();
  const rows = await UserSubscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING,
    assignedDriverId: null,
    'dispatch.escalateAt': { $lte: now },
    'dispatch.escalatedAt': null,
  })
    .select('_id')
    .lean();

  let escalated = 0;
  for (const row of rows) {
    try {
      const result = await escalateSubscriptionAutoSearch(row._id);
      if (result?.ok) escalated += 1;
    } catch (err) {
      console.warn(
        '[subscriptionDispatch] escalate failed for',
        String(row._id),
        err?.message,
      );
    }
  }
  return { ok: true, scanned: rows.length, escalated };
}

/**
 * When admin manually assigns, clear open inbox offers.
 */
export async function withdrawSubscriptionInboxOffers(subscription, reason = 'assigned_by_admin') {
  if (!subscription) return;
  const pending = (subscription.dispatch?.pendingOfferIds || []).map(String);
  if (!pending.length && !subscription.dispatch) return;

  subscription.dispatch = subscription.dispatch || {};
  subscription.dispatch.pendingOfferIds = [];
  subscription.dispatch.escalatedAt = subscription.dispatch.escalatedAt || new Date();

  for (const id of pending) {
    emitToDriver(id, S2C_EVENTS.BOOKING_OFFER_WITHDRAWN, {
      bookingId: String(subscription._id),
      subscriptionId: String(subscription._id),
      reason,
    });
  }
}

function serializeSubscriptionForDriver(sub) {
  if (!sub) return null;
  const user = sub.userId && typeof sub.userId === 'object' ? sub.userId : null;
  const car = sub.carId && typeof sub.carId === 'object' ? sub.carId : null;
  const zone = sub.zoneId && typeof sub.zoneId === 'object' ? sub.zoneId : null;
  return {
    _id: String(sub._id),
    subscriptionNumber: sub.subscriptionNumber || '',
    status: sub.status,
    assignmentStatus: sub.assignmentStatus,
    planName: sub.planNameSnapshot || '',
    durationMonths: sub.durationMonths,
    includedHoursPerDay: sub.includedHoursPerDay,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    assignedAt: sub.assignedAt,
    assignedWorkingEndDate: sub.assignedWorkingEndDate,
    dailyPickup: sub.dailyPickup || null,
    dailyDropoff: sub.dailyDropoff || null,
    driverShareRupees: sub.driverShareRupees ?? null,
    customer: user
      ? {
          _id: String(user._id),
          name: user.name || '',
          phone: user.phone_no || user.phone || '',
          profilePicture: user.profilePicture || '',
        }
      : null,
    car: car
      ? {
          _id: String(car._id),
          vehicleNumber: car.vehicleNumber || '',
          carTypeName: car.carTypeId?.name || '',
          brandName: car.brandId?.name || '',
          modelName: car.modelId?.name || '',
        }
      : null,
    zone: zone
      ? {
          _id: String(zone._id),
          name: zone.name || '',
          city: zone.city || '',
        }
      : null,
  };
}

/**
 * Active dedicated-driver subscriptions currently assigned to this driver.
 */
export async function listDriverAssignedSubscriptionsService(driverId) {
  if (!driverId) return { subscriptions: [], count: 0 };

  const rows = await UserSubscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
    assignedDriverId: driverId,
  })
    .populate('userId', 'name phone_no profilePicture')
    .populate({
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    })
    .populate('zoneId', 'name city')
    .sort({ assignedAt: -1, createdAt: -1 })
    .lean();

  const subscriptions = rows.map(serializeSubscriptionForDriver);
  return { subscriptions, count: subscriptions.length };
}

export async function getDriverAssignedSubscriptionService(driverId, subscriptionId) {
  if (!driverId || !subscriptionId) {
    throw new ApiError(400, 'subscriptionId is required');
  }

  const sub = await UserSubscription.findOne({
    _id: subscriptionId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
    assignedDriverId: driverId,
  })
    .populate('userId', 'name phone_no profilePicture')
    .populate({
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    })
    .populate('zoneId', 'name city')
    .lean();

  if (!sub) {
    throw new ApiError(404, 'Subscription assignment not found');
  }

  return { subscription: serializeSubscriptionForDriver(sub) };
}
