import { DRIVER_ONBOARDING_STEP } from '../constants/driverOnboarding.js';

const REVIEW_STATUSES = ['under_review', 'approved', 'rejected', 'suspended'];

/**
 * Drivers who submitted before live-verification used onboardingStep 5 as "submitted".
 */
export function isLegacySubmittedDriver(driver) {
  if (!driver) return false;
  return (
    driver.onboardingStep === DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION &&
    REVIEW_STATUSES.includes(driver.approvalStatus) &&
    !driver.liveVerificationVideo?.videoUrl
  );
}

export function isApplicationSubmitted(driver) {
  if (!driver) return false;
  if (driver.approvalStatus === 'rejected') return false;
  if (
    driver.onboardingStep >= DRIVER_ONBOARDING_STEP.SUBMITTED &&
    driver.approvalStatus === 'under_review'
  ) {
    return true;
  }
  return isLegacySubmittedDriver(driver);
}

export function hasCompletedLiveVerification(driver) {
  if (!driver) return false;
  if (driver.liveVerificationVideo?.videoUrl) return true;
  if (isLegacySubmittedDriver(driver)) return true;
  return driver.onboardingStep >= DRIVER_ONBOARDING_STEP.LIVE_VERIFICATION;
}

/** Rejected driver who tapped "Update my application" and is editing before re-submit. */
export function isDriverRevising(driver) {
  return driver?.approvalStatus === 'rejected' && Boolean(driver?.revisionInProgress);
}
