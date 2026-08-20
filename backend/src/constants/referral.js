export const REFERRAL_ROLE = Object.freeze({
  USER: 'user',
  DRIVER: 'driver',
});

export const REFERRAL_STATUS = Object.freeze({
  PENDING: 'pending',
  QUALIFIED: 'qualified',
  REWARDED: 'rewarded',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
});

export const REFERRAL_QUALIFICATION = Object.freeze({
  FIRST_COMPLETED_BOOKING: 'first_completed_booking',
  COMPLETED_TRIPS: 'completed_trips',
});

export const DEFAULT_REFERRAL_SETTINGS = Object.freeze({
  user: {
    enabled: true,
    referrerRewardRupees: 100,
    referredRewardRupees: 0,
    qualificationType: REFERRAL_QUALIFICATION.FIRST_COMPLETED_BOOKING,
    minBookingAmountRupees: 0,
  },
  driver: {
    enabled: true,
    referrerRewardRupees: 500,
    referredRewardRupees: 0,
    requiredCompletedTrips: 5,
  },
});
