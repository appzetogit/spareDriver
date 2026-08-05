import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const BottomSheet = ({
  isOpen,
  onClose,
  title,
  children,
  height = 'auto',
  showHandle = true,
  className = '',
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`relative bg-white rounded-t-3xl w-full max-w-lg animate-slide-up shadow-xl ${className}`}
        style={height !== 'auto' ? { height } : {}}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Sheet'}
      >
        {showHandle && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
        )}
        {title && (
          <div className="flex items-center justify-between px-5 py-3">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-text-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="px-5 pb-[max(2rem,env(safe-area-inset-bottom))] overflow-y-auto max-h-[70vh]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default BottomSheet;
