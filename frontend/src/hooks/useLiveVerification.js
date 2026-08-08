import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { blobToVideoFile } from '../utils/fileLimits';
import { LIVE_VERIFICATION_MIN_SECONDS } from '../utils/driverOnboarding';

export function useLiveVerification({ onSuccess } = {}) {
  const [savedVideo, setSavedVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [recorderKey, setRecorderKey] = useState(0);

  const fetchSavedVideo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/driver/profile');
      const video = res.data.data?.liveVerificationVideo;
      const next = video?.videoUrl ? video : null;
      setSavedVideo(next);
      return next;
    } catch (err) {
      console.error('Failed to load verification video', err);
      toast.error('Could not load verification status');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRecordingComplete = useCallback((blob, duration) => {
    setRecordedBlob(blob);
    setRecordedSeconds(duration);
  }, []);

  const startRerecord = useCallback(() => {
    setSavedVideo(null);
    setRecordedBlob(null);
    setRecordedSeconds(0);
    setRecorderKey((k) => k + 1);
  }, []);

  const uploadRecording = useCallback(async () => {
    if (!recordedBlob) {
      toast.error('Please record your verification video first');
      return false;
    }
    if (recordedSeconds < LIVE_VERIFICATION_MIN_SECONDS) {
      toast.error(`Recording must be at least ${LIVE_VERIFICATION_MIN_SECONDS} seconds`);
      return false;
    }

    setUploading(true);
    try {
      const file = blobToVideoFile(recordedBlob, 'live-verification');
      const formData = new FormData();
      formData.append('video', file);
      formData.append('durationSeconds', String(recordedSeconds));

      const res = await api.post('/driver/onboarding/live-verification', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const video = res.data.data.liveVerificationVideo;
      setSavedVideo(video);
      setRecordedBlob(null);
      onSuccess?.(res.data.data);
      toast.success('Verification video saved');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload video');
      return false;
    } finally {
      setUploading(false);
    }
  }, [recordedBlob, recordedSeconds, onSuccess]);

  const showRecorder = !savedVideo?.videoUrl;

  return {
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
  };
}

export default useLiveVerification;
