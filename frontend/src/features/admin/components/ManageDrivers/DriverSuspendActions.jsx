import { useState } from 'react';
import { Ban, UserCheck, Loader2 } from 'lucide-react';
import api from '../../../../utils/api';
import toast from 'react-hot-toast';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import RowActionsMenu from '../RowActionsMenu';
import { isApprovalNoteValid, MIN_APPROVAL_NOTE_LENGTH } from '../../utils/approvalStatus';
import { softPatchDriverCaches } from '../../utils/softPatchDriverCaches';

/**
 * Suspend / unsuspend controls for driver list rows and profile.
 * Suspend requires a reason (shown to the driver).
 *
 * @param {'buttons' | 'menu'} variant - buttons for profile; menu for table ⋮ actions
 * @param {Array} extraMenuItems - prepended when variant="menu" (e.g. Analytics)
 */
const DriverSuspendActions = ({
  driver,
  onSuccess,
  compact = false,
  className = '',
  variant = 'buttons',
  extraMenuItems = [],
}) => {
  const [loading, setLoading] = useState(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  if (!driver?._id) return null;

  const isSuspended = driver.approvalStatus === 'suspended';
  const canSuspend = driver.approvalStatus === 'approved';
  const canUnsuspend = isSuspended;

  if (!canSuspend && !canUnsuspend && variant === 'buttons') return null;
  if (variant === 'menu' && !canSuspend && !canUnsuspend && !extraMenuItems.length) {
    return null;
  }

  const closeSuspendModal = () => {
    if (loading) return;
    setSuspendOpen(false);
    setNote('');
    setNoteError('');
  };

  const finishSuccess = (updatedDriver, fallbackStatus) => {
    softPatchDriverCaches(
      updatedDriver || {
        _id: driver._id,
        approvalStatus: fallbackStatus,
      },
    );
    onSuccess?.(updatedDriver);
  };

  const handleSuspendConfirm = async () => {
    if (!isApprovalNoteValid(note)) {
      setNoteError(`Please provide a reason (minimum ${MIN_APPROVAL_NOTE_LENGTH} characters).`);
      return;
    }

    setLoading('suspend');
    setNoteError('');
    try {
      const res = await api.patch(`/admin/drivers/${driver._id}/suspend`, {
        note: note.trim(),
      });
      toast.success('Driver suspended');
      closeSuspendModal();
      finishSuccess(res.data?.data, 'suspended');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to suspend driver');
    } finally {
      setLoading(null);
    }
  };

  const handleUnsuspend = async (e) => {
    e?.stopPropagation?.();
    if (!window.confirm(`Restore ${driver.name}? They will be approved again.`)) return;

    setLoading('unsuspend');
    try {
      const res = await api.patch(`/admin/drivers/${driver._id}/unsuspend`);
      toast.success('Driver unsuspended');
      finishSuccess(res.data?.data, 'approved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unsuspend driver');
    } finally {
      setLoading(null);
    }
  };

  const suspendModal = (
    <Modal
      isOpen={suspendOpen}
      onClose={closeSuspendModal}
      title={`Suspend ${driver.name}?`}
    >
      <div className="p-1 space-y-4">
        <p className="text-sm text-slate-600">
          They will be forced offline and cannot use the driver app until unsuspended. The reason
          is shown to the driver.
        </p>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Suspension reason
          </label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (noteError && isApprovalNoteValid(e.target.value)) setNoteError('');
            }}
            rows={4}
            placeholder="Explain why this account is being suspended…"
            className={`mt-2 w-full rounded-xl border bg-slate-50 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 ${
              noteError ? 'border-rose-300' : 'border-slate-200'
            }`}
          />
          {noteError ? (
            <p className="text-xs text-rose-600 mt-1">{noteError}</p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">
              {note.trim().length}/{MIN_APPROVAL_NOTE_LENGTH} characters minimum
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={closeSuspendModal} disabled={Boolean(loading)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={loading === 'suspend'}
            onClick={handleSuspendConfirm}
          >
            Suspend account
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (variant === 'menu') {
    const items = [...extraMenuItems];
    if (canSuspend) {
      items.push({
        label: loading === 'suspend' ? 'Suspending…' : 'Suspend',
        icon: Ban,
        variant: 'danger',
        onClick: () => setSuspendOpen(true),
      });
    }
    if (canUnsuspend) {
      items.push({
        label: loading === 'unsuspend' ? 'Restoring…' : 'Unsuspend',
        icon: UserCheck,
        onClick: () => handleUnsuspend(),
      });
    }

    return (
      <>
        <RowActionsMenu items={items} />
        {suspendModal}
      </>
    );
  }

  const btnBase = compact
    ? 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50'
    : 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';

  return (
    <>
      <div
        className={`flex flex-wrap gap-2 ${className}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        {canSuspend && (
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={(e) => {
              e?.stopPropagation?.();
              setSuspendOpen(true);
            }}
            className={`${btnBase} border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`}
          >
            {loading === 'suspend' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Ban className="w-3.5 h-3.5" />
            )}
            Suspend
          </button>
        )}
        {canUnsuspend && (
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={handleUnsuspend}
            className={`${btnBase} border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
          >
            {loading === 'unsuspend' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserCheck className="w-3.5 h-3.5" />
            )}
            Unsuspend
          </button>
        )}
      </div>
      {suspendModal}
    </>
  );
};

export default DriverSuspendActions;
