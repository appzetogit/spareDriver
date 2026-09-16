import mongoose from 'mongoose';
import { SERVICE_TYPES, SERVICE_TYPE_LIST } from '../constants/serviceTypes.js';

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
    /** Refer & Earn program knobs (user + driver configured independently). */
    referralSettings: {
      user: {
        enabled: { type: Boolean, default: true },
        referrerRewardRupees: { type: Number, default: 100, min: 0 },
        referredRewardRupees: { type: Number, default: 0, min: 0 },
        qualificationType: {
          type: String,
          default: 'first_completed_booking',
        },
        minBookingAmountRupees: { type: Number, default: 0, min: 0 },
      },
      driver: {
        enabled: { type: Boolean, default: true },
        referrerRewardRupees: { type: Number, default: 500, min: 0 },
        referredRewardRupees: { type: Number, default: 0, min: 0 },
        requiredCompletedTrips: { type: Number, default: 5, min: 0 },
      },
    },
    /**
     * Driver onboarding document requirements.
     * policeVerificationRequired defaults to false (optional) — Yellow Board / PVC.
     */
    driverDocumentRequirements: {
      policeVerificationRequired: { type: Boolean, default: false },
    },
    /**
     * Payment-rail master switches + per-flow overrides.
     *
     * Effective enablement is ALWAYS `master && flow` — a per-flow
     * toggle can only narrow its master rail, never widen it. That is
     * what makes `razorpayEnabled: false` a genuine kill switch (used
     * to hide Razorpay entirely for an App Store review).
     *
     * Read at CHECKOUT TIME ONLY. Every downstream path keys off the
     * `paymentMethod` persisted on the booking/order, so flipping a
     * toggle never reprices work that is already in flight.
     *
     * See utils/paymentMethods.util.js for the resolution rules — this
     * schema only stores them.
     */
    paymentMethods: {
      razorpayEnabled: { type: Boolean, default: true },
      codEnabled: { type: Boolean, default: false },
      flows: {
        /** Razorpay-only: there is no other way to fund a wallet. */
        walletTopup: {
          razorpay: { type: Boolean, default: true },
        },
        booking: {
          wallet: { type: Boolean, default: true },
          razorpay: { type: Boolean, default: true },
          cod: { type: Boolean, default: false },
        },
        subscriptionCheckout: {
          razorpay: { type: Boolean, default: true },
          cod: { type: Boolean, default: false },
        },
        driverKit: {
          razorpay: { type: Boolean, default: true },
          cod: { type: Boolean, default: false },
        },
      },
      cod: {
        /**
         * Service types COD is offered on. Hourly only — outstation is
         * multi-day and high-value, so the cash exposure and the
         * driver's commission debt would both be large.
         *
         * Function default: a shared array literal would be mutated
         * across documents.
         */
        serviceTypes: {
          type: [String],
          enum: SERVICE_TYPE_LIST,
          default: () => [SERVICE_TYPES.HOURLY],
        },
        allowInstant: { type: Boolean, default: true },
        allowScheduled: { type: Boolean, default: true },
        /** 0 = uncapped. Refuses COD above this cash total. */
        maxBookingValueRupees: { type: Number, default: 0, min: 0 },

        /** Driver cash-dues gating (₹). warn <= block. */
        driverDuesWarnRupees: { type: Number, default: 1000, min: 0 },
        driverDuesBlockRupees: { type: Number, default: 2000, min: 0 },
        /** Stop offering new COD rides at/above this — softer than the online block. */
        driverDuesCodOfferBlockRupees: { type: Number, default: 2000, min: 0 },

        /** Above this, the user cannot book on ANY rail until they settle. */
        userMaxPendingDuesRupees: { type: Number, default: 1000, min: 0 },

        duesSettlement: {
          razorpay: { type: Boolean, default: true },
          /**
           * Always effectively true — `resolveDuesSettlementModes()`
           * forces it on regardless of what is stored here. Without
           * that floor, turning Razorpay off would trap every driver
           * who owes dues: unable to clear them, unable to go online,
           * unable to earn.
           */
          adminManual: { type: Boolean, default: true },
        },
      },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const AppSettings =
  mongoose.models.AppSettings || mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
