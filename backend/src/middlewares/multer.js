import multer from 'multer';

const storage = multer.memoryStorage();

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const imageFileFilter = (req, file, cb) => {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, JPG, and WEBP are allowed.'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_BYTES,
  },
});

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)$/i;

function isAllowedVideo(file) {
  const mime = (file.mimetype || '').toLowerCase();
  const name = file.originalname || '';

  if (mime.startsWith('video/')) return true;
  if (mime === 'application/octet-stream' && VIDEO_EXTENSIONS.test(name)) return true;

  return ['video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/x-msvideo'].includes(mime);
}

const videoFileFilter = (req, file, cb) => {
  if (isAllowedVideo(file)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only MP4, WEBM, and MOV videos are allowed.'), false);
  }
};

export const uploadVideo = multer({
  storage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

/**
 * Media uploader for promotional ads. Accepts EITHER an image (≤5 MB)
 * OR a short video (≤25 MB) — both routed through the same form field
 * (`media`) so the admin UI only deals with one upload endpoint and
 * Cloudinary picks the right `resource_type` via `resource_type: 'auto'`.
 */
const AD_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const AD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const adMediaFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  if (IMAGE_MIME_TYPES.includes(mime)) {
    cb(null, true);
    return;
  }
  if (isAllowedVideo(file)) {
    cb(null, true);
    return;
  }
  cb(new Error('Ad media must be an image (JPG/PNG/WEBP) or a short video (MP4/WEBM/MOV).'), false);
};

export const uploadAdMedia = multer({
  storage,
  fileFilter: adMediaFilter,
  limits: { fileSize: AD_MEDIA_MAX_BYTES },
});

/**
 * Image-only size guard for ad media. Multer only enforces the global
 * `fileSize` limit, so the route handler re-checks images against the
 * tighter 5 MB cap.
 */
export const AD_IMAGE_MAX = AD_IMAGE_MAX_BYTES;
