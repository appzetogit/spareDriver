import AccountDeletionRequest from '../models/accountDeletionRequest.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import {
  ACCOUNT_DELETION_STATUS,
  ACCOUNT_DELETION_SUBJECT,
  WITHDRAWAL_STATUS,
} from '../constants/withdrawal.js';
import { ACTIVE_BOOKING_STATUSES } from '../constants/bookingStatus.js';
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
} from '../constants/serviceTypes.js';
import { ApiError } from '../utils/apiError.js';
import { debitWalletService } from './wallet.service.js';
import { WALLET_TXN_SOURCE } from '../models/walletTransaction.model.js';
import Refund, { REFUND_KIND, REFUND_STATUS, REFUND_INITIATED_BY } from '../models/refund.model.js';
import { createDriverWithdrawalService } from './withdrawal.service.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function assertNoActiveBookingForUser(userId) {
  const active = await Booking.exists({
    userId,
    isDeleted: false,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  });
  if (active) {
    throw new ApiError(409, 'Complete or cancel your active booking before deleting your account');
  }
}

async function assertNoActiveTripForDriver(driverId) {
  const active = await Booking.exists({
    driverId,
    isDeleted: false,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  });
  if (active) {
    throw new ApiError(409, 'Complete or cancel your active trip before deleting your account');
  }
}

async function assertNoActiveSubscriptionForUser(userId) {
  const active = await UserSubscription.exists({
    userId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
  });
  if (active) {
    throw new ApiError(
      409,
      'Cancel or expire your active subscription before deleting your account',
    );
  }
}

async function assertNoActiveSubscriptionForDriver(driverId) {
  const active = await UserSubscription.exists({
    assignedDriverId: driverId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
  });
  if (active) {
    throw new ApiError(
      409,
      'You are assigned to an active subscription. Ask admin to release you before deleting your account',
    );
  }
}

/**
 * Returns everything that must be cleared before an account can be deleted.
 * Wallet must be ₹0, no active trips, no active subscriptions.
 */
export async function getAccountDeletionBlockersService({ userId, driverId, subjectType }) {
  const blockers = [];

  if (subjectType === ACCOUNT_DELETION_SUBJECT.USER) {
    const user = await User.findById(userId).select('wallet').lean();
    const balance = round2(user?.wallet?.balance || 0);
    const heldRupees = round2(user?.wallet?.heldRupees || 0);

    if (balance > 0) {
      blockers.push({
        code: 'wallet_balance',
        message: `Wallet balance ₹${balance} must be settled to zero`,
        amountRupees: balance,
      });
    }
    if (heldRupees > 0) {
      blockers.push({
        code: 'wallet_held',
        message: `₹${heldRupees} is held against active bookings — resolve trips first`,
        amountRupees: heldRupees,
      });
    }

    const activeBooking = await Booking.findOne({
      userId,
      isDeleted: false,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    })
      .select('bookingNumber status')
      .lean();
    if (activeBooking) {
      blockers.push({
        code: 'active_trip',
        message: `Active booking ${activeBooking.bookingNumber || ''} (${activeBooking.status})`,
        bookingId: String(activeBooking._id),
        bookingNumber: activeBooking.bookingNumber || '',
        status: activeBooking.status,
      });
    }

    const activeSub = await UserSubscription.findOne({
      userId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
    })
      .select('planNameSnapshot status assignmentStatus')
      .lean();
    if (activeSub) {
      blockers.push({
        code: 'active_subscription',
        message: `Active subscription: ${activeSub.planNameSnapshot || 'plan'}`,
        subscriptionId: String(activeSub._id),
        status: activeSub.status,
      });
    }
  } else {
    const driver = await Driver.findById(driverId).select('wallet').lean();
    const balance = round2(driver?.wallet?.balance || 0);
    if (balance > 0) {
      blockers.push({
        code: 'wallet_balance',
        message: `Wallet balance ₹${balance} must be settled to zero`,
        amountRupees: balance,
      });
    }

    const pendingWithdrawal = await WithdrawalRequest.findOne({
      driverId,
      status: WITHDRAWAL_STATUS.PENDING,
    })
      .select('amountRupees')
      .lean();
    if (pendingWithdrawal) {
      blockers.push({
        code: 'pending_withdrawal',
        message: `Pending withdrawal of ₹${pendingWithdrawal.amountRupees} must be processed`,
        withdrawalId: String(pendingWithdrawal._id),
      });
    }

    const activeTrip = await Booking.findOne({
      driverId,
      isDeleted: false,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    })
      .select('bookingNumber status')
      .lean();
    if (activeTrip) {
      blockers.push({
        code: 'active_trip',
        message: `Active trip ${activeTrip.bookingNumber || ''} (${activeTrip.status})`,
        bookingId: String(activeTrip._id),
        bookingNumber: activeTrip.bookingNumber || '',
        status: activeTrip.status,
      });
    }

    const activeSub = await UserSubscription.findOne({
      assignedDriverId: driverId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      assignmentStatus: SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED,
    })
      .select('planNameSnapshot')
      .lean();
    if (activeSub) {
      blockers.push({
        code: 'active_subscription',
        message: `Assigned to active subscription: ${activeSub.planNameSnapshot || 'plan'}`,
        subscriptionId: String(activeSub._id),
      });
    }
  }

  return {
    blockers,
    canDelete: blockers.length === 0,
  };
}

async function assertDeletionClear({ userId, driverId, subjectType }) {
  const { blockers, canDelete } = await getAccountDeletionBlockersService({
    userId,
    driverId,
    subjectType,
  });
  if (!canDelete) {
    throw new ApiError(409, 'Account cannot be deleted until all blockers are resolved', {
      blockers,
    });
  }
}

async function assertNoPendingDeletion({ userId, driverId, subjectType }) {
  const filter = {
    subjectType,
    status: { $in: [ACCOUNT_DELETION_STATUS.PENDING, ACCOUNT_DELETION_STATUS.IN_PROGRESS] },
  };
  if (subjectType === ACCOUNT_DELETION_SUBJECT.USER) filter.userId = userId;
  else filter.driverId = driverId;

  const existing = await AccountDeletionRequest.exists(filter);
  if (existing) {
    throw new ApiError(409, 'You already have a pending account deletion request');
  }
}

export async function getMyAccountDeletionRequestService({ userId, driverId, subjectType }) {
  const filter = { subjectType };
  if (subjectType === ACCOUNT_DELETION_SUBJECT.USER) filter.userId = userId;
  else filter.driverId = driverId;

  const request = await AccountDeletionRequest.findOne(filter)
    .sort({ createdAt: -1 })
    .lean();
  return request;
}

export async function requestUserAccountDeletionService(userId, { reason = '' } = {}) {
  const user = await User.findById(userId).select('wallet isDeleted').lean();
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  await assertNoPendingDeletion({ userId, subjectType: ACCOUNT_DELETION_SUBJECT.USER });

  const balance = round2(user.wallet?.balance || 0);
  const heldRupees = round2(user.wallet?.heldRupees || 0);

  const request = await AccountDeletionRequest.create({
    subjectType: ACCOUNT_DELETION_SUBJECT.USER,
    userId,
    reason: String(reason || '').slice(0, 500),
    walletBalanceAtRequest: balance,
    walletSettlementStatus: balance > 0 || heldRupees > 0 ? 'pending' : 'not_applicable',
    status: ACCOUNT_DELETION_STATUS.PENDING,
  });

  return request.toObject();
}

export async function requestDriverAccountDeletionService(
  driverId,
  { reason = '', withdrawAmount = null, qrFile = null } = {},
) {
  const driver = await Driver.findById(driverId).select('wallet isDeleted').lean();
  if (!driver || driver.isDeleted) throw new ApiError(404, 'Driver not found');

  await assertNoPendingDeletion({ driverId, subjectType: ACCOUNT_DELETION_SUBJECT.DRIVER });

  const balance = round2(driver.wallet?.balance || 0);

  const request = await AccountDeletionRequest.create({
    subjectType: ACCOUNT_DELETION_SUBJECT.DRIVER,
    driverId,
    reason: String(reason || '').slice(0, 500),
    walletBalanceAtRequest: balance,
    walletSettlementStatus: balance > 0 ? 'pending' : 'not_applicable',
    status: ACCOUNT_DELETION_STATUS.PENDING,
  });

  let withdrawal = null;
  if (balance > 0) {
    const amount = withdrawAmount != null ? withdrawAmount : balance;
    withdrawal = await createDriverWithdrawalService(driverId, {
      amount,
      qrFile,
      isFullSettlement: true,
      accountDeletionRequestId: request._id,
    });
    request.withdrawalRequestId = withdrawal._id;
    await request.save();
  }

  return { request: request.toObject(), withdrawal };
}

export async function listAccountDeletionsAdminService({
  page = 1,
  limit = 20,
  status = '',
  subjectType = '',
  search = '',
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const match = {};
  if (status) match.status = status;
  if (subjectType) match.subjectType = subjectType;

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
  ];

  if (search?.trim()) {
    const q = search.trim();
    pipeline.push({
      $match: {
        $or: [
          { 'user.name': { $regex: q, $options: 'i' } },
          { 'user.phone_no': { $regex: q, $options: 'i' } },
          { 'driver.name': { $regex: q, $options: 'i' } },
          { 'driver.phone': { $regex: q, $options: 'i' } },
        ],
      },
    });
  }

  pipeline.push(
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        rows: [
          { $skip: (safePage - 1) * safeLimit },
          { $limit: safeLimit },
          {
            $project: {
              subjectType: 1,
              userId: 1,
              driverId: 1,
              reason: 1,
              walletBalanceAtRequest: 1,
              status: 1,
              walletSettlementStatus: 1,
              withdrawalRequestId: 1,
              completedAt: 1,
              rejectedAt: 1,
              rejectionReason: 1,
              adminNotes: 1,
              createdAt: 1,
              subjectName: {
                $cond: [
                  { $eq: ['$subjectType', ACCOUNT_DELETION_SUBJECT.USER] },
                  '$user.name',
                  '$driver.name',
                ],
              },
              subjectPhone: {
                $cond: [
                  { $eq: ['$subjectType', ACCOUNT_DELETION_SUBJECT.USER] },
                  '$user.phone_no',
                  '$driver.phone',
                ],
              },
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  );

  const [result] = await AccountDeletionRequest.aggregate(pipeline);
  return {
    requests: result?.rows || [],
    total: result?.total?.[0]?.count || 0,
    page: safePage,
    limit: safeLimit,
  };
}

export async function rejectAccountDeletionAdminService(
  requestId,
  { reason = '', adminNotes = '' } = {},
  admin = null,
) {
  const request = await AccountDeletionRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Account deletion request not found');
  if (![ACCOUNT_DELETION_STATUS.PENDING, ACCOUNT_DELETION_STATUS.IN_PROGRESS].includes(request.status)) {
    throw new ApiError(409, 'This request can no longer be rejected');
  }

  request.status = ACCOUNT_DELETION_STATUS.REJECTED;
  request.rejectedAt = new Date();
  request.rejectionReason = String(reason || '').slice(0, 500);
  request.adminNotes = String(adminNotes || '').slice(0, 500);
  if (admin?._id) request.processedBy = admin._id;
  await request.save();

  if (request.withdrawalRequestId) {
    await WithdrawalRequest.updateOne(
      { _id: request.withdrawalRequestId, status: WITHDRAWAL_STATUS.PENDING },
      {
        $set: {
          status: WITHDRAWAL_STATUS.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: 'Account deletion request was rejected',
        },
      },
    );
  }

  return request.toObject();
}

export async function settleUserWalletForDeletionAdminService(
  requestId,
  { mode = '', transactionId = '', utr = '', referenceNumber = '', notes = '' } = {},
  admin = null,
) {
  const request = await AccountDeletionRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Account deletion request not found');
  if (request.subjectType !== ACCOUNT_DELETION_SUBJECT.USER) {
    throw new ApiError(400, 'Wallet settlement applies to user accounts only');
  }
  if (![ACCOUNT_DELETION_STATUS.PENDING, ACCOUNT_DELETION_STATUS.IN_PROGRESS].includes(request.status)) {
    throw new ApiError(409, 'This request is already finalized');
  }

  const txnId = String(transactionId || '').trim();
  const txnUtr = String(utr || '').trim();
  if (!txnId && !txnUtr) {
    throw new ApiError(400, 'Transaction ID or UTR is required');
  }

  const user = await User.findById(request.userId).select('wallet name').lean();
  if (!user) throw new ApiError(404, 'User not found');

  const balance = round2(user.wallet?.balance || 0);
  const heldRupees = round2(user.wallet?.heldRupees || 0);
  if (heldRupees > 0) {
    throw new ApiError(409, 'Cannot settle wallet while funds are held against active bookings');
  }
  if (balance <= 0) {
    request.walletSettlementStatus = 'settled';
    await request.save();
    return { settled: false, balance: 0, request: request.toObject() };
  }

  const existingRefund = await Refund.findOne({
    accountDeletionRequestId: request._id,
    kind: REFUND_KIND.WALLET_SETTLEMENT,
    status: REFUND_STATUS.PROCESSED,
  }).lean();
  if (existingRefund) {
    throw new ApiError(409, 'Wallet for this deletion request is already settled');
  }

  await debitWalletService({
    userId: request.userId,
    amount: balance,
    source: WALLET_TXN_SOURCE.ADMIN_DEBIT,
    description: `Account deletion wallet settlement — request ${request._id}`,
    refType: 'AccountDeletionRequest',
    refId: request._id,
    initiatedBy: admin?._id,
  });

  const refund = await Refund.create({
    kind: REFUND_KIND.WALLET_SETTLEMENT,
    userId: request.userId,
    accountDeletionRequestId: request._id,
    bookingNumber: 'WALLET-SETTLEMENT',
    amountRupees: balance,
    grossPaidRupees: balance,
    cancellationFeeRupees: 0,
    status: REFUND_STATUS.PROCESSED,
    initiatedBy: REFUND_INITIATED_BY.ADMIN,
    reason: 'account_deletion_wallet_settlement',
    processedAt: new Date(),
    razorpayRefundId: txnId || txnUtr,
    transactionDetails: {
      mode: String(mode || '').slice(0, 80),
      transactionId: txnId,
      utr: txnUtr,
      referenceNumber: String(referenceNumber || '').slice(0, 120),
      notes: String(notes || '').slice(0, 500),
    },
  });

  request.walletSettlementStatus = 'settled';
  await request.save();

  return {
    settled: true,
    balance,
    refund: refund.toObject(),
    request: request.toObject(),
  };
}

export async function getAccountDeletionBlockersAdminService(requestId) {
  const request = await AccountDeletionRequest.findById(requestId).lean();
  if (!request) throw new ApiError(404, 'Account deletion request not found');

  return getAccountDeletionBlockersService({
    userId: request.userId,
    driverId: request.driverId,
    subjectType: request.subjectType,
  });
}

export async function completeAccountDeletionAdminService(
  requestId,
  { adminNotes = '' } = {},
  admin = null,
) {
  const request = await AccountDeletionRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Account deletion request not found');
  if (![ACCOUNT_DELETION_STATUS.PENDING, ACCOUNT_DELETION_STATUS.IN_PROGRESS].includes(request.status)) {
    throw new ApiError(409, 'This request has already been finalized');
  }

  await assertDeletionClear({
    userId: request.userId,
    driverId: request.driverId,
    subjectType: request.subjectType,
  });

  if (request.subjectType === ACCOUNT_DELETION_SUBJECT.USER) {
    const user = await User.findById(request.userId).select('isDeleted').lean();
    if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

    await User.updateOne(
      { _id: request.userId },
      { $set: { isDeleted: true, isActive: false } },
    );
    request.walletSettlementStatus = 'settled';
  } else {
    const driver = await Driver.findById(request.driverId).select('isDeleted isOnline').lean();
    if (!driver || driver.isDeleted) throw new ApiError(404, 'Driver not found');

    await Driver.updateOne(
      { _id: request.driverId },
      { $set: { isDeleted: true, isOnline: false, canGoOnline: false } },
    );
    request.walletSettlementStatus = 'settled';
  }

  request.status = ACCOUNT_DELETION_STATUS.COMPLETED;
  request.completedAt = new Date();
  request.adminNotes = String(adminNotes || '').slice(0, 500);
  if (admin?._id) request.processedBy = admin._id;
  await request.save();

  return request.toObject();
}

export async function markAccountDeletionInProgressAdminService(requestId, admin = null) {
  const request = await AccountDeletionRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Account deletion request not found');
  if (request.status !== ACCOUNT_DELETION_STATUS.PENDING) {
    throw new ApiError(409, 'Only pending requests can be marked in progress');
  }
  request.status = ACCOUNT_DELETION_STATUS.IN_PROGRESS;
  if (admin?._id) request.processedBy = admin._id;
  await request.save();
  return request.toObject();
}
