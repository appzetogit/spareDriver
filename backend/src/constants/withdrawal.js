export const WITHDRAWAL_STATUS = Object.freeze({
  PENDING: 'pending',
  REJECTED: 'rejected',
  PROCESSED: 'processed',
});

/** How the driver wants to receive the payout. */
export const WITHDRAWAL_PAYOUT_METHOD = Object.freeze({
  QR: 'qr',
  BANK: 'bank',
});

/** Minimum balance (₹) a driver must keep after a normal withdrawal. */
export const MIN_DRIVER_WALLET_BALANCE_RUPEES = 100;

export const ACCOUNT_DELETION_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
});

export const ACCOUNT_DELETION_SUBJECT = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
});
