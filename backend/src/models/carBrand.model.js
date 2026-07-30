import mongoose from 'mongoose';

const carBrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    /** Absolute URL — Cloudinary upload or jsDelivr brand logo CDN. */
    logo: { type: String, default: '', trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

carBrandSchema.index({ isActive: 1, sortOrder: 1 });

const CarBrand =
  mongoose.models.CarBrand || mongoose.model('CarBrand', carBrandSchema);
export default CarBrand;
