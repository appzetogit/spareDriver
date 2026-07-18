import PDFDocument from 'pdfkit';
import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SERVICE_TYPE_LABELS } from '../constants/serviceTypes.js';

const PALETTE = {
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  accent: '#0D9488',
};

function fmtDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN');
  } catch {
    return '—';
  }
}

function pretty(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatDistance(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return '—';
  const m = Number(meters);
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function computeDurationMinutes(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return Math.max(1, Math.round(diffMs / 60_000));
}

function acceptedExtensionTotal(extensions = []) {
  return extensions.reduce(
    (sum, ext) => sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
    0,
  );
}

function drawDivider(doc) {
  const y = doc.y + 4;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.5)
    .strokeColor(PALETTE.border)
    .stroke();
  doc.moveDown(0.8);
}

function drawRow(doc, label, value, { bold = false } = {}) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.y;
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(bold ? 11 : 10)
    .fillColor(bold ? PALETTE.text : PALETTE.muted)
    .text(label, left, y, { width: (right - left) * 0.55 });
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(bold ? 12 : 10)
    .fillColor(PALETTE.text)
    .text(pretty(value), left, y, {
      width: right - left,
      align: 'right',
    });
  doc.moveDown(0.6);
}

/**
 * Stream a trip invoice PDF for a completed booking. Caller pipes `doc`
 * into the HTTP response.
 */
export async function buildBookingInvoicePdf(bookingId, { userId, res } = {}) {
  const booking = await Booking.findOne({ _id: bookingId, userId })
    .populate('userId', 'name email phone_no')
    .populate('driverId', 'name phone_no')
    .lean();

  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== BOOKING_STATUS.COMPLETED) {
    throw new ApiError(400, 'Invoice is available only for completed trips');
  }

  const invoiceNumber = booking.invoiceNumber || booking.bookingNumber || String(booking._id);
  const completedAt = booking.timeline?.completedAt || booking.timeline?.createdAt;
  const startedAt = booking.timeline?.startedAt;
  const durationMinutes = computeDurationMinutes(startedAt, completedAt);
  const distanceMeters =
    booking.distanceMeters ??
    booking.fareSnapshot?.distanceMeters ??
    booking.tripSummary?.distanceMeters ??
    null;

  const fare = booking.fareSnapshot || {};
  const extensionTotal = acceptedExtensionTotal(booking.extensions);
  const grandTotal = (Number(fare.total) || 0) + extensionTotal;

  const serviceLabel =
    SERVICE_TYPE_LABELS[booking.serviceType] || pretty(booking.serviceType);
  const customerName =
    typeof booking.userId === 'object' ? booking.userId?.name : null;
  const driverName =
    typeof booking.driverId === 'object' ? booking.driverId?.name : null;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: `Invoice ${invoiceNumber}`,
      Author: 'SpareDriver',
      Subject: `Trip invoice for booking ${booking.bookingNumber}`,
      CreationDate: new Date(),
    },
  });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf"`,
    );
    doc.pipe(res);
  }

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor(PALETTE.text)
    .text('SpareDriver', pageLeft, doc.y);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(PALETTE.muted)
    .text('Trip Invoice / Receipt', pageLeft, doc.y);
  doc.moveDown(1.2);

  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(PALETTE.accent)
    .text(`Invoice #${invoiceNumber}`);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(PALETTE.muted)
    .text(`Issued on ${fmtDateTime(completedAt)}`);
  doc.moveDown(1);

  drawDivider(doc);

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PALETTE.text)
    .text('Trip details');
  doc.moveDown(0.4);
  drawRow(doc, 'Booking number', booking.bookingNumber);
  drawRow(doc, 'Customer', customerName || '—');
  drawRow(doc, 'Driver', driverName || '—');
  drawRow(doc, 'Service', serviceLabel);
  drawRow(doc, 'Pickup', booking.pickup?.address || booking.pickup?.label || '—');
  if (booking.dropoff?.address || booking.dropoff?.label) {
    drawRow(doc, 'Drop-off', booking.dropoff.address || booking.dropoff.label);
  }
  drawRow(doc, 'Distance', formatDistance(distanceMeters));
  drawRow(doc, 'Duration', durationMinutes != null ? `${durationMinutes} min` : '—');
  drawRow(doc, 'Payment status', pretty(booking.paymentStatus));
  drawRow(doc, 'Payment method', pretty(booking.paymentMethod));

  doc.moveDown(0.6);
  drawDivider(doc);

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PALETTE.text)
    .text('Fare breakdown');
  doc.moveDown(0.4);

  if (fare.baseFare != null) drawRow(doc, 'Base fare', `₹${fare.baseFare}`);
  if (fare.extras) drawRow(doc, 'Extras', `₹${fare.extras}`);
  if (fare.serviceCharge || fare.platformFee) {
    drawRow(doc, 'Platform fee', `₹${fare.platformFee || fare.serviceCharge}`);
  }
  if (fare.gst) drawRow(doc, 'GST', `₹${fare.gst}`);
  if (fare.discount) drawRow(doc, 'Discount', `-₹${fare.discount}`);
  if (fare.couponDiscount) {
    const couponLabel = fare.couponCode ? `Coupon (${fare.couponCode})` : 'Coupon discount';
    drawRow(doc, couponLabel, `-₹${fare.couponDiscount}`);
  }
  if (extensionTotal) drawRow(doc, 'Trip extensions', `₹${extensionTotal}`);

  doc.moveDown(0.4);
  drawDivider(doc);
  drawRow(doc, 'Total paid', `₹${grandTotal}`, { bold: true });

  doc.moveDown(2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PALETTE.muted)
    .text('Thank you for riding with SpareDriver.', pageLeft, doc.y, {
      width: pageRight - pageLeft,
      align: 'center',
    });

  doc.end();
}
