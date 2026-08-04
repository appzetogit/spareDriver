import { useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle, Camera, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { validateImageFile, MAX_IMAGE_LABEL } from '../utils/fileLimits';
import BottomSheet from './BottomSheet';

/**
 * Single document slot — disables input while uploading; does not auto-upload on mount.
 * For image fields, opens a sheet with Camera + Gallery (unless allowCamera is false).
 */
const DocumentUploadField = ({
  label,
  doc = { url: null, publicId: null, loading: false },
  onUpload,
  accept = 'image/*',
  variant = 'card',
  hint,
  disabled = false,
  allowCamera = true,
  /** 'environment' (rear, docs) or 'user' (front, selfie) */
  capture = 'environment',
}) => {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isBusy = disabled || doc.loading;

  const isImageField = !accept || accept.includes('image');
  const showCameraChoice = allowCamera && isImageField;

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isBusy) return;

    if (isImageField) {
      const check = validateImageFile(file);
      if (!check.ok) {
        toast.error(check.message);
        return;
      }
    }

    try {
      await onUpload(file);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    }
  };

  const openPicker = () => {
    if (isBusy) return;
    if (showCameraChoice) {
      setSheetOpen(true);
      return;
    }
    galleryRef.current?.click();
  };

  const pickFromCamera = () => {
    setSheetOpen(false);
    // Defer so the sheet unmounts before the native picker opens
    requestAnimationFrame(() => cameraRef.current?.click());
  };

  const pickFromGallery = () => {
    setSheetOpen(false);
    requestAnimationFrame(() => galleryRef.current?.click());
  };

  const hiddenInputs = (
    <>
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={isBusy}
        className="hidden"
      />
      {showCameraChoice && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture={capture}
          onChange={handleChange}
          disabled={isBusy}
          className="hidden"
        />
      )}
    </>
  );

  const sourceSheet = showCameraChoice ? (
    <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Add photo">
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={pickFromCamera}
          className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl hover:bg-bg text-left transition-colors"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
            <Camera className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-text">Take photo</span>
            <span className="block text-xs text-text-muted">Use your device camera</span>
          </span>
        </button>
        <button
          type="button"
          onClick={pickFromGallery}
          className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl hover:bg-bg text-left transition-colors"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
            <ImageIcon className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-text">Choose from gallery</span>
            <span className="block text-xs text-text-muted">Pick an existing image</span>
          </span>
        </button>
      </div>
    </BottomSheet>
  ) : null;

  if (variant === 'grid') {
    return (
      <div className="relative">
        {hiddenInputs}
        <button
          type="button"
          onClick={openPicker}
          disabled={isBusy}
          className="w-full text-left disabled:cursor-not-allowed"
        >
          <GridPreview label={label} doc={doc} isBusy={isBusy} />
        </button>
        {sourceSheet}
      </div>
    );
  }

  return (
    <div>
      {label && <label className="text-sm font-medium text-text mb-3 block">{label}</label>}
      <div className="relative">
        {hiddenInputs}
        <button
          type="button"
          onClick={openPicker}
          disabled={isBusy}
          className={`w-full border-2 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-colors overflow-hidden relative min-h-[140px] text-center
            ${doc.url ? 'border-primary border-solid' : 'border-dashed border-border'}
            ${isBusy ? 'opacity-70 cursor-not-allowed' : 'hover:border-primary hover:bg-primary/5 cursor-pointer'}
          `}
        >
          {doc.loading ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : doc.url ? (
            <>
              <img src={doc.url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
              <CheckCircle className="w-8 h-8 text-primary z-0 bg-white rounded-full" />
              <span className="text-sm text-primary font-medium z-0 bg-white px-2 rounded">
                {doc.isLocal || doc.pendingFile ? 'Selected' : 'Uploaded'}
              </span>
              {!isBusy && (
                <span className="text-xs text-text-muted z-0 bg-white/90 px-2 rounded">Tap to replace</span>
              )}
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-text-muted" />
              <span className="text-sm text-text-secondary">
                {showCameraChoice ? 'Tap for camera or gallery' : 'Tap to select'}
              </span>
              {hint && <span className="text-xs text-text-muted">{hint}</span>}
              {isImageField && (
                <span className="text-xs text-text-muted">Max {MAX_IMAGE_LABEL}</span>
              )}
            </>
          )}
        </button>
      </div>
      {sourceSheet}
    </div>
  );
};

function GridPreview({ label, doc, isBusy }) {
  return (
    <div
      className={`aspect-square border-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all overflow-hidden relative
        ${doc.url ? 'border-primary border-solid' : 'border-dashed border-border'}
        ${isBusy ? 'opacity-70' : 'hover:border-primary hover:bg-primary/5'}
      `}
    >
      {doc.loading ? (
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      ) : doc.url ? (
        <>
          <img src={doc.url} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
            <Upload className="w-5 h-5 text-white" />
          </div>
        </>
      ) : (
        <>
          <Upload className="w-5 h-5 text-text-muted" />
          <span className="text-[10px] text-text-muted text-center px-1">{label}</span>
        </>
      )}
    </div>
  );
}

export default DocumentUploadField;
