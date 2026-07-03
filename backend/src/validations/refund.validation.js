import { z } from 'zod';

const transactionDetailsSchema = z.object({
  mode: z.string().max(80).optional(),
  transactionId: z.string().max(120).optional(),
  utr: z.string().max(120).optional(),
  referenceNumber: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

export const createAdminManualRefundSchema = z
  .object({
    subjectType: z.enum(['user', 'driver']),
    subjectId: z.string().min(1, 'Subject is required'),
    amountRupees: z.coerce.number().positive('Amount must be greater than zero'),
    payoutMethod: z.enum(['wallet', 'bank_account']),
    reason: z.string().min(3, 'Refund reason is required').max(500),
    transactionDetails: transactionDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payoutMethod !== 'bank_account') return;
    const txn = data.transactionDetails || {};
    if (!txn.transactionId?.trim() && !txn.utr?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Transaction ID or UTR is required for bank refunds',
        path: ['transactionDetails'],
      });
    }
  });
