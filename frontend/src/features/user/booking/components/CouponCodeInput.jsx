import { useState } from 'react';
import { Tag, X, Loader2 } from 'lucide-react';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';

/**
 * Coupon code entry for checkout screens. Parent owns `value` and
 * re-fetches the fare estimate when a code is applied or removed.
 */
const CouponCodeInput = ({
  value = '',
  onChange,
  onApply,
  onRemove,
  applying = false,
  error = null,
  appliedCode = null,
}) => {
  const [draft, setDraft] = useState(value || '');

  const handleApply = () => {
    const code = draft.trim().toUpperCase();
    if (!code) return;
    onApply?.(code);
  };

  const handleRemove = () => {
    setDraft('');
    onRemove?.();
    onChange?.('');
  };

  if (appliedCode) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="w-4 h-4 text-success shrink-0" />
          <span className="text-sm font-medium text-text truncate">
            {appliedCode} applied
          </span>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="p-1 rounded-lg hover:bg-surface-secondary text-text-muted"
          aria-label="Remove coupon"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder="Enter coupon code"
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
      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </div>
  );
};

export default CouponCodeInput;
