import mongoose from 'mongoose';

const fuelTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, uppercase: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

fuelTypeSchema.index({ isActive: 1, sortOrder: 1 });

const FuelType =
  mongoose.models.FuelType || mongoose.model('FuelType', fuelTypeSchema);
export default FuelType;
