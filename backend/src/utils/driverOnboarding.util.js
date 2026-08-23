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

function hasDocument(driver, type) {
  return (driver?.documents || []).some((doc) => doc?.type === type && doc?.fileUrl);
}

/** Driver filled the section so admin may mark it approved. */
export function isReviewStepComplete(driver, stepKey) {
  if (!driver) return false;

  switch (stepKey) {
    case 'identity':
      return Boolean(String(driver.name || '').trim()) && /^[0-9]{10}$/.test(String(driver.phone || ''));
    case 'credentials': {
      const hasVehicles =
        (driver.vehicleExperience || []).length > 0 || (driver.carTypeExperience || []).length > 0;
      return Boolean(
        String(driver.drivingLicense?.number || '').trim() &&
          driver.drivingLicense?.expiryDate &&
          hasVehicles &&
          hasDocument(driver, 'driving_license') &&
          hasDocument(driver, 'selfie'),
      );
    }
    case 'bank': {
      const bank = driver.bankDetails;
      return Boolean(
        String(bank?.accountHolderName || '').trim() &&
          String(bank?.accountNumber || '').trim() &&
          String(bank?.ifscCode || '').trim() &&
          String(bank?.bankName || '').trim(),
      );
    }
    case 'safety':
      return Boolean(
        driver.safetyDeclaration?.agreed &&
          hasDocument(driver, 'aadhaar_front') &&
          hasDocument(driver, 'aadhaar_back'),
      );
    case 'liveVerification':
      return Boolean(driver.liveVerificationVideo?.videoUrl) || isLegacySubmittedDriver(driver);
    default:
      return false;
  }
}

/** Rejected driver who tapped "Update my application" and is editing before re-submit. */
export function isDriverRevising(driver) {
  return driver?.approvalStatus === 'rejected' && Boolean(driver?.revisionInProgress);
}
