export const WITHDRAWAL_STATUS = Object.freeze({
  PENDING: 'pending',
  REJECTED: 'rejected',
  PROCESSED: 'processed',
});

export const WITHDRAWAL_STATUS_LABELS = {
  pending: 'Pending',
  rejected: 'Rejected',
  processed: 'Paid',
};

export const WITHDRAWAL_PAYOUT_METHOD = Object.freeze({
  QR: 'qr',
  BANK: 'bank',
});

export const WITHDRAWAL_PAYOUT_METHOD_LABELS = {
  qr: 'QR code',
  bank: 'Bank transfer',
};

export const MIN_DRIVER_WALLET_BALANCE = 100;

export const ACCOUNT_DELETION_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
});

export const ACCOUNT_DELETION_STATUS_LABELS = {
  pending: 'Pending review',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
};
