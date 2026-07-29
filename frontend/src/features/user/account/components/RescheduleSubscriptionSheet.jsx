import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Calendar } from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import Button from '../../../../components/Button';
import api from '../../../../utils/api';

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayInputValue() {
  return toDateInputValue(new Date());
}

/**
 * Change subscription start date while dedicated-driver assignment
 * is still pending. Expiry shifts by the same duration months.
 */
export default function RescheduleSubscriptionSheet({
  open,
  subscription,
  onClose,
  onSaved,
}) {
  if (!open || !subscription) return null;
  return (
    <RescheduleSubscriptionSheetBody
      subscription={subscription}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function RescheduleSubscriptionSheetBody({ subscription, onClose, onSaved }) {
  const [value, setValue] = useState(() => toDateInputValue(subscription.startDate));
  const [saving, setSaving] = useState(false);
  const minDate = useMemo(() => todayInputValue(), []);

  const handleSave = async () => {
    if (!value || saving) return;
    setSaving(true);
    try {
      const res = await api.post(
        `/auth/subscriptions/${subscription._id}/reschedule`,
        { startDate: new Date(`${value}T00:00:00`).toISOString() },
      );
      const next = res?.data?.data || null;
      toast.success('Start date updated');
      onSaved?.(next);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not update start date',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet isOpen onClose={saving ? undefined : onClose} title="Change start date">
      <div className="space-y-4 px-4 pb-6">
        <p className="text-xs text-text-muted leading-relaxed">
          You can change when this subscription starts until a dedicated driver
          is assigned. The end date will move to keep the same plan length.
        </p>

        <label className="block">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
            New start date
          </span>
          <div className="mt-1.5 relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="date"
              min={minDate}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-xl border border-border bg-white pl-10 pr-3 py-3 text-sm font-semibold text-text"
            />
          </div>
        </label>

        <div className="flex gap-2 pt-1">
          <Button fullWidth variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={!value || saving}
            loading={saving}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
