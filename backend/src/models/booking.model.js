import mongoose from 'mongoose';
import { SERVICE_TYPE_LIST } from '../constants/serviceTypes.js';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_LIST,
  BOOKING_PAYMENT_STATUS,
  PAYMENT_MODE,
  PAYMENT_MODE_LIST,
  BOOKING_TYPE,
  BOOKING_TYPE_LIST,
  DISPATCH,
  DISPATCH_RESPONSE,
} from '../constants/bookingStatus.js';

/* ------------------------------------------------------------------ */
/* Sub-schemas                                                         */
/* ------------------------------------------------------------------ */

// Shared by pickup + dropoff. Dropoff is optional today (hourly defaults it
// to the pickup; outstation already mirrors it into `outstation.destinationAddress`).
const placeSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    city: { type: String, default: '', trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  { _id: false },
);

const hourlyDetailsSchema = new mongoose.Schema(
  {
    scheduledStartAt: { type: Date, required: true },
    durationHours: { type: Number, required: true, min: 1 },
    slabId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** True when the user booked via the custom-hours option (no slab). */
    isCustomDuration: { type: Boolean, default: false },
  },
  { _id: false },
);

const outstationDetailsSchema = new mongoose.Schema(
  {
    destinationAddress: { type: String, required: true, trim: true },
    // Exact pickup / expected return DATETIMES the customer chose. These
    // are the authoritative bounds of the trip and drive the conflict
    // service's window. `startDate` / `endDate` are kept as back-compat
    // aliases (set to the same Date values at create-time) so legacy
    // readers and historical bookings keep working.
    pickupAt: { type: Date, default: null },
    expectedReturnAt: { type: Date, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 },
    nights: { type: Number, default: 0, min: 0 },
    needsStay: { type: Boolean, default: true },
    needsFood: { type: Boolean, default: true },
    estimatedKm: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/** Snapshot of pricing engine output at booking-creation time. */
const fareSnapshotSchema = new mongoose.Schema(
  {
    pricingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePricing', default: null },
    baseFare: { type: Number, required: true, min: 0 },
    extras: { type: Number, default: 0, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    couponDiscount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: null, trim: true },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    total: { type: Number, required: true, min: 0 },
    /** Full pricing engine output retained for display + audit. */
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSubscription', default: null },
  },
  { _id: false },
);

const dispatchOfferSchema = new mongoose.Schema(
  {
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    offeredAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    response: {
      type: String,
      enum: Object.values(DISPATCH_RESPONSE),
      default: null,
    },
    distanceMeters: { type: Number, default: null },
  },
  { _id: false },
);

const dispatchSchema = new mongoose.Schema(
  {
    /** History of every driver offered, including their response. */
    offers: { type: [dispatchOfferSchema], default: [] },

    /**
     * Driver IDs that currently hold a live offer.
     * Wave mode: up to DISPATCH.WAVE_SIZE in parallel with expiry.
     * Inbox mode (scheduled): all matching drivers, no expiry — first
     * accept wins and clears the list for everyone else.
     */
    pendingOfferIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Driver' }],
      default: [],
    },
    /**
     * When this wave's offers expire (wave mode only). Null for inbox
     * mode — scheduled requests stay open until accept / escalate / cancel.
     */
    currentExpiresAt: { type: Date, default: null },

    /**
     * `wave` (instant timed offers) or `inbox` (scheduled open requests).
     * See DISPATCH_MODE in bookingStatus.js.
     */
    mode: { type: String, enum: ['wave', 'inbox'], default: 'wave' },

    /**
     * Radius (in metres) used to find candidate drivers for the current wave.
     * Each empty/expired wave can expand this up to SEARCH_RADIUS_MAX_METERS.
     */
    currentRadiusMeters: {
      type: Number,
      default: DISPATCH.SEARCH_RADIUS_START_METERS,
    },
    /** Hard ceiling for radius expansion (cap from booking creation). */
    maxRadiusMeters: {
      type: Number,
      default: DISPATCH.SEARCH_RADIUS_MAX_METERS,
    },

    /** Number of waves issued so far (wave mode). Inbox uses a single broadcast. */
    attemptsCount: { type: Number, default: 0 },
    /** Max number of waves before declaring no_drivers_found (wave mode). */
    maxAttempts: { type: Number, default: DISPATCH.MAX_ATTEMPTS },
  },
  { _id: false },
);

const razorpaySchema = new mongoose.Schema(
  {
    orderId: { type: String, default: null },
    paymentId: { type: String, default: null },
    signature: { type: String, default: null },
    amountPaise: { type: Number, default: null },
    refundId: { type: String, default: null },
  },
  { _id: false },
);

/**
 * In-ride extensions. The user is prompted near the end of their booked
 * duration; if they accept, an entry lands here with the agreed extra hours
 * and the incremental fare. `fareDelta` is added on top of `fareSnapshot.total`
 * when the payment service computes the amount due — see `payment` below for
 * the running balance.
 */
/**
 * Lifecycle of an extension request:
 *
 *   pending_otp     — customer hit Extend, server generated a 4-digit
 *                     code and pushed it to the driver. Waiting for the
 *                     customer to enter the code (they ask the driver
 *                     in person, just like the ride-start OTP).
 *   pending_payment — OTP verified, fareDelta is locked in. Waiting
 *                     for the customer to confirm payment from wallet.
 *   accepted        — payment debited; extension is live; bookedHours
 *                     and timeline updated.
 *   declined        — driver refused (rare, post-payment is a manual
 *                     admin path).
 *   expired         — customer didn't pay/verify within the window.
 *
 * Legacy "pending" rows from before this flow are coerced to
 * `pending_payment` for back-compat (they had fareDelta + accepted by
 * default; the server now requires the OTP+pay handshake).
 */
const extensionSchema = new mongoose.Schema(
  {
    requestedAt: { type: Date, default: Date.now },
    /**
     * Hourly/scheduled extension amount in fractional hours
     * (0.25 = 15 min, 0.5 = 30 min). Outstation rows set this to
     * days × 24 so legacy aggregations that read this field
     * keep producing sensible numbers.
     */
    additionalHours: { type: Number, required: true, min: 0 },
    /**
     * Outstation day-extension amount (whole calendar days). Zero for
     * hourly/scheduled extensions AND for outstation hour-slice
     * extensions. When > 0 the row is treated as a day extension
     * (additionalHours is set to days × 24 for legacy readers).
     */
    additionalDays: { type: Number, default: 0, min: 0 },
    fareDelta: { type: Number, required: true, min: 0 },
    /**
     * Snapshot of the fare math at initiate time. Captures everything
     * we need at `accepted` time to (a) credit the driver their share
     * and (b) reconcile the platform commission ledger without having
     * to re-query pricing — which may have shifted mid-ride.
     *
     *   { subtotal, serviceCharge, serviceChargePercent,
     *     gst, gstPercent,
     *     driverEarning, platformCommission, platformCommissionPercent,
     *     ratePerHour }
     */
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: [
        'pending_otp',
        'pending_payment',
        'accepted',
        'declined',
        'expired',
        // Legacy:
        'pending',
      ],
      default: 'pending_otp',
    },
    /**
     * Customer reads this code aloud to the driver, who reads it back
     * to the customer's screen. We never emit `code` to the customer
     * directly — the driver app gets it via the EXTENSION_OTP socket
     * event so it stays a true human handshake.
     */
    otp: {
      code: { type: String, default: '' },
      generatedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      // When the OTP window closes the row auto-expires. The
      // `bookingExtensionTimeout.service.js` watcher uses this.
      expiresAt: { type: Date, default: null },
    },
    /** WalletTransaction _id for the fareDelta debit (once paid). */
    paymentTxId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
    paidAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    driverNotifiedAt: { type: Date, default: null },
    /**
     * Set when payExtension bumps outstation expectedReturnAt / days
     * for this row. Lets the FE countdown skip re-adding additionalDays
     * for already-applied windows (and still correct legacy rows that
     * were accepted before the bump existed).
     */
    windowAppliedAt: { type: Date, default: null },
    /**
     * True iff the driver actively dismissed the extension request
     * from their app (vs. customer-cancel, timeout, or trip end). The
     * customer-facing UX uses this to show a distinct "Driver couldn't
     * process this — try again" message rather than the generic
     * cancel/expire copy.
     */
    dismissedByDriver: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false },
);

/**
 * OTP the customer reads out to the driver at pickup. We never emit `code` to
 * the driver — they ask the customer in person, type it back, and the server
 * verifies. `attempts` lets us throttle abuse without locking the booking.
 */
const rideStartOtpSchema = new mongoose.Schema(
  {
    code: { type: String, default: null },
    generatedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Running payment state across every charge against the booking.
 * `fareSnapshot` is immutable; this sub-doc tracks what's actually been
 * collected so far so extensions and partial pre-payments compose
 * correctly:
 *
 *   amountDue = effectiveTotal − amountPaidRupees
 *
 * `attempts` counts Razorpay-order retries during the AWAITING_PAYMENT
 * window — used to refresh the auto-cancel deadline (see
 * bookingPaymentTimeout.service.js).
 *
 * `walletTxId` points to the WalletTransaction row that debited the
 * user when this booking was paid from the wallet. It lets cancel /
 * no-driver-found paths credit the exact amount back without consulting
 * a separate refund table.
 */
const paymentLedgerSchema = new mongoose.Schema(
  {
    amountPaidRupees: { type: Number, default: 0, min: 0 },
    attempts: { type: Number, default: 0, min: 0 },
    walletTxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
  },
  { _id: false },
);

/**
 * Which rail the customer actually paid through.
 *
 *   wallet   — fare debited from the user's wallet at booking creation
 *              (the default, post-refactor).
 *   razorpay — legacy "Pay Now after driver accepts" flow.
 */
export const BOOKING_PAYMENT_METHOD = Object.freeze({
  WALLET: 'wallet',
  RAZORPAY: 'razorpay',
});
const BOOKING_PAYMENT_METHOD_LIST = Object.values(BOOKING_PAYMENT_METHOD);

/* ------------------------------------------------------------------ */
/* Main schema                                                         */
/* ------------------------------------------------------------------ */

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, required: true, unique: true, index: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null, index: true },
    /** The user's own car the assigned driver will drive on this booking. */
    carId: { type: mongoose.Schema.Types.ObjectId, ref: 'Car', required: true },

    serviceType: { type: String, enum: SERVICE_TYPE_LIST, required: true },
    /** Whether this is an instant ("now") or a future-scheduled booking. */
    bookingType: {
      type: String,
      enum: BOOKING_TYPE_LIST,
      default: BOOKING_TYPE.INSTANT,
      required: true,
    },
    pickup: { type: placeSchema, required: true },
    /**
     * Drop location. Optional today: hourly bookings default it to the pickup
     * if the user didn't separately pick a dropoff. Outstation continues to
     * persist the destination in `outstation.destinationAddress`.
     */
    dropoff: { type: placeSchema, default: null },

    hourly: { type: hourlyDetailsSchema, default: null },
    outstation: { type: outstationDetailsSchema, default: null },

    fareSnapshot: { type: fareSnapshotSchema, required: true },

    /**
     * The customer's payment timing. Created bookings default to
     * `post_ride`; the dispatch service flips the booking to `pre_ride`
     * + AWAITING_PAYMENT the moment a driver accepts.
     */
    paymentMode: {
      type: String,
      enum: PAYMENT_MODE_LIST,
      default: PAYMENT_MODE.POST_RIDE,
      required: true,
    },
    /**
     * Which rail the customer paid through. `wallet` means the fare was
     * debited from `User.wallet.balance` at booking creation (the new
     * default). `razorpay` is the legacy "pay after accept" path.
     */
    paymentMethod: {
      type: String,
      enum: BOOKING_PAYMENT_METHOD_LIST,
      default: BOOKING_PAYMENT_METHOD.WALLET,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(BOOKING_PAYMENT_STATUS),
      default: BOOKING_PAYMENT_STATUS.NOT_DUE_YET,
    },
    razorpay: { type: razorpaySchema, default: () => ({}) },

    status: { type: String, enum: BOOKING_STATUS_LIST, default: BOOKING_STATUS.SEARCHING, index: true },

    /**
     * Zones the pickup point falls inside at booking-creation time.
     * Persisted (rather than recomputed) so the admin emergency-pool
     * list can filter for team_member staff by `assignedZones` without
     * a per-row geo lookup. Empty when no zone matched (or when the
     * geo lookup failed — best-effort, never blocks creation).
     */
    zoneIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
      default: [],
      index: true,
    },

    /**
     * Lifecycle metadata for the scheduled-ride dispatcher. Populated
     * only when the booking is created with `bookingType = scheduled`.
     *
     *   tier             which branch of the schedule decision tree
     *                    fired: 'morning' | 'morning_lead' |
     *                    'short_window' | 'long_lead' |
     *                    'outstation_days' (calendar-day outstation)
     *   assignAt         server time at which `kickoffScheduledAssignment`
     *                    is expected to run (null = "search immediately")
     *   escalateAt       server time at which `escalateToEmergencyPool`
     *                    will fire if no driver is assigned by then
     *   assignmentStartedAt  set when the worker actually flips
     *                    PENDING_ASSIGNMENT → SEARCHING
     *   retryAttempts    number of times the wave dispatcher has come
     *                    back empty and we've re-queued a `retry` job.
     *                    Bounded by `escalateAt` (we stop retrying and
     *                    let the escalate job take over when there's no
     *                    runway left).
     *   lastRetryAt      timestamp of the most recent retry kickoff —
     *                    surfaced in the admin "Scheduled Jobs" board.
     *   remindersEnqueuedAt  set when reminder jobs have been pushed to
     *                    the queue (one-shot, after a driver was
     *                    actually assigned). Reminders are NOT enqueued
     *                    at booking-creation time any more.
     *   escalatedAt      set when the booking lands in the emergency pool
     *   emergencyPool    audit + UI state for the manual-assignment
     *                    queue (notes the admin who took it, etc.)
     */
    scheduled: {
      tier: {
        type: String,
        enum: [
          'morning',
          'morning_lead',
          'short_window',
          'long_lead',
          'outstation_days',
          '',
        ],
        default: '',
      },
      assignAt: { type: Date, default: null },
      escalateAt: { type: Date, default: null },
      assignmentStartedAt: { type: Date, default: null },
      retryAttempts: { type: Number, default: 0, min: 0 },
      lastRetryAt: { type: Date, default: null },
      remindersEnqueuedAt: { type: Date, default: null },
      escalatedAt: { type: Date, default: null },
      emergencyPool: {
        enteredAt: { type: Date, default: null },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        assignedAt: { type: Date, default: null },
        notes: { type: String, default: '' },
      },
      /** Staff manual assign from Scheduled Bookings (any open status). */
      manualAssign: {
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        assignedAt: { type: Date, default: null },
        notes: { type: String, default: '' },
        reassigned: { type: Boolean, default: false },
        previousDriverId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Driver',
          default: null,
        },
      },
    },

    dispatch: { type: dispatchSchema, default: () => ({}) },
    extensions: { type: [extensionSchema], default: [] },
    rideStartOtp: { type: rideStartOtpSchema, default: () => ({}) },
    payment: { type: paymentLedgerSchema, default: () => ({}) },

    /** Timeline timestamps — populated lazily as states transition. */
    timeline: {
      createdAt: { type: Date, default: Date.now },
      driverAssignedAt: { type: Date, default: null },
      /**
       * Hard deadline by which the customer must complete pre-pay. Set on
       * driver-accept and refreshed on each Pay Now click (so a retry
       * always has at least PAYMENT_DEADLINE_SECONDS of runway). The
       * server-side timer in bookingPaymentTimeout.service.js is the
       * source of truth; this timestamp exists so both the user UI and
       * the driver overlay can render an honest countdown.
       */
      paymentDeadlineAt: { type: Date, default: null },
      paymentReceivedAt: { type: Date, default: null },
      enRouteAt: { type: Date, default: null },
      arrivedAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
    },

    cancellation: {
      reason: { type: String, default: '' },
      cancelledBy: { type: String, enum: ['user', 'driver', 'system', 'admin', ''], default: '' },
      feeCharged: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      // Split of `feeCharged` between the driver who was mobilised and
      // the platform — driven by `ServicePricing.cancellation.driverSharePercent`.
      // `driverShare + companyShare === feeCharged`. Persisted so the
      // admin audit (and the Revenue page) can reconcile the books.
      driverShare: { type: Number, default: 0 },
      companyShare: { type: Number, default: 0 },
      /**
       * Free-form tier id stamped by the cancellation policy engine
       * (e.g. `outstation_more_than_24h`, `outstation_arrived`,
       * `outstation_driver_within_6h`). Drives FE copy + admin audits
       * without having to re-derive from the reason/status alone.
       */
      tier: { type: String, default: '' },
      /**
       * Snapshot of `hours until pickup` at cancellation time —
       * outstation policy keys off this. Persisted so a later refund
       * dispute can reconstruct the exact tier we charged.
       */
      hoursUntilPickup: { type: Number, default: null },
    },

    /**
     * Waiting charge accrued between the driver hitting "I've arrived"
     * and the trip actually starting (OTP verification). Computed when
     * `startTripService` fires using the live admin policy:
     *
     *   billableWait = max(0, waitedMinutes − freeWaitingMinutes)
     *   billableWait = min(billableWait, maxBillableMinutes)
     *   chargeRupees = billableWait × perMinuteRupees
     *
     * The buffer (`bufferRupees`) is pre-collected at booking creation
     * so we never have to chase the customer for the waiting charge.
     * At trip-end / no-show-auto-complete we settle:
     *
     *   bufferConsumedRupees = min(chargeRupees, bufferRupees)
     *   bufferRefundRupees   = bufferRupees − bufferConsumedRupees
     *
     * `bufferRefundRupees` is credited back to the user's wallet via
     * the same wallet ledger used elsewhere — `bufferRefundTxId` points
     * at the resulting WalletTransaction row.
     */
    waiting: {
      waitedMinutes: { type: Number, default: 0, min: 0 },
      billableMinutes: { type: Number, default: 0, min: 0 },
      chargeRupees: { type: Number, default: 0, min: 0 },
      freeMinutes: { type: Number, default: 0, min: 0 },
      perMinuteRupees: { type: Number, default: 0, min: 0 },
      maxBillableMinutes: { type: Number, default: 0, min: 0 },
      bufferRupees: { type: Number, default: 0, min: 0 },
      bufferConsumedRupees: { type: Number, default: 0, min: 0 },
      bufferRefundRupees: { type: Number, default: 0, min: 0 },
      bufferRefundTxId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WalletTransaction',
        default: null,
      },
      // Set when the no-show flow auto-completes a ride the customer
      // never showed up for. Lets the driver-history UI badge the
      // booking with a "no-show" pill and admin audits filter on it.
      noShow: { type: Boolean, default: false },
    },

    /**
     * No-show prompt state. Lifecycle:
     *
     *   1. Driver hits ARRIVED → server schedules a job for
     *      `noShowPromptMinutes` later.
     *   2. Job fires → `promptSentAt` set + customer notified.
     *      `promptDeadlineAt` = promptSentAt + noShowGraceMinutes.
     *   3. Customer responds:
     *        Yes → `customerResponse = 'on_my_way'`, reschedule.
     *        No  → `customerResponse = 'not_coming'`, auto-complete.
     *   4. No response by deadline → auto-complete.
     *
     * `firedFor` records the minute threshold that triggered the
     * prompt so consecutive "on_my_way" responses can each re-prompt
     * at a later threshold without losing the audit trail.
     */
    noShow: {
      promptSentAt: { type: Date, default: null },
      promptDeadlineAt: { type: Date, default: null },
      customerResponse: {
        type: String,
        enum: ['', 'on_my_way', 'not_coming'],
        default: '',
      },
      respondedAt: { type: Date, default: null },
      firedFor: { type: Number, default: 0 }, // minute threshold that triggered the prompt
    },

    /**
     * Post-trip ratings, one from each side. Both sub-docs default to
     * `null` until the customer / driver submits via the rating pages
     * that open after `COMPLETED`. The customer rating also rolls into
     * `Driver.rating` / `ratingCount` / `totalRatingScore` as a running
     * average — the booking row keeps the per-trip record for audits
     * and to let admins surface "what did THIS rider think of THIS
     * driver".
     *
     * `customer.stars`  user-submitted 1..5 stars for the driver.
     * `customer.review` optional free-text review (≤500 chars).
     * `driver.stars`    driver-submitted 1..5 stars for the customer.
     * `driver.review`   reserved for future use; the driver UI does
     *                   not capture free text today but the field is
     *                   here so a later iteration doesn't need a
     *                   migration.
     */
    rating: {
      customer: {
        stars: { type: Number, default: null, min: 0, max: 5 },
        review: { type: String, default: '', trim: true, maxlength: 500 },
        ratedAt: { type: Date, default: null },
      },
      driver: {
        stars: { type: Number, default: null, min: 0, max: 5 },
        review: { type: String, default: '', trim: true, maxlength: 500 },
        ratedAt: { type: Date, default: null },
      },
    },

    /**
     * Admin settle for outstation arrivals where the customer never
     * started the trip (no OTP). Prepaid fare is split into platform
     * commission/fee, a manual driver payout, and a user wallet refund.
     * Distinct from hourly no-show auto-complete.
     */
    adminSettlement: {
      kind: {
        type: String,
        enum: ['', 'outstation_arrived_no_otp'],
        default: '',
      },
      driverPayoutRupees: { type: Number, default: 0, min: 0 },
      userRefundRupees: { type: Number, default: 0, min: 0 },
      commissionKept: { type: Number, default: 0, min: 0 },
      platformFeeKept: { type: Number, default: 0, min: 0 },
      amountPaidRupees: { type: Number, default: 0, min: 0 },
      settledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      settledAt: { type: Date, default: null },
      notes: { type: String, default: '', trim: true, maxlength: 500 },
      userRefundTxId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WalletTransaction',
        default: null,
      },
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

/* Geo + dispatch-friendly indexes. */
bookingSchema.index({ 'pickup.location': '2dsphere' });
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ driverId: 1, status: 1, createdAt: -1 });
/* Emergency-pool list: filter by status (+ optional zone) ordered by ride time. */
bookingSchema.index({ status: 1, 'hourly.scheduledStartAt': 1 });

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
export default Booking;
