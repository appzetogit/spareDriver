import PDFDocument from 'pdfkit';
import {
  getAdminDriverAnalyticsService,
  listAdminDriverTripsService,
  listAdminDriverWithdrawalsService,
  listAdminDriverEarningsService,
} from './adminDriverAnalytics.service.js';
import { stampBrandLogoOnAllPages } from '../utils/pdfBrand.js';

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
const PDF_FETCH_LIMIT = 50;
const PDF_MAX_PAGES = 100;

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
    doc.roundedRect(x, startY, boxW, boxH, 8).fillColor(PALETTE.pillBg).fill();
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

  doc.roundedRect(left, y, tableWidth, headerH, 6).fillColor(PALETTE.accent).fill();
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
    doc.rect(left, y, tableWidth, rowH).fillColor(PALETTE.rowAlt).fill();
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

  doc.font('Helvetica-Bold').fontSize(9).fillColor(PALETTE.text).text(title, left, doc.y);
  doc.moveDown(0.4);

  const y0 = doc.y;
  const max = Math.max(...slice.map((p) => Number(p[valueKey]) || 0), 1);
  const barGap = 3;
  const barW = (chartW - barGap * (slice.length - 1)) / slice.length;

  doc.roundedRect(left, y0, chartW, chartH, 6).fillColor(PALETTE.pillBg).fill();

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

function ledgerKindLabel(kind) {
  const labels = {
    trip: 'Trip earning',
    cancellation_share: 'Cancellation share',
    subscription_payout: 'Subscription payout',
    penalty: 'Penalty',
  };
  return labels[kind] || capitalize(kind);
}

async function fetchAllTripsForPdf(driverId, query, dateParams) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= PDF_MAX_PAGES) {
    const result = await listAdminDriverTripsService(driverId, {
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

async function fetchAllWithdrawalsForPdf(driverId, dateParams) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= PDF_MAX_PAGES) {
    const result = await listAdminDriverWithdrawalsService(driverId, {
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

async function fetchAllEarningsForPdf(driverId) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= PDF_MAX_PAGES) {
    const result = await listAdminDriverEarningsService(driverId, {
      page,
      limit: PDF_FETCH_LIMIT,
    });
    items.push(...(result.items || []));
    totalPages = result.pages || 1;
    page += 1;
  }
  return items;
}

function drawReportHeader(doc, driver, profile) {
  const pageLeft = doc.page.margins.left;
  const right = pageRight(doc);
  const bannerH = 108;
  const bannerY = doc.y;

  doc.roundedRect(pageLeft, bannerY, right - pageLeft, bannerH, 12).fillColor(PALETTE.headerBg).fill();

  const avatarSize = 68;
  const avatarX = pageLeft + 16;
  const avatarY = bannerY + (bannerH - avatarSize) / 2;

  doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2).fillColor('#1E293B').fill();
  doc
    .font('Helvetica-Bold')
    .fontSize(26)
    .fillColor('#94A3B8')
    .text((driver.name || '?').charAt(0).toUpperCase(), avatarX, avatarY + 16, {
      width: avatarSize,
      align: 'center',
    });

  const titleX = avatarX + avatarSize + 16;
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#FFFFFF')
    .text(driver.name || 'Driver', titleX, bannerY + 16, { width: right - titleX - 100 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#CBD5E1')
    .text('Driver Analytics Report', titleX, doc.y + 2);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#94A3B8')
    .text(
      [
        driver.phone,
        driver.email,
        `Joined ${fmtDate(profile.joinedAt)}`,
        `Rating ${profile.rating.value.toFixed(1)} (${profile.rating.count})`,
      ]
        .filter(Boolean)
        .join('  |  '),
      titleX,
      doc.y + 4,
      { width: right - titleX - 16 },
    );

  const statusLabel = String(driver.approvalStatus || 'unknown').toUpperCase().replace(/_/g, ' ');
  const statusColor =
    driver.approvalStatus === 'approved'
      ? PALETTE.success
      : driver.approvalStatus === 'suspended' || driver.approvalStatus === 'rejected'
        ? PALETTE.danger
        : '#D97706';
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
  doc.strokeColor('#A7F3D0').lineWidth(0.5).roundedRect(left, y, w, 36, 8).stroke();

  const rangeLabel =
    filters.from && filters.to
      ? `${fmtDate(filters.from)} to ${fmtDate(filters.to)}`
      : 'All time';

  const parts = [`Period: ${rangeLabel}`];
  if (filters.serviceType) parts.push(`Service: ${capitalize(filters.serviceType)}`);
  if (filters.status) parts.push(`Trip status: ${capitalize(filters.status)}`);

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
 * Professional driver analytics PDF — trips, earnings, withdrawals,
 * and cancellation track record for the selected period.
 */
export async function buildDriverAnalyticsPdf(driverId, query = {}, { res } = {}) {
  const analytics = await getAdminDriverAnalyticsService(driverId, query);
  const { driver, profile, filters, summary, breakdown, trends } = analytics;
  const dateParams = filterDateParams(filters);

  const [allTrips, allWithdrawals, allEarnings] = await Promise.all([
    fetchAllTripsForPdf(driverId, query, dateParams),
    fetchAllWithdrawalsForPdf(driverId, dateParams),
    fetchAllEarningsForPdf(driverId),
  ]);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: `${driver.name || 'Driver'} – Analytics`,
      Author: `${BRAND} Admin`,
      Subject: `Driver analytics for ${driver._id}`,
      CreationDate: new Date(),
    },
  });

  if (res) {
    const safeName = (driver.name || 'driver')
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="driver-analytics-${safeName || 'report'}.pdf"`,
    );
    doc.pipe(res);
  }

  drawReportHeader(doc, driver, profile);
  drawFilterStrip(doc, filters);

  statBoxes(doc, [
    { label: 'Total trips', value: summary.trips.total },
    { label: 'Completed', value: summary.trips.completed },
    { label: 'Net earnings (period)', value: fmtCurrency(summary.earnings.net) },
    { label: 'Wallet balance', value: fmtCurrency(profile.wallet.balance) },
  ]);

  sectionHeading(doc, 'Executive summary');
  infoGrid(doc, [
    { label: 'Trip earnings', value: fmtCurrency(summary.earnings.tripEarnings) },
    { label: 'Cancellation shares', value: fmtCurrency(summary.earnings.cancellationEarnings) },
    { label: 'Subscription payouts', value: fmtCurrency(summary.earnings.subscriptionEarnings) },
    { label: 'Penalties', value: fmtCurrency(summary.earnings.penaltyDeductions) },
    { label: 'Active trips', value: summary.trips.active },
    { label: 'Cancelled trips', value: summary.trips.cancelled },
    { label: 'Active subscriptions', value: profile.activeSubscriptions },
    {
      label: 'Withdrawals (period)',
      value: `${summary.withdrawals.total} requests`,
    },
  ]);

  sectionHeading(doc, 'Activity trends');
  drawTrendChart(doc, trends.trips, 'count', {
    title: 'Daily trips',
    formatValue: (v) => String(Math.round(v)),
  });
  drawTrendChart(doc, trends.earnings, 'amount', {
    title: 'Daily trip earnings',
    formatValue: fmtCurrency,
  });

  sectionHeading(doc, 'Wallet & lifetime');
  infoGrid(doc, [
    { label: 'Driver ID', value: driver._id },
    { label: 'Experience', value: `${profile.experienceYears} years` },
    { label: 'Total earned (lifetime)', value: fmtCurrency(profile.wallet.totalEarnings) },
    { label: 'Total withdrawn', value: fmtCurrency(profile.wallet.totalWithdrawn) },
    { label: 'Approved', value: profile.approvedAt ? fmtDate(profile.approvedAt) : '—' },
    {
      label: 'Online status',
      value: profile.online.isOnline
        ? profile.online.isOnTrip
          ? 'On trip'
          : 'Online'
        : 'Offline',
    },
    {
      label: 'Priority penalty points',
      value: String(profile.cancellationStats?.priorityPenaltyPoints ?? 0),
    },
    {
      label: 'Outstation cancellations',
      value: String(profile.cancellationStats?.outstationTotal ?? 0),
    },
  ]);

  sectionHeading(doc, 'Withdrawals summary (period)');
  infoGrid(doc, [
    {
      label: 'Pending',
      value: `${summary.withdrawals.pending.count} · ${fmtCurrency(summary.withdrawals.pending.total)}`,
    },
    {
      label: 'Processed',
      value: `${summary.withdrawals.processed.count} · ${fmtCurrency(summary.withdrawals.processed.total)}`,
    },
    {
      label: 'Rejected',
      value: `${summary.withdrawals.rejected.count} · ${fmtCurrency(summary.withdrawals.rejected.total)}`,
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
        { label: 'Trips', key: 'count', width: 80 },
      ],
      breakdown.byServiceType.map((r) => ({
        serviceType: capitalize(r.serviceType),
        count: String(r.count),
      })),
    );
  }

  sectionHeading(doc, `All trips (${allTrips.length})`);
  drawTable(
    doc,
    [
      { label: 'Booking', key: 'booking', width: 90 },
      { label: 'Customer', key: 'customer', width: 90 },
      { label: 'Service', key: 'service', width: 70 },
      { label: 'Status', key: 'status', width: 80 },
      { label: 'Fare', key: 'fare', width: 60 },
      { label: 'Date', key: 'date', width: 80 },
    ],
    allTrips.map((t) => ({
      booking: t.bookingNumber || String(t._id).slice(-8),
      customer: t.userId?.name || '—',
      service: capitalize(t.serviceType),
      status: capitalize(t.status),
      fare: fmtCurrency(tripFare(t)),
      date: fmtDate(t.createdAt),
    })),
    { emptyText: 'No trips in the selected period.' },
  );

  sectionHeading(doc, `Earnings ledger (${allEarnings.length})`);
  drawTable(
    doc,
    [
      { label: 'Type', key: 'type', width: 100 },
      { label: 'Reference', key: 'ref', width: 100 },
      { label: 'Amount', key: 'amount', width: 80 },
      { label: 'Date', key: 'date', width: 95 },
    ],
    allEarnings.map((row) => ({
      type: ledgerKindLabel(row.kind),
      ref: row.bookingNumber || row.meta?.planName || '—',
      amount: `${row.direction === 'credit' ? '+' : '-'}${fmtCurrency(row.amountRupees)}`,
      date: fmtDate(row.occurredAt),
    })),
    { emptyText: 'No earnings recorded.' },
  );

  sectionHeading(doc, `Withdrawal requests (${allWithdrawals.length})`);
  drawTable(
    doc,
    [
      { label: 'Amount', key: 'amount', width: 80 },
      { label: 'Status', key: 'status', width: 80 },
      { label: 'Balance at request', key: 'balance', width: 100 },
      { label: 'Requested', key: 'date', width: 95 },
    ],
    allWithdrawals.map((w) => ({
      amount: fmtCurrency(w.amountRupees),
      status: capitalize(w.status),
      balance: fmtCurrency(w.walletBalanceAtRequest),
      date: fmtDate(w.createdAt),
    })),
    { emptyText: 'No withdrawal requests in the selected period.' },
  );

  stampBrandLogoOnAllPages(doc);
  addFooters(doc);
  doc.end();
  return doc;
}
