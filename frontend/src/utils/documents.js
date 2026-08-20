/** Human-readable labels for driver document types */
export const DOCUMENT_LABELS = {
  driving_license: 'Driving License',
  selfie: 'Selfie / Photo',
  aadhaar_front: 'Aadhaar (Front)',
  aadhaar_back: 'Aadhaar (Back)',
  police_verification: 'Police Verification / Yellow Board Certificate',
};

export const EMPTY_DOCUMENT = Object.freeze({
  url: null,
  publicId: null,
  loading: false,
  /** Set when user picked a file but Cloudinary upload is deferred until submit */
  pendingFile: null,
  /** True when url is a local blob preview (not yet on Cloudinary) */
  isLocal: false,
});

/**
 * Extract Cloudinary public_id from secure URL (legacy records without stored publicId).
 */
export function publicIdFromCloudinaryUrl(url) {
  if (!url || !url.includes('cloudinary')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^./]+$/);
  return match?.[1] || null;
}

/**
 * API documents[] → map keyed by type (latest per type).
 */
export function documentsArrayToMap(documents, allowedTypes = null) {
  const map = {};
  if (!documents?.length) return map;

  const sorted = [...documents].sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  for (const doc of sorted) {
    if (!doc?.type || !doc?.fileUrl) continue;
    if (allowedTypes && !allowedTypes.includes(doc.type)) continue;
    if (map[doc.type]) continue;

    map[doc.type] = {
      url: doc.fileUrl,
      publicId: doc.cloudinaryPublicId || publicIdFromCloudinaryUrl(doc.fileUrl),
      loading: false,
      pendingFile: null,
      isLocal: false,
    };
  }

  return map;
}

/**
 * Local documents map → API payload (one per type).
 */
export function documentsMapToArray(documentsMap) {
  return Object.entries(documentsMap)
    .filter(
      ([, state]) =>
        state?.url &&
        !state.loading &&
        !state.pendingFile &&
        !state.isLocal,
    )
    .map(([type, state]) => ({
      type,
      fileUrl: state.url,
      ...(state.publicId ? { cloudinaryPublicId: state.publicId } : {}),
    }));
}

/**
 * Dedupe API documents for display (latest per type, preserves fileUrl + type).
 */
export function dedupeDocumentsForDisplay(documents) {
  if (!documents?.length) return [];

  const sorted = [...documents].sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  const seen = new Set();
  return sorted.filter((doc) => {
    if (!doc?.type || seen.has(doc.type)) return false;
    seen.add(doc.type);
    return Boolean(doc.fileUrl);
  });
}
