import mongoose from 'mongoose';

const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    supportPhone: { type: String, default: '+919876543210', trim: true },
    supportWhatsapp: { type: String, default: '+919876543210', trim: true },
    supportEmail: { type: String, default: 'support@sparedriver.com', trim: true },
    contactAddress: {
      type: String,
      default: 'New Delhi, India',
      trim: true,
    },
    supportHours: {
      type: String,
      default: 'Mon–Sat, 9:00 AM to 6:00 PM',
      trim: true,
    },
    androidAppUrl: { type: String, default: '', trim: true },
    iosAppUrl: { type: String, default: '', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const AppSettings =
  mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
