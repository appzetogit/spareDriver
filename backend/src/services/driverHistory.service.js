import Payment from '../models/payment.model.js';
import KitOrder from '../models/kitOrder.model.js';
import { PAYMENT_PURPOSE, PAYMENT_STATUS } from '../constants/kitStatus.js';

const PURPOSE_LABELS = {
  [PAYMENT_PURPOSE.DRIVER_KIT]: 'Driver kit',
  [PAYMENT_PURPOSE.TRIP_FARE]: 'Trip fare',
  [PAYMENT_PURPOSE.TRIP_ALLOWANCE]: 'Food & stay allowance',
  [PAYMENT_PURPOSE.WITHDRAWAL]: 'Withdrawal',
};

function mapPaymentDocStatus(status) {
  if (status === 'captured') return PAYMENT_STATUS.PAID;
  if (status === 'failed') return PAYMENT_STATUS.FAILED;
  if (status === 'refunded') return PAYMENT_STATUS.REFUNDED;
  return PAYMENT_STATUS.PENDING;
}

function formatKitOrder(order) {
  const paymentStatus = order.paymentStatus;
  const adminStatus = order.adminStatus;

  return {
    id: order._id,
    kitId: order.kitId,
    type: 'kit',
    orderNumber: order.orderNumber,
    title: order.kitSnapshot?.name || 'Driver kit',
    amount: order.amount,
    currency: order.currency || 'INR',
    paymentStatus,
    adminStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    canPayNow: paymentStatus === PAYMENT_STATUS.PENDING,
    canReorder:
      paymentStatus === PAYMENT_STATUS.FAILED ||
      (paymentStatus === PAYMENT_STATUS.PAID && adminStatus === 'rejected'),
    itemCount: order.itemSelections?.length || order.kitSnapshot?.items?.length || 0,
    itemSelections: order.itemSelections || [],
    shippingAddress: order.shippingAddress || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export const getDriverOrdersService = async (driverId) => {
  const kitOrders = await KitOrder.find({ driverId }).sort({ createdAt: -1 }).lean();
  const orders = kitOrders.map(formatKitOrder);

  const summary = {
    total: orders.length,
    pendingPayment: orders.filter((o) => o.paymentStatus === PAYMENT_STATUS.PENDING).length,
    awaitingApproval: orders.filter(
      (o) => o.paymentStatus === PAYMENT_STATUS.PAID && o.adminStatus === 'pending',
    ).length,
    completed: orders.filter(
      (o) => o.paymentStatus === PAYMENT_STATUS.PAID && o.adminStatus === 'approved',
    ).length,
  };

  return { orders, summary };
};

export const getDriverOrderByIdService = async (driverId, orderId) => {
  const order = await KitOrder.findOne({ _id: orderId, driverId }).lean();
  if (!order) return null;
  return formatKitOrder(order);
};

export const getDriverPaymentHistoryService = async (driverId) => {
  const [payments, kitOrders] = await Promise.all([
    Payment.find({ driverId }).sort({ createdAt: -1 }).lean(),
    KitOrder.find({ driverId }).sort({ createdAt: -1 }).lean(),
  ]);

  const kitById = new Map(kitOrders.map((o) => [String(o._id), o]));
  const items = [];
  const seenKeys = new Set();

  for (const p of payments) {
    const kitOrder = kitById.get(String(p.referenceId));
    const key = `payment-${p._id}`;
    seenKeys.add(String(p.referenceId));

    let type = 'other';
    if (p.purpose === PAYMENT_PURPOSE.DRIVER_KIT) type = 'kit';
    else if (
      p.purpose === PAYMENT_PURPOSE.TRIP_FARE
      || p.purpose === PAYMENT_PURPOSE.TRIP_ALLOWANCE
    ) type = 'trip';
    else if (p.purpose === PAYMENT_PURPOSE.WITHDRAWAL) type = 'withdrawal';

    items.push({
      id: p._id,
      type,
      purpose: p.purpose,
      // Trip-credit rows surface the booking number on the FE so the
      // driver can link a row back to the trip it came from. The
      // `meta.bookingNumber` is stamped at write time in
      // bookingTrip.service.js's `settleDriverEarning`.
      title:
        kitOrder?.kitSnapshot?.name
        || PURPOSE_LABELS[p.purpose]
        || 'Payment',
      orderNumber:
        kitOrder?.orderNumber
        || p.meta?.bookingNumber
        || '',
      amount: p.amount,
      currency: p.currency || 'INR',
      status: mapPaymentDocStatus(p.status),
      method: p.method || '',
      razorpayPaymentId: p.razorpayPaymentId || '',
      referenceId: p.referenceId,
      createdAt: p.createdAt,
      // Forward the breakdown so the driver app can render an
      // expandable "where did this credit come from?" detail row
      // without an extra round-trip.
      meta: p.meta || {},
    });
  }

  for (const order of kitOrders) {
    const refKey = String(order._id);
    if (seenKeys.has(refKey) && order.paymentStatus === PAYMENT_STATUS.PAID) continue;

    if (
      order.paymentStatus === PAYMENT_STATUS.PENDING ||
      order.paymentStatus === PAYMENT_STATUS.FAILED
    ) {
      items.push({
        id: order._id,
        type: 'kit',
        purpose: PAYMENT_PURPOSE.DRIVER_KIT,
        title: order.kitSnapshot?.name || 'Driver kit',
        orderNumber: order.orderNumber,
        amount: order.amount,
        currency: order.currency || 'INR',
        status: order.paymentStatus,
        method: '',
        razorpayPaymentId: '',
        referenceId: order._id,
        createdAt: order.createdAt,
      });
    }
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const kitPayments = items.filter((i) => i.type === 'kit');
  const summary = {
    total: kitPayments.length,
    kit: kitPayments.length,
  };

  return { payments: kitPayments, summary };
};
