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
  TRIP_STARTED: 'trip_started',
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
});

/** Driver-facing notification kinds */
export const DRIVER_NOTIFICATION = Object.freeze({
  NEW_BOOKING_REQUEST: 'new_booking_request',
  BOOKING_CANCELLED: 'booking_cancelled',
  CUSTOMER_CANCELLED: 'customer_cancelled',
  ORDER_ASSIGNED: 'order_assigned',
  EARNINGS_CREDITED: 'earnings_credited',
  WITHDRAWAL_REQUESTED: 'withdrawal_requested',
  WITHDRAWAL_APPROVED: 'withdrawal_approved',
  WITHDRAWAL_REJECTED: 'withdrawal_rejected',
  WITHDRAWAL_PROCESSED: 'withdrawal_processed',
  WALLET_ADJUSTMENT: 'wallet_adjustment',
  SUBSCRIPTION_REMINDER: 'subscription_reminder',
  SUBSCRIPTION_ASSIGNED: 'subscription_assigned',
  ADMIN_ANNOUNCEMENT: 'admin_announcement',
  SUPPORT_REPLY: 'support_reply',
  EMERGENCY_ALERT: 'emergency_alert',
  BOOKING_REMINDER: 'booking_reminder',
});

/** Admin inbox kinds (socket + DB only — no FCM push) */
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
  SCHEDULED_DISPATCH_RETRY: 'scheduled_dispatch_retry',
  SUPPORT_TICKET_RECEIVED: 'support_ticket_received',
});

export const NOTIFICATION_AUDIENCE = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
  ADMIN: 'admin',
});
