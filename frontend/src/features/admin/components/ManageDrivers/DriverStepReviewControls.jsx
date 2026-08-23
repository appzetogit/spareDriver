import { useState } from 'react';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import Button from '../../../../components/Button';
import { isApprovalNoteValid } from '../../utils/approvalStatus';

const statusMeta = {
  approved: {
    Icon: CheckCircle2,
    label: 'Approved',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  rejected: {
    Icon: XCircle,
    label: 'Rejected',
    className: 'bg-rose-50 text-rose-700 border-rose-100',
  },
  pending: {
    Icon: Circle,
    label: 'Pending',
    className: 'bg-slate-50 text-slate-500 border-slate-200',
  },
};

export function StepReviewStatusBadge({ review }) {
  const status = review?.status || 'pending';
  const meta = statusMeta[status] || statusMeta.pending;
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

/**
 * Approve / reject controls aligned with a profile section.
 * Reject requires a short note before confirm.
 */
const DriverStepReviewControls = ({
  stepKey,
  review,
  canReview,
  submitting,
  stepComplete = true,
  incompleteHint = '',
  onApprove,
  onReject,
}) => {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  if (!canReview) {
    if (!review?.reviewedByName && !review?.note) return null;
    return (
      <div className="text-right space-y-1 max-w-xs ml-auto">
        {review?.reviewedByName ? (
          <p className="text-xs text-slate-500">By {review.reviewedByName}</p>
        ) : null}
        {review?.note ? (
          <p className="text-xs text-slate-600 whitespace-pre-wrap">{review.note}</p>
        ) : null}
      </div>
    );
  }

  const busy = Boolean(submitting);
  const status = review?.status || 'pending';
  const approveDisabled = busy || status === 'approved' || !stepComplete;

  const handleConfirmReject = () => {
    if (!isApprovalNoteValid(note)) {
      setNoteError('Add a brief note (min 10 characters).');
      return;
    }
    setNoteError('');
    onReject?.(stepKey, note.trim());
    setRejecting(false);
    setNote('');
  };

  if (rejecting) {
    return (
      <div className="w-full sm:min-w-[280px] space-y-2">
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (noteError && isApprovalNoteValid(e.target.value)) setNoteError('');
          }}
          rows={2}
          placeholder="Reason for rejecting this section…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {noteError ? <p className="text-xs text-rose-600">{noteError}</p> : null}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setRejecting(false);
              setNote('');
              setNoteError('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={submitting === `step:${stepKey}:rejected`}
            disabled={busy}
            onClick={handleConfirmReject}
          >
            Confirm reject
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {review?.reviewedByName ? (
          <span className="text-[11px] text-slate-400 mr-1 hidden sm:inline">
            {review.reviewedByName}
          </span>
        ) : null}
        <Button
          variant="admin"
          size="sm"
          loading={submitting === `step:${stepKey}:approved`}
          disabled={approveDisabled}
          title={!stepComplete ? incompleteHint : undefined}
          onClick={() => onApprove?.(stepKey)}
        >
          Approve
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={busy || status === 'rejected'}
          onClick={() => setRejecting(true)}
        >
          Reject
        </Button>
      </div>
      {!stepComplete && status !== 'approved' ? (
        <p className="text-[11px] text-amber-700 text-right">{incompleteHint}</p>
      ) : null}
    </div>
  );
};

export default DriverStepReviewControls;
