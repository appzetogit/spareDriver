import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import Button from '../../../../components/Button';

/**
 * "Are you coming?" alert when the driver has been waiting at pickup.
 * Forced Yes / No — silence still drives the server-side auto-close.
 */
export default function NoShowPromptModal({
  open,
  deadline,
  promptIndex,
  maxPrompts,
  isFinal,
  onYes,
  onNo,
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  const remainingMs = deadline
    ? Math.max(0, new Date(deadline).getTime() - now)
    : null;
  const remainingSec = remainingMs != null ? Math.floor(remainingMs / 1000) : null;
  const m = remainingSec != null ? Math.floor(remainingSec / 60) : null;
  const s = remainingSec != null ? remainingSec % 60 : null;
  const countdown =
    remainingSec != null
      ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : '—';

  const showProgress = Number.isFinite(promptIndex) && Number.isFinite(maxPrompts);
  const totalPrompts = showProgress ? Number(maxPrompts) + 1 : null;
  const displayIndex = showProgress
    ? Math.min(Number(promptIndex), totalPrompts)
    : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isFinal ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <Clock className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-text">
              {isFinal ? 'Last reminder — are you coming?' : 'Are you on your way?'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {showProgress
                ? `Reminder ${displayIndex} of ${totalPrompts}`
                : 'Your driver has been waiting at the pickup.'}
            </p>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-snug">
          {isFinal
            ? 'If you don\'t respond in time, the trip will be closed as a no-show and a configured no-show fee will be charged (rest refunded).'
            : `Tap "Yes" to keep your ride. If you don't respond, we'll check in again. After ${(maxPrompts != null ? maxPrompts : 'a few')} reminders the ride is closed.`}
        </p>
        {remainingSec != null && (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 flex items-center justify-between ${
              isFinal
                ? 'bg-red-50 border border-red-200'
                : 'bg-amber-50 border border-amber-200'
            }`}
          >
            <span
              className={`text-xs font-medium ${
                isFinal ? 'text-red-800' : 'text-amber-800'
              }`}
            >
              {isFinal ? 'Auto-close in' : 'Next reminder in'}
            </span>
            <span
              className={`text-xl font-bold tabular-nums ${
                isFinal ? 'text-red-700' : 'text-amber-700'
              }`}
            >
              {countdown}
            </span>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" onClick={onYes} className="w-full">
            Yes, I&rsquo;m on my way
          </Button>
          <Button variant="ghost" onClick={onNo} className="w-full">
            No, I&rsquo;m not coming
          </Button>
        </div>
      </div>
    </div>
  );
}
