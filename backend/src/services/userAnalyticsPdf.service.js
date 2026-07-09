import PDFDocument from 'pdfkit';
import { getAdminUserAnalyticsService, listAdminUserWalletTransactionsService } from './adminUserAnalytics.service.js';
import {
  listAdminUserTripsService,
  listAdminUserSubscriptionsService,
} from './adminUserActivity.service.js';

const PALETTE = {
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  accent: '#0D9488',
  accentDark: '#0F766E',
  danger: '#DC2626',
  success: '#16A34A',
  pillBg: '#F1F5F9',
  headerBg: '#0F172A',
  rowAlt: '#F8FAFC',
};

const BRAND = 'SpareDriver';

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
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function fmtCurrency(n) {
  const val = Number(n) || 0;
  return `Rs ${val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function pretty(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function capitalize(s) {
  if (!s) return '—';
  return String(s).replace(/_/g, ' ');
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

function pageContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pageRight(doc) {
  return doc.page.width - doc.page.margins.right;
}

function drawDivider(doc) {
  const y = doc.y + 4;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(pageRight(doc), y)
    .lineWidth(0.5)
    .strokeColor(PALETTE.border)
    .stroke();
  doc.moveDown(0.8);
}

function ensureSpace(doc, neededHeight = 100) {
  const bottom = doc.page.height - doc.page.margins.bottom - 28;
  if (doc.y + neededHeight > bottom) doc.addPage();
}

function sectionHeading(doc, label) {
  ensureSpace(doc, 60);
  doc
    .moveDown(0.6)
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(PALETTE.accent)
    .text(label.toUpperCase(), { characterSpacing: 0.8 });
  drawDivider(doc);
}

function infoGrid(doc, rows) {
  const colGap = 16;
  const colWidth = (pageContentWidth(doc) - colGap) / 2;
  const startX = doc.page.margins.left;

  for (let i = 0; i < rows.length; i += 2) {
    ensureSpace(doc, 48);
    const yStart = doc.y;

    const drawCell = (cell, x) => {
      if (!cell) return 0;
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(PALETTE.muted)
        .text(cell.label.toUpperCase(), x, yStart, { width: colWidth, characterSpacing: 0.5 });
      const labelH = doc.heightOfString(cell.label.toUpperCase(), { width: colWidth });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(PALETTE.text)
        .text(pretty(cell.value), x, yStart + labelH + 3, { width: colWidth });
      const valueH = doc.heightOfString(pretty(cell.value), { width: colWidth });
      return labelH + valueH + 6;
    };

    const leftH = drawCell(rows[i], startX);
    const rightH = drawCell(rows[i + 1], startX + colWidth + colGap);
    doc.y = yStart + Math.max(leftH, rightH) + 8;
  }
}

function statBoxes(doc, items) {
  ensureSpace(doc, 72);
  const gap = 10;
  const count = items.length;
  const boxW = (pageContentWidth(doc) - gap * (count - 1)) / count;
  const boxH = 58;
  const startX = doc.page.margins.left;
  const startY = doc.y;

  items.forEach((item, i) => {
    const x = startX + i * (boxW + gap);
    doc
      .roundedRect(x, startY, boxW, boxH, 8)
      .fillColor(PALETTE.pillBg)
      .fill();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(PALETTE.muted)
      .text(item.label.toUpperCase(), x + 10, startY + 10, { width: boxW - 20 });
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(PALETTE.text)
      .text(pretty(item.value), x + 10, startY + 26, { width: boxW - 20 });
  });

  doc.y = startY + boxH + 14;
}

function drawTable(doc, columns, rows, { emptyText = 'No records.' } = {}) {
  const left = doc.page.margins.left;
  const tableWidth = pageContentWidth(doc);
  const rowH = 22;
  const headerH = 24;

  ensureSpace(doc, headerH + rowH * Math.min(rows.length || 1, 3) + 8);

  const colWidths = columns.map((c) => c.width || tableWidth / columns.length);
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const scale = tableWidth / totalW;
  const scaledWidths = colWidths.map((w) => w * scale);

  let y = doc.y;

  doc
    .roundedRect(left, y, tableWidth, headerH, 6)
    .fillColor(PALETTE.accent)
    .fill();
  let x = left;
  columns.forEach((col, i) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#FFFFFF')
      .text(col.label.toUpperCase(), x + 8, y + 7, {
        width: scaledWidths[i] - 12,
        ellipsis: true,
      });
    x += scaledWidths[i];
  });
  y += headerH;

  if (!rows.length) {
    doc
      .rect(left, y, tableWidth, rowH)
      .fillColor(PALETTE.rowAlt)
      .fill();
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(PALETTE.muted)
      .text(emptyText, left + 8, y + 6, { width: tableWidth - 16 });
    doc.y = y + rowH + 10;
    return;
  }

  rows.forEach((row, rowIdx) => {
    ensureSpace(doc, rowH + 8);
    if (rowIdx > 0) y = doc.y;

    const bg = rowIdx % 2 === 0 ? '#FFFFFF' : PALETTE.rowAlt;
    doc.rect(left, y, tableWidth, rowH).fillColor(bg).fill();
    doc
      .moveTo(left, y + rowH)
      .lineTo(left + tableWidth, y + rowH)
      .lineWidth(0.25)
      .strokeColor(PALETTE.border)
      .stroke();

    x = left;
    columns.forEach((col, i) => {
      const val = col.render ? col.render(row) : pretty(row[col.key]);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(PALETTE.text)
        .text(val, x + 8, y + 6, { width: scaledWidths[i] - 12, ellipsis: true });
      x += scaledWidths[i];
    });
    y += rowH;
    doc.y = y;
  });

  doc.moveDown(0.6);
}

function drawTrendChart(doc, points, valueKey, { title, formatValue = (v) => String(v) } = {}) {
  if (!points?.length) return;

  const slice = points.length > 21 ? points.slice(-21) : points;
  const chartH = 72;
  const chartW = pageContentWidth(doc);
  const left = doc.page.margins.left;

  ensureSpace(doc, chartH + 36);

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(PALETTE.text)
    .text(title, left, doc.y);
  doc.moveDown(0.4);

  const y0 = doc.y;
  const max = Math.max(...slice.map((p) => Number(p[valueKey]) || 0), 1);
  const barGap = 3;
  const barW = (chartW - barGap * (slice.length - 1)) / slice.length;

  doc
    .roundedRect(left, y0, chartW, chartH, 6)
    .fillColor(PALETTE.pillBg)
    .fill();

  slice.forEach((point, i) => {
    const value = Number(point[valueKey]) || 0;
    const barHeight = Math.max(value > 0 ? 4 : 2, (value / max) * (chartH - 18));
    const x = left + 8 + i * (barW + barGap);
    const barY = y0 + chartH - 10 - barHeight;
    doc
      .roundedRect(x, barY, Math.max(barW - 2, 2), barHeight, 2)
      .fillColor(value > 0 ? PALETTE.accent : '#CBD5E1')
      .fill();
  });

  doc.y = y0 + chartH + 12;
}

function tripFare(booking) {
  return booking?.payment?.amountPaidRupees || booking?.fareSnapshot?.total || 0;
}

function filterDateParams(filters) {
  if (!filters?.from && !filters?.to) return {};
  return {
    from: filters.from ? new Date(filters.from).toISOString().slice(0, 10) : undefined,
    to: filters.to ? new Date(filters.to).toISOString().slice(0, 10) : undefined,
  };
}

const PDF_FETCH_LIMIT = 50;
const PDF_MAX_PAGES = 100;

/** Paginate through the full result set for PDF export (up to 5 000 rows). */
async function fetchAllTripsForPdf(userId, query, dateParams) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= PDF_MAX_PAGES) {
    const result = await listAdminUserTripsService(userId, {
      page,
      limit: PDF_FETCH_LIMIT,
      ...dateParams,
      status: query.status,
      serviceType: query.serviceType,
    });
    items.push(...(result.items || []));
    totalPages = result.pages || 1;
    page += 1;
  }
  return items;
}

async function fetchAllSubscriptionsForPdf(userId, query, dateParams) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= PDF_MAX_PAGES) {
    const result = await listAdminUserSubscriptionsService(userId, {
      page,
      limit: PDF_FETCH_LIMIT,
      ...dateParams,
      status: query.subscriptionStatus,
    });
    items.push(...(result.items || []));
    totalPages = result.pages || 1;
    page += 1;
  }
  return items;
}

async function fetchAllWalletTxnsForPdf(userId, dateParams) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= PDF_MAX_PAGES) {
    const result = await listAdminUserWalletTransactionsService(userId, {
      page,
      limit: PDF_FETCH_LIMIT,
      ...dateParams,
    });
    items.push(...(result.items || []));
    totalPages = result.pages || 1;
    page += 1;
  }
  return items;
}

function drawReportHeader(doc, user, profile, profilePicBuffer) {
  const pageLeft = doc.page.margins.left;
  const right = pageRight(doc);
  const bannerH = 108;
  const bannerY = doc.y;

  doc.roundedRect(pageLeft, bannerY, right - pageLeft, bannerH, 12).fillColor(PALETTE.headerBg).fill();

  const avatarSize = 68;
  const avatarX = pageLeft + 16;
  const avatarY = bannerY + (bannerH - avatarSize) / 2;

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
      // fall through
    }
  }

  if (!profilePicBuffer) {
    doc
      .roundedRect(avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2)
      .fillColor('#1E293B')
      .fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(26)
      .fillColor('#94A3B8')
      .text((user.name || '?').charAt(0).toUpperCase(), avatarX, avatarY + 16, {
        width: avatarSize,
        align: 'center',
      });
  }

  const titleX = avatarX + avatarSize + 16;
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#FFFFFF')
    .text(user.name || 'Customer', titleX, bannerY + 16, { width: right - titleX - 100 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#CBD5E1')
    .text('Customer Analytics Report', titleX, doc.y + 2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#94A3B8')
    .text(
      [user.phone_no, user.email, `Joined ${fmtDate(profile.joinedAt)}`].filter(Boolean).join('  |  '),
      titleX,
      doc.y + 4,
      { width: right - titleX - 16 },
    );

  const statusLabel = user.isActive ? 'ACTIVE' : 'INACTIVE';
  const statusColor = user.isActive ? PALETTE.success : PALETTE.danger;
  doc.font('Helvetica-Bold').fontSize(8);
  const padX = 10;
  const padY = 5;
  const pillW = doc.widthOfString(statusLabel) + padX * 2;
  const pillH = doc.currentLineHeight() + padY * 2;
  const pillX = right - pillW - 16;
  const pillY = bannerY + 16;
  doc.roundedRect(pillX, pillY, pillW, pillH, 999).fillColor(statusColor).fill();
  doc.fillColor('#FFFFFF').text(statusLabel, pillX + padX, pillY + padY, { lineBreak: false });

  doc.y = bannerY + bannerH + 16;
  doc.x = pageLeft;
}

function drawFilterStrip(doc, filters) {
  ensureSpace(doc, 44);
  const left = doc.page.margins.left;
  const w = pageContentWidth(doc);
  const y = doc.y;

  doc.roundedRect(left, y, w, 36, 8).fillColor('#ECFDF5').fill();
  doc
    .strokeColor('#A7F3D0')
    .lineWidth(0.5)
    .roundedRect(left, y, w, 36, 8)
    .stroke();

  const rangeLabel =
    filters.from && filters.to
      ? `${fmtDate(filters.from)} to ${fmtDate(filters.to)}`
      : 'All time';

  const parts = [`Period: ${rangeLabel}`];
  if (filters.serviceType) parts.push(`Service: ${capitalize(filters.serviceType)}`);
  if (filters.status) parts.push(`Trip status: ${capitalize(filters.status)}`);
  if (filters.subscriptionStatus) parts.push(`Subscription: ${capitalize(filters.subscriptionStatus)}`);

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(PALETTE.accentDark)
    .text(parts.join('   •   '), left + 12, y + 12, { width: w - 24 });

  doc.y = y + 44;
}

function addFooters(doc) {
  const range = doc.bufferedPageRange();
  const right = pageRight(doc);
  const generated = fmtDateTime(new Date());

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const footerY = doc.page.height - doc.page.margins.bottom + 10;
    doc
      .moveTo(doc.page.margins.left, footerY - 4)
      .lineTo(right, footerY - 4)
      .lineWidth(0.25)
      .strokeColor(PALETTE.border)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(PALETTE.muted)
      .text(
        `Generated ${generated}  •  ${BRAND} Admin  •  Confidential  •  Page ${i + 1} of ${range.count}`,
        doc.page.margins.left,
        footerY,
        { align: 'center', width: right - doc.page.margins.left },
      );
  }
  doc.switchToPage(range.start + range.count - 1);
}

/**
 * Professional customer analytics PDF — includes full period data for trips,
 * subscriptions, and wallet transactions (paginated fetch on the server).
 */
export async function buildUserAnalyticsPdf(userId, query = {}, { res } = {}) {
  const analytics = await getAdminUserAnalyticsService(userId, query);
  const { user, profile, filters, summary, breakdown, trends } = analytics;
  const dateParams = filterDateParams(filters);

  const [allTrips, allSubscriptions, allWalletTxns, profilePicBuffer] = await Promise.all([
    fetchAllTripsForPdf(userId, query, dateParams),
    fetchAllSubscriptionsForPdf(userId, query, dateParams),
    fetchAllWalletTxnsForPdf(userId, dateParams),
    fetchAsBuffer(user.profilePicture),
  ]);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: `${user.name || 'Customer'} – Analytics`,
      Author: `${BRAND} Admin`,
      Subject: `Customer analytics for ${user._id}`,
      CreationDate: new Date(),
    },
  });

  if (res) {
    const safeName = (user.name || 'user')
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user-analytics-${safeName || 'report'}.pdf"`,
    );
    doc.pipe(res);
  }

  drawReportHeader(doc, user, profile, profilePicBuffer);
  drawFilterStrip(doc, filters);

  statBoxes(doc, [
    { label: 'Total trips', value: summary.trips.total },
    { label: 'Completed', value: summary.trips.completed },
    { label: 'Total spending', value: fmtCurrency(summary.spending.total) },
    { label: 'Wallet balance', value: fmtCurrency(profile.wallet.balance) },
  ]);

  sectionHeading(doc, 'Executive summary');
  infoGrid(doc, [
    { label: 'Trip spending', value: fmtCurrency(summary.spending.trips) },
    { label: 'Subscription spending', value: fmtCurrency(summary.spending.subscriptions) },
    { label: 'Active trips', value: summary.trips.active },
    { label: 'Cancelled trips', value: summary.trips.cancelled },
    { label: 'Active subscriptions', value: summary.subscriptions.active },
    { label: 'Support tickets', value: summary.support.tickets },
    { label: 'SOS alerts', value: summary.support.sosAlerts },
    { label: 'Refunds', value: summary.support.refunds },
  ]);

  sectionHeading(doc, 'Activity trends');
  drawTrendChart(doc, trends.trips, 'count', {
    title: 'Daily trips',
    formatValue: (v) => String(Math.round(v)),
  });
  drawTrendChart(doc, trends.spending, 'amount', {
    title: 'Daily spending (completed trips)',
    formatValue: fmtCurrency,
  });

  sectionHeading(doc, 'Account & wallet');
  infoGrid(doc, [
    { label: 'Customer ID', value: user._id },
    { label: 'Email verified', value: user.isEmailVerified ? 'Yes' : 'No' },
    { label: 'Phone verified', value: user.isPhoneVerified ? 'Yes' : 'No' },
    { label: 'Vehicles', value: `${profile.activeCarsCount} active / ${profile.carsCount} total` },
    { label: 'Wallet credited (lifetime)', value: fmtCurrency(profile.wallet.totalCredited) },
    { label: 'Wallet spent (lifetime)', value: fmtCurrency(profile.wallet.totalSpent) },
    { label: 'Held buffers', value: fmtCurrency(profile.wallet.heldRupees) },
    { label: 'Saved locations', value: profile.savedLocationsCount },
    {
      label: 'Credits in period',
      value: `${fmtCurrency(summary.walletActivity.credits)} (${summary.walletActivity.creditCount} txns)`,
    },
    {
      label: 'Debits in period',
      value: `${fmtCurrency(summary.walletActivity.debits)} (${summary.walletActivity.debitCount} txns)`,
    },
  ]);

  if (breakdown.byTripStatus.length) {
    sectionHeading(doc, 'Trip status breakdown');
    drawTable(
      doc,
      [
        { label: 'Status', key: 'status', width: 180 },
        { label: 'Count', key: 'count', width: 80 },
      ],
      breakdown.byTripStatus.map((r) => ({
        status: capitalize(r.status),
        count: String(r.count),
      })),
    );
  }

  if (breakdown.byServiceType.length) {
    sectionHeading(doc, 'Trips by service type');
    drawTable(
      doc,
      [
        { label: 'Service', key: 'serviceType', width: 120 },
        { label: 'Trips', key: 'count', width: 60 },
        { label: 'Spending', key: 'spending', width: 100 },
      ],
      breakdown.byServiceType.map((r) => ({
        serviceType: capitalize(r.serviceType),
        count: String(r.count),
        spending: fmtCurrency(r.spending),
      })),
    );
  }

  if (breakdown.bySubscriptionStatus?.length) {
    sectionHeading(doc, 'Subscription status');
    drawTable(
      doc,
      [
        { label: 'Status', key: 'status', width: 180 },
        { label: 'Count', key: 'count', width: 80 },
      ],
      breakdown.bySubscriptionStatus.map((r) => ({
        status: capitalize(r.status),
        count: String(r.count),
      })),
    );
  }

  sectionHeading(doc, `All trips (${allTrips.length})`);
  drawTable(
    doc,
    [
      { label: 'Booking', key: 'booking', width: 90 },
      { label: 'Service', key: 'service', width: 70 },
      { label: 'Status', key: 'status', width: 80 },
      { label: 'Fare', key: 'fare', width: 70 },
      { label: 'Date', key: 'date', width: 90 },
    ],
    allTrips.map((t) => ({
      booking: t.bookingNumber || String(t._id).slice(-8),
      service: capitalize(t.serviceType),
      status: capitalize(t.status),
      fare: fmtCurrency(tripFare(t)),
      date: fmtDate(t.createdAt),
    })),
    { emptyText: 'No trips in the selected period.' },
  );

  sectionHeading(doc, `All subscriptions (${allSubscriptions.length})`);
  drawTable(
    doc,
    [
      { label: 'Plan', key: 'plan', width: 110 },
      { label: 'Status', key: 'status', width: 80 },
      { label: 'Amount', key: 'amount', width: 70 },
      { label: 'Period', key: 'period', width: 120 },
    ],
    allSubscriptions.map((s) => ({
      plan: s.planNameSnapshot || '—',
      status: capitalize(s.status),
      amount: fmtCurrency(s.amount),
      period: `${fmtDate(s.startDate)} – ${fmtDate(s.expiryDate)}`,
    })),
    { emptyText: 'No subscriptions in the selected period.' },
  );

  sectionHeading(doc, `All wallet transactions (${allWalletTxns.length})`);
  drawTable(
    doc,
    [
      { label: 'Type', key: 'type', width: 55 },
      { label: 'Source', key: 'source', width: 100 },
      { label: 'Amount', key: 'amount', width: 75 },
      { label: 'Balance', key: 'balance', width: 75 },
      { label: 'Date', key: 'date', width: 95 },
    ],
    allWalletTxns.map((tx) => ({
      type: capitalize(tx.direction),
      source: capitalize(tx.source),
      amount: `${tx.direction === 'credit' ? '+' : '-'}${fmtCurrency(tx.amountRupees)}`,
      balance: fmtCurrency(tx.balanceAfter),
      date: fmtDate(tx.createdAt),
    })),
    { emptyText: 'No wallet transactions in the selected period.' },
  );

  addFooters(doc);
  doc.end();
  return doc;
}
