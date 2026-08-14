import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Shared PDF branding helpers.
 *
 * PDFKit's built-in Helvetica fonts do not include the ₹ glyph, so it
 * renders as a broken superscript "1". Always format money with
 * `formatPdfInr` (ASCII "Rs.") for PDF output.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOGO_CANDIDATES = [
  path.resolve(__dirname, '../../../frontend/public/images/black-logo.png'),
  path.resolve(__dirname, '../../assets/brand-logo.png'),
];

/** black-logo.png ≈ 528×473 */
const LOGO_ASPECT = 528 / 473;

let cachedLogoPath;

export function getBrandLogoPath() {
  if (cachedLogoPath !== undefined) return cachedLogoPath;
  for (const candidate of LOGO_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) {
        cachedLogoPath = candidate;
        return cachedLogoPath;
      }
    } catch {
      // keep looking
    }
  }
  cachedLogoPath = null;
  return null;
}

/** ASCII-safe INR for PDFKit Helvetica (avoids ₹ → ¹). */
export function formatPdfInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'Rs. —';
  const formatted = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}Rs. ${formatted}`;
}

/**
 * Draw the SpareDriver logo (black mark for light surfaces). Returns the
 * drawn box size (or zeros if the asset is missing).
 *
 * Pass `backdrop: true` (or a hex color) when placing on a dark fill so
 * the black artwork stays visible.
 */
export function drawBrandLogo(
  doc,
  { x, y, height = 28, align = 'left', backdrop = false } = {},
) {
  const logoPath = getBrandLogoPath();
  if (!logoPath) return { drawn: false, width: 0, height: 0 };

  const h = height;
  const w = h * LOGO_ASPECT;
  const drawX =
    align === 'right' ? (x ?? doc.page.width - doc.page.margins.right) - w : (x ?? doc.page.margins.left);
  const drawY = y ?? doc.y;

  try {
    if (backdrop) {
      const pad = Math.max(3, Math.round(h * 0.12));
      const fill = typeof backdrop === 'string' ? backdrop : '#FFFFFF';
      doc
        .roundedRect(drawX - pad, drawY - pad, w + pad * 2, h + pad * 2, pad)
        .fillColor(fill)
        .fill();
    }
    doc.image(logoPath, drawX, drawY, { height: h });
    return { drawn: true, width: w, height: h };
  } catch {
    return { drawn: false, width: 0, height: 0 };
  }
}

/**
 * Stamp a small logo in the top-right margin of every buffered page.
 * Call after content is written and before (or as part of) footers.
 * Requires `bufferPages: true` on the PDFDocument.
 */
export function stampBrandLogoOnAllPages(doc, { height = 18, marginTop = 14 } = {}) {
  const logoPath = getBrandLogoPath();
  if (!logoPath) return;

  const range = doc.bufferedPageRange();
  const right = doc.page.width - doc.page.margins.right;
  const w = height * LOGO_ASPECT;

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    try {
      doc.image(logoPath, right - w, marginTop, { height });
    } catch {
      // skip page if image fails
    }
  }

  doc.switchToPage(range.start + range.count - 1);
}
