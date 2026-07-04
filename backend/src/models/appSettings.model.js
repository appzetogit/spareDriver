import mongoose from 'mongoose';

const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    supportPhone: { type: String, default: '+919876543210', trim: true },
    supportWhatsapp: { type: String, default: '+919876543210', trim: true },
    supportEmail: { type: String, default: 'support@sparedriver.com', trim: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const AppSettings =
  mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
