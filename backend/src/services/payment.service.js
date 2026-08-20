import Payment from '../models/payment.model.js';
import KitOrder from '../models/kitOrder.model.js';
import {
  PAYMENT_STATUS,
  KIT_ADMIN_STATUS,
  PAYMENT_PURPOSE,
  PAYMENT_PROVIDER,
} from '../constants/kitStatus.js';
import { ApiError } from '../utils/apiError.js';
import { verifyRazorpayPaymentSignature } from '../utils/razorpay.js';
import { appendKitOrderHistory } from '../utils/kitOrderHistory.util.js';
import { syncDriverKitEligibility } from '../utils/kitEligibility.util.js';

export const verifyKitPaymentService = async (driverId, body) => {
  const {
    orderId,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = body;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ApiError(400, 'Missing payment verification fields');
  }

  const kitOrder = await KitOrder.findOne({ _id: orderId, driverId });
  if (!kitOrder) throw new ApiError(404, 'Order not found');

  if (kitOrder.paymentStatus === PAYMENT_STATUS.PAID) {
    const eligibility = await syncDriverKitEligibility(driverId);
    return { order: kitOrder, eligibility, alreadyPaid: true };
  }

  if (kitOrder.razorpayOrderId !== razorpayOrderId) {
    throw new ApiError(400, 'Order mismatch');
  }

  const valid = verifyRazorpayPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!valid) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  let payment = await Payment.findOne({ referenceId: kitOrder._id, referenceModel: 'KitOrder' });

  if (!payment) {
    payment = await Payment.create({
      provider: PAYMENT_PROVIDER.RAZORPAY,
      purpose: PAYMENT_PURPOSE.DRIVER_KIT,
      referenceId: kitOrder._id,
      referenceModel: 'KitOrder',
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount: kitOrder.amount,
      currency: kitOrder.currency,
      status: 'captured',
      driverId,
    });
  } else {
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.status = 'captured';
    await payment.save();
  }

  const prevPayment = kitOrder.paymentStatus;
  kitOrder.paymentStatus = PAYMENT_STATUS.PAID;
  kitOrder.paymentId = payment._id;
  kitOrder.adminStatus = KIT_ADMIN_STATUS.PENDING;
  appendKitOrderHistory(kitOrder, {
    field: 'paymentStatus',
    from: prevPayment,
    to: PAYMENT_STATUS.PAID,
    note: 'Payment verified',
  });
  await kitOrder.save();

  const { upsertKitOrderReviewTask } = await import('./adminTask.service.js');
  await upsertKitOrderReviewTask(kitOrder);

  const eligibility = await syncDriverKitEligibility(driverId);

  return { order: kitOrder, payment, eligibility, alreadyPaid: false };
};

export const handleRazorpayWebhookService = async (event, payload) => {
  if (event === 'payment.captured') {
    const paymentEntity = payload?.payment?.entity;
    const orderEntity = payload?.order?.entity;
    const orderId = paymentEntity?.order_id || orderEntity?.id;
    const paymentId = paymentEntity?.id;
    if (orderId) {
      const { handleOvertimePaymentCaptured } = await import('./bookingOvertime.service.js');
      const overtime = await handleOvertimePaymentCaptured({ orderId, paymentId });
      if (overtime?.handled) return overtime;
    }

    if (!paymentEntity?.id || !orderEntity?.id) return { handled: false };

    const kitOrder = await KitOrder.findOne({ razorpayOrderId: orderEntity.id });
    if (!kitOrder || kitOrder.paymentStatus === PAYMENT_STATUS.PAID) {
      return { handled: true, skipped: true };
    }

    kitOrder.paymentStatus = PAYMENT_STATUS.PAID;
    kitOrder.adminStatus = KIT_ADMIN_STATUS.PENDING;
    appendKitOrderHistory(kitOrder, {
      field: 'paymentStatus',
      from: PAYMENT_STATUS.PENDING,
      to: PAYMENT_STATUS.PAID,
      note: 'Webhook: payment captured',
    });
    await kitOrder.save();
    const { upsertKitOrderReviewTask } = await import('./adminTask.service.js');
    await upsertKitOrderReviewTask(kitOrder);
    await syncDriverKitEligibility(kitOrder.driverId);
    return { handled: true };
  }

  if (event === 'payment.failed') {
    const orderEntity = payload?.payment?.entity;
    const razorpayOrderId = orderEntity?.order_id;
    if (razorpayOrderId) {
      const { handleOvertimePaymentFailed } = await import('./bookingOvertime.service.js');
      const overtime = await handleOvertimePaymentFailed({ orderId: razorpayOrderId });
      if (overtime?.handled) return overtime;
    }
    if (!razorpayOrderId) return { handled: false };

    const kitOrder = await KitOrder.findOne({ razorpayOrderId });
    if (kitOrder && kitOrder.paymentStatus === PAYMENT_STATUS.PENDING) {
      kitOrder.paymentStatus = PAYMENT_STATUS.FAILED;
      appendKitOrderHistory(kitOrder, {
        field: 'paymentStatus',
        from: PAYMENT_STATUS.PENDING,
        to: PAYMENT_STATUS.FAILED,
        note: 'Webhook: payment failed',
      });
      await kitOrder.save();
    }
    return { handled: true };
  }

  return { handled: false };
};
