import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import * as legalDocumentService from '../services/legalDocument.service.js';
import { LEGAL_DOCUMENT_TYPES } from '../models/legalDocument.model.js';

export const getSubscriptionTerms = asyncHandler(async (_req, res) => {
  const doc = await legalDocumentService.getActiveLegalDocumentService(
    LEGAL_DOCUMENT_TYPES.SUBSCRIPTION,
  );
  return res.status(200).json(new ApiResponse(200, doc, 'Subscription terms fetched'));
});

export const adminListLegalDocuments = asyncHandler(async (req, res) => {
  const docs = await legalDocumentService.listLegalDocumentsService({
    type: req.query.type || undefined,
  });
  return res.status(200).json(new ApiResponse(200, docs, 'Legal documents fetched'));
});

export const adminUpsertSubscriptionTerms = asyncHandler(async (req, res) => {
  const doc = await legalDocumentService.upsertSubscriptionTermsService(
    req.body,
    req.staff?._id,
  );
  return res.status(200).json(new ApiResponse(200, doc, 'Subscription terms saved'));
});

export const adminUpdateLegalDocument = asyncHandler(async (req, res) => {
  const doc = await legalDocumentService.updateLegalDocumentService(
    req.params.id,
    req.body,
    req.staff?._id,
  );
  return res.status(200).json(new ApiResponse(200, doc, 'Document updated'));
});
