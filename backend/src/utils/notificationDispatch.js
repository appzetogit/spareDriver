/**
 * Typed notification dispatch helpers.
 * Services should call these instead of raw socket emitters for toasts/push.
 */
import {
  USER_NOTIFICATION,
  DRIVER_NOTIFICATION,
  ADMIN_NOTIFICATION,
} from '../constants/notificationTypes.js';
import { sendPushNotification, sendAdminNotification } from '../services/pushNotification.service.js';

function bookingRef(booking) {
  return {
    bookingId: String(booking._id || booking.id || booking.bookingId),
    bookingNumber: booking.bookingNumber || '',
  };
}

/* ------------------------------------------------------------------ */
/* User notifications                                                  */
/* ------------------------------------------------------------------ */

export function notifyUserBookingCreated(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'Booking confirmed',
      body: `Your booking ${booking.bookingNumber || ''} has been created.`,
      type: USER_NOTIFICATION.BOOKING_CREATED,
      data: bookingRef(booking),
    },
  );
}

export function notifyUserDriverSearching(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'Finding your driver',
      body: 'We are searching for a nearby driver for your ride.',
      type: USER_NOTIFICATION.DRIVER_SEARCHING,
      data: bookingRef(booking),
    },
  );
}

export function notifyUserNoDriversFound(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'No driver found',
      body: 'We could not find an available driver nearby. Search again or cancel for a refund.',
      type: USER_NOTIFICATION.NO_DRIVERS_FOUND,
      data: {
        ...bookingRef(booking),
        status: 'no_drivers_found',
        path: '/user/book/no-drivers',
      },
    },
  );
}

export function notifyUserDriverAssigned(userId, booking, driverName = '') {
  return sendPushNotification(
    { userId },
    {
      title: 'Driver assigned',
      body: driverName
        ? `${driverName} is on the way.`
        : 'A driver has been assigned to your ride.',
      type: USER_NOTIFICATION.DRIVER_ASSIGNED,
      data: { ...bookingRef(booking), driverName },
    },
  );
}

export function notifyUserDriverAccepted(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'Driver accepted',
      body: 'Your driver has accepted the ride.',
      type: USER_NOTIFICATION.DRIVER_ACCEPTED,
      data: bookingRef(booking),
    },
  );
}

/**
 * Driver reached the pickup. Carries a deep link so tapping the push lands on
 * the trip screen, where the ride-start OTP is waiting.
 *
 * The code itself is deliberately NOT in the title or body: a push body is
 * rendered on the lock screen, and the OTP is the one thing standing between
 * "a driver is outside" and "the trip has started". Tapping through is one
 * extra step and keeps the code behind the device lock. Move it into `body`
 * if the product decides lock-screen convenience is worth that trade.
 */
export function notifyUserDriverArrived(userId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { userId },
    {
      title: 'Driver arrived',
      body: 'Your driver is at the pickup. Tap to see your start OTP.',
      type: USER_NOTIFICATION.DRIVER_ARRIVED,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'arrived',
        path: bookingId
          ? `/user/book/assigned/${bookingId}`
          : '/user/book/assigned',
      },
    },
  );
}

export function notifyUserTripStarted(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'Trip started',
      body: 'Your trip is now in progress.',
      type: USER_NOTIFICATION.TRIP_STARTED,
      data: bookingRef(booking),
    },
  );
}

export function notifyUserRideEndingSoon(userId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { userId },
    {
      title: 'Ride ending soon',
      body: 'Your ride is about to end. Do you want to extend?',
      type: USER_NOTIFICATION.RIDE_ENDING_SOON,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'started',
        priority: 'high',
        fcmTag: bookingId ? `ride_extend_${bookingId}` : 'ride_extend',
        fcmChannelId: 'ride_alerts',
        path: bookingId
          ? `/user/book/assigned/${bookingId}?extend=1`
          : '/user/book/assigned?extend=1',
      },
    },
  );
}

export function notifyUserTripOvertimeStarted(userId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { userId },
    {
      title: 'Trip duration exceeded',
      body: 'Your trip has exceeded the allowed duration and additional charges are now applicable. Please complete the additional payment to finish the trip.',
      type: USER_NOTIFICATION.TRIP_OVERTIME_STARTED,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'started',
        path: bookingId
          ? `/user/book/assigned/${bookingId}?overtime=1`
          : '/user/book/assigned?overtime=1',
      },
    },
  );
}

export function notifyUserOvertimePaymentFailed(userId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { userId },
    {
      title: 'Additional payment failed',
      body: 'Your trip is still active. Please retry the payment.',
      type: USER_NOTIFICATION.OVERTIME_PAYMENT_FAILED,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'started',
        path: bookingId
          ? `/user/book/assigned/${bookingId}?overtime=1`
          : '/user/book/assigned?overtime=1',
      },
    },
  );
}

export function notifyDriverTripOvertimeStarted(driverId, booking) {
  const bookingId = String(booking._id || booking.id || '');
  return sendPushNotification(
    { driverId },
    {
      title: 'Trip duration exceeded',
      body: 'Please ask the customer to pay for the overdue time. You cannot complete the trip until they pay.',
      type: DRIVER_NOTIFICATION.TRIP_OVERTIME_STARTED,
      data: {
        bookingId,
        path: bookingId ? `/driver/trip/${bookingId}` : '/driver/trips',
      },
    },
  );
}

function formatExtensionDurationLabel({ additionalHours, additionalDays } = {}) {
  const days = Number(additionalDays) || 0;
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Number(additionalHours) || 0;
  const totalMin = Math.round(hours * 60);
  if (totalMin <= 0) return 'more time';
  if (totalMin < 60) return `${totalMin} min`;
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return `${hrs} hour${hrs === 1 ? '' : 's'}`;
  return `${hrs}h ${mins}m`;
}

/**
 * Customer hit Extend. Push the 4-digit OTP so the driver can read it
 * aloud even when they are not on the trip screen or the app is closed.
 * Socket `BOOKING_EXTENSION_OTP` already drives in-app UI, so we skip
 * the generic notification toast (`emitSocket: false`).
 */
export function notifyDriverExtensionOtp(
  driverId,
  booking,
  {
    extensionId,
    otp,
    additionalHours = 0,
    additionalDays = 0,
    expiresAt,
  } = {},
) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  const code = String(otp || '').trim();
  const duration = formatExtensionDurationLabel({ additionalHours, additionalDays });
  return sendPushNotification(
    { driverId },
    {
      title: 'Customer wants to extend',
      body: code
        ? `OTP ${code} — read this code to the customer to extend by ${duration}.`
        : `Customer wants to extend by ${duration}. Open the trip to share the OTP.`,
      type: DRIVER_NOTIFICATION.EXTENSION_OTP,
      persist: true,
      emitSocket: false,
      data: {
        ...bookingRef(booking),
        extensionId: String(extensionId || ''),
        otp: code,
        additionalHours,
        additionalDays,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
        priority: 'high',
        fcmTag: bookingId ? `extension_otp_${bookingId}` : 'extension_otp',
        fcmChannelId: 'ride_alerts',
        path: bookingId ? `/driver/trip/${bookingId}` : '/driver/trips',
      },
    },
  );
}

function formatReturnClock(booking) {
  const src =
    booking?.outstation?.expectedReturnAt || booking?.outstation?.endDate;
  if (!src) return null;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(src));
  } catch {
    return null;
  }
}

/** Outstation-only: ~2h before expected return. */
export function notifyUserOutstationReturnApproaching(userId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  const clock = formatReturnClock(booking);
  return sendPushNotification(
    { userId },
    {
      title: 'Trip ending soon',
      body: clock
        ? `Your trip is expected to end at ${clock}. Do you need more time with your driver?`
        : 'Your trip is expected to end soon. Do you need more time with your driver?',
      type: USER_NOTIFICATION.OUTSTATION_RETURN_APPROACHING,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'started',
        returnPhase: 'approaching',
        path: bookingId
          ? `/user/book/assigned/${bookingId}?return=1`
          : '/user/book/assigned?return=1',
      },
    },
  );
}

/** Outstation-only: expected return reached / grace / repeat. */
export function notifyUserOutstationReturnReached(
  userId,
  booking,
  { phase = 'reached' } = {},
) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { userId },
    {
      title: 'Expected return time passed',
      body: 'Your expected return time has passed. Are you still travelling with the driver?',
      type: USER_NOTIFICATION.OUTSTATION_RETURN_REACHED,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'started',
        returnPhase: phase,
        path: bookingId
          ? `/user/book/assigned/${bookingId}?return=1`
          : '/user/book/assigned?return=1',
      },
    },
  );
}

export function notifyDriverOutstationReturnReached(driverId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { driverId },
    {
      title: 'Expected return reached',
      body: 'The booked return time has been reached. Complete the trip or wait if the customer extends.',
      type: DRIVER_NOTIFICATION.OUTSTATION_RETURN_REACHED,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'started',
        path: bookingId
          ? `/driver/trips/active/${bookingId}`
          : '/driver/trips/active',
      },
    },
  );
}

/**
 * Stuck-recovery stage 1 — the driver is marked EN_ROUTE but never got
 * close enough to the pickup for the GPS-guarded arrival check to pass,
 * and the booked pickup time has come and gone. Usually a driver who
 * simply forgot to tap "I've arrived", so this is a plain reminder.
 */
export function notifyDriverArrivalReminder(
  driverId,
  booking,
  { minutesLate = 0, kind = 'en_route_past_pickup' } = {},
) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  const late = Math.max(0, Math.round(Number(minutesLate) || 0));
  const notStarted = kind === 'assigned_past_pickup';
  return sendPushNotification(
    { driverId },
    {
      title: notStarted ? 'Head to your pickup' : 'Mark your arrival',
      body: notStarted
        ? (late
          ? `Pickup time passed ${late} min ago and you have not started this trip. Tap "On the way" if you are heading there, or cancel so we can find another driver.`
          : 'You have not started this trip yet. Tap "On the way" if you are heading there, or cancel so we can find another driver.')
        : (late
          ? `Pickup time passed ${late} min ago and you're still marked on the way. Reach the pickup and tap the arrival button so the customer can share the OTP.`
          : 'You are still marked on the way. Reach the pickup and tap the arrival button so the customer can share the OTP.'),
      severity: 'warn',
      type: DRIVER_NOTIFICATION.ARRIVAL_REMINDER,
      data: {
        ...bookingRef(booking),
        status: booking.status || (notStarted ? 'driver_assigned' : 'en_route'),
        minutesLate: String(late),
        stuckKind: kind,
        path: bookingId
          ? `/driver/trips/active/${bookingId}`
          : '/driver/trips/active',
      },
    },
  );
}

/**
 * Stuck-recovery stage 2 — the booking has been wedged at EN_ROUTE long
 * enough that a human needs to force-arrive, reassign, or settle it. Sent
 * once per wedge (guarded by `stuckRecovery.escalatedAt`).
 */
export function notifyAdminBookingStuckEnRoute(
  booking,
  { minutesLate = 0, kind = 'en_route_past_pickup' } = {},
) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  const late = Math.max(0, Math.round(Number(minutesLate) || 0));
  const hours = Math.floor(late / 60);
  const lateLabel = hours >= 1 ? `${hours}h ${late % 60}m` : `${late}m`;
  const notStarted = kind === 'assigned_past_pickup';
  return sendAdminNotification({
    title: notStarted
      ? 'Booking accepted but never started'
      : 'Booking stuck en route',
    body: notStarted
      ? `${booking.bookingNumber || bookingId} is ${lateLabel} past pickup and the driver never set off — the customer is still waiting. Reassign, or cancel and refund.`
      : `${booking.bookingNumber || bookingId} is still "on the way" ${lateLabel} past pickup — the driver never reached the pickup, so no OTP was generated. Force arrival, reassign, or settle.`,
    type: ADMIN_NOTIFICATION.BOOKING_STUCK_EN_ROUTE,
    severity: 'warn',
    data: {
      ...bookingRef(booking),
      status: booking.status || (notStarted ? 'driver_assigned' : 'en_route'),
      minutesLate: String(late),
      stuckKind: kind,
      driverId: booking.driverId ? String(booking.driverId) : '',
      path: bookingId
        ? `/admin/bookings?bookingId=${bookingId}`
        : '/admin/bookings',
    },
    zoneIds: (booking.zoneIds || []).map((id) => String(id)),
  });
}

export function notifyUserNoShowPrompt(userId, booking, { isFinal = false } = {}) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { userId },
    {
      title: isFinal
        ? 'Last reminder — are you coming?'
        : 'Are you on your way?',
      body: isFinal
        ? 'Respond now or the trip will be auto-closed as a no-show.'
        : 'Your driver is waiting at the pickup. Tap to respond.',
      severity: isFinal ? 'warn' : 'info',
      type: USER_NOTIFICATION.NOSHOW_PROMPT,
      data: {
        ...bookingRef(booking),
        status: booking.status || 'arrived',
        isFinal: isFinal ? '1' : '0',
        path: bookingId
          ? `/user/book/assigned/${bookingId}`
          : '/user/book/assigned',
      },
    },
  );
}

export function notifyUserTripCompleted(userId, booking) {
  const bookingId = String(booking._id || booking.id || '');
  return sendPushNotification(
    { userId },
    {
      title: 'Trip completed',
      body:
        booking?.overtime?.paymentStatus === 'paid'
          ? 'Your overtime charge has been successfully paid and your trip is now completed.'
          : 'Your trip has been completed. Rate your driver!',
      severity: 'success',
      type: USER_NOTIFICATION.TRIP_COMPLETED,
      data: {
        ...bookingRef(booking),
        status: 'completed',
        path: bookingId
          ? `/user/tracking/completed?bookingId=${bookingId}`
          : '/user/tracking/completed',
      },
    },
  );
}

export function notifyUserPaymentSuccessful(userId, { amountRupees, refType, refId }) {
  return sendPushNotification(
    { userId },
    {
      title: 'Payment successful',
      body: `₹${amountRupees} payment received.`,
      severity: 'success',
      type: USER_NOTIFICATION.PAYMENT_SUCCESSFUL,
      data: { amountRupees, refType, refId: refId ? String(refId) : '' },
    },
  );
}

export function notifyUserRefundInitiated(userId, refund) {
  return sendPushNotification(
    { userId },
    {
      title: 'Refund initiated',
      body: `Refund of ₹${refund.amountRupees} is being processed.`,
      type: USER_NOTIFICATION.REFUND_INITIATED,
      data: { refundId: String(refund._id), amountRupees: refund.amountRupees },
    },
  );
}

export function notifyUserRefundApproved(userId, refund) {
  return sendPushNotification(
    { userId },
    {
      title: 'Refund approved',
      body: `Your refund of ₹${refund.amountRupees} has been approved.`,
      severity: 'success',
      type: USER_NOTIFICATION.REFUND_APPROVED,
      data: { refundId: String(refund._id), amountRupees: refund.amountRupees },
    },
  );
}

export function notifyUserRefundProcessed(userId, refund) {
  return sendPushNotification(
    { userId },
    {
      title: 'Refund processed',
      body: `₹${refund.amountRupees} has been refunded to your account.`,
      severity: 'success',
      type: USER_NOTIFICATION.REFUND_PROCESSED,
      data: { refundId: String(refund._id), amountRupees: refund.amountRupees },
    },
  );
}

export function notifyUserRefundRejected(userId, refund) {
  const rejectionReason =
    String(refund?.error || refund?.reason || '').trim()
    || 'Your refund request could not be approved.';
  return sendPushNotification(
    { userId },
    {
      title: 'Refund rejected',
      body: rejectionReason,
      severity: 'warn',
      type: USER_NOTIFICATION.REFUND_REJECTED,
      data: {
        refundId: String(refund._id),
        rejectionReason,
      },
    },
  );
}

export function notifyUserWalletCredited(userId, { amountRupees, source, description }) {
  return sendPushNotification(
    { userId },
    {
      title: 'Wallet credited',
      body: description || `₹${amountRupees} added to your wallet.`,
      severity: 'success',
      type: USER_NOTIFICATION.WALLET_CREDITED,
      data: { amountRupees, source },
    },
  );
}

export function notifyUserWalletDebited(userId, { amountRupees, source, description }) {
  return sendPushNotification(
    { userId },
    {
      title: 'Wallet debited',
      body: description || `₹${amountRupees} deducted from your wallet.`,
      type: USER_NOTIFICATION.WALLET_DEBITED,
      data: { amountRupees, source },
    },
  );
}

export function notifyReferralReward({ referrerId, referrerRole, amountRupees, referredName }) {
  const body = referredName
    ? `You earned ₹${amountRupees} from your referral (${referredName}).`
    : `You earned ₹${amountRupees} from your referral.`;

  if (referrerRole === 'driver') {
    return sendPushNotification(
      { driverId: referrerId },
      {
        title: 'Referral reward added',
        body,
        severity: 'success',
        type: DRIVER_NOTIFICATION.REFERRAL_REWARD,
        data: { amountRupees, referredName },
      },
    );
  }

  return sendPushNotification(
    { userId: referrerId },
    {
      title: 'Referral reward added',
      body,
      severity: 'success',
      type: USER_NOTIFICATION.REFERRAL_REWARD,
      data: { amountRupees, referredName },
    },
  );
}

export function notifyUserBookingReminder(userId, booking, minutesAhead) {
  return sendPushNotification(
    { userId },
    {
      title: 'Scheduled ride reminder',
      body: `Your ride starts in ${minutesAhead} minutes.`,
      type: USER_NOTIFICATION.BOOKING_REMINDER,
      data: { ...bookingRef(booking), minutesAhead },
    },
  );
}

export function notifyUserBookingCancelled(userId, booking, reason = '') {
  return sendPushNotification(
    { userId },
    {
      title: 'Booking cancelled',
      body: reason || 'Your booking has been cancelled.',
      severity: 'warn',
      type: USER_NOTIFICATION.BOOKING_CANCELLED,
      data: { ...bookingRef(booking), reason },
    },
  );
}

export function notifyUserSubscriptionExpiring(userId, { planName, expiresAt }) {
  return sendPushNotification(
    { userId },
    {
      title: 'Subscription expiring soon',
      body: `Your ${planName || 'subscription'} expires soon.`,
      severity: 'warn',
      type: USER_NOTIFICATION.SUBSCRIPTION_EXPIRING,
      data: { planName, expiresAt },
    },
  );
}

export function notifyUserSubscriptionExpired(userId, { planName }) {
  return sendPushNotification(
    { userId },
    {
      title: 'Subscription expired',
      body: `Your ${planName || 'subscription'} has expired.`,
      severity: 'warn',
      type: USER_NOTIFICATION.SUBSCRIPTION_EXPIRED,
      data: { planName },
    },
  );
}

export function notifyUserSosUpdate(userId, data) {
  return sendPushNotification(
    { userId },
    {
      title: 'SOS update',
      body: data.message || 'Emergency services have been notified.',
      severity: 'error',
      type: USER_NOTIFICATION.SOS_UPDATE,
      data: { ...data, priority: 'high' },
    },
  );
}

/* ------------------------------------------------------------------ */
/* Driver notifications                                                */
/* ------------------------------------------------------------------ */

export function notifyDriverNewBookingRequest(driverId, booking, offerPayload = null) {
  const bookingType = String(
    offerPayload?.bookingType || booking.bookingType || booking.serviceType || '',
  );
  const isInbox = Boolean(
    offerPayload?.inbox
    || bookingType === 'scheduled'
    || bookingType === 'outstation'
    || bookingType === 'subscription'
    || offerPayload?.kind === 'subscription',
  );

  const pickupHint =
    offerPayload?.pickup?.address ||
    booking.pickup?.address ||
    'nearby';

  const title = isInbox ? 'New inbox request' : 'New booking request';
  const body = isInbox
    ? bookingType === 'subscription'
      ? 'A subscription assignment is waiting in your Incoming list.'
      : bookingType === 'outstation'
        ? 'An outstation request is waiting in your Incoming list.'
        : 'A scheduled ride is waiting in your Incoming list.'
    : `Ride request near ${String(pickupHint).slice(0, 80)}`;

  return sendPushNotification(
    { driverId },
    {
      title,
      body,
      type: isInbox
        ? DRIVER_NOTIFICATION.INBOX_OFFER
        : DRIVER_NOTIFICATION.BOOKING_OFFER,
      data: {
        ...bookingRef(booking),
        path: isInbox ? '/driver/trips?tab=incoming' : '/driver/home',
      },
    },
  );
}

/**
 * Cancel a previously pushed offer (timeout / other driver accepted / cancel).
 * FCM-only — socket withdraw is emitted separately by the dispatcher.
 */
export function notifyDriverBookingOfferWithdrawn(driverId, { bookingId, reason = '' }) {
  const id = String(bookingId);
  return sendPushNotification(
    { driverId },
    {
      title: 'Booking request expired',
      body: 'This ride request is no longer available.',
      type: DRIVER_NOTIFICATION.BOOKING_OFFER_WITHDRAWN,
      persist: false,
      emitSocket: false,
      fcmSilent: true,
      data: {
        kind: DRIVER_NOTIFICATION.BOOKING_OFFER_WITHDRAWN,
        bookingId: id,
        reason: reason || '',
        priority: 'high',
        fcmTag: `booking_offer_${id}`,
        fcmSilent: true,
      },
    },
  );
}

export function notifyDriverOrderAssigned(driverId, booking) {
  const bookingId = String(booking._id || booking.id || booking.bookingId || '');
  return sendPushNotification(
    { driverId },
    {
      title: 'Trip assigned',
      body: `Booking ${booking.bookingNumber || ''} has been assigned to you.`,
      type: DRIVER_NOTIFICATION.ORDER_ASSIGNED,
      data: {
        ...bookingRef(booking),
        kind: DRIVER_NOTIFICATION.ORDER_ASSIGNED,
        path: bookingId ? `/driver/trip/${bookingId}` : '/driver/home',
        bookingType: booking.bookingType || booking.serviceType || '',
        status: booking.status || '',
        priority: 'high',
        fcmTag: bookingId ? `order_assigned_${bookingId}` : 'order_assigned',
      },
    },
  );
}

export function notifyDriverSubscriptionAssigned(driverId, { subscriptionId, carLabel }) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Subscription assigned',
      body: `You have been assigned as dedicated driver for ${carLabel || 'a customer vehicle'}.`,
      severity: 'success',
      type: DRIVER_NOTIFICATION.SUBSCRIPTION_ASSIGNED,
      data: {
        kind: 'subscription_assigned',
        subscriptionId: String(subscriptionId),
        carLabel: carLabel || '',
      },
    },
  );
}

export function notifyDriverBookingCancelled(driverId, booking, reason = '') {
  return sendPushNotification(
    { driverId },
    {
      title: 'Booking cancelled',
      body: reason || 'A booking has been cancelled.',
      severity: 'warn',
      type: DRIVER_NOTIFICATION.BOOKING_CANCELLED,
      data: { ...bookingRef(booking), reason },
    },
  );
}

export function notifyDriverCustomerCancelled(driverId, booking) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Customer cancelled',
      body: 'The customer has cancelled the ride.',
      severity: 'warn',
      type: DRIVER_NOTIFICATION.CUSTOMER_CANCELLED,
      data: bookingRef(booking),
    },
  );
}

export function notifyDriverEarningsCredited(driverId, { amountRupees, bookingId }) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Earnings credited',
      body: `₹${amountRupees} has been added to your earnings.`,
      severity: 'success',
      type: DRIVER_NOTIFICATION.EARNINGS_CREDITED,
      data: { amountRupees, bookingId: bookingId ? String(bookingId) : '' },
    },
  );
}

export function notifyDriverWithdrawalRequested(driverId, { amountRupees, withdrawalId }) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Withdrawal requested',
      body: `Withdrawal of ₹${amountRupees} is pending review.`,
      type: DRIVER_NOTIFICATION.WITHDRAWAL_REQUESTED,
      data: { amountRupees, withdrawalId },
    },
  );
}

export function notifyDriverWithdrawalApproved(driverId, { amountRupees, withdrawalId }) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Withdrawal approved',
      body: `Your withdrawal of ₹${amountRupees} has been approved.`,
      severity: 'success',
      type: DRIVER_NOTIFICATION.WITHDRAWAL_APPROVED,
      data: { amountRupees, withdrawalId },
    },
  );
}

export function notifyDriverWithdrawalRejected(driverId, { reason, withdrawalId }) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Withdrawal rejected',
      body: reason || 'Your withdrawal request was rejected.',
      severity: 'warn',
      type: DRIVER_NOTIFICATION.WITHDRAWAL_REJECTED,
      data: { withdrawalId, reason },
    },
  );
}

export function notifyDriverWithdrawalProcessed(driverId, { amountRupees, withdrawalId }) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Withdrawal processed',
      body: `₹${amountRupees} has been transferred to your account.`,
      severity: 'success',
      type: DRIVER_NOTIFICATION.WITHDRAWAL_PROCESSED,
      data: { amountRupees, withdrawalId },
    },
  );
}

export function notifyDriverBookingReminder(driverId, booking, minutesAhead) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Upcoming scheduled ride',
      body: `Ride starts in ${minutesAhead} minutes.`,
      type: DRIVER_NOTIFICATION.BOOKING_REMINDER,
      data: { ...bookingRef(booking), minutesAhead },
    },
  );
}

export function notifyDriverEmergencyAlert(driverId, { title, body, data }) {
  return sendPushNotification(
    { driverId },
    {
      title: title || 'Emergency alert',
      body: body || 'Please check the app immediately.',
      severity: 'error',
      type: DRIVER_NOTIFICATION.EMERGENCY_ALERT,
      data: { ...data, priority: 'high' },
    },
  );
}

export function notifyDriverAccountApproved(driverId, { note = '' } = {}) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Account approved',
      body: note
        ? `Your driver account has been approved. ${note}`
        : 'Your driver account has been approved. You can now go online and accept rides.',
      severity: 'success',
      type: DRIVER_NOTIFICATION.ACCOUNT_APPROVED,
      data: {
        kind: DRIVER_NOTIFICATION.ACCOUNT_APPROVED,
        approvalStatus: 'approved',
        path: '/driver/home',
        note,
      },
    },
  );
}

export function notifyDriverAccountRejected(driverId, { note = '' } = {}) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Account rejected',
      body: note
        ? `Your driver application was rejected. ${note}`
        : 'Your driver application was rejected. Please review the note and resubmit.',
      severity: 'error',
      type: DRIVER_NOTIFICATION.ACCOUNT_REJECTED,
      data: {
        kind: DRIVER_NOTIFICATION.ACCOUNT_REJECTED,
        approvalStatus: 'rejected',
        path: '/driver/register/approval',
        note,
      },
    },
  );
}

export function notifyDriverAccountSuspended(driverId, { note = '' } = {}) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Account suspended',
      body: note
        ? `Your driver account has been suspended. ${note}`
        : 'Your driver account has been suspended. Contact support for help.',
      severity: 'error',
      type: DRIVER_NOTIFICATION.ACCOUNT_SUSPENDED,
      data: {
        kind: DRIVER_NOTIFICATION.ACCOUNT_SUSPENDED,
        approvalStatus: 'suspended',
        path: '/driver/register/approval',
        note,
      },
    },
  );
}

export function notifyDriverAccountUnsuspended(driverId) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Account reinstated',
      body: 'Your driver account suspension has been lifted. You can go online again.',
      severity: 'success',
      type: DRIVER_NOTIFICATION.ACCOUNT_UNSUSPENDED,
      data: {
        kind: DRIVER_NOTIFICATION.ACCOUNT_UNSUSPENDED,
        approvalStatus: 'approved',
        path: '/driver/home',
      },
    },
  );
}

export function notifyUserPromotional(userId, { title, body }) {
  return sendPushNotification(
    { userId },
    {
      title,
      body,
      type: USER_NOTIFICATION.PROMOTIONAL,
      data: { kind: USER_NOTIFICATION.PROMOTIONAL },
    },
  );
}

export function notifyDriverPromotional(driverId, { title, body }) {
  return sendPushNotification(
    { driverId },
    {
      title,
      body,
      type: DRIVER_NOTIFICATION.PROMOTIONAL,
      data: { kind: DRIVER_NOTIFICATION.PROMOTIONAL },
    },
  );
}

/* ------------------------------------------------------------------ */
/* Admin notifications (inbox only — no FCM)                           */
/* ------------------------------------------------------------------ */

export function notifyAdminNewUserRegistration(user) {
  return sendAdminNotification({
    title: 'New user registration',
    body: `${user.name || 'A user'} has registered.`,
    type: ADMIN_NOTIFICATION.NEW_USER_REGISTRATION,
    data: { userId: String(user._id) },
  });
}

export function notifyAdminNewDriverRegistration(driver) {
  return sendAdminNotification({
    title: 'New driver registration',
    body: `${driver.name || 'A driver'} submitted an application.`,
    type: ADMIN_NOTIFICATION.NEW_DRIVER_REGISTRATION,
    data: { driverId: String(driver._id), path: '/admin/drivers' },
  });
}

export function notifyAdminSosTriggered(data) {
  const zoneIds = (data.zoneIds || []).map((id) => String(id));
  return sendAdminNotification({
    title: 'Emergency SOS Alert',
    body: data.message || 'Passenger has requested emergency assistance.',
    severity: 'error',
    type: ADMIN_NOTIFICATION.SOS_TRIGGERED,
    data: { ...data, path: '/admin/sos' },
    zoneIds,
  });
}

export function notifyOperationsSosTriggered(data) {
  // Socket-only companion to notifyAdminSosTriggered — avoids duplicate FCM/inbox.
  return sendAdminNotification({
    title: 'Emergency SOS Alert',
    body: data.message || 'Passenger has requested emergency assistance.',
    severity: 'error',
    type: ADMIN_NOTIFICATION.SOS_TRIGGERED,
    data: { ...data, audience: 'operations', path: '/admin/sos' },
    persist: false,
    sendFcm: false,
  });
}

export function notifyAdminRefundRequest(refund) {
  return sendAdminNotification({
    title: 'Refund request',
    body: `Refund of ₹${refund.amountRupees} pending review.`,
    type: ADMIN_NOTIFICATION.REFUND_REQUEST,
    data: {
      refundId: String(refund._id),
      bookingId: refund.bookingId ? String(refund.bookingId) : undefined,
      subscriptionId: refund.subscriptionId ? String(refund.subscriptionId) : undefined,
      amountRupees: refund.amountRupees,
      path: '/admin/account/refunds',
    },
  });
}

export function notifyAdminSubscriptionCancelRequest(subscription) {
  const zoneIds = subscription.zoneId ? [String(subscription.zoneId)] : [];
  const number = subscription.subscriptionNumber || String(subscription._id).slice(-6);
  return sendAdminNotification({
    title: 'Subscription cancel request',
    body: `Customer requested cancellation for ${number}. Review and issue refund.`,
    severity: 'warn',
    type: ADMIN_NOTIFICATION.SUBSCRIPTION_CANCEL_REQUEST,
    data: {
      subscriptionId: String(subscription._id),
      subscriptionNumber: subscription.subscriptionNumber || '',
      userId: String(subscription.userId),
      path: '/admin/bookings/subscription-requests',
    },
    zoneIds,
  });
}

export function notifyAdminWithdrawalRequest({ driverId, amountRupees, withdrawalId }) {
  return sendAdminNotification({
    title: 'Withdrawal request',
    body: `Driver withdrawal of ₹${amountRupees} pending review.`,
    type: ADMIN_NOTIFICATION.WITHDRAWAL_REQUEST,
    data: { driverId: String(driverId), amountRupees, withdrawalId },
  });
}

export function notifyAdminEmergencyPoolEntered(booking) {
  const zoneIds = (booking.zoneIds || []).map((id) => String(id));
  return sendAdminNotification({
    title: 'Emergency pool',
    body: `Booking ${booking.bookingNumber || ''} needs manual driver assignment.`,
    severity: 'warn',
    type: ADMIN_NOTIFICATION.EMERGENCY_POOL_ENTERED,
    data: {
      ...bookingRef(booking),
      path: '/admin/bookings/emergency-pool',
    },
    zoneIds,
  });
}

export function notifyAdminNoDriversFound(booking) {
  const zoneIds = (booking.zoneIds || []).map((id) => String(id));
  return sendAdminNotification({
    title: 'No driver found',
    body: `Instant booking ${booking.bookingNumber || ''} exhausted driver search.`,
    severity: 'warn',
    type: ADMIN_NOTIFICATION.NO_DRIVERS_FOUND,
    data: {
      ...bookingRef(booking),
      status: 'no_drivers_found',
      path: '/admin/bookings',
    },
    zoneIds,
  });
}

export function notifyAdminScheduledDispatchRetry(booking, attempt) {
  return sendAdminNotification({
    title: 'Scheduled dispatch retry',
    body: `Booking ${booking.bookingNumber || ''} found no drivers — retry #${attempt} queued.`,
    type: ADMIN_NOTIFICATION.SCHEDULED_DISPATCH_RETRY,
    data: { ...bookingRef(booking), attempt },
  });
}

export function notifyAdminPaymentMismatch(data) {
  return sendAdminNotification({
    title: 'Payment mismatch',
    body: data.message || 'A payment mismatch was detected.',
    severity: 'error',
    type: ADMIN_NOTIFICATION.PAYMENT_MISMATCH,
    data,
  });
}

function supportTicketRef(ticket) {
  return {
    ticketId: String(ticket._id),
    ticketNumber: ticket.ticketNumber || '',
  };
}

export function notifyAdminSupportTicketReceived(ticket) {
  const subject = String(ticket.subject || '').trim();
  return sendAdminNotification({
    title: 'New support ticket',
    body: subject
      ? `${ticket.ticketNumber || 'Ticket'}: ${subject}`
      : 'New support ticket received.',
    severity: 'warn',
    type: ADMIN_NOTIFICATION.SUPPORT_TICKET_RECEIVED,
    data: {
      ...supportTicketRef(ticket),
      path: '/admin/support',
    },
  });
}

export function notifyUserSupportReply(userId, ticket) {
  return sendPushNotification(
    { userId },
    {
      title: 'Support update',
      body: 'Support has responded to your ticket.',
      type: USER_NOTIFICATION.SUPPORT_REPLY,
      data: supportTicketRef(ticket),
    },
  );
}

export function notifyDriverSupportReply(driverId, ticket) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Support update',
      body: 'Support has responded to your ticket.',
      type: DRIVER_NOTIFICATION.SUPPORT_REPLY,
      data: supportTicketRef(ticket),
    },
  );
}

/* ------------------------------------------------------------------ */
/* Trip chat                                                           */
/* ------------------------------------------------------------------ */

function chatPushData(data = {}) {
  const bookingId = data.bookingId ? String(data.bookingId) : '';
  return {
    ...data,
    priority: 'high',
    fcmTag: bookingId ? `trip_chat_${bookingId}` : 'trip_chat',
    fcmChannelId: 'chat_messages',
  };
}

export function notifyUserTripChatMessage(userId, { title, body, data = {}, emitSocket = true } = {}) {
  if (!userId) return Promise.resolve();
  return sendPushNotification(
    { userId },
    {
      title: title || 'New message',
      body: body || '',
      type: USER_NOTIFICATION.TRIP_CHAT_MESSAGE,
      emitSocket,
      data: chatPushData(data),
    },
  );
}

export function notifyDriverTripChatMessage(driverId, { title, body, data = {}, emitSocket = true } = {}) {
  if (!driverId) return Promise.resolve();
  return sendPushNotification(
    { driverId },
    {
      title: title || 'New message',
      body: body || '',
      type: DRIVER_NOTIFICATION.TRIP_CHAT_MESSAGE,
      emitSocket,
      data: chatPushData(data),
    },
  );
}

/**
 * Soft admin notify for trip chat — inbox + socket, no FCM by default
 * (chat volume would be noisy). Zone-scoped when booking has zoneIds.
 */
export function notifyAdminsTripChatMessage({ title, body, data = {}, zoneIds } = {}) {
  return sendAdminNotification({
    title: title || 'Trip chat message',
    body: body || '',
    severity: 'info',
    type: ADMIN_NOTIFICATION.TRIP_CHAT_MESSAGE,
    data,
    zoneIds,
    sendFcm: false,
  });
}

