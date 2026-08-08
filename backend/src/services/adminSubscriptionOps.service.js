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
  { action, reviewNote = '', settlementConfirmed = false, createRefund = true } = {},
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
    sub.cancellationRequest.status = SUBSCRIPTION_CANCEL_REQUEST_STATUS.REJECTED;
    sub.cancellationRequest.reviewedAt = new Date();
    sub.cancellationRequest.reviewedBy = admin?._id || null;
    sub.cancellationRequest.reviewNote = String(reviewNote || '').trim().slice(0, 500);
    await sub.save();
    return { subscription: sub.toObject(), action: 'reject', refund: null };
  }

  if (settlementConfirmed !== true) {
    throw new ApiError(
      400,
      'Confirm that customer payments, driver payouts, refunds, and other obligations are settled before approving cancellation',
    );
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

  let refund = null;
  if (createRefund !== false && refreshed) {
    refund = await issueSubscriptionRefundService(refreshed, {
      initiatedBy: 'admin',
      reason:
        reviewNote
        || refreshed.cancellationRequest?.reason
        || 'Subscription cancellation refund',
    });
  }

  return {
    subscription: refreshed ? refreshed.toObject() : cancelResult.subscription,
    action: 'approve',
    refund,
  };
}

/**
 * Admin override for subscription lifecycle status. Cancelling or expiring
 * a subscription releases any assigned driver so account deletion can proceed.
 */
export async function adminUpdateUserSubscriptionStatusService(
  subscriptionId,
  { status, reason = '', settlementConfirmed = false, createRefund = false } = {},
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
    if (status === SUBSCRIPTION_STATUS.CANCELLED && createRefund === true) {
      refund = await issueSubscriptionRefundService(refreshed, {
        initiatedBy: 'admin',
        reason: reason || 'Subscription cancellation refund',
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
  if (status === SUBSCRIPTION_STATUS.CANCELLED && createRefund === true) {
    refund = await issueSubscriptionRefundService(sub, {
      initiatedBy: 'admin',
      reason: reason || 'Subscription cancellation refund',
    });
  }

  return { subscription: sub.toObject(), previousStatus, changed: true, refund };
}
