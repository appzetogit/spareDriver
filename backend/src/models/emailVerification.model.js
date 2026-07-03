import mongoose from 'mongoose';

const emailVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      sparse: true,
    },
    /** Set during sign-up before an account exists. */
    phone: {
      type: String,
      trim: true,
      default: '',
      index: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  { timestamps: true },
);

emailVerificationSchema.index({ userId: 1, email: 1 });
emailVerificationSchema.index({ phone: 1, email: 1 });

export const EmailVerification =
  mongoose.models.EmailVerification ||
  mongoose.model('EmailVerification', emailVerificationSchema);
