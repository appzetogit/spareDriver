import mongoose from 'mongoose';

const savedLocationSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      required: true,
      maxlength: 300,
    },
    city: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    googleId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    phone_no: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    /** Optional emergency / alternate mobile collected at signup */
    alternatePhone: {
      type: String,
      trim: true,
      default: '',
      match: [/^[0-9]{10}$|^$/, 'Alternate phone must be exactly 10 digits'],
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'sub_admin', 'team_member', 'driver'],
      default: 'user',
    },
    profilePicture: {
      type: String,
      default: '',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    fcmToken: {
      type: String,
      default: '',
    },
    fcmTokenWeb: {
      type: String,
      default: '',
      trim: true,
    },
    fcmTokenMobile: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
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
      }
    ],
    savedLocations: {
      type: [savedLocationSchema],
      default: [],
      validate: {
        validator: (arr) => !arr || arr.length <= 20,
        message: 'You can save up to 20 favourite locations',
      },
    },

    /**
     * In-app wallet. All currency values are rupees (paise are only used
     * at the Razorpay boundary). Mutations MUST go through
     * services/wallet.service.js so the ledger (WalletTransaction)
     * stays in sync with the running balance.
     *
     *   balance        — current usable balance (₹)
     *   totalCredited  — lifetime credits (top-ups + refunds)
     *   totalSpent     — lifetime debits (booking payments + retained fees)
     *   currency       — kept for forward-compat; INR is the only value today
     */
    wallet: {
      balance: { type: Number, default: 0, min: 0 },
      totalCredited: { type: Number, default: 0, min: 0 },
      totalSpent: { type: Number, default: 0, min: 0 },
      /**
       * Soft-held portion of `balance` reserved against active bookings'
       * waiting-charge buffer. The money stays in the wallet (`balance`
       * is NOT decremented) but the user cannot spend it elsewhere
       * because every debit checks `balance − heldRupees ≥ amount`.
       *
       * Lifecycle:
       *   booking created → heldRupees += booking.waiting.bufferRupees
       *   trip completes  → actual waiting debited from balance, hold released
       *   booking cancel  → hold released (no debit)
       */
      heldRupees: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: 'INR', trim: true },
    },

    /**
     * Zones a `sub_admin` or `team_member` is responsible for.
     *
     * Drives visibility on bookings, emergency pool, live map, and
     * zone-scoped admin notifications. Super admin sees everything
     * regardless of this list.
     */
    assignedZones: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
