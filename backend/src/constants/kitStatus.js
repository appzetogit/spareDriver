export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const KIT_ADMIN_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const FULFILLMENT_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  DISPATCHED: 'dispatched',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  FAILED: 'failed',
});

export const PAYMENT_PROVIDER = Object.freeze({
  RAZORPAY: 'razorpay',
  /**
   * Internal wallet credit/debit — used when the backend moves rupees
   * inside our own books (driver earning settled at trip completion,
   * food/stay allowance pass-through). No Razorpay round-trip; the
   * matching balance mutation happens in the same transaction.
   */
  WALLET: 'wallet',
});

export const PAYMENT_PURPOSE = Object.freeze({
  DRIVER_KIT: 'driver_kit',
  SUBSCRIPTION: 'subscription',
  /** Driver-side credit: their share of the daily-rate × commission split. */
  TRIP_FARE: 'trip_fare',
  /**
   * Driver-side credit: the pass-through food/stay allowance the
   * customer paid for on outstation trips (driver opted not to be
   * hosted/fed by the customer). Always paired with a TRIP_FARE row
   * for the same booking — the two sum to `driverEarning`.
   */
  TRIP_ALLOWANCE: 'trip_allowance',
  /**
   * Driver-side credit: 100% of the waiting charge the user paid for
   * the driver's idle time between ARRIVED and STARTED (or accrued
   * through the no-show cadence). No platform commission is taken —
   * the waiting charge is purely the driver's compensation for the
   * time they sat unable to start the ride.
   */
  TRIP_WAITING: 'trip_waiting',
  WITHDRAWAL: 'withdrawal',
  /** Admin manual refund credited to a driver's wallet. */
  ADMIN_REFUND: 'admin_refund',
});
