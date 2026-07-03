import UserSubscription from '../models/userSubscription.model.js';
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_ASSIGNMENT_STATUS,
} from '../constants/serviceTypes.js';
import { ApiError } from '../utils/apiError.js';
import { releaseSubscriptionDriverService } from './pricing.service.js';

const ALLOWED_ADMIN_SUBSCRIPTION_STATUSES = Object.freeze([
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.EXPIRED,
  SUBSCRIPTION_STATUS.CANCELLED,
]);

/**
 * Admin override for subscription lifecycle status. Cancelling or expiring
 * a subscription releases any assigned driver so account deletion can proceed.
 */
export async function adminUpdateUserSubscriptionStatusService(
  subscriptionId,
  { status, reason = '' } = {},
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
    return { subscription: sub.toObject(), previousStatus, changed: false };
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
    await refreshed.save();
    return {
      subscription: refreshed.toObject(),
      previousStatus,
      changed: true,
    };
  }

  sub.status = status;
  if (reason) sub.releaseReason = String(reason).slice(0, 500);
  if (
    status === SUBSCRIPTION_STATUS.CANCELLED
    && sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING
  ) {
    sub.assignmentStatus = SUBSCRIPTION_ASSIGNMENT_STATUS.RELEASED;
    sub.releasedAt = new Date();
  }
  await sub.save();

  return { subscription: sub.toObject(), previousStatus, changed: true };
}
