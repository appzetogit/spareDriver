import mongoose from 'mongoose';

const bankSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

bankSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const Bank = mongoose.models.Bank || mongoose.model('Bank', bankSchema);
export default Bank;
