import Booking from '../models/booking.model.js';
import { BOOKING_STATUS, BOOKING_TYPE } from '../constants/bookingStatus.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { sendEmail } from './email.service.js';
import { buildBookingInvoicePdfBuffer } from './bookingInvoicePdf.service.js';
import {
  escapeHtml,
  isPlaceholderUserEmail,
} from '../utils/email.util.js';

function bookingIdOf(bookingOrId) {
  if (!bookingOrId) return null;
  if (typeof bookingOrId === 'object') return bookingOrId._id || bookingOrId.id || null;
  return bookingOrId;
}

function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const formatted = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}₹${formatted}`;
}

function fmtDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN');
  } catch {
    return '—';
  }
}

function formatDistance(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return '—';
  const m = Number(meters);
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function tripKindLabel(booking, serviceLabel) {
  const isOutstation =
    booking.serviceType === SERVICE_TYPES.OUTSTATION
    || booking.bookingType === BOOKING_TYPE.OUTSTATION;
  if (isOutstation) return 'Round trip';
  if (booking.bookingType === BOOKING_TYPE.SCHEDULED) {
    return `Scheduled ${String(serviceLabel || 'hourly').toLowerCase()}`;
  }
  if (booking.bookingType === BOOKING_TYPE.INSTANT) {
    return `Instant ${String(serviceLabel || 'hourly').toLowerCase()}`;
  }
  return serviceLabel || 'Trip';
}

function pretty(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replace(/_/g, ' ');
}

function buildHtml({
  userName,
  tripLabel,
  invoiceNumber,
  bookingNumber,
  completedAt,
  pickup,
  dropoff,
  distance,
  duration,
  paymentStatus,
  grandTotal,
}) {
  const rows = [
    ['Invoice', invoiceNumber],
    ['Booking', bookingNumber],
    ['Trip', tripLabel],
    ['Completed', completedAt],
    ['Pickup', pickup],
    dropoff ? ['Drop-off', dropoff] : null,
    ['Distance', distance],
    ['Duration', duration],
    ['Payment', paymentStatus],
    ['Total', grandTotal],
  ].filter(Boolean);

  const detailRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:40%;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="background:#0f172a;color:#fff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Your trip invoice</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.85;">Hi ${escapeHtml(userName)}, thanks for riding with SpareDriver. Your invoice is attached.</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${detailRows}</table>
        <p style="margin:0;font-size:12px;color:#94a3b8;">This is a computer-generated tax invoice. If you have questions, contact SpareDriver support from the app.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildText(payload) {
  const lines = [
    `Hi ${payload.userName},`,
    '',
    'Your SpareDriver trip is complete. Invoice attached.',
    '',
    `Invoice: ${payload.invoiceNumber}`,
    `Booking: ${payload.bookingNumber}`,
    `Trip: ${payload.tripLabel}`,
    `Completed: ${payload.completedAt}`,
    `Pickup: ${payload.pickup}`,
  ];
  if (payload.dropoff) lines.push(`Drop-off: ${payload.dropoff}`);
  lines.push(
    `Distance: ${payload.distance}`,
    `Duration: ${payload.duration}`,
    `Payment: ${payload.paymentStatus}`,
    `Total: ${payload.grandTotal}`,
    '',
  );
  return lines.join('\n');
}

/**
 * Email the completed-trip invoice PDF to the customer's registered email.
 * Covers instant, scheduled, hourly, and outstation (round trip) bookings.
 * Idempotent via `invoiceEmailSentAt`. Never throws to callers.
 */
export async function sendBookingInvoiceEmail(bookingOrId) {
  const bookingId = bookingIdOf(bookingOrId);
  if (!bookingId) return { sent: false, reason: 'no_booking' };

  const claimed = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: BOOKING_STATUS.COMPLETED,
      invoiceEmailSentAt: null,
    },
    { $set: { invoiceEmailSentAt: new Date() } },
    { new: false },
  ).select('_id userId').lean();

  if (!claimed) {
    return { sent: false, reason: 'already_sent_or_not_completed' };
  }

  const releaseClaim = () =>
    Booking.updateOne(
      { _id: bookingId, invoiceEmailSentAt: { $ne: null } },
      { $unset: { invoiceEmailSentAt: 1 } },
    ).catch(() => null);

  try {
    const { buffer, booking, summary } = await buildBookingInvoicePdfBuffer(bookingId, {
      userId: claimed.userId,
    });

    const user = typeof booking.userId === 'object' ? booking.userId : null;
    const recipient = user?.email?.trim();
    if (!recipient || isPlaceholderUserEmail(recipient)) {
      console.warn(
        `[invoiceEmail] Skipping invoice email — user ${claimed.userId} has no registered email`,
      );
      return { sent: false, reason: 'no_email' };
    }

    const tripLabel = tripKindLabel(booking, summary.serviceLabel);
    const payload = {
      userName: user?.name || 'there',
      tripLabel,
      invoiceNumber: summary.invoiceNumber,
      bookingNumber: booking.bookingNumber || summary.invoiceNumber,
      completedAt: fmtDateTime(summary.completedAt),
      pickup: booking.pickup?.address || booking.pickup?.label || '—',
      dropoff: booking.dropoff?.address || booking.dropoff?.label || '',
      distance: formatDistance(summary.distanceMeters),
      duration: summary.durationMinutes != null ? `${summary.durationMinutes} min` : '—',
      paymentStatus: pretty(booking.paymentStatus),
      grandTotal: formatInr(summary.grandTotal),
    };

    const result = await sendEmail({
      to: recipient,
      subject: `Your SpareDriver invoice — ${payload.bookingNumber}`,
      html: buildHtml(payload),
      text: buildText(payload),
      attachments: [
        {
          filename: summary.filename,
          content: buffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.info(
      `[invoiceEmail] Invoice emailed to ${recipient} for ${payload.bookingNumber} via ${result.provider || 'unknown'}`,
    );
    return { sent: true, to: recipient, provider: result.provider };
  } catch (err) {
    await releaseClaim();
    console.warn('[invoiceEmail] failed:', err?.message || err);
    return { sent: false, reason: err?.message || 'send_failed' };
  }
}

/** Fire-and-forget wrapper for trip-complete side effects. */
export function queueBookingInvoiceEmail(bookingOrId) {
  sendBookingInvoiceEmail(bookingOrId).catch((err) =>
    console.warn('[invoiceEmail] unhandled:', err?.message || err),
  );
}
