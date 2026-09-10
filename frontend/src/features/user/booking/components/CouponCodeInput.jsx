import { useEffect, useState } from 'react';
import { Tag, X, Loader2 } from 'lucide-react';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';

/**
 * Coupon code entry for checkout screens.
 *
 * Parent owns the applied/pending code (`code`) and re-fetches the fare
 * estimate when a code is applied or removed. When validation fails
 * (usage limit, expired, etc.) we still show the chip + remove so the
 * user is never stuck with a dead coupon in the draft.
 */
const CouponCodeInput = ({
  code = null,
  appliedCode = null,
  onApply,
  onRemove,
  applying = false,
  error = null,
}) => {
  const [draft, setDraft] = useState('');

  // Keep the input empty whenever the parent clears the coupon.
  useEffect(() => {
    if (!code) setDraft('');
  }, [code]);

  const handleApply = () => {
    const next = draft.trim().toUpperCase();
    if (!next) return;
    onApply?.(next);
  };

  const handleRemove = () => {
    setDraft('');
    onRemove?.();
  };

  // Chip state: successfully applied, currently validating, or failed
  const chipCode = appliedCode || code;
  const showChip = !!chipCode && (!!appliedCode || !!error || applying);

  if (showChip) {
    const invalid = !!error && !appliedCode;
    return (
      <div className="space-y-1.5">
        <div
          className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 transition-all ${
            invalid
              ? 'border-red-200 bg-red-50/70'
              : 'border-emerald-200 bg-emerald-50/80 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              invalid ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {applying && !appliedCode ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Tag className="w-4 h-4 shrink-0" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tracking-wider text-text uppercase truncate">
                  {chipCode}
                </span>
                {appliedCode && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900">
                    Applied
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                {invalid ? 'Invalid or expired code' : applying ? 'Validating code...' : 'Discount applied to fare'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={applying}
            className="p-1.5 rounded-lg hover:bg-black/5 text-text-muted hover:text-text transition disabled:opacity-50"
            aria-label="Remove coupon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-xs font-medium text-red-600 px-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="ENTER PROMO / COUPON CODE"
            className="w-full font-mono text-xs uppercase tracking-wider pr-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply();
              }
            }}
          />
          <Tag className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleApply}
          disabled={!draft.trim() || applying}
          className="shrink-0 px-4 text-xs font-semibold"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
        </Button>
      </div>
    </div>
  );
};

export default CouponCodeInput;
