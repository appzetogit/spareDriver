import { Driver } from '../models/driverModels/driver.model.js';
import Payment from '../models/payment.model.js';
import { PAYMENT_PROVIDER, PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { MIN_DRIVER_WALLET_BALANCE_RUPEES } from '../constants/withdrawal.js';
import { ApiError } from '../utils/apiError.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function ensurePositive(amount, label = 'amount') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a positive number`);
  }
  return round2(n);
}

/**
 * Atomically debit a driver's wallet and write a withdrawal ledger row.
 * Increments `wallet.totalWithdrawn` alongside the balance decrement.
 */
export async function debitDriverWalletService({
  driverId,
  amount,
  withdrawalId,
  initiatedBy = null,
}) {
  const amt = ensurePositive(amount, 'amount');
  const updated = await Driver.findOneAndUpdate(
    { _id: driverId, isDeleted: false, 'wallet.balance': { $gte: amt } },
    {
      $inc: {
        'wallet.balance': -amt,
        'wallet.totalWithdrawn': amt,
      },
    },
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) {
    throw new ApiError(402, 'Insufficient wallet balance for withdrawal');
  }

  await Payment.create({
    provider: PAYMENT_PROVIDER.WALLET,
    purpose: PAYMENT_PURPOSE.WITHDRAWAL,
    referenceId: withdrawalId,
    referenceModel: 'WithdrawalRequest',
    amount: amt,
    currency: 'INR',
    status: 'captured',
    method: 'manual_payout',
    driverId,
    meta: {
      balanceAfter: round2(updated.wallet?.balance || 0),
      initiatedBy: initiatedBy ? String(initiatedBy) : '',
    },
  });

  return {
    balance: round2(updated.wallet?.balance || 0),
    totalWithdrawn: round2(updated.wallet?.totalWithdrawn || 0),
  };
}

export async function creditDriverWalletService({
  driverId,
  amount,
  refundId,
  description = '',
  initiatedBy = null,
}) {
  const amt = ensurePositive(amount, 'amount');
  const updated = await Driver.findOneAndUpdate(
    { _id: driverId, isDeleted: false },
    {
      $inc: {
        'wallet.balance': amt,
        'wallet.totalEarnings': amt,
      },
    },
    { new: true, projection: { wallet: 1 } },
  );
  if (!updated) throw new ApiError(404, 'Driver not found');

  await Payment.create({
    provider: PAYMENT_PROVIDER.WALLET,
    purpose: PAYMENT_PURPOSE.ADMIN_REFUND,
    referenceId: refundId,
    referenceModel: 'Refund',
    amount: amt,
    currency: 'INR',
    status: 'captured',
    method: 'wallet',
    driverId,
    meta: {
      balanceAfter: round2(updated.wallet?.balance || 0),
      description: description ? String(description).slice(0, 280) : '',
      initiatedBy: initiatedBy ? String(initiatedBy) : '',
    },
  });

  return {
    balance: round2(updated.wallet?.balance || 0),
    totalEarnings: round2(updated.wallet?.totalEarnings || 0),
  };
}

export async function getDriverWalletService(driverId) {
  if (!driverId) throw new ApiError(400, 'driverId is required');
  const driver = await Driver.findById(driverId).select('wallet name phone_no').lean();
  if (!driver) throw new ApiError(404, 'Driver not found');
  const wallet = driver.wallet || { balance: 0, totalEarnings: 0, totalWithdrawn: 0 };
  return {
    balance: round2(wallet.balance || 0),
    totalEarnings: round2(wallet.totalEarnings || 0),
    totalWithdrawn: round2(wallet.totalWithdrawn || 0),
    currency: 'INR',
    name: driver.name || '',
    phone: driver.phone_no || '',
  };
}

export function computeDriverWithdrawable(balance, { fullSettlement = false } = {}) {
  const bal = round2(Number(balance) || 0);
  if (bal <= 0) return 0;
  if (fullSettlement) return bal;
  return round2(Math.max(0, bal - MIN_DRIVER_WALLET_BALANCE_RUPEES));
}
