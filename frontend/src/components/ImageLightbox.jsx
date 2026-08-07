import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen in-app image viewer. Pass `src` to open; `onClose` clears it.
 * Backdrop click and Escape also close.
 */
const ImageLightbox = ({ src, alt = 'Preview', onClose }) => {
  useEffect(() => {
    if (!src) return undefined;

    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [src, onClose]);

  if (!src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
      />
    </div>,
    document.body,
  );
};

export default ImageLightbox;
