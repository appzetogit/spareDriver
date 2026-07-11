import mongoose from 'mongoose';

export const LEGAL_DOCUMENT_TYPES = {
  SUBSCRIPTION: 'subscription',
  PRIVACY: 'privacy',
  TERMS: 'terms',
  REFUND_CANCELLATION: 'refund_cancellation',
  PRICING_SHIPPING: 'pricing_shipping',
};

export const SITE_LEGAL_DOCUMENT_TYPES = [
  LEGAL_DOCUMENT_TYPES.PRIVACY,
  LEGAL_DOCUMENT_TYPES.TERMS,
  LEGAL_DOCUMENT_TYPES.REFUND_CANCELLATION,
  LEGAL_DOCUMENT_TYPES.PRICING_SHIPPING,
];

const LEGAL_DOCUMENT_TYPE_LIST = Object.values(LEGAL_DOCUMENT_TYPES);

const legalDocumentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: LEGAL_DOCUMENT_TYPE_LIST,
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    version: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

legalDocumentSchema.index({ type: 1, isActive: 1 });

const LegalDocument =
  mongoose.models.LegalDocument || mongoose.model('LegalDocument', legalDocumentSchema);

export default LegalDocument;
