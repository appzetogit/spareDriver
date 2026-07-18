import mongoose from 'mongoose';

const carSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    carTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CarType',
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CarBrand',
      required: true,
    },
    modelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CarModel',
      required: true,
    },
    fuelTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FuelType',
      required: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    transmission: {
      type: String,
      enum: ['manual', 'automatic'],
      required: true,
    },
    image: {
      type: String,
      default: '',
    },
    /** Motor insurance policy expiry (date-only). */
    insuranceExpiry: {
      type: Date,
      default: null,
    },
    /** Pollution Under Control (PUC) certificate expiry (date-only). */
    pucExpiry: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    conditions: [
      {
        conditionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'PlatformCondition',
        },
        value: {
          type: Boolean,
          default: null,
        },
      },
    ],
  },
  { timestamps: true },
);

const Car = mongoose.models.Car || mongoose.model('Car', carSchema);
export default Car;
