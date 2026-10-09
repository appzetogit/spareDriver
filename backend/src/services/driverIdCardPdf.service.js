import PDFDocument from 'pdfkit';
import { Driver } from '../models/driverModels/driver.model.js';
import { ApiError } from '../utils/apiError.js';
import { dedupeDocumentsByType } from '../utils/driverDocuments.util.js';
import { drawBrandLogo } from '../utils/pdfBrand.js';

const COLORS = {
  primary: '#FFD86F',
  dark: '#0F0F11',
  darkSoft: '#18181B',
  line: '#2E2E33',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  ink: '#0F0F11',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  sheet: '#F4F4F5',
};

const STATUS = {
  approved: { label: 'VERIFIED', color: COLORS.success },
  pending: { label: 'ONBOARDING', color: COLORS.warning },
  under_review: { label: 'UNDER REVIEW', color: COLORS.warning },
  rejected: { label: 'REJECTED', color: COLORS.danger },
  suspended: { label: 'SUSPENDED', color: COLORS.danger },
};

/** CR80 (ISO/IEC 7810 ID-1) card in PDF points: 54 mm x 85.6 mm, portrait. */
const CARD_W = 153;
const CARD_H = 242.6;
const RADIUS = 9;

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function fmtPhone(phone) {
  if (!phone) return '—';
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10) return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
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
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Draw single-line text, shrinking the font until it fits `width`. */
function fitText(doc, text, x, y, width, { font, size, max = size, min = 5, color, align = 'left' }) {
  const value = String(text ?? '—');
  let s = max;
  doc.font(font);
  while (s > min) {
    doc.fontSize(s);
    if (doc.widthOfString(value) <= width) break;
    s -= 0.5;
  }
  doc.fontSize(s).fillColor(color).text(value, x, y, { width, align, lineBreak: false });
}

function drawField(doc, x, y, width, label, value) {
  doc
    .font('Helvetica-Bold')
    .fontSize(4.8)
    .fillColor(COLORS.muted)
    .text(label, x, y, { width, characterSpacing: 0.6, lineBreak: false });
  fitText(doc, value || '—', x, y + 7, width, {
    font: 'Helvetica-Bold',
    size: 7.6,
    color: COLORS.text,
  });
}

function drawInitials(doc, x, y, w, h, name) {
  doc.rect(x, y, w, h).fillColor(COLORS.darkSoft).fill();
  const initials =
    String(name || 'D')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'D';
  doc
    .font('Helvetica-Bold')
    .fontSize(26)
    .fillColor(COLORS.primary)
    .text(initials, x, y + h / 2 - 13, { width: w, align: 'center', lineBreak: false });
}

/** Rounded dark card with a clipped content region; caller draws inside `fn`. */
function withCard(doc, x, y, fn) {
  doc.save();
  doc.roundedRect(x, y, CARD_W, CARD_H, RADIUS).clip();
  doc.rect(x, y, CARD_W, CARD_H).fillColor(COLORS.dark).fill();
  fn();
  doc.restore();
  doc.roundedRect(x, y, CARD_W, CARD_H, RADIUS).lineWidth(0.4).strokeColor(COLORS.line).stroke();
}

function drawFront(doc, x, y, d) {
  withCard(doc, x, y, () => {
    // Header band
    doc.rect(x, y, CARD_W, 64).fillColor(COLORS.primary).fill();
    // Decorative arc
    doc
      .circle(x + CARD_W - 6, y - 8, 46)
      .fillColor('#F5C84F')
      .fillOpacity(0.55)
      .fill()
      .fillOpacity(1);
    const logo = drawBrandLogo(doc, { x: x + 12, y: y + 11, height: 17 });
    if (!logo.drawn) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink).text('SpareDriver', x + 12, y + 14);
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(5.6)
      .fillColor(COLORS.ink)
      .text('CAPTAIN IDENTITY CARD', x + 12, y + 33, { characterSpacing: 0.9, lineBreak: false });

    // Photo with ring
    const pw = 66;
    const ph = 80;
    const px = x + (CARD_W - pw) / 2;
    const py = y + 40;
    doc.roundedRect(px - 3, py - 3, pw + 6, ph + 6, 8).fillColor(COLORS.dark).fill();
    doc.roundedRect(px - 1.2, py - 1.2, pw + 2.4, ph + 2.4, 7).fillColor(COLORS.primary).fill();
    doc.save();
    doc.roundedRect(px, py, pw, ph, 6).clip();
    let drew = false;
    if (d.photo) {
      try {
        doc.image(d.photo, px, py, { cover: [pw, ph], align: 'center', valign: 'center' });
        drew = true;
      } catch {
        drew = false;
      }
    }
    if (!drew) drawInitials(doc, px, py, pw, ph, d.name);
    doc.restore();

    // Name + role
    fitText(doc, d.name.toUpperCase(), x + 8, y + 132, CARD_W - 16, {
      font: 'Helvetica-Bold',
      size: 12.5,
      min: 7,
      color: COLORS.text,
      align: 'center',
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(5.8)
      .fillColor(COLORS.primary)
      .text('PROFESSIONAL CAPTAIN', x, y + 148, {
        width: CARD_W,
        align: 'center',
        characterSpacing: 1.1,
        lineBreak: false,
      });

    // Status pill
    doc.font('Helvetica-Bold').fontSize(5.4);
    const label = d.status.label;
    const pillW = doc.widthOfString(label, { characterSpacing: 0.8 }) + 18;
    const pillX = x + (CARD_W - pillW) / 2;
    doc.roundedRect(pillX, y + 160, pillW, 11, 5.5).fillColor(d.status.color).fill();
    doc
      .fillColor(COLORS.text)
      .text(label, pillX, y + 163.2, { width: pillW, align: 'center', characterSpacing: 0.8, lineBreak: false });

    // Details
    doc.moveTo(x + 14, y + 179).lineTo(x + CARD_W - 14, y + 179).lineWidth(0.4).strokeColor(COLORS.line).stroke();
    const colW = (CARD_W - 28 - 8) / 2;
    const left = x + 14;
    const right = left + colW + 8;
    drawField(doc, left, y + 186, colW, 'DRIVER ID', d.driverNumber);
    drawField(doc, right, y + 186, colW, 'MOBILE', d.phone);
    drawField(doc, left, y + 206, colW, 'LICENCE NO.', d.licenseNumber);
    drawField(doc, right, y + 206, colW, 'LICENCE VALID TILL', d.licenseValidity);

    // Footer strip
    doc.rect(x, y + CARD_H - 13, CARD_W, 13).fillColor(COLORS.primary).fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(5)
      .fillColor(COLORS.ink)
      .text('VERIFIED SPAREDRIVER CAPTAIN', x, y + CARD_H - 9, {
        width: CARD_W,
        align: 'center',
        characterSpacing: 0.9,
        lineBreak: false,
      });
  });
}

function drawBack(doc, x, y, d) {
  withCard(doc, x, y, () => {
    doc.rect(x, y, CARD_W, 34).fillColor(COLORS.primary).fill();
    const logo = drawBrandLogo(doc, { x: x + 12, y: y + 9, height: 16 });
    if (!logo.drawn) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text('SpareDriver', x + 12, y + 12);
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(5.2)
      .fillColor(COLORS.ink)
      .text('TERMS OF USE', x, y + 14, { width: CARD_W - 12, align: 'right', characterSpacing: 0.9, lineBreak: false });

    const terms = [
      'This card is the property of SpareDriver and is not transferable.',
      'Carry it while on duty and show it to customers when asked.',
      'Report a lost or misused card at once through Help & Support in the SpareDriver app.',
      'Misuse or tampering can lead to suspension of the captain account.',
    ];
    let ty = y + 42;
    terms.forEach((line, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(6)
        .fillColor(COLORS.primary)
        .text(`${i + 1}.`, x + 14, ty, { lineBreak: false });
      doc.font('Helvetica').fontSize(6).fillColor('#D4D4D8');
      const h = doc.heightOfString(line, { width: CARD_W - 40, lineGap: 1.2 });
      doc.text(line, x + 24, ty, { width: CARD_W - 40, lineGap: 1.2 });
      ty += h + 4;
    });

    doc.moveTo(x + 14, y + 140).lineTo(x + CARD_W - 14, y + 140).lineWidth(0.4).strokeColor(COLORS.line).stroke();
    const colW = (CARD_W - 28 - 8) / 2;
    drawField(doc, x + 14, y + 148, colW, 'ISSUED ON', d.issuedOn);
    drawField(doc, x + 14 + colW + 8, y + 148, colW, 'VALID', 'While account active');

    // Signature
    doc.moveTo(x + 24, y + 206).lineTo(x + CARD_W - 24, y + 206).lineWidth(0.5).strokeColor(COLORS.muted).stroke();
    doc
      .font('Helvetica')
      .fontSize(5.2)
      .fillColor(COLORS.muted)
      .text('Authorised Signatory — SpareDriver', x, y + 209, {
        width: CARD_W,
        align: 'center',
        lineBreak: false,
      });

    doc.rect(x, y + CARD_H - 13, CARD_W, 13).fillColor(COLORS.primary).fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(5)
      .fillColor(COLORS.ink)
      .text('IF FOUND, PLEASE RETURN TO SPAREDRIVER', x, y + CARD_H - 9, {
        width: CARD_W,
        align: 'center',
        characterSpacing: 0.7,
        lineBreak: false,
      });
  });
}

/**
 * Render the front + back ID card onto `doc` (A4, true CR80 size so it can be
 * printed and laminated). Pure drawing — no DB or network — so it can be tested.
 */
export function renderDriverIdCard(doc, data) {
  const pageW = doc.page.width;
  const gap = 28;
  const totalW = CARD_W * 2 + gap;
  const x0 = (pageW - totalW) / 2;
  const y0 = 150;

  doc.rect(0, 0, pageW, doc.page.height).fillColor(COLORS.sheet).fill();

  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor(COLORS.ink)
    .text('SpareDriver Captain ID Card', 0, 60, { width: pageW, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#71717A')
    .text('Print at 100% scale. Card size 54 x 85.6 mm (CR80). Cut along the card edge.', 0, 82, {
      width: pageW,
      align: 'center',
    });

  doc.font('Helvetica-Bold').fontSize(7).fillColor('#71717A');
  doc.text('FRONT', x0, y0 - 14, { width: CARD_W, align: 'center', characterSpacing: 1.2, lineBreak: false });
  doc.text('BACK', x0 + CARD_W + gap, y0 - 14, {
    width: CARD_W,
    align: 'center',
    characterSpacing: 1.2,
    lineBreak: false,
  });

  drawFront(doc, x0, y0, data);
  drawBack(doc, x0 + CARD_W + gap, y0, data);
}

export function buildIdCardData(driver, photo) {
  const status = STATUS[driver.approvalStatus] || {
    label: String(driver.approvalStatus || '—').toUpperCase(),
    color: COLORS.warning,
  };
  return {
    name: driver.name || 'Driver',
    driverNumber: driver.driverNumber || '—',
    phone: fmtPhone(driver.phone),
    licenseNumber: driver.drivingLicense?.number || '—',
    licenseValidity: fmtDate(driver.drivingLicense?.expiryDate),
    issuedOn: fmtDate(driver.approvedAt || driver.createdAt),
    status,
    photo,
  };
}

/**
 * Stream a SpareDriver captain ID card PDF for the authenticated driver.
 * Layout mirrors the in-app ID card screen.
 */
export async function buildDriverIdCardPdf(driverId, { res } = {}) {
  const driverDoc = await Driver.findById(driverId);
  if (!driverDoc) throw new ApiError(404, 'Driver not found');
  await Driver.ensureNumber(driverDoc);
  const driver = driverDoc.toObject();

  const documents = dedupeDocumentsByType(driver.documents || []);
  const selfieUrl =
    documents.find((d) => d.type === 'selfie')?.fileUrl || driver.profilePicture || '';
  const photo = await fetchAsBuffer(selfieUrl);

  const data = buildIdCardData(driver, photo);
  const safeName = data.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `${data.name} – SpareDriver ID Card`,
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

  renderDriverIdCard(doc, data);
  doc.end();
  return doc;
}
