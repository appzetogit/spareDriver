import { z } from 'zod';

export const createWithdrawalSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  isFullSettlement: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const rejectWithdrawalSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const processWithdrawalSchema = z.object({
  mode: z.string().max(80).optional(),
  transactionId: z.string().max(120).optional(),
  utr: z.string().max(120).optional(),
  referenceNumber: z.string().max(120).optional(),
  paidAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  adminNotes: z.string().max(500).optional(),
});

export const accountDeletionRequestSchema = z.object({
  reason: z.string().min(3, 'Please provide a reason').max(500),
  withdrawAmount: z.coerce.number().positive().optional(),
});

export const rejectAccountDeletionSchema = z.object({
  reason: z.string().min(1).max(500),
  adminNotes: z.string().max(500).optional(),
});

export const completeAccountDeletionSchema = z.object({
  adminNotes: z.string().max(500).optional(),
});

export const settleWalletDeletionSchema = z.object({
  mode: z.string().max(80).optional(),
  transactionId: z.string().max(120).optional(),
  utr: z.string().max(120).optional(),
  referenceNumber: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => Boolean(data.transactionId?.trim() || data.utr?.trim()),
  { message: 'Transaction ID or UTR is required' },
);

export const adminUpdateBookingStatusSchema = z.object({
  status: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const adminUpdateSubscriptionStatusSchema = z.object({
  status: z.enum(['active', 'expired', 'cancelled']),
  reason: z.string().max(500).optional(),
  settlementConfirmed: z.boolean().optional(),
});
