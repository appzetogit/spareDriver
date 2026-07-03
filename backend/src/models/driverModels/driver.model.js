import mongoose from 'mongoose';
import documentSchema from './document.schema.js';
import bankDetailsSchema from './bankDetails.schema.js';
import trainingProgressSchema from './trainingProgress.schema.js';
import vehicleExperienceSchema from './vehicleExperience.schema.js';

// ─── Enums ─────────────────────────────────────────────────────────────────────

// ─── Main Driver Schema ────────────────────────────────────────────────────────

const driverSchema = new mongoose.Schema(
  {
    // ── Step 1: Identity ──────────────────────────────────────────────────────
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
      match: [/^[0-9]{10}$/, 'Phone number must be exactly 10 digits'],
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
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
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    profilePicture: {
      type: String,
      default: '',
      trim: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', ''],
      default: '',
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },

    // ── Step 2: Driving Credentials ───────────────────────────────────────────
    drivingLicense: {
      number: {
        type: String,
        default: '',
        trim: true,
        uppercase: true,
      },
      expiryDate: {
        type: Date,
        default: null,
      },
    },
    experienceYears: {
      type: Number,
      default: 0,
      min: 0,
    },
    availability: {
      type: String,
      enum: ['full-time', 'part-time', 'weekends-only', ''],
      default: '',
    },

    /** Detailed vehicles (category, brand, model, fuel) — max 5 */
    vehicleExperience: {
      type: [vehicleExperienceSchema],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: 'You can add a maximum of 5 vehicles',
      },
      default: [],
    },

    /** Derived unique categories from vehicleExperience (for matching) */
    carTypeExperience: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'CarType',
        },
      ],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: 'You can select a maximum of 5 car types',
      },
      default: [],
    },

    // ── Step 3: Bank Details ──────────────────────────────────────────────────
    bankDetails: {
      type: bankDetailsSchema,
      default: null,
    },

    // ── Step 4: Safety Documents ──────────────────────────────────────────────
    documents: {
      type: [documentSchema],
      default: [],
    },
    safetyDeclaration: {
      agreed: {
        type: Boolean,
        default: false,
      },
      agreedAt: {
        type: Date,
        default: null,
      },
    },

    // ── Step 5: Live identity verification (Aadhaar + licence on camera) ─────
    liveVerificationVideo: {
      videoUrl: { type: String, default: '', trim: true },
      cloudinaryPublicId: { type: String, default: '', trim: true },
      recordedAt: { type: Date, default: null },
      durationSeconds: { type: Number, default: 0, min: 0 },
    },

    // ── Step 6: Training & certification (required videos) ───────────────────
    trainingProgress: {
      type: [trainingProgressSchema],
      default: [],
    },

    // ── Onboarding & Approval ─────────────────────────────────────────────────
    onboardingStep: {
      type: Number,
      default: 1,
      min: 1,
      max: 6,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected', 'suspended'],
      default: 'pending',
      index: true,
    },
    approvalNote: {
      type: String,
      default: '',
      trim: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // admin who approved
      default: null,
    },

    // ── Online / Live Status ──────────────────────────────────────────────────
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    isOnTrip: {
      type: Boolean,
      default: false,
    },
    currentBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    lastOnlineAt: {
      type: Date,
      default: null,
    },

    // ── Location (for nearby driver search) ───────────────────────────────────
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    /** Last time `location` was updated by the live-location pipeline. */
    lastLocationAt: {
      type: Date,
      default: null,
    },
    city: {
      type: String,
      default: '',
      trim: true,
    },

    // ── Realtime / Push ───────────────────────────────────────────────────────
    socketId: {
      type: String,
      default: null,
    },
    fcmToken: {
      type: String,
      default: '',
      trim: true,
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

    // ── Ratings ───────────────────────────────────────────────────────────────
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRatingScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Earnings & Wallet ─────────────────────────────────────────────────────
    wallet: {
      balance: {
        type: Number,
        default: 0,
      },
      totalEarnings: {
        type: Number,
        default: 0,
      },
      totalWithdrawn: {
        type: Number,
        default: 0,
      },
    },
    todaySummary: {
      dateKey: {
        type: String, // e.g. "2026-05-13"
        default: '',
        trim: true,
      },
      trips: {
        type: Number,
        default: 0,
      },
      earnings: {
        type: Number,
        default: 0,
      },
      onlineMinutes: {
        type: Number,
        default: 0,
      },
    },

    // Per-day driver cancellation budget. `dateKey` is rolled over (and
    // `used` reset to 0) the first time the driver tries to cancel on a
    // new local-day. While `used < policy.driverDailyFreeCancellations`
    // AND the cancel happens within `policy.driverGraceMinutes` of the
    // accept timestamp, no rupee penalty is applied. Counter always
    // increments on every cancel.
    cancellationChances: {
      dateKey: { type: String, default: '', trim: true },
      used: { type: Number, default: 0, min: 0 },
    },

    /**
     * Long-running cancellation stats — used by the outstation
     * cancellation policy to lower a driver's dispatch priority when
     * they repeatedly bail on rides. Independent of the daily
     * `cancellationChances` counter (which resets every day).
     *
     *   priorityPenaltyPoints  Higher = lower dispatch priority. The
     *                          outstation assignment picker sorts the
     *                          eligible pool by this number ascending
     *                          (and falls back to rating + distance).
     *                          Admins can reset from the driver detail
     *                          page after manual review.
     *   outstationTotal        Lifetime count of outstation
     *                          cancellations — surfaced in the driver
     *                          detail header.
     *   outstationPenalised    Lifetime count of cancellations that
     *                          actually attracted the full ₹ penalty.
     *   lastCancelledAt        Most recent cancellation timestamp.
     *   recentEvents           Bounded ring (kept ≤ 20) of recent
     *                          cancellations so the admin can audit
     *                          tier/penalty/amount/booking quickly.
     */
    cancellationStats: {
      priorityPenaltyPoints: { type: Number, default: 0, min: 0 },
      outstationTotal: { type: Number, default: 0, min: 0 },
      outstationPenalised: { type: Number, default: 0, min: 0 },
      lastCancelledAt: { type: Date, default: null },
      recentEvents: {
        type: [
          new mongoose.Schema(
            {
              at: { type: Date, default: Date.now },
              bookingId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Booking',
                default: null,
              },
              serviceType: { type: String, default: '' },
              tier: { type: String, default: '' },
              penalty: { type: Number, default: 0, min: 0 },
              priorityPoints: { type: Number, default: 0, min: 0 },
              hoursUntilPickup: { type: Number, default: null },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },

    // ── Referral ──────────────────────────────────────────────────────────────
    referralCode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // allows empty strings without unique conflict
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },

    // ── Trip preferences ─────────────────────────────────────────────────────
    /**
     * Per-driver opt-in for outstation (multi-day round-trip) assignments.
     * Outstation is dispatched manually by admins (see
     * `bookingOutstationAssignment.service.js`), and the picker only
     * surfaces drivers with this flag set to `true`. Drivers can flip it
     * from the home screen — default is `false` so a brand-new
     * driver isn't surprised by an overnight job.
     *
     * `outstationAvailabilityUpdatedAt` is stamped on every toggle so
     * admins can sort the picker by "recently confirmed availability".
     *
     * `preferredOutstationZones` is the set of zones the driver is
     * willing to take outstation pickups from. The driver UI requires
     * at least one zone before the toggle can flip on, so this array
     * is guaranteed non-empty whenever `availableForOutstation` is
     * true (modulo legacy rows opted in before this constraint
     * existed — those keep working but are nudged to pick a zone
     * the next time they edit their preference).
     */
    availableForOutstation: {
      type: Boolean,
      default: false,
      index: true,
    },
    outstationAvailabilityUpdatedAt: {
      type: Date,
      default: null,
    },
    preferredOutstationZones: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
      default: [],
      index: true,
    },
    /** Driver confirmed they are OK with all-India / multi-state outstation trips. */
    outstationAllIndiaOk: {
      type: Boolean,
      default: false,
    },
    /** Self-declared max driving hours per day on outstation trips. */
    outstationMaxDrivingHoursPerDay: {
      type: Number,
      default: null,
      min: 4,
      max: 16,
    },
    /** Set when the driver completes the first-time outstation preference form. */
    outstationPreferencesCompletedAt: {
      type: Date,
      default: null,
    },

    // ── Driver kit (mandatory before going online) ───────────────────────────
    activeKitOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KitOrder',
      default: null,
    },
    canGoOnline: {
      type: Boolean,
      default: false,
    },
    kitEligibilityCheckedAt: {
      type: Date,
      default: null,
    },

    // ── Soft Delete ───────────────────────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

// ─── Indexes ───────────────────────────────────────────────────────────────────

// Geospatial index for finding nearby drivers
driverSchema.index({ location: '2dsphere' });

// Compound indexes for common queries
driverSchema.index({ isOnline: 1, isOnTrip: 1, approvalStatus: 1 }); // available drivers
driverSchema.index({ phone: 1, isDeleted: 1 });                       // login lookup
driverSchema.index({ approvalStatus: 1, isDeleted: 1, createdAt: -1 }); // admin dashboard
driverSchema.index({ carTypeExperience: 1 });                          // filter by car expertise

// ─── Export ────────────────────────────────────────────────────────────────────

export const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
