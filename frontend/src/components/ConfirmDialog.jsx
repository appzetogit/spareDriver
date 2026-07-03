import { useEffect } from 'react';
import {
  AlertTriangle,
  Info,
  ShieldCheck,
  Loader2,
  X,
} from 'lucide-react';

/**
 * Reusable confirm dialog.
 *
 * Replaces every `window.confirm()` in the codebase. Bottom-sheet on
 * mobile, centred card on larger viewports — the layout mirrors the
 * existing booking UX so it feels native to the app.
 *
 * Props:
 *   open            (bool)        — controlled visibility
 *   onClose         (fn)          — called on backdrop / dismiss / Cancel
 *   onConfirm       (fn)          — called on the primary CTA; awaited
 *   title           (string|node) — heading
 *   description     (string|node) — body copy
 *   confirmLabel    (string)      — primary CTA text (default "Confirm")
 *   cancelLabel     (string)      — secondary CTA text (default "Cancel")
 *   variant         ("danger" | "warning" | "info" | "success")
 *                                 — colour + icon palette (default "danger")
 *   loading         (bool)        — disables both CTAs + shows spinner on primary
 *   hideCancel      (bool)        — render only the primary CTA (single-button mode)
 *   children        (node)        — optional rich content rendered above the CTAs
 *                                   (e.g. an extra warning row)
 *
 * Usage:
 *
 *   const [open, setOpen] = useState(false);
 *
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onConfirm={handleCancelBooking}
 *     title="Cancel this booking?"
 *     description="You won't be charged."
 *     confirmLabel="Cancel booking"
 *     variant="danger"
 *     loading={cancelling}
 *   />
 *
 * The dialog never traps focus permanently — pressing Escape closes it,
 * and the backdrop is click-through when `loading === false`.
 */

const VARIANT_META = {
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-red-50 text-red-600',
    primaryBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: 'bg-amber-50 text-amber-600',
    primaryBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  info: {
    icon: Info,
    iconWrap: 'bg-blue-50 text-blue-600',
    primaryBtn: 'bg-primary hover:opacity-90 text-white',
  },
  success: {
    icon: ShieldCheck,
    iconWrap: 'bg-emerald-50 text-emerald-600',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  hideCancel = false,
  children,
}) => {
  // Esc-to-close. Wired only while the dialog is mounted so we don't
  // hijack keys for the rest of the app.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape' && !loading) onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, loading, onClose]);

  if (!open) return null;

  const meta = VARIANT_META[variant] || VARIANT_META.danger;
  const Icon = meta.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-4 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconWrap}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-text leading-tight">{title}</h3>
            {description && (
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -m-1.5 rounded-xl hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          )}
        </div>

        {children && <div className="text-xs text-text-secondary">{children}</div>}

        <div className={`grid gap-3 ${hideCancel ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!hideCancel && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-3 rounded-2xl text-sm font-semibold border border-border-light text-text disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`py-3 rounded-2xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 ${meta.primaryBtn}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
