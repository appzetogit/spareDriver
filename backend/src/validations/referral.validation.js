import { z } from 'zod';

export const validateReferralCodeSchema = z.object({
  referralCode: z
    .string({ required_error: 'Referral code is required' })
    .trim()
    .min(4, 'Invalid referral code')
    .max(12, 'Invalid referral code'),
});

export const updateReferralSettingsSchema = z.object({
  user: z
    .object({
      enabled: z.boolean().optional(),
      referrerRewardRupees: z.number().min(0).optional(),
      referredRewardRupees: z.number().min(0).optional(),
      minBookingAmountRupees: z.number().min(0).optional(),
    })
    .optional(),
  driver: z
    .object({
      enabled: z.boolean().optional(),
      referrerRewardRupees: z.number().min(0).optional(),
      referredRewardRupees: z.number().min(0).optional(),
      requiredCompletedTrips: z.number().int().min(0).optional(),
    })
    .optional(),
});

export const adminRejectReferralSchema = z.object({
  reason: z
    .string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(5, 'Rejection reason must be at least 5 characters')
    .max(280),
});
