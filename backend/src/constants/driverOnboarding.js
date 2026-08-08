/** Driver onboarding steps (1–5), then SUBMITTED (6) after application submit. */
export const DRIVER_ONBOARDING_STEP = {
  IDENTITY: 1,
  CREDENTIALS: 2,
  BANK: 3,
  SAFETY: 4,
  LIVE_VERIFICATION: 5,
  SUBMITTED: 6,
};

export const DRIVER_ONBOARDING_MAX_STEP = 6;

/** Admin verifies these application sections before final approve. */
export const DRIVER_REVIEW_STEPS = [
  'identity',
  'credentials',
  'bank',
  'safety',
  'liveVerification',
];

export const DRIVER_REVIEW_STEP_LABELS = {
  identity: 'Identity',
  credentials: 'Credentials',
  bank: 'Bank details',
  safety: 'Safety & documents',
  liveVerification: 'Live verification',
};

export const DRIVER_REVIEW_STEP_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export function createEmptyStepReviews() {
  return Object.fromEntries(
    DRIVER_REVIEW_STEPS.map((key) => [
      key,
      {
        status: DRIVER_REVIEW_STEP_STATUS.PENDING,
        note: '',
        reviewedBy: null,
        reviewedByName: '',
        reviewedAt: null,
      },
    ]),
  );
}

export function areAllReviewStepsApproved(reviews = {}) {
  return DRIVER_REVIEW_STEPS.every(
    (key) => reviews?.[key]?.status === DRIVER_REVIEW_STEP_STATUS.APPROVED,
  );
}
