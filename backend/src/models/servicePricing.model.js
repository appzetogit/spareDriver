import mongoose from 'mongoose';
import { SERVICE_TYPE_LIST } from '../constants/serviceTypes.js';

// ─── Hourly: slab inside a service type — e.g. "Up to 1 Hour → ₹299" ──────────
const slabSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    minHours: { type: Number, required: true, min: 0 },
    maxHours: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true },
);

const waitingChargeSchema = new mongoose.Schema(
  {
    /**
     * Free wait the customer gets after the driver hits "I've arrived".
     * Within this window, no waiting charge accrues. Beyond it, every
     * additional minute costs `chargePerMinute`.
     */
    freeWaitingMinutes: { type: Number, default: 15, min: 0 },
    chargePerMinute: { type: Number, default: 2, min: 0 },
    /**
     * Minutes between consecutive "Are you coming?" prompts to the
     * customer after the free-wait window expires. The first prompt
     * fires `freeWaitingMinutes + noShowPromptMinutes` after arrival.
     * If the customer responds "on my way" we re-arm another prompt
     * the same number of minutes later. After `maxNoShowPrompts` such
     * cycles the next prompt becomes terminal — see below.
     */
    noShowPromptMinutes: { type: Number, default: 15, min: 0 },
    /**
     * Grace minutes the customer has to respond to the FINAL (terminal)
     * no-show prompt. After this window expires (or the customer says
     * "no") the booking is closed as a no-show: a configured fee is
     * charged (flat ₹ or % of paid; default 20%) and the remainder is
     * refunded. Waiting buffer is released unused.
     */
    noShowGraceMinutes: { type: Number, default: 5, min: 0 },
    /**
     * Fee charged when a booking ends as a customer no-show (missed
     * prompt / "not coming"). Mirrors cancellation fee knobs:
     *   'flat'       → `noShowFeeAmount` ₹
     *   'percentage' → `noShowFeeAmount` % of amount paid
     * Missing / zero amount falls back to 20% of paid.
     */
    noShowFeeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'percentage',
    },
    noShowFeeAmount: { type: Number, default: 20, min: 0 },
    /**
     * Hard cap on how many times we re-prompt before the cycle goes
     * terminal. 0 reproduces the legacy single-prompt behaviour
     * (one prompt → grace → auto-complete). With the default of 2:
     *   prompt #1 → user says yes →
     *   prompt #2 → user says yes →
     *   prompt #3 (terminal) → grace → auto-complete.
     */
    maxNoShowPrompts: { type: Number, default: 2, min: 0, max: 5 },
    /**
     * Hard ceiling on billable wait minutes. Drives both the bill cap
     * (we never charge for more than this many minutes of wait,
     * regardless of cadence) and the buffer size collected at booking
     * creation:
     *   bufferRupees = maxBillableMinutes × chargePerMinute
     *
     * The buffer is debited from the wallet alongside the base fare so
     * we always have money in hand for the no-show case. The unused
     * portion is credited back to the wallet at trip-end.
     *
     * The pricing validator enforces
     *   maxBillableMinutes ≥ (maxNoShowPrompts + 1) × noShowPromptMinutes
     *                      + noShowGraceMinutes
     * so the buffer always covers the worst-case cadence.
     */
    maxBillableMinutes: { type: Number, default: 45, min: 0 },
  },
  { _id: false },
);

const nightChargeSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    /** 24h "HH:mm" */
    startTime: { type: String, default: '22:00' },
    endTime: { type: String, default: '06:00' },
    type: { type: String, enum: ['flat', 'percentage'], default: 'flat' },
    amount: { type: Number, default: 0, min: 0 },
    /**
     * Optional duration-based trigger. When set (> 0), any booking whose
     * `bookedHours` (hourly) or `days × 24` (outstation) crosses this
     * threshold pays the night charge regardless of the time window.
     * Use 0 to disable (window-only behaviour).
     */
    thresholdHours: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const foodAllowanceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    /** ₹ added per day (outstation) or per booking (hourly) when food is owed. */
    amount: { type: Number, default: 0, min: 0 },
    /**
     * Hourly-only: minimum booked duration (hours) at which food becomes
     * payable. Charge kicks in when `bookedHours >= thresholdHours`. Ignored
     * for outstation (food is per-day there).
     */
    thresholdHours: { type: Number, default: 4, min: 0 },
    /**
     * If true, the booking UI exposes a "I'll arrange food" toggle once
     * the threshold is crossed so the user can opt out of the allowance.
     * Outstation always honours this (`needsFood` lives on the booking).
     */
    userOptOut: { type: Boolean, default: true },
  },
  { _id: false },
);

/**
 * Driver accommodation allowance for HOURLY bookings whose duration
 * extends past the configured `thresholdHours` (e.g. an overnight
 * 12-hour booking). Outstation has its own per-night stay charge under
 * `outstation.stayChargePerNight`.
 */
const stayAllowanceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    amount: { type: Number, default: 0, min: 0 },
    thresholdHours: { type: Number, default: 8, min: 0 },
    userOptOut: { type: Boolean, default: true },
  },
  { _id: false },
);

// ─── Hourly: custom-duration option ───────────────────────────────────────────
const customHoursSchema = new mongoose.Schema(
  {
    /** Whether users can request a duration not covered by the slabs. */
    enabled: { type: Boolean, default: false },
    /** Upper bound for the custom hours input (0 = unlimited). */
    maxHours: { type: Number, default: 24, min: 0 },
    /** ₹ per hour applied as the base package price for custom bookings. */
    ratePerHour: { type: Number, default: 0, min: 0 },
    /** Customer-facing label shown on the slab picker. */
    label: { type: String, default: 'Custom duration', trim: true },
  },
  { _id: false },
);

// ─── Outstation-specific block ────────────────────────────────────────────────
//
// Pricing model (current):
//   total = dailyRate × days
//         + (customer arranges food ? 0 : foodAllowancePerDay   × days)
//         + (customer arranges stay ? 0 : stayAllowancePerNight × nights)
//         + serviceCharge + GST
//
// Today the customer UI exposes ONE toggle that flips both `needsFood`
// and `needsStay` together, so the two allowances waive in lockstep —
// but the model keeps them separate so admins can tune the daytime
// food allowance independently from the per-night accommodation
// allowance (the two costs scale differently — food per day, stay per
// overnight halt).
//
// Toll & parking are NOT billed by the platform on outstation — the
// customer settles those directly with the driver. We surface a notice
// on the booking flow but never add a rupee for them in the fare.
//
// `allowancePerNight` is a LEGACY combined per-night field. New
// pricing docs should use the split `foodAllowancePerDay` +
// `stayAllowancePerNight` fields below. The fare engine falls back to
// `allowancePerNight × nights` only when BOTH new fields are zero, so
// older saved documents keep producing the same fare without a
// migration. `kmIncludedPerDay`, `extraKmRate`, `nightHaltCharge`,
// `stayChargePerNight` are dead fields kept for the same back-compat
// reason.
const outstationSchema = new mongoose.Schema(
  {
    /** Flat ₹ charged per day of the trip — the only base fare. */
    dailyRate: { type: Number, default: 0, min: 0 },
    /**
     * Driver food allowance, charged once per day of the trip. Waived
     * when the customer opts into arranging the driver's food
     * themselves (the customer UI today bundles this with the stay
     * toggle, so both waive together).
     */
    foodAllowancePerDay: { type: Number, default: 0, min: 0 },
    /**
     * Driver accommodation allowance, charged for each overnight halt
     * (nights = days − 1). Waived when the customer opts into hosting
     * the driver themselves.
     */
    stayAllowancePerNight: { type: Number, default: 0, min: 0 },

    /**
     * ₹ per extra hour when the customer extends an outstation trip
     * by hours (15 / 30 / 60 min …) instead of whole days. When 0,
     * the extension service falls back to `dailyRate / 24`.
     */
    extraHourCharge: { type: Number, default: 0, min: 0 },

    /** Minimum days that can be booked as outstation. */
    minDays: { type: Number, default: 1, min: 1 },
    /** Maximum days that can be booked as outstation (0 = unlimited). */
    maxDays: { type: Number, default: 0, min: 0 },

    // ── Deprecated (retained for back-compat with saved docs) ──
    /**
     * @deprecated Combined per-night allowance from the previous
     * pricing revision. Read by the fare engine ONLY when both
     * `foodAllowancePerDay` and `stayAllowancePerNight` are 0 — so
     * older saved pricing docs keep producing the same total without
     * a migration. New docs should use the split fields above.
     */
    allowancePerNight: { type: Number, default: 0, min: 0 },
    /** @deprecated unused — outstation no longer bills extra km. */
    kmIncludedPerDay: { type: Number, default: 0, min: 0 },
    /** @deprecated unused — outstation no longer bills extra km. */
    extraKmRate: { type: Number, default: 0, min: 0 },
    /** @deprecated absorbed into the split allowance fields above. */
    nightHaltCharge: { type: Number, default: 0, min: 0 },
    /** @deprecated absorbed into the split allowance fields above. */
    stayChargePerNight: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/**
 * Outstation-only cancellation knobs. Outstation is scheduled days in
 * advance and uses a TIME-driven policy (hours-until-pickup), not the
 * status-driven hourly model. Kept as a self-contained sub-document so
 * the hourly flow can evolve independently.
 *
 * Each fee tier is a `type` + `amount` pair so admins can pick a flat ₹
 * deduction or a percentage of the paid fare per tier (the legacy
 * one-shape-fits-all percent fields have been retired). This is the
 * single source of truth for outstation cancellations — no other
 * top-level flat fees (`flatFeeAfterAssignment`, `arrivedFeeAmount`,
 * `driverCancellationPenalty`) feed the outstation path; those remain
 * hourly-only.
 *
 *   ── Customer side ──
 *   freeCancellationHoursBeforePickup
 *                             Hours-before-pickup threshold splitting
 *                             tier A (above) from tier B (within).
 *   beforeWindowFeeType / Amount
 *                             Tier A — > free window. Defaults to a 0%
 *                             deduction → full refund. Admin can set a
 *                             flat ₹ or % deduction (e.g. a small
 *                             processing fee).
 *   preArrivalFeeType / Amount
 *                             Tier B — ≤ free window AND driver not yet
 *                             arrived. Flat ₹ or % of paid.
 *   arrivedFeeType / Amount   Tier C — driver has arrived at pickup
 *                             (also covers a STARTED trip). Flat ₹ or %.
 *   arrivedFeeMinDays         Floor that applies ONLY to tier C:
 *                             effective fee = max(tier C fee, N ×
 *                             dailyRate). 0 = disabled (fee only).
 *
 *   ── Driver side ──
 *   driverFreeReassignHoursBeforePickup
 *                             Tier A threshold — above this, driver
 *                             cancels free and booking is re-queued.
 *   driverPenaltyHoursBeforePickup
 *                             Tier C threshold — at/below this, the
 *                             full penalty + priority points fire.
 *   driverMidPenaltyType / Amount
 *                             Tier B — between the two thresholds.
 *                             Flat ₹ or % of fare.
 *   driverPenaltyType / Amount
 *                             Tier C — inside the penalty window.
 *                             Flat ₹ or % of fare.
 *   driverPriorityPenaltyPoints
 *                             Added to driver.cancellationStats only on
 *                             tier C cancels. Lowers future dispatch
 *                             priority.
 *
 * Outstation has NO driver grace window / daily free-cancel quota —
 * those are hourly-only concepts and intentionally absent here.
 */
const outstationCancellationSchema = new mongoose.Schema(
  {
    freeCancellationHoursBeforePickup: { type: Number, default: 24, min: 0 },

    beforeWindowFeeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'percentage',
    },
    beforeWindowFeeAmount: { type: Number, default: 0, min: 0 },

    preArrivalFeeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'percentage',
    },
    preArrivalFeeAmount: { type: Number, default: 15, min: 0 },

    arrivedFeeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'percentage',
    },
    arrivedFeeAmount: { type: Number, default: 50, min: 0 },
    arrivedFeeMinDays: { type: Number, default: 1, min: 0 },

    driverFreeReassignHoursBeforePickup: { type: Number, default: 24, min: 0 },
    driverPenaltyHoursBeforePickup: { type: Number, default: 6, min: 0 },

    driverMidPenaltyType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'flat',
    },
    driverMidPenaltyAmount: { type: Number, default: 100, min: 0 },

    driverPenaltyType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'flat',
    },
    driverPenaltyAmount: { type: Number, default: 200, min: 0 },
    driverPriorityPenaltyPoints: { type: Number, default: 10, min: 0 },
  },
  { _id: false },
);

const cancellationSchema = new mongoose.Schema(
  {
    /**
     * Flat ₹ deducted from the customer's paid amount when they cancel
     * AFTER a driver has been assigned but BEFORE the driver has reached
     * the pickup (statuses: driver_assigned / awaiting_payment / en_route).
     * Single flat number — driver mobilisation cost is independent of fare.
     */
    flatFeeAfterAssignment: { type: Number, default: 100, min: 0 },

    /**
     * Fee charged when the customer cancels AFTER the driver has
     * reached the pickup (statuses: arrived / started).
     *
     *   arrivedFeeType   'flat' → `arrivedFeeAmount` ₹ deducted.
     *                    'percentage' → `arrivedFeeAmount` % of paid.
     *   arrivedFeeAmount ₹ (flat) or 0-100 (percentage) — admin picks.
     *
     * Defaults: flat ₹250. The customer always sees a deterministic
     * deduction in the cancellation preview either way.
     */
    arrivedFeeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'flat',
    },
    arrivedFeeAmount: { type: Number, default: 250, min: 0 },

    /**
     * Split of every cancellation fee between the driver who was
     * mobilised and the platform. `driverSharePercent` is the % the
     * driver receives (credited to their wallet on cancel); the rest
     * flows into the platform's revenue ledger.
     *
     *   driverSharePercent = 0   → 100% to platform (default)
     *   driverSharePercent = 30  → 30% to driver, 70% to platform
     *   driverSharePercent = 100 → 100% to driver, platform gets nothing
     */
    driverSharePercent: { type: Number, default: 0, min: 0, max: 100 },

    /**
     * @deprecated Old flat-only knob from a prior revision. Kept so
     * legacy admin docs read back cleanly; the runtime falls back to
     * this only if `arrivedFeeAmount` is missing.
     */
    flatFeeAfterArrival: { type: Number, default: 250, min: 0 },
    /**
     * @deprecated Earlier percentage-only knob. Kept for back-compat.
     */
    arrivedFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    /**
     * @deprecated Earliest revision — single user-wide percentage. Kept
     * for back-compat; runtime never reads it.
     */
    userCancellationFeePercent: { type: Number, default: 0, min: 0, max: 100 },

    /** Flat ₹ deducted from driver wallet when the driver cancels. */
    driverCancellationPenalty: { type: Number, default: 50, min: 0 },
    /**
     * @deprecated Older user-side "free cancel window" knob that was
     * never enforced — user-cancel fees are status-driven, not
     * time-driven (see `computeUserCancellation`). The driver-side
     * grace lives on `driverGraceMinutes` below. Kept here so legacy
     * pricing docs still load; runtime ignores it.
     */
    freeCancellationMinutes: { type: Number, default: 2, min: 0 },

    /**
     * Driver grace window — minutes a driver can cancel after accepting
     * a booking without incurring `driverCancellationPenalty`, provided
     * they still have free cancellations left today. After this window
     * (or once the daily quota is exhausted) the flat ₹ penalty applies.
     */
    driverGraceMinutes: { type: Number, default: 2, min: 0 },
    /**
     * Free driver cancellations allowed per calendar day. Each driver
     * cancellation — penalty or not — decrements the counter. When the
     * counter hits zero, every subsequent cancel for the rest of the day
     * charges the penalty regardless of the grace window.
     */
    driverDailyFreeCancellations: { type: Number, default: 3, min: 0 },

    /**
     * Outstation-specific time-driven policy. Lives alongside (not
     * instead of) the status-driven knobs above so the hourly flow
     * keeps reading the existing fields and outstation reads from this
     * sub-doc via `loadCancellationPolicy(serviceType).outstation`.
     */
    outstation: { type: outstationCancellationSchema, default: () => ({}) },
  },
  { _id: false },
);

const driverSearchSchema = new mongoose.Schema(
  {
    searchTimeoutMinutes: { type: Number, default: 5, min: 1 },
    searchRadiusKm: { type: Number, default: 10, min: 1 },
    maxRetries: { type: Number, default: 3, min: 1 },
  },
  { _id: false },
);

/**
 * Per-service overrides for the scheduled-ride dispatcher policy.
 * Defaults live in `constants/bookingStatus.js → SCHEDULED_BOOKING` and
 * are used wherever a field on this sub-doc is left blank.
 *
 *   MORNING_*           — start/end hours of the "morning ride" window;
 *                         rides starting inside the window dispatch
 *                         immediately so drivers can plan their day.
 *   SHORT_WINDOW_HOURS  — rides ≤ this many hours away also dispatch
 *                         immediately (same UX as instant).
 *   LONG_LEAD_HOURS     — for all other rides, search starts this many
 *                         hours BEFORE `scheduledStartAt`.
 *   LEAD_SCHEDULE_HOUR  — hour-of-day (0-23) at which morning rides
 *                         that aren't "tomorrow" get their assignment
 *                         job fired the evening BEFORE pickup. Default
 *                         18 (= 6 PM) so drivers see them after their
 *                         day winds down.
 *   EMERGENCY_POOL_MINUTES — if no driver is assigned this many minutes
 *                         before pickup, the batch escalate cron moves
 *                         the booking to the admin emergency pool
 *                         (sweep every EMERGENCY_POOL_BATCH_INTERVAL_MINUTES).
 *   MIN_SCHEDULED_LEAD_HOURS — hard floor on how far in advance the
 *                         customer can create a scheduled booking.
 *                         The booking-create endpoint rejects anything
 *                         sooner with a 422.
 *   MIN_OUTSTATION_LEAD_DAYS / DRIVER_VISIBILITY_DAYS /
 *   EMERGENCY_POOL_DAYS — outstation-only calendar-day knobs (hourly
 *                         scheduled ignores these and uses the hour
 *                         fields above).
 *   REMINDER_OFFSETS_MINUTES — list of minutes-before-pickup at which
 *                         the worker emits an in-app reminder toast to
 *                         the customer (and the driver once assigned).
 *                         Reminders are only enqueued AFTER a driver
 *                         has been assigned (dispatcher accept or
 *                         emergency-pool manual assignment).
 */
const scheduledDispatchSchema = new mongoose.Schema(
  {
    MORNING_START_HOUR: { type: Number, default: 6, min: 0, max: 23 },
    MORNING_END_HOUR: { type: Number, default: 10, min: 1, max: 24 },
    SHORT_WINDOW_HOURS: { type: Number, default: 6, min: 0 },
    LONG_LEAD_HOURS: { type: Number, default: 4, min: 0 },
    LEAD_SCHEDULE_HOUR: { type: Number, default: 18, min: 0, max: 23 },
    EMERGENCY_POOL_MINUTES: { type: Number, default: 120, min: 5 },
    /**
     * Buffer (in minutes) padded around every booking's time window
     * when checking for overlapping rides during dispatch. Drivers
     * with an existing booking whose `[start − buffer, end + buffer]`
     * intersects the new request's window are skipped, even if they
     * are otherwise online and idle. Defaults to 30 min.
     */
    RIDE_BUFFER_MINUTES: { type: Number, default: 120, min: 0 },
    MIN_SCHEDULED_LEAD_HOURS: { type: Number, default: 2, min: 0 },
    /** Outstation: customer must book at least this many calendar days ahead. */
    MIN_OUTSTATION_LEAD_DAYS: { type: Number, default: 8, min: 0 },
    /** Outstation: inbox broadcast opens this many calendar days before pickup. */
    DRIVER_VISIBILITY_DAYS: { type: Number, default: 8, min: 0 },
    /** Outstation: escalate to emergency pool this many calendar days before pickup. */
    EMERGENCY_POOL_DAYS: { type: Number, default: 2, min: 0 },
    REMINDER_OFFSETS_MINUTES: {
      type: [Number],
      default: [60, 15],
    },
  },
  { _id: false },
);

const servicePricingSchema = new mongoose.Schema(
  {
    // ── Service identity ──
    serviceType: {
      type: String,
      enum: SERVICE_TYPE_LIST,
      required: true,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    icon: { type: String, default: '', trim: true },

    // ── Hourly-only: time slabs ──
    slabs: { type: [slabSchema], default: [] },
    /** ₹ per extra hour beyond the booked slab (hourly only). */
    extraHourCharge: { type: Number, default: 0, min: 0 },
    waitingCharge: { type: waitingChargeSchema, default: () => ({}) },
    /** Hourly-only: opt-in custom-duration knob, lets users go beyond slabs. */
    customHours: { type: customHoursSchema, default: () => ({}) },

    // ── Outstation-only block ──
    outstation: { type: outstationSchema, default: () => ({}) },

    // ── Shared extras ──
    nightCharge: { type: nightChargeSchema, default: () => ({}) },
    tollParkingEnabled: { type: Boolean, default: true },
    foodAllowance: { type: foodAllowanceSchema, default: () => ({}) },
    /** Hourly-only driver accommodation allowance (long bookings). */
    stayAllowance: { type: stayAllowanceSchema, default: () => ({}) },

    // ── Platform charges (shared) ──
    /**
     * Customer-facing platform fee (formerly "service charge").
     * `platformFeeType` + `platformFeeAmount` mirror night-charge /
     * coupon flat|percentage knobs. Legacy `serviceChargePercent` is
     * still read as a fallback when the new fields are unset (0).
     */
    platformFeeType: {
      type: String,
      enum: ['flat', 'percentage'],
      default: 'percentage',
    },
    platformFeeAmount: { type: Number, default: 0, min: 0 },
    /** @deprecated Prefer platformFeeType=percentage + platformFeeAmount. */
    serviceChargePercent: { type: Number, default: 0, min: 0, max: 100 },
    gstPercent: { type: Number, default: 18, min: 0, max: 100 },
    platformCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },

    // ── Policies (shared) ──
    cancellation: { type: cancellationSchema, default: () => ({}) },
    driverSearch: { type: driverSearchSchema, default: () => ({}) },
    /** Hourly-only — overrides for the scheduled-ride dispatcher. */
    scheduledDispatch: { type: scheduledDispatchSchema, default: () => ({}) },

    // ── Visibility ──
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

servicePricingSchema.index({ isActive: 1, sortOrder: 1 });

const ServicePricing =
  mongoose.models.ServicePricing || mongoose.model('ServicePricing', servicePricingSchema);

export default ServicePricing;
