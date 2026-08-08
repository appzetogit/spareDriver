import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import LiveVideoRecorder from '../../../../components/LiveVideoRecorder';
import DriverOnboardingShell from '../components/DriverOnboardingShell';
import LiveVerificationInstructions from '../components/LiveVerificationInstructions';
import SavedVerificationVideo from '../components/SavedVerificationVideo';
import useLiveVerification from '../../../../hooks/useLiveVerification';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { LIVE_VERIFICATION_MIN_SECONDS } from '../../../../utils/driverOnboarding';
import api from '../../../../utils/api';

const LiveVerificationPage = () => {
  const navigate = useNavigate();
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const [submitting, setSubmitting] = useState(false);

  const {
    savedVideo,
    loading,
    uploading,
    recordedBlob,
    recordedSeconds,
    recorderKey,
    showRecorder,
    fetchSavedVideo,
    handleRecordingComplete,
    startRerecord,
    uploadRecording,
  } = useLiveVerification({
    onSuccess: (data) => {
      updateDriver({
        onboardingStep: data.onboardingStep,
        liveVerificationVideo: data.liveVerificationVideo,
      });
    },
  });

  useEffect(() => {
    fetchSavedVideo().then((video) => {
      if (video?.videoUrl) {
        updateDriver({ liveVerificationVideo: video });
      }
    });
  }, [fetchSavedVideo, updateDriver]);

  const handleSubmitApplication = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/driver/onboarding/submit');
      updateDriver({
        onboardingStep: 6,
        approvalStatus: res.data.data?.approvalStatus || 'under_review',
      });
      toast.success('Application submitted for verification');
      navigate('/driver/register/approval', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    const ok = await uploadRecording();
    if (ok) await fetchSavedVideo();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh bg-slate-50">
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <DriverOnboardingShell
      currentStep={5}
      stepLabel="5/5"
      title="Live identity verification"
      subtitle="Record a live video showing your Aadhaar and driving licence. No gallery uploads."
      onBack={() => navigate(-1)}
      footer={
        showRecorder ? (
          <Button
            fullWidth
            loading={uploading}
            disabled={!recordedBlob || recordedSeconds < LIVE_VERIFICATION_MIN_SECONDS}
            onClick={handleUpload}
            className="rounded-full py-4 text-base font-bold"
          >
            Submit verification video
          </Button>
        ) : null
      }
    >
      {showRecorder ? (
        <>
          <LiveVerificationInstructions />
          <LiveVideoRecorder
            key={recorderKey}
            onRecordingComplete={handleRecordingComplete}
            disabled={uploading}
          />
        </>
      ) : (
        <SavedVerificationVideo
          video={savedVideo}
          onRerecord={startRerecord}
          onContinue={handleSubmitApplication}
          continuing={submitting}
          continueLabel="Submit application"
          continueHint="Submit your profile for admin verification. Training and kit purchase come after approval."
        />
      )}
    </DriverOnboardingShell>
  );
};

export default LiveVerificationPage;
