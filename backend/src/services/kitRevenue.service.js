import Payment from '../models/payment.model.js';
import KitOrder from '../models/kitOrder.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import {
  PAYMENT_PURPOSE,
  PAYMENT_STATUS,
  KIT_ADMIN_STATUS,
  FULFILLMENT_STATUS,
} from '../constants/kitStatus.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function paidAtFromOrder(order) {
  const history = order?.statusHistory || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.field === 'paymentStatus' && entry?.to === PAYMENT_STATUS.PAID && entry?.at) {
      return entry.at;
    }
  }
  return order?.updatedAt || order?.createdAt || null;
}

function buildDateRange(from, to) {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
}

/**
 * Admin Account → Kit Revenue.
 *
 * Source of truth: paid / refunded kit orders. Payment docs supply gateway
 * ids and capture timestamps when present.
 */
export async function listKitRevenueService({
  page = 1,
  limit = 20,
  search = '',
  adminStatus = '',
  fulfillmentStatus = '',
  paymentStatus = '',
  from = '',
  to = '',
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const dateRange = buildDateRange(from, to);

  const filter = {
    paymentStatus: paymentStatus
      ? String(paymentStatus)
      : { $in: [PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED] },
  };

  if (adminStatus && Object.values(KIT_ADMIN_STATUS).includes(adminStatus)) {
    filter.adminStatus = adminStatus;
  }
  if (
    fulfillmentStatus &&
    Object.values(FULFILLMENT_STATUS).includes(fulfillmentStatus)
  ) {
    filter.fulfillmentStatus = fulfillmentStatus;
  }

  if (search) {
    const q = String(search).trim();
    const drivers = await Driver.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    filter.$or = [
      { orderNumber: { $regex: q, $options: 'i' } },
      { 'kitSnapshot.name': { $regex: q, $options: 'i' } },
      ...(drivers.length ? [{ driverId: { $in: drivers.map((d) => d._id) } }] : []),
    ];
  }

  // When a date range is set, restrict to orders whose Payment was
  // captured/refunded in that window (fallback: order ids with matching Payment).
  if (dateRange) {
    const paymentMatch = {
      purpose: PAYMENT_PURPOSE.DRIVER_KIT,
      updatedAt: dateRange,
      status: { $in: ['captured', 'refunded'] },
    };
    const datedPayments = await Payment.find(paymentMatch).select('referenceId').lean();
    const datedOrderIds = datedPayments.map((p) => p.referenceId).filter(Boolean);
    if (!datedOrderIds.length) {
      return emptyResult(safePage, safeLimit);
    }
    filter._id = { $in: datedOrderIds };
  }

  const skip = (safePage - 1) * safeLimit;

  const [orders, total, aggregateOrders] = await Promise.all([
    KitOrder.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('driverId', 'name phone email')
      .populate('kitId', 'name price')
      .lean(),
    KitOrder.countDocuments(filter),
    KitOrder.find(filter)
      .select('amount paymentStatus adminStatus paymentId statusHistory updatedAt createdAt')
      .lean(),
  ]);

  const paymentIds = [
    ...new Set(
      [...orders, ...aggregateOrders]
        .map((o) => o.paymentId)
        .filter(Boolean)
        .map(String),
    ),
  ];

  const payments = paymentIds.length
    ? await Payment.find({
        _id: { $in: paymentIds },
        purpose: PAYMENT_PURPOSE.DRIVER_KIT,
      }).lean()
    : [];
  const paymentById = new Map(payments.map((p) => [String(p._id), p]));

  const rows = orders.map((order) => {
    const payment = order.paymentId ? paymentById.get(String(order.paymentId)) : null;
    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      amount: order.amount,
      currency: order.currency || 'INR',
      paymentStatus: order.paymentStatus,
      adminStatus: order.adminStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      kitName: order.kitSnapshot?.name || order.kitId?.name || '—',
      kitId: order.kitId?._id || order.kitId || null,
      driverId: order.driverId,
      paidAt: payment?.updatedAt || paidAtFromOrder(order),
      razorpayPaymentId: payment?.razorpayPaymentId || null,
      razorpayOrderId: payment?.razorpayOrderId || order.razorpayOrderId || null,
      paymentMethod: payment?.method || '',
      paymentDocStatus: payment?.status || null,
      createdAt: order.createdAt,
    };
  });

  let totalAmount = 0;
  let refundedAmount = 0;
  let paidCount = 0;
  let refundedCount = 0;
  const byAdminStatus = {};

  for (const order of aggregateOrders) {
    const amount = Number(order.amount) || 0;
    if (order.paymentStatus === PAYMENT_STATUS.REFUNDED) {
      refundedAmount = round2(refundedAmount + amount);
      refundedCount += 1;
    } else {
      totalAmount = round2(totalAmount + amount);
      paidCount += 1;
    }
    const key = order.adminStatus || 'unknown';
    if (!byAdminStatus[key]) byAdminStatus[key] = { count: 0, amount: 0 };
    byAdminStatus[key].count += 1;
    byAdminStatus[key].amount = round2(byAdminStatus[key].amount + amount);
  }

  return {
    rows,
    total,
    page: safePage,
    limit: safeLimit,
    totals: {
      totalAmount,
      paidCount,
      refundedAmount,
      refundedCount,
      netAmount: round2(totalAmount - refundedAmount),
      totalCount: aggregateOrders.length,
      byAdminStatus,
    },
  };
}

function emptyResult(page, limit) {
  return {
    rows: [],
    total: 0,
    page,
    limit,
    totals: {
      totalAmount: 0,
      paidCount: 0,
      refundedAmount: 0,
      refundedCount: 0,
      netAmount: 0,
      totalCount: 0,
      byAdminStatus: {},
    },
  };
}
