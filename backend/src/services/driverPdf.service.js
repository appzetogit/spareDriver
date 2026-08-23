import PDFDocument from 'pdfkit';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import { dedupeDocumentsByType } from '../utils/driverDocuments.util.js';
import { drawBrandLogo, getBrandLogoPath } from '../utils/pdfBrand.js';

const PALETTE = {
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  accent: '#0D9488',
  accentSoft: '#F0FDFA',
  danger: '#DC2626',
  success: '#16A34A',
  headerBg: '#0F172A',
  cardBg: '#F8FAFC',
  white: '#FFFFFF',
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
  police_verification: 'Police Verification / Yellow Board Certificate',
  pan: 'PAN card',
  driving_license: 'Driving licence',
  driving_license_front: 'Driving licence (front)',
  driving_license_back: 'Driving licence (back)',
  rc_front: 'Registration certificate (front)',
  rc_back: 'Registration certificate (back)',
  insurance: 'Vehicle insurance',
  permit: 'Permit',
  fitness: 'Fitness certificate',
};

const MARGIN = 40;
/** Continued pages reserve space for the dark logo strip stamped in chrome. */
const CONTINUED_PAGE_TOP = 56;

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

function pageLeft(doc) {
  return doc.page.margins.left;
}

function pageRight(doc) {
  return doc.page.width - doc.page.margins.right;
}

function contentWidth(doc) {
  return pageRight(doc) - pageLeft(doc);
}

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

function ensureSpace(doc, neededHeight = 120) {
  const bottom = doc.page.height - doc.page.margins.bottom - 24;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
    doc.x = pageLeft(doc);
    doc.y = CONTINUED_PAGE_TOP;
  }
}

function sectionHeading(doc, label) {
  ensureSpace(doc, 56);
  const left = pageLeft(doc);
  const y = doc.y + 6;

  doc
    .roundedRect(left, y, 4, 16, 2)
    .fillColor(PALETTE.accent)
    .fill();

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PALETTE.text)
    .text(label.toUpperCase(), left + 12, y + 2, {
      characterSpacing: 0.8,
      lineBreak: false,
    });

  doc.y = y + 22;
  doc
    .moveTo(left, doc.y)
    .lineTo(pageRight(doc), doc.y)
    .lineWidth(0.6)
    .strokeColor(PALETTE.border)
    .stroke();
  doc.y += 12;
  doc.x = left;
}

function infoGrid(doc, rows) {
  const usable = (rows || []).filter(Boolean);
  if (!usable.length) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text('No data available.', pageLeft(doc), doc.y);
    doc.moveDown(0.6);
    return;
  }

  const gap = 12;
  const colW = (contentWidth(doc) - gap) / 2;
  const left = pageLeft(doc);
  const cellPad = 10;
  const labelSize = 7.5;
  const valueSize = 10;

  for (let i = 0; i < usable.length; i += 2) {
    const leftCell = usable[i];
    const rightCell = usable[i + 1] || null;

    const measure = (cell) => {
      if (!cell) return 40;
      const label = String(cell.label || '').toUpperCase();
      const value = pretty(cell.value);
      doc.font('Helvetica').fontSize(labelSize);
      const lh = doc.heightOfString(label, { width: colW - cellPad * 2 });
      doc.font('Helvetica-Bold').fontSize(valueSize);
      const vh = doc.heightOfString(value, { width: colW - cellPad * 2 });
      return Math.max(44, cellPad + lh + 4 + vh + cellPad);
    };

    const rowH = Math.max(measure(leftCell), measure(rightCell));
    ensureSpace(doc, rowH + 8);
    const y = doc.y;

    const drawCell = (cell, x) => {
      if (!cell) return;
      doc
        .roundedRect(x, y, colW, rowH, 8)
        .fillColor(PALETTE.cardBg)
        .fill();
      doc
        .roundedRect(x, y, colW, rowH, 8)
        .lineWidth(0.5)
        .strokeColor(PALETTE.border)
        .stroke();

      const label = String(cell.label || '').toUpperCase();
      const value = pretty(cell.value);
      doc
        .font('Helvetica')
        .fontSize(labelSize)
        .fillColor(PALETTE.muted)
        .text(label, x + cellPad, y + cellPad, {
          width: colW - cellPad * 2,
          characterSpacing: 0.4,
        });
      const labelH = doc.heightOfString(label, { width: colW - cellPad * 2 });
      doc
        .font('Helvetica-Bold')
        .fontSize(valueSize)
        .fillColor(PALETTE.text)
        .text(value, x + cellPad, y + cellPad + labelH + 4, {
          width: colW - cellPad * 2,
        });
    };

    drawCell(leftCell, left);
    if (rightCell) drawCell(rightCell, left + colW + gap);

    doc.y = y + rowH + 8;
    doc.x = left;
  }
}

function drawStatusPill(doc, status, x, y) {
  if (!status) return { width: 0, height: 0 };
  const label = String(status).replace(/_/g, ' ').toUpperCase();
  const padX = 10;
  const padY = 5;
  doc.font('Helvetica-Bold').fontSize(8);
  const textW = doc.widthOfString(label);
  const w = textW + padX * 2;
  const h = 8 + padY * 2;
  const tone = STATUS_TONE[status] || '#475569';
  doc.roundedRect(x, y, w, h, 999).fillColor(tone).fill();
  doc.fillColor(PALETTE.white).text(label, x + padX, y + padY, { lineBreak: false });
  return { width: w, height: h };
}

function drawHeaderBanner(doc, driver, profilePicBuffer) {
  const left = pageLeft(doc);
  const right = pageRight(doc);
  const width = right - left;
  const bannerH = 128;
  const y = doc.page.margins.top;

  doc.roundedRect(left, y, width, bannerH, 14).fillColor(PALETTE.headerBg).fill();

  // Black logo needs a light chip on the dark banner
  const logo = drawBrandLogo(doc, {
    x: right - 12,
    y: y + 10,
    height: 34,
    align: 'right',
    backdrop: true,
  });

  const avatarSize = 76;
  const avatarX = left + 16;
  const avatarY = y + (bannerH - avatarSize) / 2;
  let photoDrawn = false;

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
      // thin ring
      doc
        .circle(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2)
        .lineWidth(2)
        .strokeColor('#334155')
        .stroke();
      photoDrawn = true;
    } catch {
      photoDrawn = false;
    }
  }

  if (!photoDrawn) {
    doc
      .roundedRect(avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2)
      .fillColor('#1E293B')
      .fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor('#94A3B8')
      .text((driver.name || '?').charAt(0).toUpperCase(), avatarX, avatarY + 22, {
        width: avatarSize,
        align: 'center',
        lineBreak: false,
      });
  }

  const titleX = avatarX + avatarSize + 16;
  const titleMaxW = Math.max(
    120,
    right - titleX - 20 - (logo.drawn ? logo.width + 8 : 0),
  );

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(PALETTE.white)
    .text(driver.name || 'Driver', titleX, y + 22, {
      width: titleMaxW,
      ellipsis: true,
      lineBreak: false,
    });

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#94A3B8')
    .text('Driver profile dossier', titleX, y + 44, {
      width: titleMaxW,
      lineBreak: false,
    });

  const meta = [
    driver.phone ? `+91 ${driver.phone}` : null,
    driver.email || null,
    `Joined ${fmtDate(driver.createdAt)}`,
  ]
    .filter(Boolean)
    .join('   ·   ');

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#CBD5E1')
    .text(meta, titleX, y + 60, {
      width: titleMaxW,
      ellipsis: true,
      lineBreak: false,
    });

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#64748B')
    .text(`ID  ${driver.driverNumber || driver._id}`, titleX, y + 76, {
      width: titleMaxW,
      ellipsis: true,
      lineBreak: false,
    });

  if (driver.approvalStatus) {
    const pillH = 18;
    drawStatusPill(doc, driver.approvalStatus, titleX, y + bannerH - pillH - 16);
  }

  doc.y = y + bannerH + 18;
  doc.x = left;
}

async function drawImageCell({ doc, x, y, w, h, url, caption, hint }) {
  doc.roundedRect(x, y, w, h, 10).fillColor(PALETTE.cardBg).fill();
  doc
    .roundedRect(x, y, w, h, 10)
    .lineWidth(0.6)
    .strokeColor(PALETTE.border)
    .stroke();

  const footerH = 36;
  const imgAreaH = h - footerH - 4;
  const imgBuffer = await fetchAsBuffer(url);

  if (imgBuffer) {
    try {
      doc.save();
      doc.roundedRect(x + 6, y + 6, w - 12, imgAreaH - 6, 6).clip();
      doc.image(imgBuffer, x + 6, y + 6, {
        fit: [w - 12, imgAreaH - 6],
        align: 'center',
        valign: 'center',
      });
      doc.restore();
    } catch {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(PALETTE.muted)
        .text('Could not render image', x + 10, y + 16, { width: w - 20 });
    }
  } else {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PALETTE.muted)
      .text(url ? 'Image unavailable' : 'No file uploaded', x + 10, y + 20, {
        width: w - 20,
      });
  }

  const captionY = y + h - footerH + 6;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(PALETTE.text)
    .text(caption || 'Document', x + 10, captionY, {
      width: w - 20,
      ellipsis: true,
      lineBreak: false,
    });
  if (hint) {
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(PALETTE.muted)
      .text(hint, x + 10, captionY + 13, {
        width: w - 20,
        ellipsis: true,
        lineBreak: false,
      });
  }
}

async function drawDocumentsGrid(doc, documents) {
  if (!documents.length) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(PALETTE.muted)
      .text('No documents have been uploaded.', pageLeft(doc), doc.y);
    doc.moveDown(0.8);
    return;
  }

  const gap = 12;
  const cols = 2;
  const cellW = (contentWidth(doc) - gap) / cols;
  const cellH = 210;
  const left = pageLeft(doc);

  let rowStartY = doc.y;
  for (let i = 0; i < documents.length; i += 1) {
    const col = i % cols;
    if (col === 0) {
      ensureSpace(doc, cellH + 14);
      rowStartY = doc.y;
    }

    // eslint-disable-next-line no-await-in-loop
    await drawImageCell({
      doc,
      x: left + col * (cellW + gap),
      y: rowStartY,
      w: cellW,
      h: cellH,
      url: documents[i].fileUrl,
      caption: docLabel(documents[i].type),
      hint: documents[i].uploadedAt
        ? `Uploaded ${fmtDate(documents[i].uploadedAt)}`
        : null,
    });

    if (col === cols - 1 || i === documents.length - 1) {
      doc.y = rowStartY + cellH + gap;
      doc.x = left;
    }
  }
}

function addPageChrome(doc) {
  const logoPath = getBrandLogoPath();
  const range = doc.bufferedPageRange();
  const generated = fmtDateTime(new Date());

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const left = pageLeft(doc);
    const right = pageRight(doc);
    const isFirst = i === range.start;

    // Subsequent pages: compact dark strip with black logo on a light chip
    if (!isFirst && logoPath) {
      const stripH = 36;
      const stripY = 12;
      doc.roundedRect(left, stripY, right - left, stripH, 8).fillColor(PALETTE.headerBg).fill();
      drawBrandLogo(doc, {
        x: left + 10,
        y: stripY + 4,
        height: 28,
        backdrop: true,
      });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94A3B8')
        .text('Driver profile', right - 120, stripY + 13, {
          width: 110,
          align: 'right',
          lineBreak: false,
        });
    }

    const footerY = doc.page.height - doc.page.margins.bottom + 10;
    doc
      .moveTo(left, footerY - 6)
      .lineTo(right, footerY - 6)
      .lineWidth(0.4)
      .strokeColor(PALETTE.border)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(PALETTE.muted)
      .text(
        `Generated ${generated}  ·  SpareDriver Admin  ·  Page ${i + 1} of ${range.count}`,
        left,
        footerY,
        { width: right - left, align: 'center' },
      );
  }

  doc.switchToPage(range.start + range.count - 1);
}

/**
 * Build a one-click driver dossier as a PDF stream.
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
    margins: { top: MARGIN, bottom: MARGIN + 8, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `${driver.name || 'Driver'} – Profile`,
      Author: 'SpareDriver Admin',
      Subject: `Driver dossier for ${driver.driverNumber || driver._id}`,
      CreationDate: new Date(),
    },
  });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="driver-${driver.driverNumber || driver._id}.pdf"`,
    );
    doc.pipe(res);
  }

  drawHeaderBanner(doc, driver, profilePicBuffer);

  sectionHeading(doc, 'Identity');
  const identityRows = [
    { label: 'Driver ID', value: driver.driverNumber || String(driver._id) },
    { label: 'Full name', value: driver.name },
    { label: 'Phone', value: driver.phone ? `+91 ${driver.phone}` : null },
  ];
  if (driver.email) identityRows.push({ label: 'Email', value: driver.email });
  if (driver.gender) identityRows.push({ label: 'Gender', value: driver.gender });
  if (driver.dateOfBirth) {
    identityRows.push({ label: 'Date of birth', value: fmtDate(driver.dateOfBirth) });
  }
  if (driver.authProvider) {
    identityRows.push({ label: 'Auth provider', value: driver.authProvider });
  }
  if (driver.city) identityRows.push({ label: 'City', value: driver.city });
  if (driver.referralCode) {
    identityRows.push({ label: 'Referral code', value: driver.referralCode });
  }
  infoGrid(doc, identityRows);

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

  if ((driver.vehicleExperience || []).length > 0) {
    sectionHeading(doc, `Vehicle experience (${driver.vehicleExperience.length})`);
    const left = pageLeft(doc);
    driver.vehicleExperience.forEach((entry, idx) => {
      ensureSpace(doc, 28);
      const parts = [
        entry.carTypeId?.name,
        entry.brandId?.name,
        entry.modelId?.name,
        entry.fuelTypeId?.name,
      ].filter(Boolean);
      const line = `${idx + 1}.  ${parts.join('  ·  ') || 'Vehicle'}`;
      const y = doc.y;
      doc
        .roundedRect(left, y, contentWidth(doc), 24, 6)
        .fillColor(PALETTE.cardBg)
        .fill();
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(PALETTE.text)
        .text(line, left + 10, y + 7, {
          width: contentWidth(doc) - 20,
          ellipsis: true,
          lineBreak: false,
        });
      doc.y = y + 30;
      doc.x = left;
    });
  }

  sectionHeading(doc, 'Status & ratings');
  infoGrid(doc, [
    { label: 'Onboarding step', value: `Step ${driver.onboardingStep || 1} of 6` },
    { label: 'Currently online', value: driver.isOnline ? 'Yes' : 'No' },
    { label: 'On a trip right now', value: driver.isOnTrip ? 'Yes' : 'No' },
    {
      label: 'Rating',
      value: driver.rating ? Number(driver.rating).toFixed(2) : '0.00',
    },
    { label: 'Total ratings', value: driver.ratingCount || 0 },
    { label: 'Last online', value: fmtDateTime(driver.lastOnlineAt) },
  ]);

  // Documents — new page only when current page is already crowded
  ensureSpace(doc, 260);
  sectionHeading(doc, `Documents (${documents.length})`);
  await drawDocumentsGrid(doc, documents);

  if (driver.liveVerificationVideo?.videoUrl) {
    sectionHeading(doc, 'Live identity verification');
    ensureSpace(doc, 70);
    const left = pageLeft(doc);
    const boxY = doc.y;
    const boxH = 64;
    doc
      .roundedRect(left, boxY, contentWidth(doc), boxH, 8)
      .fillColor(PALETTE.accentSoft)
      .fill();
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.text)
      .text(
        `Recorded ${fmtDateTime(driver.liveVerificationVideo.recordedAt)}` +
          (driver.liveVerificationVideo.durationSeconds
            ? `  ·  ${driver.liveVerificationVideo.durationSeconds}s`
            : ''),
        left + 12,
        boxY + 12,
        { width: contentWidth(doc) - 24 },
      );
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PALETTE.accent)
      .text(driver.liveVerificationVideo.videoUrl, left + 12, boxY + 32, {
        width: contentWidth(doc) - 24,
        link: driver.liveVerificationVideo.videoUrl,
        underline: true,
      });
    doc.y = boxY + boxH + 12;
    doc.x = left;
  }

  addPageChrome(doc);
  doc.end();
  return doc;
}

export const _internals = { fetchAsBuffer };
