export const DRIVER_ONBOARDING_STEPS = [
  'Identity',
  'Credentials',
  'Bank',
  'Safety',
  'Verification',
];

export const DRIVER_ONBOARDING_ROUTES = {
  0: '/driver/register/identity',
  1: '/driver/register/credentials',
  2: '/driver/register/bank',
  3: '/driver/register/safety',
  4: '/driver/register/verification',
  5: '/driver/register/verification',
};

export const DRIVER_REVIEW_STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'bank', label: 'Bank details' },
  { key: 'safety', label: 'Safety & documents' },
  { key: 'liveVerification', label: 'Live verification' },
];

export const LIVE_VERIFICATION_MIN_SECONDS = 15;
export const LIVE_VERIFICATION_MAX_SECONDS = 120;

const REVIEW_STATUSES = ['under_review', 'approved', 'rejected', 'suspended'];

export function isLegacySubmittedDriver(driver) {
  if (!driver) return false;
  return (
    driver.onboardingStep === 5 &&
    REVIEW_STATUSES.includes(driver.approvalStatus) &&
    !driver.liveVerificationVideo?.videoUrl
  );
}

export function isApplicationSubmitted(driver) {
  if (!driver) return false;
  if (driver.approvalStatus === 'rejected') return false;
  if (driver.onboardingStep >= 6 && driver.approvalStatus === 'under_review') return true;
  return isLegacySubmittedDriver(driver);
}

export function canUpdateRejectedApplication(driver) {
  return driver?.approvalStatus === 'rejected';
}

export function isDriverRevising(driver) {
  return driver?.approvalStatus === 'rejected' && Boolean(driver?.revisionInProgress);
}

export function hasCompletedLiveVerification(driver) {
  if (!driver) return false;
  if (driver.liveVerificationVideo?.videoUrl) return true;
  if (isLegacySubmittedDriver(driver)) return true;
  return driver.onboardingStep >= 5;
}

function hasDocument(driver, type) {
  return (driver?.documents || []).some((doc) => doc?.type === type && doc?.fileUrl);
}

const REVIEW_STEP_INCOMPLETE_HINT = {
  identity: 'Name and phone are required before this section can be approved.',
  credentials: 'Licence, vehicles, licence photo, and selfie are required before approve.',
  bank: 'Bank details are not submitted.',
  safety: 'Safety declaration and Aadhaar photos are required before approve.',
  liveVerification: 'Live verification video is not uploaded.',
};

/** Whether the driver actually filled a review section (not just the admin badge). */
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

export function getReviewStepIncompleteHint(stepKey) {
  return REVIEW_STEP_INCOMPLETE_HINT[stepKey] || 'This section is not complete.';
}

export function areAllReviewStepsApproved(reviews = {}) {
  return DRIVER_REVIEW_STEPS.every(
    ({ key }) => reviews?.[key]?.status === 'approved',
  );
}

export function getRejectedStepNotes(reviews = {}) {
  return DRIVER_REVIEW_STEPS.map(({ key, label }) => {
    const review = reviews?.[key];
    if (review?.status !== 'rejected') return null;
    return {
      key,
      label,
      note: review.note || '',
      reviewedByName: review.reviewedByName || '',
      reviewedAt: review.reviewedAt || null,
    };
  }).filter(Boolean);
}

export function formatSubmissionAttempt(count) {
  const n = Number(count) || 0;
  if (n <= 0) return 'Not submitted yet';
  if (n === 1) return '1st submission';
  if (n === 2) return '2nd submission';
  if (n === 3) return '3rd submission';
  return `${n}th submission`;
}
