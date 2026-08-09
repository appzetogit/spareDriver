/** Mirror of backend/src/constants/notificationTypes.js */
import { BOOKING_STATUS } from './bookingStatus';

export const USER_NOTIFICATION = Object.freeze({
  BOOKING_CREATED: 'booking_created',
  DRIVER_SEARCHING: 'driver_searching',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ACCEPTED: 'driver_accepted',
  DRIVER_ARRIVED: 'driver_arrived',
  NO_DRIVERS_FOUND: 'no_drivers_found',
  TRIP_STARTED: 'trip_started',
  RIDE_ENDING_SOON: 'ride_ending_soon',
  NOSHOW_PROMPT: 'noshow_prompt',
  TRIP_COMPLETED: 'trip_completed',
  PAYMENT_SUCCESSFUL: 'payment_successful',
  REFUND_INITIATED: 'refund_initiated',
  REFUND_APPROVED: 'refund_approved',
  REFUND_PROCESSED: 'refund_processed',
  REFUND_REJECTED: 'refund_rejected',
  WALLET_CREDITED: 'wallet_credited',
  WALLET_DEBITED: 'wallet_debited',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  BOOKING_REMINDER: 'booking_reminder',
  BOOKING_CANCELLED: 'booking_cancelled',
  SOS_UPDATE: 'sos_update',
});

export const DRIVER_NOTIFICATION = Object.freeze({
  NEW_BOOKING_REQUEST: 'new_booking_request',
  BOOKING_OFFER: 'booking_offer',
  BOOKING_OFFER_WITHDRAWN: 'booking_offer_withdrawn',
  ORDER_ASSIGNED: 'order_assigned',
  SUBSCRIPTION_ASSIGNED: 'subscription_assigned',
  BOOKING_CANCELLED: 'booking_cancelled',
  EARNINGS_CREDITED: 'earnings_credited',
  BOOKING_REMINDER: 'booking_reminder',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  ACCOUNT_SUSPENDED: 'account_suspended',
  ACCOUNT_UNSUSPENDED: 'account_unsuspended',
});

export const ADMIN_NOTIFICATION = Object.freeze({
  NEW_DRIVER_REGISTRATION: 'new_driver_registration',
  SOS_TRIGGERED: 'sos_triggered',
  EMERGENCY_POOL_ENTERED: 'emergency_pool_entered',
  NO_DRIVERS_FOUND: 'no_drivers_found',
  SUPPORT_TICKET_RECEIVED: 'support_ticket_received',
  REFUND_REQUEST: 'refund_request',
  WITHDRAWAL_REQUEST: 'withdrawal_request',
  SUBSCRIPTION_CANCEL_REQUEST: 'subscription_cancel_request',
});

const USER_LIVE_KINDS = new Set([
  USER_NOTIFICATION.DRIVER_SEARCHING,
  USER_NOTIFICATION.DRIVER_ASSIGNED,
  USER_NOTIFICATION.DRIVER_ACCEPTED,
  USER_NOTIFICATION.DRIVER_ARRIVED,
  USER_NOTIFICATION.NO_DRIVERS_FOUND,
  USER_NOTIFICATION.TRIP_STARTED,
  USER_NOTIFICATION.RIDE_ENDING_SOON,
  USER_NOTIFICATION.NOSHOW_PROMPT,
  USER_NOTIFICATION.BOOKING_REMINDER,
  USER_NOTIFICATION.PAYMENT_SUCCESSFUL,
]);

function userLiveRoute(kind, bookingId, status) {
  if (status === BOOKING_STATUS.NO_DRIVERS_FOUND) {
    return '/user/book/no-drivers';
  }
  if (status === BOOKING_STATUS.SEARCHING || kind === USER_NOTIFICATION.DRIVER_SEARCHING) {
    return '/user/book/searching';
  }
  if (
    status === BOOKING_STATUS.PENDING_ASSIGNMENT ||
    status === BOOKING_STATUS.IN_EMERGENCY_POOL
  ) {
    return '/user/book/scheduled';
  }
  if (bookingId) return `/user/book/assigned/${bookingId}`;
  return '/user/book/assigned';
}

/** Resolve in-app navigation path from notification payload */
export function notificationNavigatePath(kind, data = {}, audience = 'user') {
  if (data.path && typeof data.path === 'string' && data.path.startsWith('/')) {
    return data.path;
  }

  const bookingId = data.bookingId ? String(data.bookingId) : null;
  const status = data.status || null;

  if (audience === 'user') {
    if (bookingId) {
      if (USER_LIVE_KINDS.has(kind) || (status && [
        BOOKING_STATUS.SEARCHING,
        BOOKING_STATUS.NO_DRIVERS_FOUND,
        BOOKING_STATUS.DRIVER_ASSIGNED,
        BOOKING_STATUS.AWAITING_PAYMENT,
        BOOKING_STATUS.EN_ROUTE,
        BOOKING_STATUS.ARRIVED,
        BOOKING_STATUS.STARTED,
        BOOKING_STATUS.PENDING_ASSIGNMENT,
        BOOKING_STATUS.IN_EMERGENCY_POOL,
      ].includes(status))) {
        return userLiveRoute(kind, bookingId, status);
      }
      return `/user/trips/${bookingId}`;
    }
    if (kind === USER_NOTIFICATION.WALLET_CREDITED || kind === USER_NOTIFICATION.WALLET_DEBITED) {
      return '/user/wallet';
    }
    if (
      kind === USER_NOTIFICATION.SUBSCRIPTION_EXPIRING ||
      kind === USER_NOTIFICATION.SUBSCRIPTION_EXPIRED
    ) {
      return '/user/account/subscription';
    }
    return null;
  }

  if (audience === 'driver') {
    if (
      kind === DRIVER_NOTIFICATION.NEW_BOOKING_REQUEST ||
      kind === DRIVER_NOTIFICATION.BOOKING_OFFER
    ) {
      return '/driver/home';
    }
    if (kind === DRIVER_NOTIFICATION.SUBSCRIPTION_ASSIGNED || data.kind === 'subscription_assigned') {
      return '/driver/account';
    }
    if (
      kind === DRIVER_NOTIFICATION.ACCOUNT_APPROVED ||
      kind === DRIVER_NOTIFICATION.ACCOUNT_UNSUSPENDED
    ) {
      return '/driver/home';
    }
    if (
      kind === DRIVER_NOTIFICATION.ACCOUNT_REJECTED ||
      kind === DRIVER_NOTIFICATION.ACCOUNT_SUSPENDED
    ) {
      return '/driver/register/approval';
    }
    if (bookingId) return `/driver/trip/${bookingId}`;
    if (kind === DRIVER_NOTIFICATION.EARNINGS_CREDITED) return '/driver/earnings';
    return null;
  }

  if (audience === 'admin') {
    switch (kind) {
      case ADMIN_NOTIFICATION.SOS_TRIGGERED:
        return '/admin/sos';
      case ADMIN_NOTIFICATION.SUPPORT_TICKET_RECEIVED:
        return '/admin/support';
      case ADMIN_NOTIFICATION.EMERGENCY_POOL_ENTERED:
        return '/admin/bookings/emergency-pool';
      case ADMIN_NOTIFICATION.NO_DRIVERS_FOUND:
        return '/admin/bookings';
      case ADMIN_NOTIFICATION.NEW_DRIVER_REGISTRATION:
        return '/admin/drivers';
      case ADMIN_NOTIFICATION.REFUND_REQUEST:
        return '/admin/account/refunds';
      case ADMIN_NOTIFICATION.WITHDRAWAL_REQUEST:
        return '/admin/account/withdrawals';
      case ADMIN_NOTIFICATION.SUBSCRIPTION_CANCEL_REQUEST:
        return data.path || '/admin/subscriptions/users';
      default:
        return null;
    }
  }

  return null;
}
