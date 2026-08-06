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

export function notifyUserDriverArrived(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'Driver arrived',
      body: 'Your driver has arrived at the pickup location.',
      type: USER_NOTIFICATION.DRIVER_ARRIVED,
      data: bookingRef(booking),
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

export function notifyUserTripCompleted(userId, booking) {
  return sendPushNotification(
    { userId },
    {
      title: 'Trip completed',
      body: 'Your trip has been completed. Rate your driver!',
      severity: 'success',
      type: USER_NOTIFICATION.TRIP_COMPLETED,
      data: bookingRef(booking),
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
  return sendPushNotification(
    { userId },
    {
      title: 'Refund rejected',
      body: refund.reason || 'Your refund request could not be approved.',
      severity: 'warn',
      type: USER_NOTIFICATION.REFUND_REJECTED,
      data: { refundId: String(refund._id) },
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
  const bookingId = String(booking._id || booking.id || '');
  const expiresAt = offerPayload?.offerExpiresAt
    ? new Date(offerPayload.offerExpiresAt).toISOString()
    : booking.dispatch?.currentExpiresAt
      ? new Date(booking.dispatch.currentExpiresAt).toISOString()
      : '';

  const compactOffer = offerPayload
    ? compactBookingOfferForPush(offerPayload)
    : null;

  const pickupHint =
    compactOffer?.pickup?.address ||
    booking.pickup?.address ||
    'nearby';

  return sendPushNotification(
    { driverId },
    {
      title: 'New booking request',
      body: `Ride request near ${String(pickupHint).slice(0, 80)}`,
      severity: 'warn',
      type: DRIVER_NOTIFICATION.BOOKING_OFFER,
      // Foreground already shows BookingOfferModal via BOOKING_OFFERED —
      // skip duplicate socket toast; still persist + FCM for history/background.
      emitSocket: false,
      data: {
        kind: DRIVER_NOTIFICATION.BOOKING_OFFER,
        ...bookingRef(booking),
        priority: 'high',
        offerExpiresAt: expiresAt,
        fcmTag: `booking_offer_${bookingId}`,
        fcmChannelId: 'booking_offers',
        ...(compactOffer ? { offer: compactOffer } : {}),
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
        fcmChannelId: 'booking_offers',
        fcmSilent: true,
      },
    },
  );
}

/** Slim offer for FCM data (keep under ~4KB). */
function compactBookingOfferForPush(offer) {
  return {
    bookingId: String(offer.bookingId),
    bookingNumber: offer.bookingNumber || '',
    serviceType: offer.serviceType || '',
    bookingType: offer.bookingType || '',
    paymentMode: offer.paymentMode || '',
    pickup: offer.pickup
      ? { address: offer.pickup.address || '' }
      : null,
    dropoff: offer.dropoff
      ? { address: offer.dropoff.address || '' }
      : null,
    hourly: offer.hourly
      ? {
          durationHours: offer.hourly.durationHours ?? null,
          scheduledStartAt: offer.hourly.scheduledStartAt || null,
        }
      : null,
    outstation: offer.outstation
      ? {
          days: offer.outstation.days ?? null,
          destinationAddress: offer.outstation.destinationAddress || '',
        }
      : null,
    fare: offer.fare
      ? {
          driverEarning: offer.fare.driverEarning ?? 0,
          currency: offer.fare.currency || 'INR',
        }
      : { driverEarning: 0, currency: 'INR' },
    customer: offer.customer
      ? {
          name: offer.customer.name || '',
          phone: offer.customer.phone || '',
          profilePicture: offer.customer.profilePicture || '',
        }
      : null,
    car: offer.car
      ? {
          _id: offer.car._id || '',
          vehicleNumber: offer.car.vehicleNumber || '',
          transmission: offer.car.transmission || '',
          carTypeName: offer.car.carTypeName || '',
          brandName: offer.car.brandName || '',
          modelName: offer.car.modelName || '',
          fuelTypeName: offer.car.fuelTypeName || '',
        }
      : null,
    offerExpiresAt: offer.offerExpiresAt
      ? new Date(offer.offerExpiresAt).toISOString()
      : null,
    distanceMeters:
      typeof offer.distanceMeters === 'number' ? offer.distanceMeters : null,
    waveSize: offer.waveSize ?? null,
  };
}

export function notifyDriverOrderAssigned(driverId, booking) {
  return sendPushNotification(
    { driverId },
    {
      title: 'Ride assigned',
      body: `Booking ${booking.bookingNumber || ''} has been assigned to you.`,
      type: DRIVER_NOTIFICATION.ORDER_ASSIGNED,
      data: bookingRef(booking),
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
    data: { driverId: String(driver._id) },
  });
}

export function notifyAdminSosTriggered(data) {
  return sendAdminNotification({
    title: '🚨 Emergency SOS Alert',
    body: data.message || 'Passenger has requested emergency assistance.',
    severity: 'error',
    type: ADMIN_NOTIFICATION.SOS_TRIGGERED,
    data,
  });
}

export function notifyOperationsSosTriggered(data) {
  return sendAdminNotification({
    title: '🚨 Emergency SOS Alert',
    body: data.message || 'Passenger has requested emergency assistance.',
    severity: 'error',
    type: ADMIN_NOTIFICATION.SOS_TRIGGERED,
    data: { ...data, audience: 'operations' },
  });
}

export function notifyAdminRefundRequest(refund) {
  return sendAdminNotification({
    title: 'Refund request',
    body: `Refund of ₹${refund.amountRupees} pending review.`,
    type: ADMIN_NOTIFICATION.REFUND_REQUEST,
    data: {
      refundId: String(refund._id),
      bookingId: String(refund.bookingId),
      amountRupees: refund.amountRupees,
    },
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
      path: '/admin/emergency-pool',
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
  return sendAdminNotification({
    title: 'New support ticket',
    body: 'New support ticket received.',
    type: ADMIN_NOTIFICATION.SUPPORT_TICKET_RECEIVED,
    data: supportTicketRef(ticket),
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
