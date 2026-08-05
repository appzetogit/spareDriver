import mongoose from 'mongoose';

const carTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    type: String, // URL/Path for the car type icon
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const CarType = mongoose.models.CarType || mongoose.model('CarType', carTypeSchema);
export default CarType;
