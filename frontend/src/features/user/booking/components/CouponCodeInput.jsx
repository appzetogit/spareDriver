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
  // (limit / expired / not applicable) so remove is always reachable.
  const chipCode = appliedCode || code;
  const showChip = !!chipCode && (!!appliedCode || !!error || applying);

  if (showChip) {
    const invalid = !!error && !appliedCode;
    return (
      <div className="space-y-2">
        <div
          className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${
            invalid
              ? 'border-danger/30 bg-danger/5'
              : 'border-success/30 bg-success/5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {applying && !appliedCode ? (
              <Loader2 className="w-4 h-4 animate-spin text-text-muted shrink-0" />
            ) : (
              <Tag
                className={`w-4 h-4 shrink-0 ${invalid ? 'text-danger' : 'text-success'}`}
              />
            )}
            <span className="text-sm font-medium text-text truncate">
              {chipCode}
              {appliedCode ? ' applied' : applying ? '…' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={applying}
            className="p-1 rounded-lg hover:bg-surface-secondary text-text-muted disabled:opacity-50"
            aria-label="Remove coupon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder="Coupon code"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleApply();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleApply}
          disabled={!draft.trim() || applying}
          className="shrink-0"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
        </Button>
      </div>
    </div>
  );
};

export default CouponCodeInput;
