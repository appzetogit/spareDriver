import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/Button';
import StepIndicator from '../../../../components/StepIndicator';
import TrainingVideoCard from '../components/TrainingVideoCard';
import { ArrowLeft, Shield } from 'lucide-react';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

import { DRIVER_ONBOARDING_STEPS } from '../../../../utils/driverOnboarding';

const TrainingPage = () => {
  const navigate = useNavigate();
  const driver = useDriverAuthStore((s) => s.driver);
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const [videos, setVideos] = useState([]);
  const [allRequiredComplete, setAllRequiredComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const isApproved = driver?.approvalStatus === 'approved';

  const fetchTraining = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/driver/training');
      const data = res.data.data;
      const list = data.videos || [];
      setVideos(list);
      setAllRequiredComplete(Boolean(data.allRequiredComplete));
      const firstIncomplete = list.find((v) => v.isRequired && !v.completed);
      setActiveId((prev) => prev || firstIncomplete?._id || list[0]?._id);
    } catch (err) {
      console.error('Failed to load training', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTraining();
  }, [fetchTraining]);

  const completedCount = useMemo(() => videos.filter((v) => v.completed).length, [videos]);

  const handleProgress = async (videoId, payload) => {
    setSavingId(videoId);
    try {
      const res = await api.put('/driver/training/progress', {
        trainingVideoId: videoId,
        ...payload,
      });
      const updated = res.data.data;
      setVideos((prev) => {
        const next = prev.map((v) => (v._id === videoId ? { ...v, ...updated } : v));
        const requiredDone = next.filter((v) => v.isRequired).every((v) => v.completed);
        setAllRequiredComplete(requiredDone);
        if (updated.completed) {
          const nextIncomplete = next.find((v) => v.isRequired && !v.completed);
          if (nextIncomplete) setActiveId(nextIncomplete._id);
        }
        return next;
      });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save progress');
    } finally {
      setSavingId(null);
    }
  };

  const handleSubmit = async () => {
    if (!allRequiredComplete) {
      alert('Please complete all required training videos.');
      return;
    }

    if (isApproved) {
      navigate('/driver/account', { replace: true });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/driver/onboarding/submit');
      updateDriver({
        onboardingStep: 6,
        approvalStatus: res.data.data?.approvalStatus || 'under_review',
      });
      navigate('/driver/register/approval', { replace: true });
    } catch (err) {
      alert(err.response?.data?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh bg-white">
        <p className="text-sm text-slate-500">Loading training...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
            <div className="px-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Training & Certification</h1>
          {!isApproved && (
            <span className="text-xs text-text-muted bg-bg px-2 py-1 rounded-full">6/6</span>
          )}
        </div>
        {!isApproved && <StepIndicator steps={DRIVER_ONBOARDING_STEPS} currentStep={6} />}
        <p className="text-xs text-text-muted mt-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          {isApproved
            ? 'Complete new training without changing your approved status.'
            : 'Watch all required videos to complete registration. This step cannot be skipped.'}
        </p>
        <p className="text-xs font-semibold text-slate-600 mt-2">
          {completedCount}/{videos.length} completed
        </p>
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 overflow-y-auto">
        <div className="flex-1 space-y-4">
          {videos.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No training videos available. Contact support.</p>
          ) : (
            videos.map((video) => (
              <TrainingVideoCard
                key={video._id}
                video={video}
                active={activeId === video._id}
                saving={savingId === video._id}
                onProgress={(payload) => handleProgress(video._id, payload)}
                onSelect={() => setActiveId(video._id)}
              />
            ))
          )}
        </div>
        <div className="pt-6 sticky bottom-0 bg-white border-t border-slate-100 mt-4">
          <Button
            fullWidth
            loading={submitting}
            disabled={
              !allRequiredComplete ||
              submitting ||
              (!isApproved && videos.length === 0)
            }
            onClick={handleSubmit}
            className="rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20"
          >
            {isApproved ? 'TRAINING COMPLETE' : 'SUBMIT APPLICATION'}
          </Button>
          {!allRequiredComplete && (
            <p className="text-xs text-center text-amber-700 mt-2 font-medium">
              Complete all required videos
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;
