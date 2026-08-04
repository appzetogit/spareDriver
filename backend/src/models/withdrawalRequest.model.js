import mongoose from 'mongoose';
import {
  WITHDRAWAL_STATUS,
  WITHDRAWAL_PAYOUT_METHOD,
} from '../constants/withdrawal.js';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: '', trim: true },
    publicId: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const payoutBankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    ifscCode: { type: String, default: '', trim: true, uppercase: true },
    bankName: { type: String, default: '', trim: true },
    upiId: { type: String, default: '', trim: true },
  },
  { _id: false },
);

const transactionDetailsSchema = new mongoose.Schema(
  {
    mode: { type: String, default: '', trim: true },
    transactionId: { type: String, default: '', trim: true },
    utr: { type: String, default: '', trim: true },
    referenceNumber: { type: String, default: '', trim: true },
    paidAt: { type: Date, default: null },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false },
);

const withdrawalRequestSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    amountRupees: { type: Number, required: true, min: 1 },
    walletBalanceAtRequest: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      index: true,
    },
    payoutMethod: {
      type: String,
      enum: Object.values(WITHDRAWAL_PAYOUT_METHOD),
      default: WITHDRAWAL_PAYOUT_METHOD.QR,
    },
    /** Driver's UPI/bank QR for admin to scan when paying out. */
    qrImage: { type: imageSchema, default: () => ({}) },
    /** Snapshot of bank details when payoutMethod is bank. */
    bankDetails: { type: payoutBankDetailsSchema, default: () => ({}) },
    /** Admin-uploaded proof after the manual transfer. */
    paymentProof: { type: imageSchema, default: () => ({}) },
    transactionDetails: { type: transactionDetailsSchema, default: () => ({}) },
    /** True when settling the full wallet during account deletion. */
    isFullSettlement: { type: Boolean, default: false },
    accountDeletionRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountDeletionRequest',
      default: null,
      index: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    processedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 500 },
    adminNotes: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ driverId: 1, status: 1 });

const WithdrawalRequest =
  mongoose.models.WithdrawalRequest ||
  mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

export default WithdrawalRequest;
