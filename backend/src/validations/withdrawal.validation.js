import { z } from 'zod';
import { WITHDRAWAL_PAYOUT_METHOD } from '../constants/withdrawal.js';

const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => (typeof v === 'string' ? v.trim() : ''));

export const createWithdrawalSchema = z
  .object({
    amount: z.coerce.number().positive('Amount must be greater than zero'),
    isFullSettlement: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => v === true || v === 'true'),
    payoutMethod: z
      .enum([WITHDRAWAL_PAYOUT_METHOD.QR, WITHDRAWAL_PAYOUT_METHOD.BANK])
      .optional()
      .default(WITHDRAWAL_PAYOUT_METHOD.QR),
    accountHolderName: optionalTrimmed,
    accountNumber: optionalTrimmed,
    ifscCode: optionalTrimmed,
    bankName: optionalTrimmed,
    upiId: optionalTrimmed,
  })
  .superRefine((data, ctx) => {
    if (data.payoutMethod !== WITHDRAWAL_PAYOUT_METHOD.BANK) return;

    if (!data.accountHolderName || data.accountHolderName.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Account holder name is required',
        path: ['accountHolderName'],
      });
    }
    if (!data.accountNumber || !/^\d{9,18}$/.test(data.accountNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Account number must be 9–18 digits',
        path: ['accountNumber'],
      });
    }
    if (!data.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(data.ifscCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid IFSC format (e.g. SBIN0001234)',
        path: ['ifscCode'],
      });
    }
    if (!data.bankName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bank name is required',
        path: ['bankName'],
      });
    }
    if (
      data.upiId &&
      !/^[\w.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(data.upiId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid UPI ID format (e.g. name@bank)',
        path: ['upiId'],
      });
    }
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
