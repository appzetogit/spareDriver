import { z } from 'zod';

const transactionDetailsSchema = z.object({
  mode: z.string().max(80).optional(),
  transactionId: z.string().max(120).optional(),
  utr: z.string().max(120).optional(),
  referenceNumber: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

function requireTxnIdOrUtr(txn, ctx, path = ['transactionDetails']) {
  if (!txn?.transactionId?.trim() && !txn?.utr?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Transaction ID or UTR is required',
      path,
    });
  }
}

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
    requireTxnIdOrUtr(data.transactionDetails || {}, ctx);
  });

export const updateRefundStatusSchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'processed', 'failed']),
    razorpayRefundId: z.string().max(80).optional(),
    error: z.string().max(500).optional(),
    reason: z.string().max(500).optional(),
    payoutMethod: z.enum(['wallet', 'bank_account']).optional(),
    transactionDetails: transactionDetailsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'processed') {
      const method = data.payoutMethod || 'bank_account';
      if (method === 'bank_account') {
        requireTxnIdOrUtr(data.transactionDetails || {}, ctx);
      }
    }
    if (data.status === 'rejected') {
      const note = String(data.reason || data.error || '').trim();
      if (note.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Rejection reason is required (min 3 characters)',
          path: ['reason'],
        });
      }
    }
    if (data.status === 'failed') {
      const note = String(data.error || data.reason || '').trim();
      if (note.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Failure reason is required (min 3 characters)',
          path: ['error'],
        });
      }
    }
  });
