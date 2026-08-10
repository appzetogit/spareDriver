import UserSubscription from '../models/userSubscription.model.js';
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
  SUBSCRIPTION_CANCEL_REQUEST_STATUS,
} from '../constants/serviceTypes.js';
import { ApiError } from '../utils/apiError.js';
import { releaseSubscriptionDriverService } from './pricing.service.js';
import { issueSubscriptionRefundService } from './refund.service.js';

const ALLOWED_ADMIN_SUBSCRIPTION_STATUSES = Object.freeze([
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.EXPIRED,
  SUBSCRIPTION_STATUS.CANCELLED,
]);

function hasPendingCancelRequest(sub) {
  return sub?.cancellationRequest?.status === SUBSCRIPTION_CANCEL_REQUEST_STATUS.PENDING;
}

async function withdrawInboxOffersBestEffort(sub, reason) {
  try {
    const { withdrawSubscriptionInboxOffers } = await import(
      './subscriptionDispatch.service.js'
    );
    await withdrawSubscriptionInboxOffers(sub, reason);
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Customer cancel request — only while paid & awaiting driver assignment.
 * Does not cancel immediately; admin reviews and issues the refund.
 */
export async function requestSubscriptionCancellationService(
  userId,
  subscriptionId,
  { reason = '' } = {},
) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (sub.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    throw new ApiError(400, 'Only active subscriptions can be cancelled');
  }
  if (sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED) {
    throw new ApiError(
      400,
      'You cannot cancel after a driver is assigned. Please contact support.',
    );
  }
  if (sub.assignmentStatus !== SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING) {
    throw new ApiError(400, 'This subscription can no longer be cancelled by you');
  }
  if (hasPendingCancelRequest(sub)) {
    throw new ApiError(400, 'A cancellation request is already pending review');
  }

  sub.cancellationRequest = {
    status: SUBSCRIPTION_CANCEL_REQUEST_STATUS.PENDING,
    reason: String(reason || '').trim().slice(0, 500),
    requestedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: '',
  };
  await withdrawInboxOffersBestEffort(sub, 'subscription_cancel_requested');
  await sub.save();

  try {
    const { notifyAdminSubscriptionCancelRequest } = await import(
      '../utils/notificationDispatch.js'
    );
    notifyAdminSubscriptionCancelRequest(sub).catch(() => null);
  } catch {
    /* best-effort */
  }

  const populated = await UserSubscription.findById(sub._id)
    .populate('planId', 'name')
    .populate('zoneId', 'name city')
    .populate({
      path: 'carId',
      select: 'vehicleNumber carTypeId brandId modelId image',
      populate: [
        { path: 'carTypeId', select: 'name' },
        { path: 'brandId', select: 'name' },
        { path: 'modelId', select: 'name' },
      ],
    })
    .populate('assignedDriverId', 'name phone profilePicture rating');

  const { serializeSubscriptionForUser } = await import('./pricing.service.js');
  return serializeSubscriptionForUser(populated);
}

/**
 * Admin reviews a pending user cancel request.
 * Approve → cancel subscription + create pending refund for admin payout.
 * Reject → clear request; subscription stays active (inbox can resume).
 */
export async function reviewSubscriptionCancellationService(
  subscriptionId,
  {
    action,
    reviewNote = '',
    settlementConfirmed = false,
    createRefund = true,
    transactionDetails = null,
  } = {},
  admin = null,
) {
  const normalized = String(action || '').toLowerCase();
  if (!['approve', 'reject'].includes(normalized)) {
    throw new ApiError(400, 'action must be "approve" or "reject"');
  }

  const sub = await UserSubscription.findById(subscriptionId);
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (!hasPendingCancelRequest(sub)) {
    throw new ApiError(400, 'No pending cancellation request on this subscription');
  }

  if (normalized === 'reject') {
    const note = String(reviewNote || '').trim();
    if (note.length < 3) {
      throw new ApiError(400, 'Rejection reason is required (min 3 characters)');
    }
    sub.cancellationRequest.status = SUBSCRIPTION_CANCEL_REQUEST_STATUS.REJECTED;
    sub.cancellationRequest.reviewedAt = new Date();
    sub.cancellationRequest.reviewedBy = admin?._id || null;
    sub.cancellationRequest.reviewNote = note.slice(0, 500);
    await sub.save();
    sendSubscriptionCancelRejectedEmail(sub).catch(() => null);
    return { subscription: sub.toObject(), action: 'reject', refund: null };
  }

  if (settlementConfirmed !== true) {
    throw new ApiError(
      400,
      'Confirm that customer payments, driver payouts, refunds, and other obligations are settled before approving cancellation',
    );
  }

  const shouldRefund = Number(sub.amount) > 0;
  if (shouldRefund) {
    assertSubscriptionRefundTxn(transactionDetails);
  }

  const cancelResult = await adminUpdateUserSubscriptionStatusService(
    subscriptionId,
    {
      status: SUBSCRIPTION_STATUS.CANCELLED,
      reason:
        reviewNote
        || sub.cancellationRequest?.reason
        || 'Cancelled after customer request',
      settlementConfirmed: true,
      createRefund: shouldRefund,
      transactionDetails: shouldRefund ? transactionDetails : null,
    },
    admin,
  );

  const refreshed = await UserSubscription.findById(subscriptionId);
  if (refreshed) {
    refreshed.cancellationRequest = {
      ...(refreshed.cancellationRequest?.toObject?.() || refreshed.cancellationRequest || {}),
      status: SUBSCRIPTION_CANCEL_REQUEST_STATUS.APPROVED,
      reviewedAt: new Date(),
      reviewedBy: admin?._id || null,
      reviewNote: String(reviewNote || '').trim().slice(0, 500),
    };
    await refreshed.save();
  }

  // Refund already created inside adminUpdateUserSubscriptionStatusService when createRefund.
  return {
    subscription: refreshed ? refreshed.toObject() : cancelResult.subscription,
    action: 'approve',
    refund: cancelResult.refund || null,
  };
}

function assertSubscriptionRefundTxn(transactionDetails) {
  const txn = transactionDetails || {};
  const txnId = String(txn.transactionId || '').trim();
  const utr = String(txn.utr || '').trim();
  if (!txnId && !utr) {
    throw new ApiError(
      400,
      'Refund transaction details are required (Transaction ID or UTR) before cancelling a subscription',
    );
  }
}

/**
 * Admin override for subscription lifecycle status. Cancelling or expiring
 * a subscription releases any assigned driver so account deletion can proceed.
 */
export async function adminUpdateUserSubscriptionStatusService(
  subscriptionId,
  {
    status,
    reason = '',
    settlementConfirmed = false,
    createRefund = false,
    transactionDetails = null,
  } = {},
  admin = null,
) {
  if (!status || !ALLOWED_ADMIN_SUBSCRIPTION_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `status must be one of: ${ALLOWED_ADMIN_SUBSCRIPTION_STATUSES.join(', ')}`,
    );
  }

  const sub = await UserSubscription.findById(subscriptionId);
  if (!sub) throw new ApiError(404, 'Subscription not found');

  const previousStatus = sub.status;
  if (previousStatus === status) {
    return { subscription: sub.toObject(), previousStatus, changed: false, refund: null };
  }
  if (
    status === SUBSCRIPTION_STATUS.CANCELLED
    && settlementConfirmed !== true
  ) {
    throw new ApiError(
      400,
      'Confirm that customer payments, driver payouts, refunds, and other obligations are settled before cancellation',
    );
  }

  const shouldRefund =
    status === SUBSCRIPTION_STATUS.CANCELLED
    && Number(sub.amount) > 0;
  // Paid subscriptions always require bank refund details at cancel time.
  if (shouldRefund) {
    assertSubscriptionRefundTxn(transactionDetails);
  }

  if (
    [SUBSCRIPTION_STATUS.CANCELLED, SUBSCRIPTION_STATUS.EXPIRED].includes(status)
    && sub.assignedDriverId
    && sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED
  ) {
    await releaseSubscriptionDriverService(subscriptionId, {
      reason: reason || `Subscription marked ${status} by admin`,
      lastWorkingDate: new Date(),
    });
    const refreshed = await UserSubscription.findById(subscriptionId);
    refreshed.status = status;
    if (reason) refreshed.releaseReason = String(reason).slice(0, 500);
    if (status === SUBSCRIPTION_STATUS.CANCELLED) {
      refreshed.cancellationSettlement = {
        confirmedAt: new Date(),
        confirmedBy: admin?._id || null,
      };
      if (hasPendingCancelRequest(refreshed)) {
        refreshed.cancellationRequest.status = SUBSCRIPTION_CANCEL_REQUEST_STATUS.APPROVED;
        refreshed.cancellationRequest.reviewedAt = new Date();
        refreshed.cancellationRequest.reviewedBy = admin?._id || null;
      }
    }
    await withdrawInboxOffersBestEffort(refreshed, `subscription_${status}`);
    await refreshed.save();

    let refund = null;
    if (shouldRefund) {
      refund = await issueSubscriptionRefundService(refreshed, {
        initiatedBy: 'admin',
        reason: reason || 'Subscription cancellation refund',
        transactionDetails,
      });
    }

    return {
      subscription: refreshed.toObject(),
      previousStatus,
      changed: true,
      refund,
    };
  }

  sub.status = status;
  if (reason) sub.releaseReason = String(reason).slice(0, 500);
  if (status === SUBSCRIPTION_STATUS.CANCELLED) {
    sub.cancellationSettlement = {
      confirmedAt: new Date(),
      confirmedBy: admin?._id || null,
    };
    if (hasPendingCancelRequest(sub)) {
      sub.cancellationRequest.status = SUBSCRIPTION_CANCEL_REQUEST_STATUS.APPROVED;
      sub.cancellationRequest.reviewedAt = new Date();
      sub.cancellationRequest.reviewedBy = admin?._id || null;
    }
  }
  if (
    status === SUBSCRIPTION_STATUS.CANCELLED
    && sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING
  ) {
    sub.assignmentStatus = SUBSCRIPTION_ASSIGNMENT_STATUS.RELEASED;
    sub.releasedAt = new Date();
  }
  if (
    [SUBSCRIPTION_STATUS.CANCELLED, SUBSCRIPTION_STATUS.EXPIRED].includes(status)
  ) {
    await withdrawInboxOffersBestEffort(sub, `subscription_${status}`);
  }
  await sub.save();

  let refund = null;
  if (shouldRefund) {
    refund = await issueSubscriptionRefundService(sub, {
      initiatedBy: 'admin',
      reason: reason || 'Subscription cancellation refund',
      transactionDetails,
    });
  }

  return { subscription: sub.toObject(), previousStatus, changed: true, refund };
}

async function sendSubscriptionCancelRejectedEmail(subscription) {
  if (!subscription?.userId) return;
  const User = (await import('../models/user.model.js')).default;
  const user = await User.findById(subscription.userId).select('name email').lean();
  if (!user?.email) return;

  const { isPlaceholderUserEmail } = await import('../utils/email.util.js');
  if (isPlaceholderUserEmail(user.email)) return;

  const { sendEmail } = await import('./email.service.js');
  const reason =
    String(subscription.cancellationRequest?.reviewNote || '').trim()
    || 'Your cancellation request could not be approved.';
  const ref = subscription.subscriptionNumber || String(subscription._id).slice(-8);
  const plan = subscription.planNameSnapshot || 'your subscription';
  const name = user.name || 'there';

  const escape = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  await sendEmail({
    to: user.email,
    subject: `Cancellation request rejected — ${ref}`,
    text: `Hi ${name},\n\nYour request to cancel ${plan} (${ref}) was rejected.\n\nReason of rejection:\n${reason}\n\nYour subscription remains active.\n\n— SpareDriver`,
    html: `
      <p>Hi ${escape(name)},</p>
      <p>Your request to cancel <strong>${escape(plan)}</strong> (ref <strong>${escape(ref)}</strong>) was rejected.</p>
      <p><strong>Reason of rejection:</strong></p>
      <p style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;">${escape(reason)}</p>
      <p>Your subscription remains active. Contact support if you have questions.</p>
      <p>— SpareDriver</p>
    `,
  });
}
