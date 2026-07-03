import mongoose from 'mongoose';

const sosLocationLogSchema = new mongoose.Schema(
  {
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SosAlert',
      required: true,
      index: true,
    },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

sosLocationLogSchema.index({ sosId: 1, timestamp: -1 });

const SosLocationLog =
  mongoose.models.SosLocationLog ||
  mongoose.model('SosLocationLog', sosLocationLogSchema);

export default SosLocationLog;
