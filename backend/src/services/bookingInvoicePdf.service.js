import PDFDocument from 'pdfkit';
import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import { BOOKING_STATUS } from '../constants/bookingStatus.js';
import { SERVICE_TYPE_LABELS } from '../constants/serviceTypes.js';
import { drawBrandLogo, formatPdfInr } from '../utils/pdfBrand.js';
import { getGstDetailsService } from './appSettings.service.js';

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

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function hasGstIdentity(gst) {
  return Boolean(gst?.gstin || gst?.legalName || gst?.tradeName || gst?.address);
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

function drawSellerGstBlock(doc, gst, pageLeft, pageRight) {
  if (!hasGstIdentity(gst)) return;

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PALETTE.text)
    .text(gst.legalName || gst.tradeName || 'SpareDriver', pageLeft, doc.y, {
      width: pageRight - pageLeft,
    });

  if (gst.tradeName && gst.legalName && gst.tradeName !== gst.legalName) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text(`Trade name: ${gst.tradeName}`, pageLeft, doc.y, {
        width: pageRight - pageLeft,
      });
  }

  if (gst.gstin) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.text)
      .text(`GSTIN: ${gst.gstin}`, pageLeft, doc.y, {
        width: pageRight - pageLeft,
      });
  }

  if (gst.pan) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text(`PAN: ${gst.pan}`, pageLeft, doc.y, {
        width: pageRight - pageLeft,
      });
  }

  if (gst.address) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text(gst.address, pageLeft, doc.y, {
        width: pageRight - pageLeft,
      });
  }

  const stateLine = [gst.state, gst.stateCode ? `Code ${gst.stateCode}` : '']
    .filter(Boolean)
    .join(' · ');
  if (stateLine) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text(stateLine, pageLeft, doc.y, {
        width: pageRight - pageLeft,
      });
  }

  doc.moveDown(0.8);
}

/**
 * Stream a trip invoice PDF for a completed booking. Caller pipes `doc`
 * into the HTTP response.
 */
export async function buildBookingInvoicePdf(bookingId, { userId, res } = {}) {
  const [booking, gstDetails] = await Promise.all([
    Booking.findOne({ _id: bookingId, userId })
      .populate('userId', 'name email phone_no')
      .populate('driverId', 'name phone_no')
      .lean(),
    getGstDetailsService(),
  ]);

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
  const waitingTotal = Number(booking.waiting?.chargeRupees) || 0;
  const grandTotal = round2(
    (Number(fare.total) || 0) + extensionTotal + waitingTotal,
  );

  const serviceLabel =
    SERVICE_TYPE_LABELS[booking.serviceType] || pretty(booking.serviceType);
  const customerName =
    typeof booking.userId === 'object' ? booking.userId?.name : null;
  const driverName =
    typeof booking.driverId === 'object' ? booking.driverId?.name : null;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
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

  const logo = drawBrandLogo(doc, { x: pageLeft, y: doc.y, height: 36 });
  if (logo.drawn) {
    doc.y = doc.y + logo.height + 8;
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(PALETTE.text)
      .text('SpareDriver', pageLeft, doc.y);
  }
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(PALETTE.muted)
    .text('Tax Invoice / Trip Receipt', pageLeft, doc.y);
  doc.moveDown(0.6);

  drawSellerGstBlock(doc, gstDetails, pageLeft, pageRight);

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

  if (fare.baseFare != null) drawRow(doc, 'Base fare', formatPdfInr(fare.baseFare));
  if (fare.extras) drawRow(doc, 'Extras', formatPdfInr(fare.extras));
  if (fare.serviceCharge || fare.platformFee) {
    drawRow(doc, 'Platform fee', formatPdfInr(fare.platformFee || fare.serviceCharge));
  }
  if (fare.gst) {
    const gstPercent = fare.gstPercent ?? fare.breakdown?.gstPercent;
    const gstLabel =
      gstPercent != null ? `GST (${gstPercent}%)` : 'GST';
    drawRow(doc, gstLabel, formatPdfInr(fare.gst));
  }
  if (fare.discount) drawRow(doc, 'Discount', `-${formatPdfInr(fare.discount)}`);
  if (fare.couponDiscount) {
    const couponLabel = fare.couponCode ? `Coupon (${fare.couponCode})` : 'Coupon discount';
    drawRow(doc, couponLabel, `-${formatPdfInr(fare.couponDiscount)}`);
  }
  const acceptedExtensions = (booking.extensions || []).filter(
    (ext) => ext?.status === 'accepted',
  );
  for (const ext of acceptedExtensions) {
    const hours = Number(ext.additionalHours) || 0;
    const days = Number(ext.additionalDays) || 0;
    const label =
      days > 0
        ? `Trip extension (+${days} day${days === 1 ? '' : 's'})`
        : `Trip extension (+${hours}h)`;
    drawRow(doc, label, formatPdfInr(Number(ext.fareDelta) || 0));
  }
  if (waitingTotal) {
    drawRow(doc, 'Waiting charge', formatPdfInr(waitingTotal));
  }

  doc.moveDown(0.4);
  drawDivider(doc);
  drawRow(doc, 'Total paid', formatPdfInr(grandTotal), { bold: true });

  if (gstDetails?.gstin) {
    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PALETTE.muted)
      .text(
        `This is a computer-generated tax invoice. GSTIN: ${gstDetails.gstin}`,
        pageLeft,
        doc.y,
        { width: pageRight - pageLeft, align: 'center' },
      );
  }

  doc.moveDown(2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(PALETTE.muted)
    .text('Thank you for riding with SpareDriver.', pageLeft, doc.y, {
      width: pageRight - pageLeft,
      align: 'center',
    });

  // Logo already drawn in the header; stamp again on extra pages if any.
  const range = doc.bufferedPageRange();
  if (range.count > 1) {
    for (let i = range.start + 1; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      drawBrandLogo(doc, {
        x: pageLeft,
        y: 16,
        height: 22,
      });
    }
    doc.switchToPage(range.start + range.count - 1);
  }

  doc.end();
}
