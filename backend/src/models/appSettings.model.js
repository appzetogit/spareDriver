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
    instagramUrl: { type: String, default: '', trim: true },
    facebookUrl: { type: String, default: '', trim: true },
    twitterUrl: { type: String, default: '', trim: true },
    linkedinUrl: { type: String, default: '', trim: true },
    youtubeUrl: { type: String, default: '', trim: true },
    /**
     * Platform GST / tax identity printed on customer invoices.
     * Leave gstin empty to omit the block from PDFs.
     */
    gstDetails: {
      gstin: { type: String, default: '', trim: true, uppercase: true },
      legalName: { type: String, default: '', trim: true },
      tradeName: { type: String, default: '', trim: true },
      address: { type: String, default: '', trim: true },
      state: { type: String, default: '', trim: true },
      stateCode: { type: String, default: '', trim: true },
      pan: { type: String, default: '', trim: true, uppercase: true },
    },
    /**
     * Dedicated-driver subscription auto-search knobs
     * (mirrors scheduled/outstation inbox dispatch).
     */
    subscriptionDispatch: {
      AUTO_SEARCH_ENABLED: { type: Boolean, default: true },
      ESCALATE_MINUTES: { type: Number, default: 1440, min: 5 },
      INBOX_BROADCAST_LIMIT: { type: Number, default: 50, min: 1, max: 100 },
      SEARCH_RADIUS_METERS: { type: Number, default: 25000, min: 1000 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const AppSettings =
  mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
