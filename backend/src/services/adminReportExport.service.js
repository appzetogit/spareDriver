import { getAdminReportsOverviewService } from './adminReportsOverview.service.js';
import { getAdminUserReportsService } from './adminUserReports.service.js';
import { getAdminDriverReportsService } from './adminDriverReports.service.js';
import { getAdminBookingReportsService } from './adminBookingReports.service.js';
import {
  getAdminRevenueReportsService,
  exportAdminRevenueReportsCsv,
} from './adminRevenueReports.service.js';
import PlatformRevenue, {
  PLATFORM_REVENUE_SOURCE,
} from '../models/platformRevenue.model.js';
import { listPlatformRevenueService } from './platformRevenue.service.js';
import { listKitRevenueService } from './kitRevenue.service.js';
import { listSubscriptionRevenueService } from './pricing.service.js';
import { listRefundsService } from './refund.service.js';
import { listWithdrawalsAdminService } from './withdrawal.service.js';
import {
  resolveDateRange,
  mongoDateRange,
  round2,
} from '../utils/reportDateRange.js';
import {
  formatFilterMeta,
  EXPORT_ROW_LIMIT,
} from '../utils/reportExport.js';

const REVENUE_SOURCE_LABELS = {
  [PLATFORM_REVENUE_SOURCE.COMMISSION]: 'Commission',
  [PLATFORM_REVENUE_SOURCE.PLATFORM_FEE]: 'Platform fee',
  [PLATFORM_REVENUE_SOURCE.COUPON_DISCOUNT]: 'Coupon discount (absorbed)',
  [PLATFORM_REVENUE_SOURCE.CANCELLATION_FEE]: 'Cancellation fee',
  [PLATFORM_REVENUE_SOURCE.DRIVER_PENALTY]: 'Driver penalty',
  [PLATFORM_REVENUE_SOURCE.SUBSCRIPTION]: 'Subscription',
  [PLATFORM_REVENUE_SOURCE.ADMIN_REFUND]: 'Admin refund',
};

function periodMeta(filters = {}) {
  return formatFilterMeta({
    period: filters.period,
    from: filters.from,
    to: filters.to,
  });
}

function kvSection(title, pairs) {
  return {
    title,
    kind: 'kv',
    rows: pairs.filter(([, v]) => v !== undefined && v !== null),
  };
}

function tableSection(title, headers, rows) {
  return { title, kind: 'table', headers, rows };
}

function nameOf(ref) {
  if (!ref) return '';
  if (typeof ref === 'object') return ref.name || '';
  return String(ref);
}

function phoneOf(ref) {
  if (!ref || typeof ref !== 'object') return '';
  return ref.phone_no || ref.phone || '';
}

export async function buildOverviewExportDoc(query = {}) {
  const data = await getAdminReportsOverviewService(query);
  const s = data.summary || {};
  return {
    title: 'Reports Overview — Overall Summary',
    filename: 'reports-overview',
    meta: periodMeta(data.filters),
    sections: [
      kvSection('Summary', [
        ['New users', s.users?.count ?? 0],
        ['New users trend %', s.users?.trend ?? 0],
        ['New drivers', s.drivers?.count ?? 0],
        ['New drivers trend %', s.drivers?.trend ?? 0],
        ['Bookings', s.bookings?.count ?? 0],
        ['Bookings trend %', s.bookings?.trend ?? 0],
        ['Trip revenue (INR)', s.tripRevenue?.amount ?? 0],
        ['Platform revenue (INR)', s.platformRevenue?.amount ?? 0],
        ['Platform commission (INR)', s.platformCommission?.amount ?? 0],
        ['Coupons absorbed (INR)', s.couponsAbsorbed?.amount ?? 0],
        ['GST collected (INR)', s.gstCollected?.amount ?? 0],
        ['GST from bookings (INR)', s.gstCollected?.bookingGst ?? 0],
        ['GST from subscriptions (INR)', s.gstCollected?.subscriptionGst ?? 0],
      ]),
      tableSection(
        'Daily bookings trend',
        ['Date', 'Count'],
        (data.trends?.bookings || []).map((r) => [r.date || r._id, r.count ?? 0]),
      ),
      tableSection(
        'Daily revenue trend',
        ['Date', 'Amount (INR)'],
        (data.trends?.revenue || []).map((r) => [r.date || r._id, r.amount ?? 0]),
      ),
      tableSection(
        'Daily GST trend',
        ['Date', 'Amount (INR)'],
        (data.trends?.gst || []).map((r) => [r.date || r._id, r.amount ?? 0]),
      ),
    ],
  };
}

export async function buildUserReportsExportDoc(query = {}) {
  const data = await getAdminUserReportsService(query);
  const s = data.summary || {};
  return {
    title: 'User Reports',
    filename: 'user-reports',
    meta: periodMeta(data.filters),
    sections: [
      kvSection('Summary', [
        ['New signups', s.newSignups ?? 0],
        ['Active users', s.activeUsers ?? 0],
        ['Total spending (INR)', s.totalSpending ?? 0],
        ['Trip spending (INR)', s.tripSpending ?? 0],
        ['Subscription spending (INR)', s.subscriptionSpending ?? 0],
        ['Wallet top-ups (INR)', s.walletTopups ?? 0],
        ['Wallet top-up count', s.walletTopupCount ?? 0],
        ['Wallet booking payments (INR)', s.walletBookingPayments ?? 0],
        ['Wallet payment count', s.walletPaymentCount ?? 0],
      ]),
      tableSection(
        'By zone',
        ['Zone', 'Bookings', 'Spending (INR)'],
        (data.breakdown?.byZone || []).map((r) => [r.zoneName, r.bookings, r.spending]),
      ),
      tableSection(
        'Top users',
        ['Name', 'Phone', 'Email', 'Trips', 'Trip spend', 'Sub spend', 'Total spend'],
        (data.topUsers || []).map((r) => [
          r.name,
          r.phone,
          r.email,
          r.trips,
          r.tripSpending,
          r.subscriptionSpending,
          r.totalSpending,
        ]),
      ),
      tableSection(
        'Signup trend',
        ['Date', 'Count'],
        (data.trends?.signups || []).map((r) => [r.date || r._id, r.count ?? 0]),
      ),
    ],
  };
}

export async function buildDriverReportsExportDoc(query = {}) {
  const data = await getAdminDriverReportsService(query);
  const s = data.summary || {};
  const funnel = s.approvalFunnel || {};
  const wd = s.withdrawals || {};
  return {
    title: 'Driver Reports',
    filename: 'driver-reports',
    meta: periodMeta(data.filters),
    sections: [
      kvSection('Summary', [
        ['New signups', s.newSignups ?? 0],
        ['Online drivers', s.onlineDrivers ?? 0],
        ['Total earnings paid (INR)', s.totalEarningsPaid ?? 0],
        ['Approval pending', funnel.pending ?? 0],
        ['Under review', funnel.under_review ?? 0],
        ['Approved', funnel.approved ?? 0],
        ['Rejected', funnel.rejected ?? 0],
        ['Suspended', funnel.suspended ?? 0],
        ['Withdrawals pending count', wd.pending?.count ?? 0],
        ['Withdrawals pending (INR)', wd.pending?.total ?? 0],
        ['Withdrawals processed count', wd.processed?.count ?? 0],
        ['Withdrawals processed (INR)', wd.processed?.total ?? 0],
        ['Withdrawals rejected count', wd.rejected?.count ?? 0],
        ['Withdrawals rejected (INR)', wd.rejected?.total ?? 0],
      ]),
      tableSection(
        'By service type',
        ['Service type', 'Trips', 'Earnings (INR)'],
        (data.breakdown?.byServiceType || []).map((r) => [
          r.serviceType,
          r.trips,
          r.earnings,
        ]),
      ),
      tableSection(
        'Top drivers',
        ['Name', 'Phone', 'Status', 'Online', 'Trips', 'Earnings (INR)'],
        (data.topDrivers || []).map((r) => [
          r.name,
          r.phone,
          r.approvalStatus,
          r.isOnline ? 'Yes' : 'No',
          r.trips,
          r.earnings,
        ]),
      ),
      tableSection(
        'Signup trend',
        ['Date', 'Count'],
        (data.trends?.signups || []).map((r) => [r.date || r._id, r.count ?? 0]),
      ),
    ],
  };
}

export async function buildBookingReportsExportDoc(query = {}) {
  const data = await getAdminBookingReportsService(query);
  const s = data.summary || {};
  return {
    title: 'Booking Reports',
    filename: 'booking-reports',
    meta: periodMeta(data.filters),
    sections: [
      kvSection('Summary', [
        ['Total bookings', s.totalBookings ?? 0],
        ['Completed', s.completed ?? 0],
        ['Cancelled', s.cancelled ?? 0],
        ['Active', s.active ?? 0],
        ['Cancellation rate %', s.cancellationRate ?? 0],
        ['Average fare (INR)', s.avgFare ?? 0],
        ['Gross revenue (INR)', s.grossRevenue ?? 0],
        ['Revenue per booking (INR)', s.revenuePerBooking ?? 0],
      ]),
      tableSection(
        'By status',
        ['Status', 'Count'],
        (data.breakdown?.byStatus || []).map((r) => [r.status, r.count]),
      ),
      tableSection(
        'By service type',
        ['Service type', 'Count', 'Completed', 'Revenue (INR)'],
        (data.breakdown?.byServiceType || []).map((r) => [
          r.serviceType,
          r.count,
          r.completed,
          r.revenue,
        ]),
      ),
      tableSection(
        'By zone',
        ['Zone', 'Count', 'Completed', 'Revenue (INR)'],
        (data.breakdown?.byZone || []).map((r) => [
          r.zoneName,
          r.count,
          r.completed,
          r.revenue,
        ]),
      ),
      tableSection(
        'Bookings trend',
        ['Date', 'Count'],
        (data.trends?.bookings || []).map((r) => [r.date || r._id, r.count ?? 0]),
      ),
      tableSection(
        'Revenue trend',
        ['Date', 'Amount (INR)'],
        (data.trends?.revenue || []).map((r) => [r.date || r._id, r.amount ?? 0]),
      ),
    ],
  };
}

export async function buildRevenueReportsExportDoc(query = {}) {
  const data = await getAdminRevenueReportsService(query);
  const s = data.summary || {};

  const dateRange = resolveDateRange(query);
  const revenueMatch = {
    ...mongoDateRange(dateRange, 'occurredAt'),
    source: { $ne: PLATFORM_REVENUE_SOURCE.SUBSCRIPTION },
  };
  if (query.serviceType) revenueMatch.serviceType = query.serviceType;

  const ledgerRows = await PlatformRevenue.find(revenueMatch)
    .select('source amountRupees occurredAt bookingNumber serviceType bookingId userId driverId')
    .sort({ occurredAt: -1 })
    .limit(EXPORT_ROW_LIMIT)
    .lean();

  return {
    title: 'Revenue Reports',
    filename: 'revenue-reports',
    meta: periodMeta(data.filters),
    sections: [
      kvSection('Summary', [
        ['Net platform revenue (INR)', s.totalRevenue ?? 0],
        ['Trend %', s.trend ?? 0],
        ['Previous period total (INR)', s.previousPeriodTotal ?? 0],
        ['Commission (INR)', s.commission ?? 0],
        ['Platform fee (INR)', s.platformFee ?? 0],
        ['Coupons absorbed (INR)', s.couponsAbsorbed ?? 0],
      ]),
      tableSection(
        'By source',
        ['Source', 'Amount (INR)', 'Count'],
        (data.breakdown?.bySource || []).map((r) => [
          r.label || r.source,
          r.displayAmount ?? r.amount,
          r.count,
        ]),
      ),
      tableSection(
        'Daily revenue trend',
        ['Date', 'Amount (INR)'],
        (data.trends?.revenue || []).map((r) => [r.date || r._id, r.amount ?? 0]),
      ),
      tableSection(
        'Ledger detail',
        [
          'Date',
          'Source',
          'Amount (INR)',
          'Booking Number',
          'Service Type',
          'Booking ID',
          'User ID',
          'Driver ID',
        ],
        ledgerRows.map((row) => [
          row.occurredAt ? new Date(row.occurredAt).toISOString() : '',
          REVENUE_SOURCE_LABELS[row.source] || row.source,
          round2(row.amountRupees),
          row.bookingNumber || '',
          row.serviceType || '',
          row.bookingId ? String(row.bookingId) : '',
          row.userId ? String(row.userId) : '',
          row.driverId ? String(row.driverId) : '',
        ]),
      ),
    ],
  };
}

/** Keep legacy CSV string for revenue (backward compatible). */
export async function exportRevenueReportsLegacyCsv(query = {}) {
  return exportAdminRevenueReportsCsv(query);
}

export async function buildAccountRevenueExportDoc(query = {}) {
  const data = await listPlatformRevenueService({
    ...query,
    page: 1,
    limit: EXPORT_ROW_LIMIT,
    forExport: true,
  });
  const t = data.totals || {};
  return {
    title: 'Account — Revenue Ledger',
    filename: 'account-revenue',
    meta: formatFilterMeta({
      from: query.from,
      to: query.to,
      period: query.source ? `source=${query.source}` : undefined,
    }),
    sections: [
      kvSection('Totals', [
        ['Net revenue (INR)', t.totalAmount ?? 0],
        ['Row count', t.totalCount ?? 0],
        ...Object.entries(t.bySource || {}).map(([source, v]) => [
          `${source} (INR)`,
          v.amount ?? 0,
        ]),
      ]),
      tableSection(
        'Ledger rows',
        [
          'Date',
          'Source',
          'Amount (INR)',
          'Booking number',
          'Service type',
          'User',
          'Driver',
        ],
        (data.rows || []).map((r) => [
          r.occurredAt ? new Date(r.occurredAt).toISOString() : '',
          r.source,
          r.amountRupees,
          r.bookingNumber || '',
          r.serviceType || '',
          nameOf(r.userId),
          nameOf(r.driverId),
        ]),
      ),
    ],
  };
}

export async function buildSubscriptionRevenueExportDoc(query = {}) {
  const data = await listSubscriptionRevenueService({
    ...query,
    page: 1,
    limit: EXPORT_ROW_LIMIT,
    forExport: true,
  });
  const t = data.totals || {};
  return {
    title: 'Account — Subscription Revenue',
    filename: 'subscription-revenue',
    meta: formatFilterMeta({
      from: query.from,
      to: query.to,
      period: query.status || undefined,
    }),
    sections: [
      kvSection('Totals', [
        ['Subscriptions', t.count ?? 0],
        ['Total revenue (INR)', t.totalRevenue ?? 0],
        ['Platform earned (INR)', t.totalPlatformEarned ?? 0],
        ['Driver pool (INR)', t.totalDriverPool ?? 0],
        ['Paid to driver (INR)', t.totalPaidToDriver ?? 0],
        ['Remaining driver share (INR)', t.totalRemaining ?? 0],
      ]),
      tableSection(
        'Subscriptions',
        [
          'Paid at',
          'User',
          'Phone',
          'Plan',
          'Zone',
          'Status',
          'Total revenue',
          'Platform earned',
          'Paid to driver',
          'Remaining',
        ],
        (data.items || []).map((r) => [
          r.paidAt ? new Date(r.paidAt).toISOString() : '',
          nameOf(r.userId),
          phoneOf(r.userId),
          r.planName || r.planSnapshot?.name || '',
          typeof r.zoneId === 'object' ? r.zoneId?.name || '' : '',
          r.status || '',
          r.totalRevenue ?? 0,
          r.platformEarned ?? 0,
          r.paidToDriver ?? 0,
          r.remainingDriverShare ?? 0,
        ]),
      ),
    ],
  };
}

export async function buildKitRevenueExportDoc(query = {}) {
  const data = await listKitRevenueService({
    ...query,
    page: 1,
    limit: EXPORT_ROW_LIMIT,
    forExport: true,
  });
  const t = data.totals || {};
  return {
    title: 'Account — Kit Revenue',
    filename: 'kit-revenue',
    meta: formatFilterMeta({ from: query.from, to: query.to }),
    sections: [
      kvSection('Totals', [
        ['Paid amount (INR)', t.totalAmount ?? 0],
        ['Paid count', t.paidCount ?? 0],
        ['Refunded amount (INR)', t.refundedAmount ?? 0],
        ['Refunded count', t.refundedCount ?? 0],
        ['Net amount (INR)', t.netAmount ?? 0],
        ['Total orders', t.totalCount ?? 0],
      ]),
      tableSection(
        'Kit orders',
        [
          'Paid at',
          'Order',
          'Driver',
          'Phone',
          'Kit',
          'Amount (INR)',
          'Payment status',
          'Admin status',
          'Fulfillment',
          'Razorpay payment',
        ],
        (data.rows || []).map((r) => [
          r.paidAt ? new Date(r.paidAt).toISOString() : '',
          r.orderNumber || String(r._id || ''),
          nameOf(r.driverId),
          phoneOf(r.driverId),
          r.kitName || '',
          r.amount ?? 0,
          r.paymentStatus || '',
          r.adminStatus || '',
          r.fulfillmentStatus || '',
          r.razorpayPaymentId || '',
        ]),
      ),
    ],
  };
}

export async function buildRefundsExportDoc(query = {}) {
  const data = await listRefundsService({
    ...query,
    page: 1,
    limit: EXPORT_ROW_LIMIT,
    forExport: true,
  });
  const t = data.totals || {};
  return {
    title: 'Account — Refunds',
    filename: 'refunds',
    meta: formatFilterMeta({ from: query.from, to: query.to }),
    sections: [
      kvSection('Totals', [
        ['Total amount (INR)', t.totalAmount ?? 0],
        ['Total count', t.totalCount ?? 0],
        ...Object.entries(t.byStatus || {}).flatMap(([status, v]) => [
          [`${status} count`, v.count ?? 0],
          [`${status} amount (INR)`, v.amount ?? 0],
        ]),
      ]),
      tableSection(
        'Refunds',
        [
          'Created',
          'Status',
          'Amount (INR)',
          'Booking',
          'Subscription',
          'User',
          'Driver',
          'Reason',
          'UTR / Txn',
        ],
        (data.refunds || []).map((r) => [
          r.createdAt ? new Date(r.createdAt).toISOString() : '',
          r.status || '',
          r.amountRupees ?? 0,
          r.bookingNumber || '',
          r.subscriptionNumber || '',
          nameOf(r.userId),
          nameOf(r.driverId),
          r.reason || '',
          r.transactionDetails?.utr ||
            r.transactionDetails?.transactionId ||
            '',
        ]),
      ),
    ],
  };
}

export async function buildWithdrawalsExportDoc(query = {}) {
  const data = await listWithdrawalsAdminService({
    ...query,
    page: 1,
    limit: EXPORT_ROW_LIMIT,
    forExport: true,
  });
  const byStatus = data.totals?.byStatus || {};

  const statusPairs = Object.entries(byStatus).flatMap(([status, v]) => [
    [`${status} count`, v.count ?? 0],
    [`${status} amount (INR)`, v.amount ?? 0],
  ]);

  return {
    title: 'Account — Withdrawals',
    filename: 'withdrawals',
    meta: formatFilterMeta({ period: query.status || undefined }),
    sections: [
      kvSection('Totals', [
        ['Total count', data.totals?.totalCount ?? data.total ?? 0],
        ...statusPairs,
      ]),
      tableSection(
        'Withdrawals',
        [
          'Created',
          'Driver',
          'Phone',
          'Amount (INR)',
          'Status',
          'Payout method',
          'Processed at',
          'Rejected at',
          'Rejection reason',
        ],
        (data.withdrawals || []).map((r) => [
          r.createdAt ? new Date(r.createdAt).toISOString() : '',
          r.driverName || nameOf(r.driverId),
          r.driverPhone || phoneOf(r.driverId),
          r.amountRupees ?? 0,
          r.status || '',
          r.payoutMethod || '',
          r.processedAt ? new Date(r.processedAt).toISOString() : '',
          r.rejectedAt ? new Date(r.rejectedAt).toISOString() : '',
          r.rejectionReason || '',
        ]),
      ),
    ],
  };
}
