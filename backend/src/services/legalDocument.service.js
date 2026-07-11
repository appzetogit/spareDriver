import LegalDocument, {
  LEGAL_DOCUMENT_TYPES,
  SITE_LEGAL_DOCUMENT_TYPES,
} from '../models/legalDocument.model.js';
import { ApiError } from '../utils/apiError.js';

export async function getActiveLegalDocumentService(type) {
  return LegalDocument.findOne({ type, isActive: true })
    .sort({ version: -1, updatedAt: -1 })
    .lean();
}

export async function listLegalDocumentsService({ type } = {}) {
  const filter = {};
  if (type) filter.type = type;
  return LegalDocument.find(filter).sort({ type: 1, version: -1, updatedAt: -1 });
}

export async function listActiveSiteLegalDocumentsService() {
  const docs = await LegalDocument.find({
    type: { $in: SITE_LEGAL_DOCUMENT_TYPES },
    isActive: true,
  })
    .sort({ version: -1, updatedAt: -1 })
    .lean();

  const byType = {};
  for (const doc of docs) {
    if (!byType[doc.type]) byType[doc.type] = doc;
  }
  return byType;
}

async function upsertLegalDocumentByType(type, data, staffId) {
  const { title, content, isActive = true } = data || {};
  if (!title?.trim() || !content?.trim()) {
    throw new ApiError(400, 'Title and content are required');
  }
  if (!Object.values(LEGAL_DOCUMENT_TYPES).includes(type)) {
    throw new ApiError(400, 'Invalid legal document type');
  }

  const existing = await LegalDocument.findOne({ type, isActive: true }).sort({ version: -1 });
  if (existing) {
    existing.isActive = false;
    await existing.save();
  }

  const nextVersion = (existing?.version || 0) + 1;
  return LegalDocument.create({
    type,
    title: title.trim(),
    content: content.trim(),
    version: nextVersion,
    isActive: !!isActive,
    updatedBy: staffId || null,
  });
}

export async function upsertSubscriptionTermsService(data, staffId) {
  return upsertLegalDocumentByType(LEGAL_DOCUMENT_TYPES.SUBSCRIPTION, data, staffId);
}

export async function upsertSiteLegalDocumentService(type, data, staffId) {
  if (!SITE_LEGAL_DOCUMENT_TYPES.includes(type)) {
    throw new ApiError(400, 'Invalid site legal document type');
  }
  return upsertLegalDocumentByType(type, data, staffId);
}

export async function updateLegalDocumentService(id, data, staffId) {
  const doc = await LegalDocument.findById(id);
  if (!doc) throw new ApiError(404, 'Document not found');

  if (data.title !== undefined) doc.title = String(data.title).trim();
  if (data.content !== undefined) doc.content = String(data.content).trim();
  if (data.isActive !== undefined) doc.isActive = !!data.isActive;
  doc.updatedBy = staffId || doc.updatedBy;
  await doc.save();
  return doc;
}
