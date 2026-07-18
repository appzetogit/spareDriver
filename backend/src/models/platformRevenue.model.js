import mongoose from 'mongoose';

/**
 * Platform revenue ledger.
 *
 * Every rupee the platform keeps (commission on completed trips,
 * company's share of cancellation fees, etc.) is written here as a
 * dedicated document so the admin "Revenue" page can paginate,
 * filter and summarise the firm's income without trawling through
 * bookings.
 *
 * Writes are done from the service that produces the revenue:
 *
 *   - `commission`         on trip completion (see bookingTrip service).
 *   - `cancellation_fee`   when a user cancels and the platform keeps a
 *                          share of the cancellation fee (see booking
 *                          service `cancelOwnBookingService`).
 *   - `driver_penalty`     flat ₹ debited from a driver's wallet when
 *                          the driver cancels outside the grace window
 *                          / past their daily free-cancel quota. Goes
 *                          straight to the platform.
 *
 * The `meta` blob is intentionally schemaless so callers can stash
 * source-specific context (`feeCharged`, `driverShare`, etc.) without
 * widening the top-level shape every time a new revenue source lands.
 */

export const PLATFORM_REVENUE_SOURCE = Object.freeze({
  /** Platform's commission on a completed booking. */
  COMMISSION: 'commission',
  /** Customer-facing platform fee collected on a completed booking. */
  PLATFORM_FEE: 'platform_fee',
  /**
   * Coupon discount the platform absorbs on a completed booking
   * (stored as a negative amountRupees so net revenue declines).
   */
  COUPON_DISCOUNT: 'coupon_discount',
  /** Platform's share of a cancellation fee. */
  CANCELLATION_FEE: 'cancellation_fee',
  /** Driver cancellation penalty — entire amount goes to the platform. */
  DRIVER_PENALTY: 'driver_penalty',
  /** Platform share of a subscription purchase. */
  SUBSCRIPTION: 'subscription',
  /** Admin-initiated refund debited from platform revenue. */
  ADMIN_REFUND: 'admin_refund',
});

const platformRevenueSchema = new mongoose.Schema(
  {
    /** Source of this revenue line — drives admin filters + iconography. */
    source: {
      type: String,
      enum: Object.values(PLATFORM_REVENUE_SOURCE),
      required: true,
      index: true,
    },
    /** ₹ kept by the platform (negative for admin refund debits). */
    amountRupees: { type: Number, required: true },
    currency: { type: String, default: 'INR', trim: true },

    /** Originating booking — absent for subscription revenue rows. */
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    userSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserSubscription',
      default: null,
      index: true,
    },
    /** Friendly booking number for at-a-glance admin display. */
    bookingNumber: { type: String, default: '', trim: true, index: true },
    /** Service type at the time the revenue was booked. */
    serviceType: { type: String, default: '', trim: true, index: true },

    /** Customer the revenue is associated with (denormalised). */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    /** Driver involved in the trip (when applicable). */
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },

    /** Source-specific breakdown — schemaless on purpose. */
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /**
     * When the revenue actually accrued. Defaults to write-time but
     * we keep it separate so back-fills and corrections don't bend
     * the time-series.
     */
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

platformRevenueSchema.index({ source: 1, occurredAt: -1 });
platformRevenueSchema.index({ occurredAt: -1 });

const PlatformRevenue =
  mongoose.models.PlatformRevenue ||
  mongoose.model('PlatformRevenue', platformRevenueSchema);

export default PlatformRevenue;
