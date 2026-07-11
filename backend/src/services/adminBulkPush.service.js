import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import BulkPushCampaign from '../models/bulkPushCampaign.model.js';
import { USER_ROLES } from '../constants/roles.js';
import { ApiError } from '../utils/apiError.js';
import {
  notifyUserPromotional,
  notifyDriverPromotional,
} from '../utils/notificationDispatch.js';
import { collectFcmTokens } from './fcmToken.service.js';

const AUDIENCES = new Set(['user', 'driver']);
const MODES = new Set(['all', 'selected']);
const MAX_SELECTED = 500;
const MAX_TITLE = 100;
const MAX_BODY = 500;
const SEND_CONCURRENCY = 20;

const HAS_FCM_FILTER = {
  $or: [
    { fcmTokenWeb: { $exists: true, $nin: [null, ''] } },
    { fcmTokenMobile: { $exists: true, $nin: [null, ''] } },
    { fcmToken: { $exists: true, $nin: [null, ''] } },
  ],
};

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  for (const id of unique) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, `Invalid recipient id: ${id}`);
    }
  }
  return unique;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function resolveUserRecipients(mode, recipientIds) {
  if (mode === 'selected') {
    const users = await User.find({
      _id: { $in: recipientIds },
      role: USER_ROLES.USER,
      isDeleted: false,
    })
      .select('_id name email phone_no fcmToken fcmTokenWeb fcmTokenMobile')
      .lean();
    return users;
  }

  return User.find({
    role: USER_ROLES.USER,
    isDeleted: false,
    isActive: { $ne: false },
    ...HAS_FCM_FILTER,
  })
    .select('_id name email phone_no fcmToken fcmTokenWeb fcmTokenMobile')
    .lean();
}

async function resolveDriverRecipients(mode, recipientIds) {
  if (mode === 'selected') {
    const drivers = await Driver.find({
      _id: { $in: recipientIds },
      isDeleted: { $ne: true },
    })
      .select('_id name phone fcmToken fcmTokenWeb fcmTokenMobile')
      .lean();
    return drivers;
  }

  return Driver.find({
    isDeleted: { $ne: true },
    approvalStatus: 'approved',
    ...HAS_FCM_FILTER,
  })
    .select('_id name phone fcmToken fcmTokenWeb fcmTokenMobile')
    .lean();
}

/**
 * Admin bulk promotional push to users or drivers.
 * mode=all → everyone with an FCM token (approved drivers / active users).
 * mode=selected → explicit ids (skips recipients with no token).
 */
export async function sendBulkPromotionalPushService({
  audience,
  title,
  body,
  mode,
  recipientIds = [],
  sentBy = null,
} = {}) {
  if (!AUDIENCES.has(audience)) {
    throw new ApiError(400, 'audience must be "user" or "driver"');
  }
  if (!MODES.has(mode)) {
    throw new ApiError(400, 'mode must be "all" or "selected"');
  }

  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  if (!cleanTitle) throw new ApiError(400, 'title is required');
  if (!cleanBody) throw new ApiError(400, 'body is required');
  if (cleanTitle.length > MAX_TITLE) {
    throw new ApiError(400, `title must be at most ${MAX_TITLE} characters`);
  }
  if (cleanBody.length > MAX_BODY) {
    throw new ApiError(400, `body must be at most ${MAX_BODY} characters`);
  }

  const ids = normalizeIds(recipientIds);
  if (mode === 'selected') {
    if (!ids.length) throw new ApiError(400, 'Select at least one recipient');
    if (ids.length > MAX_SELECTED) {
      throw new ApiError(400, `You can select at most ${MAX_SELECTED} recipients`);
    }
  }

  const recipients =
    audience === 'user'
      ? await resolveUserRecipients(mode, ids)
      : await resolveDriverRecipients(mode, ids);

  if (!recipients.length) {
    throw new ApiError(404, 'No matching recipients found');
  }

  const payload = { title: cleanTitle, body: cleanBody };

  const outcomes = await mapPool(recipients, SEND_CONCURRENCY, async (doc) => {
    const tokens = collectFcmTokens(doc);
    if (!tokens.length) return 'skipped';
    try {
      if (audience === 'user') {
        await notifyUserPromotional(doc._id, payload);
      } else {
        await notifyDriverPromotional(doc._id, payload);
      }
      return 'sent';
    } catch (err) {
      console.warn('[bulk-push] send failed:', err?.message || err);
      return 'failed';
    }
  });

  const sent = outcomes.filter((o) => o === 'sent').length;
  const skipped = outcomes.filter((o) => o === 'skipped').length;
  const failed = outcomes.filter((o) => o === 'failed').length;

  const campaign = await BulkPushCampaign.create({
    audience,
    mode,
    title: cleanTitle,
    body: cleanBody,
    total: recipients.length,
    sent,
    skipped,
    failed,
    recipientIds: mode === 'selected' ? ids : [],
    sentBy: sentBy || null,
  });

  return {
    _id: campaign._id,
    audience,
    mode,
    title: cleanTitle,
    body: cleanBody,
    total: recipients.length,
    sent,
    skipped,
    failed,
    createdAt: campaign.createdAt,
  };
}

/** Counts available for the "send to all" preview. */
export async function getBulkPushAudienceStatsService(audience) {
  if (!AUDIENCES.has(audience)) {
    throw new ApiError(400, 'audience must be "user" or "driver"');
  }

  if (audience === 'user') {
    const [total, withPush] = await Promise.all([
      User.countDocuments({ role: USER_ROLES.USER, isDeleted: false, isActive: { $ne: false } }),
      User.countDocuments({
        role: USER_ROLES.USER,
        isDeleted: false,
        isActive: { $ne: false },
        ...HAS_FCM_FILTER,
      }),
    ]);
    return { audience, total, withPush };
  }

  const [total, withPush] = await Promise.all([
    Driver.countDocuments({ isDeleted: { $ne: true }, approvalStatus: 'approved' }),
    Driver.countDocuments({
      isDeleted: { $ne: true },
      approvalStatus: 'approved',
      ...HAS_FCM_FILTER,
    }),
  ]);
  return { audience, total, withPush };
}

export async function listBulkPushHistoryService({ page = 1, limit = 10 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [total, data] = await Promise.all([
    BulkPushCampaign.countDocuments({}),
    BulkPushCampaign.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('sentBy', 'name email')
      .lean(),
  ]);

  return {
    data,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    },
  };
}

function withPushFlag(doc) {
  const tokens = collectFcmTokens(doc);
  return {
    _id: doc._id,
    name: doc.name || '',
    email: doc.email || '',
    phone: doc.phone || doc.phone_no || '',
    phone_no: doc.phone_no || doc.phone || '',
    profilePicture: doc.profilePicture || '',
    hasPush: tokens.length > 0,
  };
}

/**
 * Paginated recipient picker for bulk push (server-side skip/limit).
 * Independent of admin users/drivers task scoping.
 */
export async function listBulkPushRecipientsService({
  audience,
  search = '',
  page = 1,
  limit = 10,
} = {}) {
  if (!AUDIENCES.has(audience)) {
    throw new ApiError(400, 'audience must be "user" or "driver"');
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;
  const q = String(search || '').trim();

  if (audience === 'user') {
    const filter = { role: USER_ROLES.USER, isDeleted: false };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone_no: { $regex: q, $options: 'i' } },
      ];
    }

    const [total, docs] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email phone_no profilePicture fcmToken fcmTokenWeb fcmTokenMobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return {
      data: docs.map(withPushFlag),
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
      },
    };
  }

  const filter = {
    isDeleted: { $ne: true },
    approvalStatus: 'approved',
  };
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
    ];
  }

  const [total, docs] = await Promise.all([
    Driver.countDocuments(filter),
    Driver.find(filter)
      .select('name phone profilePicture fcmToken fcmTokenWeb fcmTokenMobile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  return {
    data: docs.map(withPushFlag),
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    },
  };
}
