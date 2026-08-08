import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import ApprovalNoteForm, { isApprovalNoteValid } from '../ApprovalNoteForm';
import DriverSuspendActions from './DriverSuspendActions';
import { areAllReviewStepsApproved } from '../../../../utils/driverOnboarding';
import api from '../../../../utils/api';

const REVIEWABLE = ['pending', 'under_review'];

/** Final approve / reject + suspend controls (shown at bottom of profile). */
const DriverProfileActions = ({
  driver,
  stepReviews,
  submitting,
  setSubmitting,
  onSuccess,
  onReviewComplete,
}) => {
  const navigate = useNavigate();
  const [approvalNote, setApprovalNote] = useState(driver?.approvalNote || '');
  const [noteError, setNoteError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    setApprovalNote(driver?.approvalNote || '');
  }, [driver?.approvalNote]);

  if (!driver) return null;

  const canReview = REVIEWABLE.includes(driver.approvalStatus);
  const canSuspend = driver.approvalStatus === 'approved';
  const canUnsuspend = driver.approvalStatus === 'suspended';
  const allStepsApproved = areAllReviewStepsApproved(stepReviews);

  const runAction = async (approvalStatus) => {
    if (approvalStatus === 'approved' && !allStepsApproved) {
      setActionError('Approve all onboarding sections before final approval.');
      return;
    }

    if (['approved', 'rejected'].includes(approvalStatus) && !isApprovalNoteValid(approvalNote)) {
      setNoteError('Please provide a brief explanation (minimum 10 characters).');
      return;
    }

    setNoteError('');
    setActionError('');
    setSubmitting(approvalStatus);

    try {
      await api.put(`/admin/drivers/${driver._id}/status`, {
        approvalStatus,
        approvalNote: approvalNote.trim(),
      });

      if (['approved', 'rejected'].includes(approvalStatus)) {
        toast.success(
          approvalStatus === 'approved' ? 'Driver approved' : 'Driver rejected',
        );
        onReviewComplete?.(approvalStatus);
        navigate('/admin/drivers', { replace: true });
        return;
      }

      onSuccess?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to update driver status');
    } finally {
      setSubmitting(null);
    }
  };

  if (!canReview && !canSuspend && !canUnsuspend && !driver.approvalNote) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Final decision</h2>
        {canReview && (
          <p className="text-xs text-slate-500 mt-1">
            Review each section above, then approve or reject the full application here.
          </p>
        )}
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      {canReview && (
        <div className="space-y-4">
          <ApprovalNoteForm
            value={approvalNote}
            onChange={(val) => {
              setApprovalNote(val);
              if (noteError && isApprovalNoteValid(val)) setNoteError('');
            }}
            error={noteError}
          />

          {!allStepsApproved && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Final approve unlocks after Identity, Credentials, Bank, Safety &amp; documents, and
              Live verification are all approved.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="admin"
              size="md"
              fullWidth
              loading={submitting === 'approved'}
              disabled={Boolean(submitting) || !allStepsApproved}
              onClick={() => runAction('approved')}
            >
              Final approve driver
            </Button>
            <Button
              variant="danger"
              size="md"
              fullWidth
              loading={submitting === 'rejected'}
              disabled={Boolean(submitting)}
              onClick={() => runAction('rejected')}
            >
              Reject application
            </Button>
          </div>
        </div>
      )}

      {(canSuspend || canUnsuspend) && (
        <div className={canReview ? 'pt-4 border-t border-slate-100' : ''}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Account access
          </p>
          <DriverSuspendActions driver={driver} onSuccess={onSuccess} />
        </div>
      )}

      {!canReview && driver.approvalNote && (
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Review note
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{driver.approvalNote}</p>
        </div>
      )}
    </div>
  );
};

export default DriverProfileActions;
