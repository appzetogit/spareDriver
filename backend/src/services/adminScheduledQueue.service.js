import Booking from '../models/booking.model.js';
import { listScheduledBookingJobs } from '../queues/scheduledBooking.queue.js';

/**
 * Admin Queue module helpers — BullMQ scheduled-booking worker surface.
 * Kept separate from the Scheduled Bookings list (Mongo rides).
 */

/**
 * List live queue jobs (reminders + escalate-batch). Legacy assign /
 * escalate / retry leftovers are hidden unless `includeLegacy=true`.
 */
export async function listAdminScheduledQueueService(query = {}) {
  const snapshot = await listScheduledBookingJobs({
    limit: query.limit,
    state: query.state || null,
    name: query.name || null,
    includeLegacy: query.includeLegacy === 'true' || query.includeLegacy === true,
  });

  const bookingIds = [
    ...new Set(
      (snapshot.jobs || [])
        .map((j) => j.bookingId)
        .filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id || ''))),
    ),
  ];

  let bookingMap = {};
  if (bookingIds.length) {
    const bookings = await Booking.find({ _id: { $in: bookingIds } })
      .select('bookingNumber status hourly.scheduledStartAt serviceType bookingType userId')
      .populate('userId', 'name phone_no')
      .lean();
    bookingMap = bookings.reduce((acc, b) => {
      acc[String(b._id)] = {
        bookingNumber: b.bookingNumber,
        status: b.status,
        scheduledStartAt: b.hourly?.scheduledStartAt || null,
        serviceType: b.serviceType,
        bookingType: b.bookingType,
        customerName: b.userId?.name || null,
        customerPhone: b.userId?.phone_no || null,
      };
      return acc;
    }, {});
  }

  const jobs = (snapshot.jobs || []).map((job) => ({
    ...job,
    booking: job.bookingId ? bookingMap[String(job.bookingId)] || null : null,
  }));

  return { ...snapshot, jobs };
}
