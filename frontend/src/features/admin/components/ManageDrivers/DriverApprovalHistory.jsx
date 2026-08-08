import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { DRIVER_REVIEW_STEPS, formatSubmissionAttempt } from '../../../../utils/driverOnboarding';

function StepReviewNotes({ stepReviews }) {
  if (!stepReviews || typeof stepReviews !== 'object') return null;

  const items = DRIVER_REVIEW_STEPS.map(({ key, label }) => {
    const review = stepReviews[key];
    if (!review || review.status === 'pending') return null;
    return { key, label, ...review };
  }).filter(Boolean);

  if (!items.length) return null;

  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li
          key={item.key}
          className={`rounded-lg border px-3 py-2 text-xs ${
            item.status === 'rejected'
              ? 'bg-rose-50 border-rose-100 text-rose-800'
              : item.status === 'approved'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : 'bg-slate-50 border-slate-100 text-slate-700'
          }`}
        >
          <p className="font-semibold">
            {item.label}{' '}
            <span className="font-normal capitalize">· {item.status}</span>
          </p>
          {item.note ? (
            <p className="mt-1 whitespace-pre-wrap opacity-90">{item.note}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function noteLabelForStatus(status) {
  if (status === 'suspended') return 'Suspension reason';
  if (status === 'rejected') return 'Rejection reason';
  if (status === 'approved') return 'Approval note';
  if (status === 'unsuspended') return 'Note';
  return 'Note';
}

/**
 * Single collapsible timeline for approvals, rejections, suspends, and unsuspends.
 */
const DriverApprovalHistory = ({ history = [], submissionCount = 0 }) => {
  const [open, setOpen] = useState(true);
  const entries = useMemo(
    () => (Array.isArray(history) ? history : []),
    [history],
  );

  const suspensionCount = useMemo(
    () => entries.filter((e) => e?.status === 'suspended').length,
    [entries],
  );

  if (!entries.length && !submissionCount) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-800 tracking-wide">
            Approval &amp; suspension history
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatSubmissionAttempt(submissionCount)}
            {entries.length
              ? ` · ${entries.length} event${entries.length === 1 ? '' : 's'}`
              : ''}
            {suspensionCount
              ? ` · ${suspensionCount} suspension${suspensionCount === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {!entries.length ? (
            <p className="text-sm text-slate-500 pt-4">No decisions recorded yet.</p>
          ) : (
            <ul className="space-y-3 pt-4">
              {entries.map((entry, idx) => {
                const by =
                  entry.byName || entry.by?.name || entry.by?.email || 'Staff';
                const statusLabel =
                  entry.status === 'unsuspended'
                    ? 'Unsuspended'
                    : entry.status
                      ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1)
                      : 'Updated';
                const tone =
                  entry.status === 'approved' || entry.status === 'unsuspended'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                    : entry.status === 'rejected'
                      ? 'bg-rose-50 text-rose-800 border-rose-100'
                      : entry.status === 'suspended'
                        ? 'bg-amber-50 text-amber-800 border-amber-100'
                        : 'bg-slate-50 text-slate-700 border-slate-100';

                return (
                  <li
                    key={entry._id || `${entry.at}-${idx}`}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${tone}`}
                      >
                        {statusLabel}
                      </span>
                      {entry.submissionAttempt ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {formatSubmissionAttempt(entry.submissionAttempt)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-800">
                      <span className="font-semibold">{by}</span>
                      {entry.at ? (
                        <span className="text-slate-500 font-normal">
                          {' '}
                          ·{' '}
                          {new Date(entry.at).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : null}
                    </p>
                    {entry.note ? (
                      <p
                        className={`text-xs mt-1.5 whitespace-pre-wrap ${
                          entry.status === 'suspended'
                            ? 'text-amber-900 bg-amber-50/80 border border-amber-100 rounded-lg px-3 py-2'
                            : 'text-slate-600'
                        }`}
                      >
                        <span className="font-semibold text-slate-500">
                          {noteLabelForStatus(entry.status)}:{' '}
                        </span>
                        {entry.note}
                      </p>
                    ) : entry.status === 'suspended' ? (
                      <p className="text-xs text-slate-400 mt-1.5">No suspension reason recorded</p>
                    ) : null}
                    <StepReviewNotes stepReviews={entry.stepReviews} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverApprovalHistory;
