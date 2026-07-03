import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import Booking from '../models/booking.model.js';
import {
  WITHDRAWAL_STATUS,
  MIN_DRIVER_WALLET_BALANCE_RUPEES,
} from '../constants/withdrawal.js';
import { ACTIVE_BOOKING_STATUSES } from '../constants/bookingStatus.js';
import { ApiError } from '../utils/apiError.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import {
  debitDriverWalletService,
  computeDriverWithdrawable,
} from './driverWallet.service.js';
import {
  notifyDriverWithdrawalRequested,
  notifyDriverWithdrawalRejected,
  notifyDriverWithdrawalProcessed,
  notifyAdminWithdrawalRequest,
} from '../utils/notificationDispatch.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function assertNoActiveTrip(driverId) {
  const active = await Booking.exists({
    driverId,
    isDeleted: false,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  });
  if (active) {
    throw new ApiError(409, 'Complete or cancel your active trip before requesting a withdrawal');
  }
}

async function assertNoPendingWithdrawal(driverId) {
  const pending = await WithdrawalRequest.exists({
    driverId,
    status: WITHDRAWAL_STATUS.PENDING,
  });
  if (pending) {
    throw new ApiError(409, 'You already have a pending withdrawal request');
  }
}

async function loadDriverWallet(driverId) {
  const driver = await Driver.findById(driverId).select('wallet name phone isDeleted').lean();
  if (!driver || driver.isDeleted) throw new ApiError(404, 'Driver not found');
  return driver;
}

function validateWithdrawAmount(balance, amount, { fullSettlement = false } = {}) {
  const amt = round2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new ApiError(400, 'Withdrawal amount must be greater than zero');
  }
  const max = computeDriverWithdrawable(balance, { fullSettlement });
  if (amt > max) {
    if (fullSettlement) {
      throw new ApiError(400, `Amount cannot exceed wallet balance of ₹${round2(balance)}`);
    }
    throw new ApiError(400, `Maximum withdrawable amount is ₹${max} (₹${MIN_DRIVER_WALLET_BALANCE_RUPEES} minimum balance must remain)`);
  }
  return amt;
}

async function uploadQrImage(file) {
  if (!file?.buffer) return { url: '', publicId: '' };
  const result = await uploadToCloudinary(file.buffer, 'sparedriver/withdrawal-qr');
  return { url: result.secure_url || '', publicId: result.public_id || '' };
}

export async function getDriverWithdrawalLimitsService(driverId) {
  const driver = await loadDriverWallet(driverId);
  const balance = round2(driver.wallet?.balance || 0);
  return {
    balance,
    minBalance: MIN_DRIVER_WALLET_BALANCE_RUPEES,
    maxWithdrawable: computeDriverWithdrawable(balance),
    maxFullSettlement: balance,
    hasPendingRequest: Boolean(
      await WithdrawalRequest.exists({ driverId, status: WITHDRAWAL_STATUS.PENDING }),
    ),
  };
}

export async function createDriverWithdrawalService(
  driverId,
  { amount, qrFile, isFullSettlement = false, accountDeletionRequestId = null } = {},
) {
  await assertNoActiveTrip(driverId);
  await assertNoPendingWithdrawal(driverId);

  const driver = await loadDriverWallet(driverId);
  const balance = round2(driver.wallet?.balance || 0);
  const amountRupees = validateWithdrawAmount(balance, amount, { fullSettlement: isFullSettlement });

  const qrImage = qrFile ? await uploadQrImage(qrFile) : { url: '', publicId: '' };

  const withdrawal = await WithdrawalRequest.create({
    driverId,
    amountRupees,
    walletBalanceAtRequest: balance,
    isFullSettlement: Boolean(isFullSettlement),
    accountDeletionRequestId: accountDeletionRequestId || null,
    qrImage,
    status: WITHDRAWAL_STATUS.PENDING,
  });

  notifyDriverWithdrawalRequested(driverId, {
    amountRupees,
    withdrawalId: String(withdrawal._id),
  }).catch(() => null);
  notifyAdminWithdrawalRequest({
    driverId,
    amountRupees,
    withdrawalId: String(withdrawal._id),
  }).catch(() => null);

  return withdrawal.toObject();
}

export async function listDriverWithdrawalsService(driverId, { page = 1, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const filter = { driverId };
  const [withdrawals, total] = await Promise.all([
    WithdrawalRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    WithdrawalRequest.countDocuments(filter),
  ]);
  return { withdrawals, total, page: safePage, limit: safeLimit };
}

export async function listWithdrawalsAdminService({
  page = 1,
  limit = 20,
  status = '',
  search = '',
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const filter = {};
  if (status) filter.status = status;

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
  ];

  if (search?.trim()) {
    const q = search.trim();
    pipeline.push({
      $match: {
        $or: [
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
              driverId: 1,
              amountRupees: 1,
              walletBalanceAtRequest: 1,
              status: 1,
              qrImage: 1,
              paymentProof: 1,
              transactionDetails: 1,
              isFullSettlement: 1,
              accountDeletionRequestId: 1,
              processedAt: 1,
              rejectedAt: 1,
              rejectionReason: 1,
              adminNotes: 1,
              createdAt: 1,
              updatedAt: 1,
              driverName: '$driver.name',
              driverPhone: '$driver.phone',
            },
          },
        ],
        total: [{ $count: 'count' }],
        totals: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amountRupees' },
            },
          },
        ],
      },
    },
  );

  const [result] = await WithdrawalRequest.aggregate(pipeline);
  const withdrawals = result?.rows || [];
  const total = result?.total?.[0]?.count || 0;
  const byStatus = {};
  for (const row of result?.totals || []) {
    byStatus[row._id] = { count: row.count, amount: round2(row.amount) };
  }

  return {
    withdrawals,
    total,
    page: safePage,
    limit: safeLimit,
    totals: {
      totalCount: total,
      byStatus,
    },
  };
}

export async function rejectWithdrawalAdminService(withdrawalId, { reason = '' } = {}, admin = null) {
  const withdrawal = await WithdrawalRequest.findById(withdrawalId);
  if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found');
  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    throw new ApiError(409, 'Only pending withdrawal requests can be rejected');
  }

  withdrawal.status = WITHDRAWAL_STATUS.REJECTED;
  withdrawal.rejectedAt = new Date();
  withdrawal.rejectionReason = String(reason || '').slice(0, 500);
  if (admin?._id) withdrawal.processedBy = admin._id;
  await withdrawal.save();

  notifyDriverWithdrawalRejected(withdrawal.driverId, {
    reason: withdrawal.rejectionReason,
    withdrawalId: String(withdrawal._id),
  }).catch(() => null);

  return withdrawal.toObject();
}

export async function processWithdrawalAdminService(
  withdrawalId,
  { proofFile, transactionDetails = {}, adminNotes = '' } = {},
  admin = null,
) {
  const withdrawal = await WithdrawalRequest.findById(withdrawalId);
  if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found');
  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    throw new ApiError(409, 'Only pending withdrawal requests can be processed');
  }

  if (!proofFile?.buffer) {
    throw new ApiError(400, 'Payment proof image is required');
  }

  const proofResult = await uploadToCloudinary(proofFile.buffer, 'sparedriver/withdrawal-proof');

  const walletResult = await debitDriverWalletService({
    driverId: withdrawal.driverId,
    amount: withdrawal.amountRupees,
    withdrawalId: withdrawal._id,
    initiatedBy: admin?._id,
  });

  withdrawal.status = WITHDRAWAL_STATUS.PROCESSED;
  withdrawal.processedAt = new Date();
  withdrawal.paymentProof = {
    url: proofResult.secure_url || '',
    publicId: proofResult.public_id || '',
  };
  withdrawal.transactionDetails = {
    mode: String(transactionDetails.mode || '').slice(0, 80),
    transactionId: String(transactionDetails.transactionId || '').slice(0, 120),
    utr: String(transactionDetails.utr || '').slice(0, 120),
    referenceNumber: String(transactionDetails.referenceNumber || '').slice(0, 120),
    paidAt: transactionDetails.paidAt ? new Date(transactionDetails.paidAt) : new Date(),
    notes: String(transactionDetails.notes || '').slice(0, 500),
  };
  withdrawal.adminNotes = String(adminNotes || '').slice(0, 500);
  if (admin?._id) withdrawal.processedBy = admin._id;
  await withdrawal.save();

  notifyDriverWithdrawalProcessed(withdrawal.driverId, {
    amountRupees: withdrawal.amountRupees,
    withdrawalId: String(withdrawal._id),
  }).catch(() => null);

  return { withdrawal: withdrawal.toObject(), wallet: walletResult };
}
