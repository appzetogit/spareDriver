import { CheckCircle2, RotateCcw } from 'lucide-react';
import Button from '../../../../components/Button';

const SavedVerificationVideo = ({
  video,
  onRerecord,
  onContinue,
  continuing = false,
  continueLabel = 'Submit application',
  continueHint = 'You can submit for verification or re-record if you want to replace this video.',
}) => (
  <div className="space-y-5">
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-emerald-900">Verification video saved</p>
        <p className="text-xs text-emerald-800 mt-1 leading-relaxed">{continueHint}</p>
      </div>
    </div>

    {video?.videoUrl && (
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-black">
        <video
          src={video.videoUrl}
          controls
          playsInline
          className="w-full max-h-[360px] object-contain"
        />
        {video.durationSeconds > 0 && (
          <p className="text-xs text-slate-500 px-3 py-2 bg-white border-t border-slate-100">
            Duration: {video.durationSeconds}s
            {video.recordedAt &&
              ` · Recorded ${new Date(video.recordedAt).toLocaleDateString()}`}
          </p>
        )}
      </div>
    )}

    <div className="flex flex-col gap-3">
      <Button fullWidth onClick={onContinue} loading={continuing} className="rounded-full py-4">
        {continueLabel}
      </Button>
      <Button
        fullWidth
        variant="outline"
        onClick={onRerecord}
        disabled={continuing}
        className="rounded-full py-4 border-slate-300 text-slate-800"
      >
        <RotateCcw className="w-4 h-4 mr-2 inline" />
        Re-record video
      </Button>
    </div>
  </div>
);

export default SavedVerificationVideo;
