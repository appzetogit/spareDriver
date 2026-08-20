import mongoose from 'mongoose';
import Referral from '../models/referral.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import WalletTransaction, { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import Payment from '../models/payment.model.js';
import AppSettings from '../models/appSettings.model.js';
import {
  DEFAULT_REFERRAL_SETTINGS,
  REFERRAL_QUALIFICATION,
  REFERRAL_ROLE,
  REFERRAL_STATUS,
} from '../constants/referral.js';
import { PAYMENT_PROVIDER, PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { ApiError } from '../utils/apiError.js';
import {
  generateUniqueDriverReferralCode,
  generateUniqueUserReferralCode,
  isDriverReferralCode,
  isUserReferralCode,
  normalizeReferralCode,
} from '../utils/referralCode.util.js';
import { creditWalletService } from './wallet.service.js';

const SETTINGS_KEY = 'default';
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function mergeReferralSettings(doc) {
  const stored = doc?.referralSettings || {};
  return {
    user: { ...DEFAULT_REFERRAL_SETTINGS.user, ...(stored.user || {}) },
    driver: { ...DEFAULT_REFERRAL_SETTINGS.driver, ...(stored.driver || {}) },
  };
}

export async function getReferralSettingsService() {
  const doc = await AppSettings.findOne({ key: SETTINGS_KEY }).lean();
  return mergeReferralSettings(doc);
}

export async function updateReferralSettingsService(data, staffId) {
  const current = await getReferralSettingsService();
  const user = { ...current.user, ...(data?.user || {}) };
  const driver = { ...current.driver, ...(data?.driver || {}) };

  if (user.referrerRewardRupees < 0 || user.referredRewardRupees < 0) {
    throw new ApiError(400, 'User reward amounts cannot be negative');
  }
  if (driver.referrerRewardRupees < 0 || driver.referredRewardRupees < 0) {
    throw new ApiError(400, 'Driver reward amounts cannot be negative');
  }
  if (user.minBookingAmountRupees < 0) {
    throw new ApiError(400, 'Minimum booking amount cannot be negative');
  }
  if (!Number.isInteger(driver.requiredCompletedTrips) || driver.requiredCompletedTrips < 0) {
    throw new ApiError(400, 'Required completed trips must be an integer >= 0');
  }

  const doc = await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        referralSettings: {
          user: {
            enabled: Boolean(user.enabled),
            referrerRewardRupees: round2(user.referrerRewardRupees),
            referredRewardRupees: round2(user.referredRewardRupees),
            qualificationType: REFERRAL_QUALIFICATION.FIRST_COMPLETED_BOOKING,
            minBookingAmountRupees: round2(user.minBookingAmountRupees),
          },
          driver: {
            enabled: Boolean(driver.enabled),
            referrerRewardRupees: round2(driver.referrerRewardRupees),
            referredRewardRupees: round2(driver.referredRewardRupees),
            requiredCompletedTrips: driver.requiredCompletedTrips,
          },
        },
        updatedBy: staffId || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return mergeReferralSettings(doc);
}

export async function ensureUserReferralCode(userId) {
  const user = await User.findById(userId).select('referralCode isDeleted').lean();
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');
  if (user.referralCode) return user.referralCode;
  const code = await generateUniqueUserReferralCode();
  await User.updateOne({ _id: userId }, { $set: { referralCode: code } });
  return code;
}

export async function ensureDriverReferralCode(driverId) {
  const driver = await Driver.findById(driverId).select('referralCode isDeleted').lean();
  if (!driver || driver.isDeleted) throw new ApiError(404, 'Driver not found');
  if (driver.referralCode) return driver.referralCode;
  const code = await generateUniqueDriverReferralCode();
  await Driver.updateOne({ _id: driverId }, { $set: { referralCode: code } });
  return code;
}

async function findReferrerByCode(code, expectedReferredRole) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) throw new ApiError(400, 'Invalid referral code');

  if (expectedReferredRole === REFERRAL_ROLE.USER) {
    if (!isUserReferralCode(normalized)) {
      throw new ApiError(400, 'Invalid referral code');
    }
    const referrer = await User.findOne({
      referralCode: normalized,
      isDeleted: false,
      isActive: true,
      role: 'user',
    })
      .select('_id name phone_no referralCode')
      .lean();
    if (!referrer) throw new ApiError(400, 'Invalid referral code');
    return { referrer, referrerRole: REFERRAL_ROLE.USER, normalized };
  }

  if (expectedReferredRole === REFERRAL_ROLE.DRIVER) {
    if (!isDriverReferralCode(normalized)) {
      throw new ApiError(400, 'Invalid referral code');
    }
    const referrer = await Driver.findOne({
      referralCode: normalized,
      isDeleted: false,
      approvalStatus: 'approved',
    })
      .select('_id name phone referralCode approvalStatus')
      .lean();
    if (!referrer) throw new ApiError(400, 'Invalid referral code');
    return { referrer, referrerRole: REFERRAL_ROLE.DRIVER, normalized };
  }

  throw new ApiError(400, 'Invalid referral role');
}

export async function validateReferralCodeService(code, expectedReferredRole) {
  const settings = await getReferralSettingsService();
  const roleKey = expectedReferredRole === REFERRAL_ROLE.DRIVER ? 'driver' : 'user';
  if (!settings[roleKey]?.enabled) {
    throw new ApiError(400, 'Referral program is currently unavailable');
  }
  const { referrer, referrerRole, normalized } = await findReferrerByCode(code, expectedReferredRole);
  return {
    valid: true,
    referralCode: normalized,
    referrerRole,
    referrerName: referrer.name || '',
  };
}

async function assertNoExistingReferral(referredId, referredRole) {
  const existing = await Referral.findOne({ referredId, referredRole }).lean();
  if (existing) {
    throw new ApiError(400, 'A referral is already linked to this account');
  }
}

async function assertNotSelfReferral(referrer, referrerRole, referredEntity, referredRole) {
  if (String(referrer._id) === String(referredEntity._id)) {
    throw new ApiError(400, 'You cannot use your own referral code');
  }
  const referrerPhone = referrerRole === REFERRAL_ROLE.USER ? referrer.phone_no : referrer.phone;
  const referredPhone =
    referredRole === REFERRAL_ROLE.USER ? referredEntity.phone_no : referredEntity.phone;
  if (referrerPhone && referredPhone && referrerPhone === referredPhone) {
    throw new ApiError(400, 'You cannot use your own referral code');
  }
}

export async function applyUserReferralOnRegistration(user, referralCodeRaw) {
  const code = normalizeReferralCode(referralCodeRaw);
  if (!code) return null;

  const settings = await getReferralSettingsService();
  if (!settings.user.enabled) {
    throw new ApiError(400, 'Referral program is currently unavailable');
  }

  await assertNoExistingReferral(user._id, REFERRAL_ROLE.USER);

  const { referrer, referrerRole, normalized } = await findReferrerByCode(code, REFERRAL_ROLE.USER);
  await assertNotSelfReferral(referrer, referrerRole, user, REFERRAL_ROLE.USER);

  await User.updateOne({ _id: user._id }, { $set: { referredBy: referrer._id } });

  const minBookingAmountRupees = round2(settings.user.minBookingAmountRupees);
  const shouldCreditImmediately = minBookingAmountRupees <= 0;

  const referral = await Referral.create({
    referrerId: referrer._id,
    referrerRole,
    referredId: user._id,
    referredRole: REFERRAL_ROLE.USER,
    referralCode: normalized,
    status: shouldCreditImmediately ? REFERRAL_STATUS.QUALIFIED : REFERRAL_STATUS.PENDING,
    referrerRewardRupees: round2(settings.user.referrerRewardRupees),
    referredRewardRupees: round2(settings.user.referredRewardRupees),
    qualificationType: REFERRAL_QUALIFICATION.FIRST_COMPLETED_BOOKING,
    minBookingAmountRupees,
    requiredCompletedTrips: 1,
    ...(shouldCreditImmediately ? { qualifiedAt: new Date() } : {}),
  });

  if (shouldCreditImmediately) {
    await rewardReferralIfEligible(referral._id).catch((err) =>
      console.warn('[referral] immediate user reward failed:', err?.message),
    );
  }

  return referral;
}

/**
 * Driver referrals are deferred until admin approval.
 * Store validated code on the driver doc; Referral row is created on approve.
 */
export async function storeDriverAppliedReferralCode(driver, referralCodeRaw) {
  const code = normalizeReferralCode(referralCodeRaw);
  if (!code) return;

  const settings = await getReferralSettingsService();
  if (!settings.driver.enabled) {
    throw new ApiError(400, 'Referral program is currently unavailable');
  }

  if (driver.appliedReferralCode) {
    throw new ApiError(400, 'A referral code is already linked to this account');
  }

  const existingReferral = await Referral.findOne({
    referredId: driver._id,
    referredRole: REFERRAL_ROLE.DRIVER,
  }).lean();
  if (existingReferral) {
    throw new ApiError(400, 'A referral is already linked to this account');
  }

  const { referrer, referrerRole, normalized } = await findReferrerByCode(code, REFERRAL_ROLE.DRIVER);
  await assertNotSelfReferral(referrer, referrerRole, driver, REFERRAL_ROLE.DRIVER);

  driver.appliedReferralCode = normalized;
  driver.referredBy = referrer._id;
  await driver.save();
}

export async function createDriverReferralOnApproval(driver) {
  const code = normalizeReferralCode(driver.appliedReferralCode);
  if (!code) return null;

  const settings = await getReferralSettingsService();
  if (!settings.driver.enabled) {
    driver.appliedReferralCode = '';
    await driver.save();
    return null;
  }

  const existing = await Referral.findOne({
    referredId: driver._id,
    referredRole: REFERRAL_ROLE.DRIVER,
  }).lean();
  if (existing) return existing;

  let referrer;
  try {
    ({ referrer } = await findReferrerByCode(code, REFERRAL_ROLE.DRIVER));
  } catch {
    driver.appliedReferralCode = '';
    driver.referredBy = null;
    await driver.save();
    return null;
  }

  await assertNotSelfReferral(referrer, REFERRAL_ROLE.DRIVER, driver, REFERRAL_ROLE.DRIVER);

  const requiredCompletedTrips = Number(settings.driver.requiredCompletedTrips) || 0;
  const shouldCreditImmediately = requiredCompletedTrips <= 0;

  const referral = await Referral.create({
    referrerId: referrer._id,
    referrerRole: REFERRAL_ROLE.DRIVER,
    referredId: driver._id,
    referredRole: REFERRAL_ROLE.DRIVER,
    referralCode: code,
    status: shouldCreditImmediately ? REFERRAL_STATUS.QUALIFIED : REFERRAL_STATUS.PENDING,
    referrerRewardRupees: round2(settings.driver.referrerRewardRupees),
    referredRewardRupees: round2(settings.driver.referredRewardRupees),
    qualificationType: REFERRAL_QUALIFICATION.COMPLETED_TRIPS,
    requiredCompletedTrips,
    completedTripsCount: 0,
    ...(shouldCreditImmediately ? { qualifiedAt: new Date() } : {}),
  });

  driver.appliedReferralCode = '';
  await driver.save();

  if (shouldCreditImmediately) {
    await rewardReferralIfEligible(referral._id).catch((err) =>
      console.warn('[referral] immediate driver reward failed:', err?.message),
    );
  }

  return referral;
}

export async function clearDriverAppliedReferralOnRejection(driver) {
  driver.appliedReferralCode = '';
  driver.referredBy = null;
  await driver.save();

  await Referral.updateOne(
    {
      referredId: driver._id,
      referredRole: REFERRAL_ROLE.DRIVER,
      status: REFERRAL_STATUS.PENDING,
    },
    {
      $set: {
        status: REFERRAL_STATUS.REJECTED,
        rejectionReason: 'Driver application rejected',
      },
    },
  );
}

function bookingFareRupees(booking) {
  const snap = booking?.fareSnapshot || {};
  const candidates = [
    snap.totalRupees,
    snap.grandTotalRupees,
    snap.payableRupees,
    snap.finalRupees,
    snap.estimatedRupees,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return round2(n);
  }
  return 0;
}

export async function handleUserBookingCompleted(booking) {
  if (!booking?.userId) return;

  const referral = await Referral.findOne({
    referredId: booking.userId,
    referredRole: REFERRAL_ROLE.USER,
    status: REFERRAL_STATUS.PENDING,
    qualificationType: REFERRAL_QUALIFICATION.FIRST_COMPLETED_BOOKING,
  });
  if (!referral) return;

  const fare = bookingFareRupees(booking);
  if (fare < round2(referral.minBookingAmountRupees || 0)) return;

  const qualified = await Referral.findOneAndUpdate(
    { _id: referral._id, status: REFERRAL_STATUS.PENDING },
    {
      $set: {
        status: REFERRAL_STATUS.QUALIFIED,
        qualifiedAt: new Date(),
        qualificationBookingId: booking._id,
      },
    },
    { new: true },
  );
  if (!qualified) return;

  await rewardReferralIfEligible(qualified._id).catch((err) =>
    console.warn('[referral] user reward failed:', err?.message),
  );
}

export async function handleDriverTripCompleted(booking) {
  if (!booking?.driverId) return;

  const driver = await Driver.findById(booking.driverId).select('approvalStatus').lean();
  if (!driver || driver.approvalStatus !== 'approved') return;

  const referral = await Referral.findOne({
    referredId: booking.driverId,
    referredRole: REFERRAL_ROLE.DRIVER,
    status: REFERRAL_STATUS.PENDING,
    qualificationType: REFERRAL_QUALIFICATION.COMPLETED_TRIPS,
  });
  if (!referral) return;

  const updated = await Referral.findOneAndUpdate(
    { _id: referral._id, status: REFERRAL_STATUS.PENDING },
    { $inc: { completedTripsCount: 1 } },
    { new: true },
  );
  if (!updated) return;

  if (updated.completedTripsCount < updated.requiredCompletedTrips) return;

  const qualified = await Referral.findOneAndUpdate(
    { _id: updated._id, status: REFERRAL_STATUS.PENDING },
    {
      $set: {
        status: REFERRAL_STATUS.QUALIFIED,
        qualifiedAt: new Date(),
        qualificationBookingId: booking._id,
      },
    },
    { new: true },
  );
  if (!qualified) return;

  await rewardReferralIfEligible(qualified._id).catch((err) =>
    console.warn('[referral] driver reward failed:', err?.message),
  );
}

async function creditDriverReferralReward({
  driverId,
  amount,
  referralId,
  description,
  rewardKind = 'referrer',
}) {
  const amt = round2(amount);
  if (amt <= 0) return null;

  const existingPayment = await Payment.findOne({
    referenceId: referralId,
    referenceModel: 'Referral',
    purpose: PAYMENT_PURPOSE.REFERRAL_REWARD,
    driverId,
    'meta.rewardKind': rewardKind,
  }).lean();
  if (existingPayment) return existingPayment;

  const updated = await Driver.findOneAndUpdate(
    { _id: driverId, isDeleted: false },
    { $inc: { 'wallet.balance': amt, 'wallet.totalEarnings': amt } },
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) throw new ApiError(404, 'Driver not found');

  return Payment.create({
    provider: PAYMENT_PROVIDER.WALLET,
    purpose: PAYMENT_PURPOSE.REFERRAL_REWARD,
    referenceId: referralId,
    referenceModel: 'Referral',
    amount: amt,
    currency: 'INR',
    status: 'captured',
    method: 'wallet',
    driverId,
    meta: {
      balanceAfter: round2(updated.wallet?.balance || 0),
      description: description ? String(description).slice(0, 280) : '',
      rewardKind,
    },
  });
}

export async function rewardReferralIfEligible(referralId) {
  const referral = await Referral.findById(referralId);
  if (!referral) return null;
  if (referral.status === REFERRAL_STATUS.REWARDED) return referral;
  if (referral.status !== REFERRAL_STATUS.QUALIFIED) return referral;

  const alreadyPaid =
    referral.walletTransactionId ||
    referral.driverPaymentId ||
    (await WalletTransaction.exists({
      refType: 'Referral',
      refId: String(referral._id),
      source: WALLET_TXN_SOURCE.REFERRAL_REWARD,
    })) ||
    (await Payment.exists({
      referenceId: referral._id,
      referenceModel: 'Referral',
      purpose: PAYMENT_PURPOSE.REFERRAL_REWARD,
    }));
  if (alreadyPaid) {
    if (referral.status !== REFERRAL_STATUS.REWARDED) {
      referral.status = REFERRAL_STATUS.REWARDED;
      referral.rewardedAt = referral.rewardedAt || new Date();
      await referral.save();
    }
    return referral;
  }

  const referredName = await resolveReferredName(referral);
  const description = referredName
    ? `Referral reward from ${referredName}`
    : 'Referral reward';

  let walletTransactionId = null;
  let driverPaymentId = null;

  if (referral.referrerRole === REFERRAL_ROLE.USER && referral.referrerRewardRupees > 0) {
    const txn = await creditWalletService({
      userId: referral.referrerId,
      amount: referral.referrerRewardRupees,
      source: WALLET_TXN_SOURCE.REFERRAL_REWARD,
      description,
      refType: 'Referral',
      refId: String(referral._id),
    });
    walletTransactionId = txn._id;
  } else if (referral.referrerRole === REFERRAL_ROLE.DRIVER && referral.referrerRewardRupees > 0) {
    const payment = await creditDriverReferralReward({
      driverId: referral.referrerId,
      amount: referral.referrerRewardRupees,
      referralId: referral._id,
      description,
      rewardKind: 'referrer',
    });
    driverPaymentId = payment?._id || null;
  }

  if (referral.referredRewardRupees > 0) {
    if (referral.referredRole === REFERRAL_ROLE.USER) {
      await creditWalletService({
        userId: referral.referredId,
        amount: referral.referredRewardRupees,
        source: WALLET_TXN_SOURCE.REFERRAL_REWARD,
        description: 'Welcome referral bonus',
        refType: 'Referral',
        refId: `${String(referral._id)}:referred`,
      });
    } else if (referral.referredRole === REFERRAL_ROLE.DRIVER) {
      await creditDriverReferralReward({
        driverId: referral.referredId,
        amount: referral.referredRewardRupees,
        referralId: referral._id,
        description: 'Welcome referral bonus',
        rewardKind: 'referred',
      });
    }
  }

  const rewarded = await Referral.findOneAndUpdate(
    { _id: referral._id, status: REFERRAL_STATUS.QUALIFIED },
    {
      $set: {
        status: REFERRAL_STATUS.REWARDED,
        rewardedAt: new Date(),
        walletTransactionId,
        driverPaymentId,
      },
    },
    { new: true },
  );

  if (rewarded && referral.referrerRewardRupees > 0) {
    const { notifyReferralReward } = await import('../utils/notificationDispatch.js');
    notifyReferralReward({
      referrerId: referral.referrerId,
      referrerRole: referral.referrerRole,
      amountRupees: referral.referrerRewardRupees,
      referredName,
    }).catch(() => null);
  }

  return rewarded;
}

async function resolveReferredName(referral) {
  if (referral.referredRole === REFERRAL_ROLE.USER) {
    const u = await User.findById(referral.referredId).select('name').lean();
    return u?.name || '';
  }
  const d = await Driver.findById(referral.referredId).select('name').lean();
  return d?.name || '';
}

export async function getMyReferralSummaryService(accountId, role) {
  const code =
    role === REFERRAL_ROLE.DRIVER
      ? await ensureDriverReferralCode(accountId)
      : await ensureUserReferralCode(accountId);

  const settings = await getReferralSettingsService();
  const roleSettings = role === REFERRAL_ROLE.DRIVER ? settings.driver : settings.user;

  const referrals = await Referral.find({ referrerId: accountId, referrerRole: role }).lean();
  const totalEarned = referrals
    .filter((r) => r.status === REFERRAL_STATUS.REWARDED)
    .reduce((sum, r) => sum + round2(r.referrerRewardRupees || 0), 0);
  const pending = referrals
    .filter((r) => r.status === REFERRAL_STATUS.PENDING || r.status === REFERRAL_STATUS.QUALIFIED)
    .reduce((sum, r) => sum + round2(r.referrerRewardRupees || 0), 0);

  return {
    referralCode: code,
    settings: roleSettings,
    stats: {
      totalReferrals: referrals.length,
      successfulReferrals: referrals.filter((r) => r.status === REFERRAL_STATUS.REWARDED).length,
      totalEarned: round2(totalEarned),
      pending: round2(pending),
    },
  };
}

export async function listMyReferralsService(accountId, role, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const filter = { referrerId: accountId, referrerRole: role };

  const [rows, total] = await Promise.all([
    Referral.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Referral.countDocuments(filter),
  ]);

  const referredIds = rows.map((r) => r.referredId);
  let nameMap = new Map();
  if (role === REFERRAL_ROLE.USER || rows.some((r) => r.referredRole === REFERRAL_ROLE.USER)) {
    const users = await User.find({ _id: { $in: referredIds } }).select('name').lean();
    users.forEach((u) => nameMap.set(String(u._id), u.name));
  }
  if (role === REFERRAL_ROLE.DRIVER || rows.some((r) => r.referredRole === REFERRAL_ROLE.DRIVER)) {
    const drivers = await Driver.find({ _id: { $in: referredIds } }).select('name').lean();
    drivers.forEach((d) => nameMap.set(String(d._id), d.name));
  }

  const referrals = rows.map((r) => ({
    id: r._id,
    referredName: nameMap.get(String(r.referredId)) || '—',
    status: r.status,
    rewardRupees: round2(r.referrerRewardRupees || 0),
    createdAt: r.createdAt,
    qualifiedAt: r.qualifiedAt,
    rewardedAt: r.rewardedAt,
  }));

  return { referrals, total, page: safePage, limit: safeLimit };
}

function buildAdminReferralFilter(query = {}) {
  const filter = {};
  if (query.role === REFERRAL_ROLE.USER || query.role === REFERRAL_ROLE.DRIVER) {
    filter.referrerRole = query.role;
  }
  if (query.status && Object.values(REFERRAL_STATUS).includes(query.status)) {
    filter.status = query.status;
  }
  if (query.referralCode) {
    filter.referralCode = normalizeReferralCode(query.referralCode);
  }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  return filter;
}

export async function adminListReferralsService(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const filter = buildAdminReferralFilter(query);

  if (query.referrerId && mongoose.Types.ObjectId.isValid(query.referrerId)) {
    filter.referrerId = query.referrerId;
  }
  if (query.referredId && mongoose.Types.ObjectId.isValid(query.referredId)) {
    filter.referredId = query.referredId;
  }

  const [rows, total] = await Promise.all([
    Referral.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Referral.countDocuments(filter),
  ]);

  const statsAgg = await Referral.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        rewards: { $sum: '$referrerRewardRupees' },
      },
    },
  ]);

  const stats = {
    total: 0,
    pending: 0,
    qualified: 0,
    rewarded: 0,
    rejected: 0,
    totalRewardsPaid: 0,
    userReferrals: 0,
    driverReferrals: 0,
  };

  const statusCounts = Object.fromEntries(statsAgg.map((s) => [s._id, s]));
  stats.pending = statusCounts[REFERRAL_STATUS.PENDING]?.count || 0;
  stats.qualified = statusCounts[REFERRAL_STATUS.QUALIFIED]?.count || 0;
  stats.rewarded = statusCounts[REFERRAL_STATUS.REWARDED]?.count || 0;
  stats.rejected = statusCounts[REFERRAL_STATUS.REJECTED]?.count || 0;
  stats.total = stats.pending + stats.qualified + stats.rewarded + stats.rejected + (statusCounts[REFERRAL_STATUS.EXPIRED]?.count || 0);
  stats.totalRewardsPaid = round2(statusCounts[REFERRAL_STATUS.REWARDED]?.rewards || 0);

  const roleAgg = await Referral.aggregate([{ $group: { _id: '$referrerRole', count: { $sum: 1 } } }]);
  roleAgg.forEach((r) => {
    if (r._id === REFERRAL_ROLE.USER) stats.userReferrals = r.count;
    if (r._id === REFERRAL_ROLE.DRIVER) stats.driverReferrals = r.count;
  });

  const enriched = await enrichReferralsForAdmin(rows);
  return {
    referrals: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    stats,
  };
}

async function enrichReferralsForAdmin(rows) {
  const userIds = new Set();
  const driverIds = new Set();
  rows.forEach((r) => {
    if (r.referrerRole === REFERRAL_ROLE.USER) userIds.add(String(r.referrerId));
    else driverIds.add(String(r.referrerId));
    if (r.referredRole === REFERRAL_ROLE.USER) userIds.add(String(r.referredId));
    else driverIds.add(String(r.referredId));
  });

  const [users, drivers] = await Promise.all([
    userIds.size
      ? User.find({ _id: { $in: [...userIds] } }).select('name phone_no email').lean()
      : [],
    driverIds.size
      ? Driver.find({ _id: { $in: [...driverIds] } }).select('name phone email').lean()
      : [],
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const driverMap = new Map(drivers.map((d) => [String(d._id), d]));

  const pickEntity = (id, role) => {
    if (role === REFERRAL_ROLE.USER) return userMap.get(String(id));
    return driverMap.get(String(id));
  };

  return rows.map((r) => {
    const referrer = pickEntity(r.referrerId, r.referrerRole);
    const referred = pickEntity(r.referredId, r.referredRole);
    return {
      ...r,
      referrerName: referrer?.name || '—',
      referrerPhone: referrer?.phone_no || referrer?.phone || '',
      referredName: referred?.name || '—',
      referredPhone: referred?.phone_no || referred?.phone || '',
    };
  });
}

export async function adminGetReferralByIdService(id) {
  const referral = await Referral.findById(id).lean();
  if (!referral) throw new ApiError(404, 'Referral not found');
  const [enriched] = await enrichReferralsForAdmin([referral]);
  return enriched;
}

export async function adminRejectReferralService(staff, id, reason) {
  const note = String(reason || '').trim();
  if (note.length < 5) {
    throw new ApiError(400, 'Rejection reason is required (minimum 5 characters)');
  }

  const referral = await Referral.findOneAndUpdate(
    {
      _id: id,
      status: { $in: [REFERRAL_STATUS.PENDING, REFERRAL_STATUS.QUALIFIED] },
    },
    {
      $set: {
        status: REFERRAL_STATUS.REJECTED,
        rejectionReason: note.slice(0, 280),
      },
    },
    { new: true },
  );
  if (!referral) throw new ApiError(400, 'Referral cannot be rejected in its current state');
  return referral;
}
