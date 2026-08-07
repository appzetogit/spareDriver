import PDFDocument from 'pdfkit';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import { dedupeDocumentsByType } from '../utils/driverDocuments.util.js';
import { drawBrandLogo } from '../utils/pdfBrand.js';

const COLORS = {
  primary: '#FFD86F',
  text: '#0F0F11',
  muted: '#A1A1AA',
  border: '#E4E4E7',
  white: '#FFFFFF',
  success: '#10B981',
  warning: '#F59E0B',
  pageBg: '#FAFAFA',
};

const APPROVAL_LABEL = {
  approved: 'Approved',
  pending: 'Onboarding',
  under_review: 'Under review',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

function fmtDate(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  } catch {
    return '—';
  }
}

function fmtPhone(phone) {
  if (!phone) return '—';
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return String(phone);
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

/**
 * Stream a SpareDriver captain ID card PDF for the authenticated driver.
 * Layout mirrors the in-app ID card screen.
 */
export async function buildDriverIdCardPdf(driverId, { res } = {}) {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) throw new ApiError(404, 'Driver not found');

  const documents = dedupeDocumentsByType(driver.documents || []);
  const selfieUrl =
    documents.find((d) => d.type === 'selfie')?.fileUrl ||
    driver.profilePicture ||
    '';
  const photoBuffer = await fetchAsBuffer(selfieUrl);

  const name = driver.name || 'Driver';
  const phone = fmtPhone(driver.phone);
  const licenseNumber = driver.drivingLicense?.number || '—';
  const licenseValidity = fmtDate(driver.drivingLicense?.expiryDate);
  const status = driver.approvalStatus || '';
  const statusLabel = APPROVAL_LABEL[status] || status || '—';
  const isApproved = status === 'approved';

  const safeName = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: `${name} – SpareDriver ID Card`,
      Author: 'SpareDriver',
      Subject: 'Captain ID Card',
      CreationDate: new Date(),
    },
  });

  if (res) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sparedriver-id-card-${safeName || 'captain'}.pdf"`,
    );
    doc.pipe(res);
  }

  const pageW = doc.page.width;
  const cardW = Math.min(420, pageW - 96);
  const cardX = (pageW - cardW) / 2;
  const cardY = 120;
  const headerH = 88;
  const avatarR = 42;
  const bodyPad = 28;
  const cardH = 360;

  // Page title
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(COLORS.text)
    .text('SpareDriver ID Card', 48, 56, { align: 'center', width: pageW - 96 });

  // Card shadow
  doc
    .roundedRect(cardX + 2, cardY + 3, cardW, cardH, 16)
    .fillColor('#E4E4E7')
    .fill();

  // Card body
  doc
    .roundedRect(cardX, cardY, cardW, cardH, 16)
    .fillColor(COLORS.white)
    .fill();

  // Yellow header (clip to rounded top by covering bottom of header with white later)
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, 16).clip();
  doc.rect(cardX, cardY, cardW, headerH).fillColor(COLORS.primary).fill();
  doc.restore();

  // Captain badge (top-right)
  const badgeR = 28;
  const badgeX = cardX + cardW - bodyPad - badgeR;
  const badgeY = cardY + 18 + badgeR;
  doc.circle(badgeX, badgeY, badgeR).fillColor(COLORS.white).fill();
  const logo = drawBrandLogo(doc, {
    x: badgeX - 16,
    y: badgeY - 18,
    height: 14,
  });
  if (!logo.drawn) {
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(COLORS.text)
      .text('SD', badgeX - 8, badgeY - 14, { width: 16, align: 'center' });
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.text)
    .text('Captain', badgeX - 22, badgeY + 2, { width: 44, align: 'center' });

  // Avatar
  const avatarX = cardX + bodyPad + avatarR;
  const avatarY = cardY + headerH;
  doc
    .circle(avatarX, avatarY, avatarR + 4)
    .fillColor(COLORS.white)
    .fill();

  if (photoBuffer) {
    try {
      doc.save();
      doc.circle(avatarX, avatarY, avatarR).clip();
      doc.image(photoBuffer, avatarX - avatarR, avatarY - avatarR, {
        fit: [avatarR * 2, avatarR * 2],
        align: 'center',
        valign: 'center',
      });
      doc.restore();
    } catch {
      drawInitialsAvatar(doc, avatarX, avatarY, avatarR, name);
    }
  } else {
    drawInitialsAvatar(doc, avatarX, avatarY, avatarR, name);
  }

  // Status pill
  const pillLabel = statusLabel;
  doc.font('Helvetica-Bold').fontSize(9);
  const pillTextW = doc.widthOfString(pillLabel);
  const pillPadX = 10;
  const pillW = pillTextW + pillPadX * 2 + (isApproved ? 12 : 0);
  const pillH = 20;
  const pillX = cardX + cardW - bodyPad - pillW;
  const pillY = cardY + headerH + 10;
  doc
    .roundedRect(pillX, pillY, pillW, pillH, 10)
    .fillColor(isApproved ? COLORS.success : COLORS.warning)
    .fill();
  doc.fillColor(COLORS.white);
  if (isApproved) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('✓', pillX + 6, pillY + 4, { lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(pillLabel, pillX + 18, pillY + 5, { lineBreak: false });
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(pillLabel, pillX + pillPadX, pillY + 5, { lineBreak: false });
  }

  // Name
  let y = cardY + headerH + avatarR + 18;
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor(COLORS.text)
    .text(name, cardX + bodyPad, y, {
      width: cardW - bodyPad * 2,
      lineBreak: false,
    });
  y += 36;

  // Mobile
  y = drawField(doc, cardX + bodyPad, y, cardW - bodyPad * 2, 'MOBILE NUMBER', phone);
  y += 18;

  // License row
  const colW = (cardW - bodyPad * 2 - 16) / 2;
  drawField(doc, cardX + bodyPad, y, colW, 'LICENSE NUMBER', licenseNumber);
  drawField(
    doc,
    cardX + bodyPad + colW + 16,
    y,
    colW,
    'LICENSE VALIDITY',
    licenseValidity,
  );

  // Footer note
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      'This ID card identifies a verified SpareDriver captain.',
      48,
      cardY + cardH + 24,
      { align: 'center', width: pageW - 96 },
    );

  doc.end();
  return doc;
}

function drawInitialsAvatar(doc, cx, cy, r, name) {
  doc.circle(cx, cy, r).fillColor('#FFFBF0').fill();
  const initials = String(name || 'D')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(COLORS.text)
    .text(initials || 'D', cx - r, cy - 9, {
      width: r * 2,
      align: 'center',
      lineBreak: false,
    });
}

function drawField(doc, x, y, width, label, value) {
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(label, x, y, { width, characterSpacing: 0.6, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor(COLORS.text)
    .text(value || '—', x, y + 14, { width, lineBreak: false });
  return y + 28;
}
