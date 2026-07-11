import mongoose from 'mongoose';

/**
 * One admin bulk promotional push campaign (audit / history row).
 */
const bulkPushCampaignSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ['user', 'driver'],
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ['all', 'selected'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    recipientIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId }],
      default: [],
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

bulkPushCampaignSchema.index({ createdAt: -1 });

const BulkPushCampaign =
  mongoose.models.BulkPushCampaign ||
  mongoose.model('BulkPushCampaign', bulkPushCampaignSchema);

export default BulkPushCampaign;
