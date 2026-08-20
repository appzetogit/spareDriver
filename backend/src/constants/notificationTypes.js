/**
 * Canonical notification type constants.
 * Used in Notification documents, FCM data payloads, and frontend routing.
 */

export const NOTIFICATION_SEVERITY = Object.freeze({
  INFO: 'info',
  SUCCESS: 'success',
  WARN: 'warn',
  ERROR: 'error',
});

/** User-facing notification kinds */
export const USER_NOTIFICATION = Object.freeze({
  BOOKING_CREATED: 'booking_created',
  DRIVER_SEARCHING: 'driver_searching',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ACCEPTED: 'driver_accepted',
  DRIVER_REJECTED: 'driver_rejected',
  DRIVER_ARRIVED: 'driver_arrived',
  NO_DRIVERS_FOUND: 'no_drivers_found',
  TRIP_STARTED: 'trip_started',
  /** Hourly ride nearing booked end — offer to extend. */
  RIDE_ENDING_SOON: 'ride_ending_soon',
  /** Grace ended — additional online payment required. */
  TRIP_OVERTIME_STARTED: 'trip_overtime_started',
  OVERTIME_PAYMENT_FAILED: 'overtime_payment_failed',
  /** Outstation: ~2h before expectedReturnAt. */
  OUTSTATION_RETURN_APPROACHING: 'outstation_return_approaching',
  /** Outstation: expectedReturnAt reached / grace / repeat prompt. */
  OUTSTATION_RETURN_REACHED: 'outstation_return_reached',
  /** Driver waiting at pickup — "are you on your way?" no-show prompt. */
  NOSHOW_PROMPT: 'noshow_prompt',
  TRIP_COMPLETED: 'trip_completed',
  ORDER_PICKED_UP: 'order_picked_up',
  ORDER_DELIVERED: 'order_delivered',
  PAYMENT_SUCCESSFUL: 'payment_successful',
  REFUND_INITIATED: 'refund_initiated',
  REFUND_APPROVED: 'refund_approved',
  REFUND_PROCESSED: 'refund_processed',
  REFUND_REJECTED: 'refund_rejected',
  WALLET_CREDITED: 'wallet_credited',
  WALLET_DEBITED: 'wallet_debited',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  SUBSCRIPTION_PURCHASED: 'subscription_purchased',
  PROMOTIONAL: 'promotional',
  SUPPORT_TICKET_CREATED: 'support_ticket_created',
  SUPPORT_REPLY: 'support_reply',
  SUPPORT_RESOLVED: 'support_resolved',
  SUPPORT_REOPENED: 'support_reopened',
  SOS_UPDATE: 'sos_update',
  BOOKING_REMINDER: 'booking_reminder',
  BOOKING_CANCELLED: 'booking_cancelled',
  TRIP_CHAT_MESSAGE: 'trip_chat_message',
});

/** Driver-facing notification kinds */
export const DRIVER_NOTIFICATION = Object.freeze({
  NEW_BOOKING_REQUEST: 'new_booking_request',
  /** Rich dual-channel booking offer (socket + FCM hydrate payload). Instant wave only. */
  BOOKING_OFFER: 'booking_offer',
  /**
   * Scheduled / outstation / subscription inbox request (no countdown modal).
   * Flutter rings on this kind and opens Incoming tab.
   */
  INBOX_OFFER: 'inbox_offer',
  /** FCM/socket cancel when wave times out or another driver wins. */
  BOOKING_OFFER_WITHDRAWN: 'booking_offer_withdrawn',
  BOOKING_CANCELLED: 'booking_cancelled',
  CUSTOMER_CANCELLED: 'customer_cancelled',
  ORDER_ASSIGNED: 'order_assigned',
  EARNINGS_CREDITED: 'earnings_credited',
  TRIP_OVERTIME_STARTED: 'trip_overtime_started',
  WITHDRAWAL_REQUESTED: 'withdrawal_requested',
  WITHDRAWAL_APPROVED: 'withdrawal_approved',
  WITHDRAWAL_REJECTED: 'withdrawal_rejected',
  WITHDRAWAL_PROCESSED: 'withdrawal_processed',
  WALLET_ADJUSTMENT: 'wallet_adjustment',
  SUBSCRIPTION_REMINDER: 'subscription_reminder',
  SUBSCRIPTION_ASSIGNED: 'subscription_assigned',
  ADMIN_ANNOUNCEMENT: 'admin_announcement',
  PROMOTIONAL: 'promotional',
  SUPPORT_REPLY: 'support_reply',
  EMERGENCY_ALERT: 'emergency_alert',
  BOOKING_REMINDER: 'booking_reminder',
  /** Outstation expected return reached — driver may complete or await extension. */
  OUTSTATION_RETURN_REACHED: 'outstation_return_reached',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  ACCOUNT_SUSPENDED: 'account_suspended',
  ACCOUNT_UNSUSPENDED: 'account_unsuspended',
  TRIP_CHAT_MESSAGE: 'trip_chat_message',
});

/** Admin inbox kinds (socket + DB; FCM only for ADMIN_FCM_NOTIFICATION_TYPES) */
export const ADMIN_NOTIFICATION = Object.freeze({
  NEW_USER_REGISTRATION: 'new_user_registration',
  NEW_DRIVER_REGISTRATION: 'new_driver_registration',
  NEW_VENDOR_REGISTRATION: 'new_vendor_registration',
  SOS_TRIGGERED: 'sos_triggered',
  REFUND_REQUEST: 'refund_request',
  WITHDRAWAL_REQUEST: 'withdrawal_request',
  SCHEDULER_JOB_FAILED: 'scheduler_job_failed',
  PAYMENT_MISMATCH: 'payment_mismatch',
  ACCOUNTING_MISMATCH: 'accounting_mismatch',
  EMERGENCY_POOL_ENTERED: 'emergency_pool_entered',
  NO_DRIVERS_FOUND: 'no_drivers_found',
  SCHEDULED_DISPATCH_RETRY: 'scheduled_dispatch_retry',
  SUPPORT_TICKET_RECEIVED: 'support_ticket_received',
  SUBSCRIPTION_CANCEL_REQUEST: 'subscription_cancel_request',
  TRIP_CHAT_MESSAGE: 'trip_chat_message',
});

export const NOTIFICATION_AUDIENCE = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
});

/** Inbox retention — older rows are purged and never returned by list APIs. */
export const NOTIFICATION_RETENTION_DAYS = 7;

/**
 * Admin types worth keeping in the inbox DB.
 * Everything else is socket-only (realtime toast) and not persisted.
 */
export const ADMIN_PERSISTED_NOTIFICATION_TYPES = Object.freeze(
  new Set([
    ADMIN_NOTIFICATION.NEW_DRIVER_REGISTRATION,
    ADMIN_NOTIFICATION.SOS_TRIGGERED,
    ADMIN_NOTIFICATION.REFUND_REQUEST,
    ADMIN_NOTIFICATION.WITHDRAWAL_REQUEST,
    ADMIN_NOTIFICATION.SCHEDULER_JOB_FAILED,
    ADMIN_NOTIFICATION.PAYMENT_MISMATCH,
    ADMIN_NOTIFICATION.ACCOUNTING_MISMATCH,
    ADMIN_NOTIFICATION.EMERGENCY_POOL_ENTERED,
    ADMIN_NOTIFICATION.NO_DRIVERS_FOUND,
    ADMIN_NOTIFICATION.SUPPORT_TICKET_RECEIVED,
    ADMIN_NOTIFICATION.SUBSCRIPTION_CANCEL_REQUEST,
    ADMIN_NOTIFICATION.TRIP_CHAT_MESSAGE,
  ]),
);

/** Admin types that also fan out via FCM to staff devices. */
export const ADMIN_FCM_NOTIFICATION_TYPES = Object.freeze(
  new Set([
    ADMIN_NOTIFICATION.EMERGENCY_POOL_ENTERED,
    ADMIN_NOTIFICATION.SOS_TRIGGERED,
    ADMIN_NOTIFICATION.SUPPORT_TICKET_RECEIVED,
  ]),
);
