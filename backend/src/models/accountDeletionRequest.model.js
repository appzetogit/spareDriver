import mongoose from 'mongoose';
import {
  ACCOUNT_DELETION_STATUS,
  ACCOUNT_DELETION_SUBJECT,
} from '../constants/withdrawal.js';

const accountDeletionRequestSchema = new mongoose.Schema(
  {
    subjectType: {
      type: String,
      enum: Object.values(ACCOUNT_DELETION_SUBJECT),
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },
    reason: { type: String, default: '', trim: true, maxlength: 500 },
    walletBalanceAtRequest: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(ACCOUNT_DELETION_STATUS),
      default: ACCOUNT_DELETION_STATUS.PENDING,
      index: true,
    },
    withdrawalRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WithdrawalRequest',
      default: null,
    },
    walletSettlementStatus: {
      type: String,
      enum: ['pending', 'settled', 'not_applicable'],
      default: 'not_applicable',
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },
    adminNotes: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

accountDeletionRequestSchema.index({ status: 1, createdAt: -1 });

const AccountDeletionRequest =
  mongoose.models.AccountDeletionRequest ||
  mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);

export default AccountDeletionRequest;
