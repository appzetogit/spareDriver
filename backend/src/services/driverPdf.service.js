import PDFDocument from 'pdfkit';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import { dedupeDocumentsByType } from '../utils/driverDocuments.util.js';

const PALETTE = {
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  accent: '#0D9488',
  danger: '#DC2626',
  success: '#16A34A',
  pillBg: '#F1F5F9',
};

const STATUS_TONE = {
  approved: PALETTE.success,
  pending: '#D97706',
  under_review: '#D97706',
  rejected: PALETTE.danger,
  suspended: PALETTE.danger,
};

const DOC_TYPE_LABELS = {
  selfie: 'Selfie',
  aadhaar_front: 'Aadhaar (front)',
  aadhaar_back: 'Aadhaar (back)',
  pan: 'PAN card',
  driving_license_front: 'Driving licence (front)',
  driving_license_back: 'Driving licence (back)',
  rc_front: 'Registration certificate (front)',
  rc_back: 'Registration certificate (back)',
  insurance: 'Vehicle insurance',
  permit: 'Permit',
  fitness: 'Fitness certificate',
};

function fmtDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

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

function docLabel(type) {
  if (!type) return 'Document';
  return DOC_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

/**
 * Fetch a remote URL into a Buffer. We deliberately swallow errors and
 * return `null` so a broken/expired Cloudinary URL never fails the
 * whole PDF export — the affected image is just rendered as a
 * placeholder with the URL written underneath.
 */
async function fetchAsBuffer(url, { timeoutMs = 12_000 } = {}) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* PDF primitives                                                      */
/* ------------------------------------------------------------------ */

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

function sectionHeading(doc, label) {
  doc
    .moveDown(0.8)
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(PALETTE.accent)
    .text(label.toUpperCase(), { characterSpacing: 1 });
  drawDivider(doc);
}

function ensureSpace(doc, neededHeight = 120) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) doc.addPage();
}

function infoGrid(doc, rows) {
  const colGap = 18;
  const colWidth =
    (doc.page.width - doc.page.margins.left - doc.page.margins.right - colGap) / 2;
  const startX = doc.page.margins.left;
  let rowY = doc.y;

  const pairs = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push([rows[i], rows[i + 1] || null]);
  }

  pairs.forEach(([left, right]) => {
    ensureSpace(doc, 50);
    const yStart = doc.y;
    const drawCell = (cell, x) => {
      if (!cell) return 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(PALETTE.muted)
        .text(cell.label.toUpperCase(), x, yStart, {
          width: colWidth,
          characterSpacing: 0.6,
        });
      const labelHeight = doc.heightOfString(cell.label.toUpperCase(), {
        width: colWidth,
      });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(PALETTE.text)
        .text(pretty(cell.value), x, yStart + labelHeight + 2, {
          width: colWidth,
        });
      const valueHeight = doc.heightOfString(pretty(cell.value), {
        width: colWidth,
      });
      return labelHeight + valueHeight + 4;
    };

    const leftHeight = drawCell(left, startX);
    const rightHeight = drawCell(right, startX + colWidth + colGap);
    rowY = yStart + Math.max(leftHeight, rightHeight) + 10;
    doc.y = rowY;
  });
}

function statusPill(doc, status) {
  if (!status) return;
  const label = status.replace(/_/g, ' ').toUpperCase();
  const padX = 8;
  const padY = 4;
  doc.font('Helvetica-Bold').fontSize(9);
  const textWidth = doc.widthOfString(label);
  const w = textWidth + padX * 2;
  const h = doc.currentLineHeight() + padY * 2;
  const x = doc.x;
  const y = doc.y;
  doc
    .roundedRect(x, y, w, h, 999)
    .fillAndStroke(STATUS_TONE[status] || PALETTE.muted, STATUS_TONE[status] || PALETTE.muted);
  doc
    .fillColor('#FFFFFF')
    .text(label, x + padX, y + padY, { lineBreak: false });
  doc.x = x + w + 8;
  doc.y = y;
}

async function drawImageCell({ doc, x, y, w, h, url, caption, hint }) {
  doc
    .roundedRect(x, y, w, h, 8)
    .lineWidth(0.5)
    .strokeColor(PALETTE.border)
    .stroke();

  const imgBuffer = await fetchAsBuffer(url);
  const captionY = y + h - 28;
  if (imgBuffer) {
    try {
      doc.save();
      doc.roundedRect(x + 1, y + 1, w - 2, h - 32, 8).clip();
      doc.image(imgBuffer, x + 1, y + 1, {
        fit: [w - 2, h - 32],
        align: 'center',
        valign: 'center',
      });
      doc.restore();
    } catch {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(PALETTE.muted)
        .text('Could not render image', x + 6, y + 12, { width: w - 12 });
    }
  } else {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PALETTE.muted)
      .text(url ? 'Image unavailable' : 'No file uploaded', x + 6, y + 12, {
        width: w - 12,
      });
    if (url) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(PALETTE.muted)
        .text(url, x + 6, y + 28, { width: w - 12, ellipsis: true });
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(PALETTE.text)
    .text(caption || 'Document', x + 6, captionY, { width: w - 12, ellipsis: true });
  if (hint) {
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(PALETTE.muted)
      .text(hint, x + 6, captionY + 12, { width: w - 12, ellipsis: true });
  }
}

/* ------------------------------------------------------------------ */
/* Top-level builder                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a one-click driver dossier as a PDF stream. Caller is
 * expected to pipe `doc` into the HTTP response and set the
 * appropriate `Content-Disposition` / `Content-Type` headers.
 *
 * The renderer is deliberately defensive: every image fetch is
 * best-effort, so a broken URL never crashes the export.
 */
export async function buildDriverProfilePdf(driverId, { res } = {}) {
  const driver = await Driver.findById(driverId)
    .populate('carTypeExperience', 'name')
    .populate('vehicleExperience.carTypeId', 'name')
    .populate('vehicleExperience.brandId', 'name')
    .populate('vehicleExperience.modelId', 'name')
    .populate('vehicleExperience.fuelTypeId', 'name')
    .populate('approvedBy', 'name email')
    .lean();
  if (!driver) throw new ApiError(404, 'Driver not found');

  const documents = dedupeDocumentsByType(driver.documents || []);
  const selfieDoc = documents.find((d) => d.type === 'selfie');
  const profilePicUrl = selfieDoc?.fileUrl || driver.profilePicture || '';
  const profilePicBuffer = await fetchAsBuffer(profilePicUrl);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: `${driver.name || 'Driver'} – Profile`,
      Author: 'SpareDriver Admin',
      Subject: `Driver dossier for ${driver._id}`,
      CreationDate: new Date(),
    },
  });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="driver-${driver._id}.pdf"`,
    );
    doc.pipe(res);
  }

  /* ───── Header banner ─────────────────────────────────────────── */

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const bannerHeight = 110;
  const bannerY = doc.y;

  doc
    .roundedRect(pageLeft, bannerY, pageRight - pageLeft, bannerHeight, 12)
    .fillColor('#0F172A')
    .fill();

  const avatarSize = 72;
  const avatarX = pageLeft + 16;
  const avatarY = bannerY + (bannerHeight - avatarSize) / 2;
  if (profilePicBuffer) {
    try {
      doc.save();
      doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2).clip();
      doc.image(profilePicBuffer, avatarX, avatarY, {
        fit: [avatarSize, avatarSize],
        align: 'center',
        valign: 'center',
      });
      doc.restore();
    } catch {
      // fall through to initials avatar below
    }
  }
  if (!profilePicBuffer) {
    doc
      .roundedRect(avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2)
      .fillColor('#1E293B')
      .fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor('#94A3B8')
      .text((driver.name || '?').charAt(0).toUpperCase(), avatarX, avatarY + 18, {
        width: avatarSize,
        align: 'center',
      });
  }

  const titleX = avatarX + avatarSize + 18;
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#FFFFFF')
    .text(driver.name || 'Driver', titleX, bannerY + 18, {
      width: pageRight - titleX - 16,
    });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#CBD5F5')
    .text(`Driver ID: ${driver._id}`, titleX, doc.y + 2, {
      width: pageRight - titleX - 16,
    });
  doc.font('Helvetica').fontSize(10).fillColor('#CBD5F5');
  const subLine = [
    driver.phone ? `+91 ${driver.phone}` : null,
    driver.email ? driver.email : null,
    `Joined ${fmtDate(driver.createdAt)}`,
  ]
    .filter(Boolean)
    .join('  •  ');
  doc.text(subLine, titleX, doc.y + 2, { width: pageRight - titleX - 16 });

  // Status pill, anchored bottom-right of the banner.
  if (driver.approvalStatus) {
    const pillLabel = driver.approvalStatus.replace(/_/g, ' ').toUpperCase();
    doc.font('Helvetica-Bold').fontSize(9);
    const padX = 10;
    const padY = 5;
    const pillW = doc.widthOfString(pillLabel) + padX * 2;
    const pillH = doc.currentLineHeight() + padY * 2;
    const pillX = pageRight - pillW - 16;
    const pillY = bannerY + bannerHeight - pillH - 16;
    doc
      .roundedRect(pillX, pillY, pillW, pillH, 999)
      .fillColor(STATUS_TONE[driver.approvalStatus] || '#475569')
      .fill();
    doc
      .fillColor('#FFFFFF')
      .text(pillLabel, pillX + padX, pillY + padY, { lineBreak: false });
  }

  doc.y = bannerY + bannerHeight + 18;
  doc.x = pageLeft;

  /* ───── Identity ──────────────────────────────────────────────── */

  sectionHeading(doc, 'Identity');
  const identityRows = [
    { label: 'Full name', value: driver.name },
    { label: 'Phone', value: driver.phone ? `+91 ${driver.phone}` : null },
  ];
  if (driver.email) identityRows.push({ label: 'Email', value: driver.email });
  if (driver.gender) identityRows.push({ label: 'Gender', value: driver.gender });
  if (driver.dateOfBirth)
    identityRows.push({ label: 'Date of birth', value: fmtDate(driver.dateOfBirth) });
  if (driver.authProvider) identityRows.push({ label: 'Auth provider', value: driver.authProvider });
  if (driver.city) identityRows.push({ label: 'City', value: driver.city });
  if (driver.referralCode) identityRows.push({ label: 'Referral code', value: driver.referralCode });

  infoGrid(doc, identityRows);

  /* ───── Driving credentials ───────────────────────────────────── */

  sectionHeading(doc, 'Driving credentials');
  infoGrid(doc, [
    { label: 'Licence number', value: driver.drivingLicense?.number || null },
    {
      label: 'Licence expiry',
      value: driver.drivingLicense?.expiryDate
        ? fmtDate(driver.drivingLicense.expiryDate)
        : null,
    },
    { label: 'Experience (years)', value: driver.experienceYears ?? 0 },
    { label: 'Availability', value: driver.availability || null },
    {
      label: 'Safety declaration',
      value: driver.safetyDeclaration?.agreed
        ? `Agreed on ${fmtDateTime(driver.safetyDeclaration.agreedAt)}`
        : 'Not agreed',
    },
    {
      label: 'Approval',
      value:
        driver.approvalStatus === 'approved'
          ? `Approved on ${fmtDateTime(driver.approvedAt)}${
              driver.approvedBy?.name ? ` by ${driver.approvedBy.name}` : ''
            }`
          : driver.approvalNote || driver.approvalStatus,
    },
  ]);

  /* ───── Bank details ─────────────────────────────────────────── */

  if (driver.bankDetails) {
    sectionHeading(doc, 'Bank details');
    infoGrid(doc, [
      { label: 'Account holder', value: driver.bankDetails.accountHolderName },
      { label: 'Account number', value: driver.bankDetails.accountNumber },
      { label: 'IFSC', value: driver.bankDetails.ifscCode },
      { label: 'Bank name', value: driver.bankDetails.bankName },
      { label: 'UPI ID', value: driver.bankDetails.upiId },
    ]);
  }

  /* ───── Vehicle experience ────────────────────────────────────── */

  if ((driver.vehicleExperience || []).length > 0) {
    sectionHeading(doc, `Vehicle experience (${driver.vehicleExperience.length})`);
    driver.vehicleExperience.forEach((entry, idx) => {
      ensureSpace(doc, 24);
      const parts = [
        entry.carTypeId?.name,
        entry.brandId?.name,
        entry.modelId?.name,
        entry.fuelTypeId?.name,
      ].filter(Boolean);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(PALETTE.text)
        .text(`${idx + 1}. ${parts.join(' • ') || 'Vehicle'}`, { continued: false });
      doc.moveDown(0.3);
    });
  }

  /* ───── Status snapshot ──────────────────────────────────────── */

  sectionHeading(doc, 'Status & ratings');
  infoGrid(doc, [
    { label: 'Onboarding step', value: `Step ${driver.onboardingStep || 1} of 6` },
    { label: 'Currently online', value: driver.isOnline ? 'Yes' : 'No' },
    { label: 'On a trip right now', value: driver.isOnTrip ? 'Yes' : 'No' },
    { label: 'Rating', value: driver.rating ? Number(driver.rating).toFixed(2) : '0.00' },
    { label: 'Total ratings', value: driver.ratingCount || 0 },
    { label: 'Last online', value: fmtDateTime(driver.lastOnlineAt) },
  ]);

  /* ───── Documents (every image) ──────────────────────────────── */

  doc.addPage();
  sectionHeading(doc, 'Documents');
  if (documents.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PALETTE.muted)
      .text('No documents have been uploaded.');
  } else {
    const cellGap = 12;
    const cellsPerRow = 2;
    const cellW =
      (pageRight - pageLeft - cellGap * (cellsPerRow - 1)) / cellsPerRow;
    const cellH = 230;

    for (let i = 0; i < documents.length; i += 1) {
      const row = Math.floor(i / cellsPerRow);
      const col = i % cellsPerRow;
      if (col === 0) ensureSpace(doc, cellH + 16);
      const cellY = doc.y + (col === 0 ? 0 : -(cellH + 0));
      // Re-compute the y for the current row only on the first cell.
      // eslint-disable-next-line no-await-in-loop
      await drawImageCell({
        doc,
        x: pageLeft + col * (cellW + cellGap),
        y: cellY,
        w: cellW,
        h: cellH,
        url: documents[i].fileUrl,
        caption: docLabel(documents[i].type),
        hint: documents[i].uploadedAt
          ? `Uploaded ${fmtDate(documents[i].uploadedAt)}`
          : null,
      });
      if (col === cellsPerRow - 1 || i === documents.length - 1) {
        doc.y = cellY + cellH + cellGap;
      }
      // Don't advance row counter on individual cells.
      void row;
    }
  }

  /* ───── Live verification ────────────────────────────────────── */

  if (driver.liveVerificationVideo?.videoUrl) {
    sectionHeading(doc, 'Live identity verification');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PALETTE.text)
      .text(
        `Recorded ${fmtDateTime(driver.liveVerificationVideo.recordedAt)}` +
          (driver.liveVerificationVideo.durationSeconds
            ? ` • ${driver.liveVerificationVideo.durationSeconds}s`
            : ''),
      );
    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text('Video link (paste into a browser to play):');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.accent)
      .text(driver.liveVerificationVideo.videoUrl, {
        link: driver.liveVerificationVideo.videoUrl,
        underline: true,
      });
  }

  /* ───── Footer with timestamp on every page ──────────────────── */

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const footerY = doc.page.height - doc.page.margins.bottom + 12;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PALETTE.muted)
      .text(
        `Generated ${fmtDateTime(new Date())} • SpareDriver Admin • Page ${i + 1} of ${range.count}`,
        doc.page.margins.left,
        footerY,
        { align: 'center', width: pageRight - doc.page.margins.left },
      );
  }
  // Reset to the last page so the caller's `end()` finalises everything.
  doc.switchToPage(range.start + range.count - 1);

  void statusPill; // silence unused-export warning if helper is trimmed later

  doc.end();
  return doc;
}

// Silence eslint about the unused export when only buildDriverProfilePdf is consumed.
export const _internals = { fetchAsBuffer };
