/** Max image upload size (driver documents, car photos, etc.) */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const MAX_IMAGE_LABEL = '5 MB';

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {File} file
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateImageFile(file) {
  if (!file) {
    return { ok: false, message: 'No file selected' };
  }

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const mime = (file.type || '').toLowerCase();
  if (mime && !allowed.includes(mime)) {
    return { ok: false, message: 'Only JPEG, PNG, and WEBP images are allowed' };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `Image must be ${MAX_IMAGE_LABEL} or smaller (selected: ${formatFileSize(file.size)})`,
    };
  }

  return { ok: true };
}

/**
 * Normalize live-recorded blob for multipart upload (fixes empty/wrong MIME from MediaRecorder).
 * @param {Blob} blob
 * @param {string} [baseName]
 * @returns {File}
 */
export function blobToVideoFile(blob, baseName = 'live-verification') {
  const rawType = (blob.type || '').split(';')[0].trim().toLowerCase();
  let mime = 'video/webm';
  let ext = 'webm';

  if (rawType === 'video/mp4' || rawType === 'video/quicktime') {
    mime = rawType === 'video/quicktime' ? 'video/quicktime' : 'video/mp4';
    ext = rawType === 'video/quicktime' ? 'mov' : 'mp4';
  } else if (rawType.startsWith('video/')) {
    mime = rawType;
    ext = rawType.replace('video/', '') || 'webm';
  }

  return new File([blob], `${baseName}.${ext}`, { type: mime });
}
