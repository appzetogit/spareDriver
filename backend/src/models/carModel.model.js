import mongoose from 'mongoose';

const carModelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, uppercase: true },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CarBrand',
      required: true,
    },
    carTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CarType',
      default: null,
    },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

carModelSchema.index({ brandId: 1, name: 1 }, { unique: true });
carModelSchema.index({ brandId: 1, carTypeId: 1, isActive: 1 });

const CarModel =
  mongoose.models.CarModel || mongoose.model('CarModel', carModelSchema);
export default CarModel;
