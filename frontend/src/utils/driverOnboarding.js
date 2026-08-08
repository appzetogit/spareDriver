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
