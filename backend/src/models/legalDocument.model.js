import mongoose from 'mongoose';

export const LEGAL_DOCUMENT_TYPES = {
  SUBSCRIPTION: 'subscription',
};

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
