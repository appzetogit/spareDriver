import Razorpay from 'razorpay';
import crypto from 'crypto';
import { ApiError } from './apiError.js';

let razorpayInstance = null;

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new ApiError(503, 'Payment gateway is not configured. Contact support.');
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  return razorpayInstance;
}

export function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || '';
}

export async function createRazorpayOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
  const razorpay = getRazorpay();
  return razorpay.orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes,
  });
}

export function verifyRazorpayPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

/**
 * Fetch a captured payment from Razorpay. Used after signature verify so
 * we can read `fee` (already includes GST) and credit only the net.
 */
export async function fetchRazorpayPayment(paymentId) {
  if (!paymentId) throw new ApiError(400, 'paymentId is required');
  const razorpay = getRazorpay();
  return razorpay.payments.fetch(paymentId);
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time compare. `===` leaks how many leading characters matched
  // through its return timing; over enough attempts that is enough to
  // reconstruct a valid signature without ever knowing the secret.
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(String(signature), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
