import mongoose from 'mongoose';
import { DRIVER_REVIEW_STEP_STATUS } from '../../constants/driverOnboarding.js';

const stepReviewSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(DRIVER_REVIEW_STEP_STATUS),
      default: DRIVER_REVIEW_STEP_STATUS.PENDING,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedByName: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

export default stepReviewSchema;
