import Ad from '../models/ad.model.js';
import { ApiError } from '../utils/apiError.js';
import { deleteFromCloudinary } from '../utils/cloudinary.js';

const ALLOWED_MEDIA_TYPES = new Set(['image', 'video']);

function sanitizeLink(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  // Allow http(s), mailto, tel — anything else is rejected so we don't
  // open a `javascript:` URL or similar in the user app.
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  // Bare domain → assume https.
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(trimmed)) return `https://${trimmed}`;
  throw new ApiError(400, 'Link URL must start with http(s):// or be a valid domain');
}

function parseSortOrder(val) {
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

function buildCreatePayload(body, file, createdBy) {
  if (!file) throw new ApiError(400, 'Ad media file is required');
  if (!body?.mediaType || !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
    throw new ApiError(400, 'mediaType must be "image" or "video"');
  }
  if (!body.mediaUrl || !body.mediaPublicId) {
    throw new ApiError(400, 'Uploaded media URL/publicId missing — re-upload the file');
  }
  return {
    title: (body.title || '').trim(),
    mediaType: body.mediaType,
    mediaUrl: body.mediaUrl,
    mediaPublicId: body.mediaPublicId,
    linkUrl: sanitizeLink(body.linkUrl),
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder: parseSortOrder(body.sortOrder),
    createdBy: createdBy || null,
  };
}

export async function createAdService(body, createdBy) {
  // We accept the media as a pre-uploaded Cloudinary asset (the FE
  // uses the existing `/common/upload*` endpoints, same as training
  // videos). The body therefore carries `mediaUrl` + `mediaPublicId`.
  if (!body?.mediaType || !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
    throw new ApiError(400, 'mediaType must be "image" or "video"');
  }
  if (!body.mediaUrl || !body.mediaPublicId) {
    throw new ApiError(400, 'Upload the ad media first, then submit');
  }
  return Ad.create({
    title: (body.title || '').trim(),
    mediaType: body.mediaType,
    mediaUrl: body.mediaUrl,
    mediaPublicId: body.mediaPublicId,
    linkUrl: sanitizeLink(body.linkUrl),
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder: parseSortOrder(body.sortOrder),
    createdBy: createdBy || null,
  });
}

export async function listAdsService({ onlyActive = false } = {}) {
  const filter = onlyActive ? { isActive: true } : {};
  return Ad.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

export async function updateAdService(id, body) {
  const ad = await Ad.findById(id);
  if (!ad) throw new ApiError(404, 'Ad not found');

  // Media swap — body carries the freshly-uploaded mediaUrl/publicId
  // plus mediaType. Old Cloudinary asset gets cleaned up so we don't
  // leak files when admins iterate on creatives.
  const swappingMedia =
    body.mediaUrl && body.mediaUrl !== ad.mediaUrl && body.mediaPublicId;
  if (swappingMedia) {
    if (body.mediaType && !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
      throw new ApiError(400, 'mediaType must be "image" or "video"');
    }
    if (ad.mediaPublicId) {
      await deleteFromCloudinary(
        ad.mediaPublicId,
        ad.mediaType === 'video' ? 'video' : 'image',
      );
    }
    ad.mediaUrl = body.mediaUrl;
    ad.mediaPublicId = body.mediaPublicId;
    if (body.mediaType) ad.mediaType = body.mediaType;
  }

  if (body.title !== undefined) ad.title = String(body.title || '').trim();
  if (body.linkUrl !== undefined) ad.linkUrl = sanitizeLink(body.linkUrl);
  if (body.isActive !== undefined) ad.isActive = Boolean(body.isActive);
  if (body.sortOrder !== undefined) ad.sortOrder = parseSortOrder(body.sortOrder);

  await ad.save();
  return ad.toObject();
}

export async function deleteAdService(id) {
  const ad = await Ad.findById(id);
  if (!ad) throw new ApiError(404, 'Ad not found');
  if (ad.mediaPublicId) {
    await deleteFromCloudinary(
      ad.mediaPublicId,
      ad.mediaType === 'video' ? 'video' : 'image',
    );
  }
  await Ad.findByIdAndDelete(id);
  return { id };
}

// Exported for tests / shared shaping if needed later.
export const _internals = { buildCreatePayload, sanitizeLink };
