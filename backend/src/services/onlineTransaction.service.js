import Payment from '../models/payment.model.js';
import Booking from '../models/booking.model.js';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import WalletTransaction, {
  WALLET_TXN_SOURCE,
  WALLET_TXN_STATUS,
} from '../models/walletTransaction.model.js';
import UserSubscription from '../models/userSubscription.model.js';
import KitOrder from '../models/kitOrder.model.js';
import { PAYMENT_PROVIDER, PAYMENT_PURPOSE } from '../constants/kitStatus.js';
import { ApiError } from '../utils/apiError.js';

const ONLINE_PURPOSES = Object.freeze([
  PAYMENT_PURPOSE.DRIVER_KIT,
  PAYMENT_PURPOSE.SUBSCRIPTION,
  PAYMENT_PURPOSE.BOOKING,
  PAYMENT_PURPOSE.WALLET_TOPUP,
]);

const PURPOSE_LABELS = Object.freeze({
  [PAYMENT_PURPOSE.DRIVER_KIT]: 'Driver kit',
  [PAYMENT_PURPOSE.SUBSCRIPTION]: 'Subscription',
  [PAYMENT_PURPOSE.BOOKING]: 'Booking',
  [PAYMENT_PURPOSE.WALLET_TOPUP]: 'Wallet top-up',
});

/**
 * Upsert a Razorpay ledger row. Used by booking / wallet / kit /
 * subscription flows so Account → Online Transactions stays complete.
 */
export async function upsertRazorpayPaymentRecord({
  purpose,
  referenceId,
  referenceModel,
  userId = null,
  driverId = null,
  razorpayOrderId = '',
  razorpayPaymentId,
  razorpaySignature,
  amountRupees,
  currency = 'INR',
  status = 'captured',
  method = '',
  failureReason = '',
  meta = {},
  matchBy = 'reference',
}) {
  if (!purpose || !referenceId || !referenceModel) {
    throw new ApiError(400, 'purpose, referenceId and referenceModel are required');
  }

  const amount = Math.max(0, Number(amountRupees) || 0);
  const set = {
    provider: PAYMENT_PROVIDER.RAZORPAY,
    purpose,
    referenceId,
    referenceModel,
    amount,
    currency,
    status,
    method: method || '',
    failureReason: failureReason || '',
    meta: meta || {},
  };
  if (userId) set.userId = userId;
  if (driverId) set.driverId = driverId;
  if (razorpayOrderId) set.razorpayOrderId = String(razorpayOrderId);
  if (razorpayPaymentId) set.razorpayPaymentId = String(razorpayPaymentId);
  if (razorpaySignature) set.razorpaySignature = String(razorpaySignature);

  let filter;
  if (matchBy === 'paymentId' && razorpayPaymentId) {
    filter = { razorpayPaymentId: String(razorpayPaymentId) };
  } else if (matchBy === 'orderId' && razorpayOrderId) {
    filter = {
      razorpayOrderId: String(razorpayOrderId),
      purpose,
      referenceModel,
    };
  } else {
    filter = { referenceId, referenceModel };
  }

  return Payment.findOneAndUpdate(
    filter,
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizePaymentRow(doc, extras = {}) {
  const amountRupees = round2(Number(doc.amount) || 0);
  const subjectType = doc.driverId ? 'driver' : 'user';
  return {
    id: String(doc._id),
    source: 'payment',
    provider: PAYMENT_PROVIDER.RAZORPAY,
    purpose: doc.purpose,
    purposeLabel: PURPOSE_LABELS[doc.purpose] || doc.purpose,
    subjectType,
    userId: doc.userId || null,
    driverId: doc.driverId || null,
    subjectName: extras.subjectName || '',
    subjectPhone: extras.subjectPhone || '',
    amountRupees,
    currency: doc.currency || 'INR',
    status: doc.status || 'created',
    method: doc.method || '',
    failureReason: doc.failureReason || '',
    razorpayOrderId: doc.razorpayOrderId || '',
    razorpayPaymentId: doc.razorpayPaymentId || '',
    razorpaySignature: doc.razorpaySignature || '',
    referenceId: doc.referenceId ? String(doc.referenceId) : '',
    referenceModel: doc.referenceModel || '',
    referenceLabel: extras.referenceLabel || '',
    feePaise: Number(doc.meta?.feePaise) || 0,
    taxPaise: Number(doc.meta?.taxPaise) || 0,
    meta: doc.meta || {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function loadSubjectMaps(userIds, driverIds) {
  const [users, drivers] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } }).select('name phone_no email').lean()
      : [],
    driverIds.length
      ? Driver.find({ _id: { $in: driverIds } }).select('name phone').lean()
      : [],
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const driverMap = new Map(drivers.map((d) => [String(d._id), d]));
  return { userMap, driverMap };
}

async function resolveReferenceLabels(rows) {
  const byModel = {
    Booking: [],
    UserSubscription: [],
    KitOrder: [],
    WalletTransaction: [],
  };
  for (const row of rows) {
    if (row.referenceModel && byModel[row.referenceModel] && row.referenceId) {
      byModel[row.referenceModel].push(row.referenceId);
    }
  }

  const [bookings, subs, kits, walletTxns] = await Promise.all([
    byModel.Booking.length
      ? Booking.find({ _id: { $in: byModel.Booking } }).select('bookingNumber').lean()
      : [],
    byModel.UserSubscription.length
      ? UserSubscription.find({ _id: { $in: byModel.UserSubscription } })
          .select('subscriptionNumber planNameSnapshot')
          .lean()
      : [],
    byModel.KitOrder.length
      ? KitOrder.find({ _id: { $in: byModel.KitOrder } }).select('orderNumber').lean()
      : [],
    byModel.WalletTransaction.length
      ? WalletTransaction.find({ _id: { $in: byModel.WalletTransaction } })
          .select('description amountRupees')
          .lean()
      : [],
  ]);

  const labels = new Map();
  for (const b of bookings) {
    labels.set(`Booking:${b._id}`, b.bookingNumber || String(b._id).slice(-8));
  }
  for (const s of subs) {
    labels.set(
      `UserSubscription:${s._id}`,
      s.subscriptionNumber || s.planNameSnapshot || String(s._id).slice(-8),
    );
  }
  for (const k of kits) {
    labels.set(`KitOrder:${k._id}`, k.orderNumber || String(k._id).slice(-8));
  }
  for (const w of walletTxns) {
    labels.set(
      `WalletTransaction:${w._id}`,
      w.description || `Top-up ₹${round2(w.amountRupees)}`,
    );
  }
  return labels;
}

/**
 * Backfill Payment rows for historical booking / wallet Razorpay charges
 * that never wrote to the Payment collection. Idempotent via payment id.
 */
async function syncLegacyRazorpayIntoPayments() {
  const [bookings, topups] = await Promise.all([
    Booking.find({
      'razorpay.paymentId': { $exists: true, $type: 'string', $ne: null, $gt: '' },
    })
      .select('userId bookingNumber razorpay paymentStatus createdAt updatedAt')
      .lean(),
    WalletTransaction.find({
      source: WALLET_TXN_SOURCE.TOPUP,
      'razorpay.paymentId': { $exists: true, $type: 'string', $gt: '' },
    })
      .select('userId amountRupees razorpay status createdAt updatedAt description')
      .lean(),
  ]);

  const paymentIds = [
    ...bookings.map((b) => b.razorpay?.paymentId).filter(Boolean),
    ...topups.map((t) => t.razorpay?.paymentId).filter(Boolean),
  ];
  if (!paymentIds.length) return;

  const existing = await Payment.find({
    razorpayPaymentId: { $in: paymentIds },
  })
    .select('razorpayPaymentId')
    .lean();
  const have = new Set(existing.map((p) => p.razorpayPaymentId));

  const ops = [];
  for (const b of bookings) {
    const pid = b.razorpay?.paymentId;
    if (!pid || have.has(pid)) continue;
    const amountRupees = round2((Number(b.razorpay?.amountPaise) || 0) / 100);
    ops.push({
      updateOne: {
        filter: { razorpayPaymentId: pid },
        update: {
          $setOnInsert: {
            provider: PAYMENT_PROVIDER.RAZORPAY,
            purpose: PAYMENT_PURPOSE.BOOKING,
            referenceId: b._id,
            referenceModel: 'Booking',
            userId: b.userId,
            razorpayOrderId: b.razorpay?.orderId || '',
            razorpayPaymentId: pid,
            razorpaySignature: b.razorpay?.signature || undefined,
            amount: amountRupees,
            currency: 'INR',
            status:
              b.paymentStatus === 'refunded'
                ? 'refunded'
                : b.paymentStatus === 'failed'
                  ? 'failed'
                  : 'captured',
            meta: {
              bookingNumber: b.bookingNumber || '',
              amountPaise: b.razorpay?.amountPaise || 0,
              legacySynced: true,
            },
            createdAt: b.updatedAt || b.createdAt || new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  for (const t of topups) {
    const pid = t.razorpay?.paymentId;
    if (!pid || have.has(pid)) continue;
    ops.push({
      updateOne: {
        filter: { razorpayPaymentId: pid },
        update: {
          $setOnInsert: {
            provider: PAYMENT_PROVIDER.RAZORPAY,
            purpose: PAYMENT_PURPOSE.WALLET_TOPUP,
            referenceId: t._id,
            referenceModel: 'WalletTransaction',
            userId: t.userId,
            razorpayOrderId: t.razorpay?.orderId || '',
            razorpayPaymentId: pid,
            razorpaySignature: t.razorpay?.signature || undefined,
            amount: round2(t.amountRupees),
            currency: 'INR',
            status: t.status === WALLET_TXN_STATUS.FAILED ? 'failed' : 'captured',
            meta: {
              feePaise: t.razorpay?.feePaise || 0,
              taxPaise: t.razorpay?.taxPaise || 0,
              amountPaise: t.razorpay?.amountPaise || 0,
              netAmountPaise: t.razorpay?.netAmountPaise || 0,
              legacySynced: true,
            },
            createdAt: t.createdAt || new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) {
    await Payment.bulkWrite(ops, { ordered: false }).catch(() => null);
  }

  const orphanSubs = await Payment.find({
    provider: PAYMENT_PROVIDER.RAZORPAY,
    purpose: PAYMENT_PURPOSE.SUBSCRIPTION,
    $or: [{ userId: null }, { userId: { $exists: false } }],
  })
    .select('_id referenceId')
    .lean();
  if (orphanSubs.length) {
    const subDocs = await UserSubscription.find({
      _id: { $in: orphanSubs.map((p) => p.referenceId) },
    })
      .select('userId')
      .lean();
    const byId = new Map(subDocs.map((s) => [String(s._id), s.userId]));
    const subOps = orphanSubs
      .map((p) => {
        const uid = byId.get(String(p.referenceId));
        if (!uid) return null;
        return {
          updateOne: {
            filter: { _id: p._id },
            update: { $set: { userId: uid } },
          },
        };
      })
      .filter(Boolean);
    if (subOps.length) {
      await Payment.bulkWrite(subOps, { ordered: false }).catch(() => null);
    }
  }
}

let legacySyncPromise = null;
async function dropLegacyPaymentCompoundIndex() {
  try {
    const indexes = await Payment.collection.indexes();
    const legacy = indexes.find(
      (idx) =>
        idx.name === 'referenceId_1_referenceModel_1'
        && !idx.partialFilterExpression,
    );
    if (legacy) {
      await Payment.collection.dropIndex('referenceId_1_referenceModel_1');
    }
  } catch {
    /* index may already be gone */
  }
}

function ensureLegacySync() {
  if (!legacySyncPromise) {
    legacySyncPromise = (async () => {
      await dropLegacyPaymentCompoundIndex();
      await syncLegacyRazorpayIntoPayments();
    })().catch(() => {
      legacySyncPromise = null;
    });
  }
  return legacySyncPromise;
}

/**
 * Admin Account → Online Transactions.
 * Lists every Razorpay-mediated payment (user + driver) for gateway reconciliation.
 */
export async function listOnlineTransactionsService({
  page = 1,
  limit = 20,
  status,
  purpose,
  subjectType,
  search,
  from,
  to,
} = {}) {
  await ensureLegacySync();

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const filter = {
    provider: PAYMENT_PROVIDER.RAZORPAY,
    purpose: { $in: ONLINE_PURPOSES },
  };

  if (status) filter.status = status;
  if (purpose && ONLINE_PURPOSES.includes(purpose)) filter.purpose = purpose;
  if (subjectType === 'user') filter.userId = { $ne: null };
  if (subjectType === 'driver') filter.driverId = { $ne: null };

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  if (search) {
    const q = String(search).trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const [users, drivers, bookings, subs, kits] = await Promise.all([
        User.find({ $or: [{ name: rx }, { phone_no: rx }, { email: rx }] })
          .select('_id')
          .limit(50)
          .lean(),
        Driver.find({ $or: [{ name: rx }, { phone: rx }] })
          .select('_id')
          .limit(50)
          .lean(),
        Booking.find({ bookingNumber: rx }).select('_id').limit(50).lean(),
        UserSubscription.find({ subscriptionNumber: rx }).select('_id').limit(50).lean(),
        KitOrder.find({ orderNumber: rx }).select('_id').limit(50).lean(),
      ]);

      filter.$or = [
        { razorpayOrderId: rx },
        { razorpayPaymentId: rx },
        { userId: { $in: users.map((u) => u._id) } },
        { driverId: { $in: drivers.map((d) => d._id) } },
        {
          referenceId: {
            $in: [...bookings, ...subs, ...kits].map((d) => d._id),
          },
        },
      ];
    }
  }

  const [total, totalsAgg, docs] = await Promise.all([
    Payment.countDocuments(filter),
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
        },
      },
    ]),
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
  ]);

  const userIds = [...new Set(docs.map((d) => d.userId).filter(Boolean).map(String))];
  const driverIds = [...new Set(docs.map((d) => d.driverId).filter(Boolean).map(String))];
  const { userMap, driverMap } = await loadSubjectMaps(userIds, driverIds);
  const labels = await resolveReferenceLabels(docs);

  const transactions = docs.map((doc) => {
    const user = doc.userId ? userMap.get(String(doc.userId)) : null;
    const driver = doc.driverId ? driverMap.get(String(doc.driverId)) : null;
    const subjectName = driver?.name || user?.name || '';
    const subjectPhone = driver?.phone || user?.phone_no || '';
    const referenceLabel =
      labels.get(`${doc.referenceModel}:${doc.referenceId}`)
      || doc.meta?.bookingNumber
      || '';
    return normalizePaymentRow(doc, { subjectName, subjectPhone, referenceLabel });
  });

  const byStatus = {};
  let totalAmount = 0;
  for (const row of totalsAgg) {
    byStatus[row._id || 'unknown'] = {
      count: row.count,
      amount: round2(row.amount),
    };
    totalAmount += Number(row.amount) || 0;
  }

  return {
    transactions,
    total,
    page: safePage,
    limit: safeLimit,
    totals: {
      totalCount: total,
      totalAmount: round2(totalAmount),
      byStatus,
    },
  };
}

export async function getOnlineTransactionService(id) {
  await ensureLegacySync();
  const doc = await Payment.findById(id).lean();
  if (!doc || doc.provider !== PAYMENT_PROVIDER.RAZORPAY) {
    throw new ApiError(404, 'Online transaction not found');
  }
  if (!ONLINE_PURPOSES.includes(doc.purpose)) {
    throw new ApiError(404, 'Online transaction not found');
  }

  const { userMap, driverMap } = await loadSubjectMaps(
    doc.userId ? [String(doc.userId)] : [],
    doc.driverId ? [String(doc.driverId)] : [],
  );
  const labels = await resolveReferenceLabels([doc]);
  const user = doc.userId ? userMap.get(String(doc.userId)) : null;
  const driver = doc.driverId ? driverMap.get(String(doc.driverId)) : null;

  return normalizePaymentRow(doc, {
    subjectName: driver?.name || user?.name || '',
    subjectPhone: driver?.phone || user?.phone_no || '',
    referenceLabel:
      labels.get(`${doc.referenceModel}:${doc.referenceId}`)
      || doc.meta?.bookingNumber
      || '',
  });
}

export { ONLINE_PURPOSES, PURPOSE_LABELS };
