import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

const TrainingVideoCard = ({ video, active, onProgress, saving, onSelect }) => {
  const videoRef = useRef(null);
  const lastSentRef = useRef(0);
  const [localWatched, setLocalWatched] = useState(video.watchedSeconds || 0);

  useEffect(() => {
    setLocalWatched(video.watchedSeconds || 0);
  }, [video.watchedSeconds, video._id]);

  useEffect(() => {
    if (!active || !videoRef.current) return;
    if (localWatched > 0 && localWatched < (video.durationSeconds || 0)) {
      videoRef.current.currentTime = localWatched;
    }
  }, [active, video._id]);

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || video.completed) return;

    const seconds = Math.floor(el.currentTime);
    setLocalWatched(seconds);

    const threshold = video.durationSeconds
      ? Math.max(1, Math.floor(video.durationSeconds * 0.9))
      : 0;
    const reachedEnd = threshold > 0 && seconds >= threshold;

    if (!reachedEnd && seconds - lastSentRef.current < 3) return;
    lastSentRef.current = seconds;
    onProgress({ watchedSeconds: seconds, completed: reachedEnd });
  };

  const handleEnded = () => {
    const el = videoRef.current;
    const played = Math.floor(el?.currentTime || 0);
    const duration = video.durationSeconds || played;
    // Prefer DB duration so backend 90% threshold matches; fall back to played time.
    const watchedSeconds = Math.max(played, duration);
    onProgress({ watchedSeconds, completed: true });
  };

  const progressPct = video.durationSeconds
    ? Math.min(100, Math.round((localWatched / video.durationSeconds) * 100))
    : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
      className={`rounded-2xl border-2 p-4 transition-all cursor-pointer ${
        video.completed
          ? 'border-emerald-500 bg-emerald-50/50'
          : active
            ? 'border-primary bg-white shadow-md'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-900 text-sm">{video.title}</h3>
            {video.isRequired && (
              <span className="text-[10px] font-bold uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                Required
              </span>
            )}
          </div>
          {video.description && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{video.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
          {video.completed ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          ) : (
            <Circle className="w-6 h-6 text-slate-300" />
          )}
        </div>
      </div>

      {active && (
        <video
          ref={videoRef}
          src={video.videoUrl}
          controls
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          className="w-full rounded-xl bg-black max-h-64"
          onClick={(e) => e.stopPropagation()}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />
      )}

      {!video.completed && video.durationSeconds > 0 && (
        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  );
};

export default TrainingVideoCard;
