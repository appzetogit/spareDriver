export const REFUND_KIND_LABELS = {
  booking_cancellation: 'Booking refund',
  subscription_cancellation: 'Subscription refund',
  wallet_settlement: 'Wallet settlement',
  admin_manual: 'Admin refund',
};

export const REFUND_PAYOUT_METHOD_LABELS = {
  wallet: 'Wallet credit',
  bank_account: 'Bank account',
};

export const REFUND_SUBJECT_TYPE_LABELS = {
  user: 'User',
  driver: 'Driver',
};

/** How the money moved — used on the admin Refunds table. */
export function refundChannelLabel(refund) {
  if (!refund) return '';
  if (refund.kind === 'admin_manual') return 'Manual';
  if (refund.kind === 'wallet_settlement') return 'Settlement';
  if (refund.payoutMethod === 'wallet' && refund.status === 'processed') {
    return 'Automatic';
  }
  return 'Manual';
}
