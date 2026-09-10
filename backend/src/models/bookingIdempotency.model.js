import mongoose from 'mongoose';

/**
 * One row per in-flight (or recently completed) booking-create attempt.
 *
 * The unique index on `key` is the actual guard: `createBookingService`
 * inserts here BEFORE it debits the wallet, so of two concurrent
 * double-submits exactly one insert survives and the other is rejected by
 * Mongo with a duplicate-key error. Doing it in the database rather than
 * in a Redis lock matters — the queue layer already degrades to a no-op
 * when Redis is unconfigured, and a guard that protects the customer's
 * money must not be able to quietly disappear with it.
 *
 * `bookingId` is filled in once the booking exists, which turns a later
 * replay of the same request into an idempotent success (the caller gets
 * the original booking back) instead of a second charge. Rows are dropped
 * again if the attempt fails, so a genuine retry is never blocked.
 *
 * Rows self-delete via the TTL index — this is a short-lived claim, not an
 * audit log.
 */
const bookingIdempotencySchema = new mongoose.Schema(
  {
    /** sha256 of the client key or the derived request fingerprint. */
    key: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Null while the attempt is still in flight. */
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0, // MongoDB TTL index — row is removed once expiresAt passes.
    },
  },
  { timestamps: true },
);

export const BookingIdempotency =
  mongoose.models.BookingIdempotency
  || mongoose.model('BookingIdempotency', bookingIdempotencySchema);

export default BookingIdempotency;
