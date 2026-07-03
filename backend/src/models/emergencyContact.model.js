import mongoose from 'mongoose';

const emergencyContactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      match: [/^[0-9]{10}$/, 'Phone number must be exactly 10 digits'],
    },
    relationship: {
      type: String,
      default: '',
      trim: true,
      maxlength: 40,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

emergencyContactSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });
emergencyContactSchema.index({ userId: 1, isPrimary: 1 });

const EmergencyContact =
  mongoose.models.EmergencyContact ||
  mongoose.model('EmergencyContact', emergencyContactSchema);

export default EmergencyContact;
