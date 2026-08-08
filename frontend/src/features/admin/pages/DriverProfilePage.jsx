import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Video,
} from 'lucide-react';
import Avatar from '../../../components/Avatar';
import api from '../../../utils/api';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminDriverProfileStore } from '../../../store/admin/useAdminDriverProfileStore';
import { useAdminDriversStore } from '../../../store/admin/useAdminDriversStore';
import { useAdminTasksListStore } from '../../../store/admin/useAdminTasksStore';
import StatusBadge from '../components/StatusBadge';
import DocumentGallery from '../components/DocumentGallery';
import { SectionCard, InfoGrid } from '../components/DetailBlocks';
import DriverProfileActions from '../components/ManageDrivers/DriverProfileActions';
import DriverStepReviewControls, {
  StepReviewStatusBadge,
} from '../components/ManageDrivers/DriverStepReviewControls';
import DriverApprovalHistory from '../components/ManageDrivers/DriverApprovalHistory';
import {
  formatDate,
  formatAvailability,
  getCarTypeLabel,
  ONBOARDING_STEP_LABELS,
} from '../components/ManageDrivers/driverProfileUtils';
import { DRIVER_REVIEW_STEPS, areAllReviewStepsApproved, formatSubmissionAttempt } from '../../../utils/driverOnboarding';
import { formatVehicleExperienceLabel } from '../../../utils/vehicleCatalog';

const REVIEWABLE = ['pending', 'under_review'];

const DriverProfilePage = () => {
  const { driverId } = useParams();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [submitting, setSubmitting] = useState(null);
  const [stepReviews, setStepReviews] = useState({});

  const queryParams = useMemo(() => ({ driverId }), [driverId]);
  const cacheKey = buildCacheKey('driver-profile', queryParams);

  const { data: profile, loading, error, refetch } = useCachedQuery(
    useAdminDriverProfileStore,
    cacheKey,
    queryParams,
    { enabled: Boolean(driverId) },
  );

  useEffect(() => {
    setStepReviews(profile?.driver?.onboardingStepReviews || {});
  }, [profile?.driver?.onboardingStepReviews]);

  const handleDownloadPdf = async () => {
    if (!driverId) return;
    setDownloadingPdf(true);
    try {
      const res = await api.get(`/admin/drivers/${driverId}/pdf`, {
        responseType: 'blob',
      });
      const filenameSafe =
        (profile?.driver?.name || 'driver')
          .toString()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'driver';
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameSafe}-${driverId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not generate PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const invalidateAfterReview = () => {
    useAdminDriversStore.getState().invalidate('admin-drivers');
    useAdminDriverProfileStore.getState().invalidate((key) => key.startsWith('driver-profile'));
    useAdminTasksListStore.getState().invalidate('admin-tasks');
  };

  const handleStatusUpdated = (updatedDriver) => {
    if (updatedDriver?._id) {
      // Soft update from suspend/unsuspend — avoid full-page refetch flash.
      return;
    }
    invalidateAfterReview();
    refetch();
  };

  const runStepReview = async (step, status, note = '') => {
    if (!profile?.driver?._id) return;
    setSubmitting(`step:${step}:${status}`);
    try {
      const res = await api.put(`/admin/drivers/${profile.driver._id}/step-review`, {
        step,
        status,
        note,
      });
      const data = res.data.data;
      // Update in place — do not invalidate/refetch (avoids full-page loading flash).
      setStepReviews(data.onboardingStepReviews || {});
      const label = DRIVER_REVIEW_STEPS.find((s) => s.key === step)?.label || step;
      toast.success(status === 'approved' ? `${label} approved` : `${label} rejected`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update step review');
    } finally {
      setSubmitting(null);
    }
  };

  const sectionReviewActions = (stepKey) => {
    if (!profile?.driver) return null;
    const canReview = REVIEWABLE.includes(profile.driver.approvalStatus);
    const review = stepReviews?.[stepKey] || { status: 'pending' };
    return (
      <DriverStepReviewControls
        stepKey={stepKey}
        review={review}
        canReview={canReview}
        submitting={submitting}
        onApprove={(key) => runStepReview(key, 'approved')}
        onReject={(key, note) => runStepReview(key, 'rejected', note)}
      />
    );
  };

  const sectionStatus = (stepKey) => (
    <StepReviewStatusBadge review={stepReviews?.[stepKey]} />
  );

  if (loading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-slate-500">Loading driver profile...</p>
      </div>
    );
  }

  if (error || !profile?.driver) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || 'Driver not found'}
        </div>
      </div>
    );
  }

  const { driver, training, trainingComplete } = profile;
  const canReview = REVIEWABLE.includes(driver.approvalStatus);
  const allStepsApproved = areAllReviewStepsApproved(stepReviews);
  const selfie = driver.documents?.find((d) => d.type === 'selfie')?.fileUrl;
  const carLabels = (driver.carTypeExperience || []).map(getCarTypeLabel).filter(Boolean);
  const vehicleExperience = driver.vehicleExperience || [];

  return (
    <div className="space-y-6 animate-fade-in-up pb-8">
      <div className="flex items-center justify-between gap-4">
        <BackLink />
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            to={`/admin/drivers/${driverId}/analytics`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </Link>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {downloadingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloadingPdf ? 'Generating…' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar name={driver.name} size="lg" src={selfie} className="ring-2 ring-white shadow-md" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900">{driver.name}</h1>
              <StatusBadge status={driver.approvalStatus} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-4 h-4" />
                {driver.phone}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                {driver.email || '—'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  driver.isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {driver.isOnline ? (driver.isOnTrip ? 'On trip' : 'Online') : 'Offline'}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                Onboarding:{' '}
                {ONBOARDING_STEP_LABELS[driver.onboardingStep] || `Step ${driver.onboardingStep}`}
              </span>
              {(driver.submissionCount > 0 || canReview) && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                  {formatSubmissionAttempt(driver.submissionCount)}
                  {driver.submissionCount > 1 ? ' (resubmitted)' : ''}
                </span>
              )}
              {canReview && (
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    allStepsApproved
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {allStepsApproved ? 'All sections verified' : 'Sections pending verification'}
                </span>
              )}
              {driver.revisionInProgress && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  Driver editing (not re-submitted)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {canReview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Verify each section with Approve / Reject next to it. Final approval is at the bottom
          after all five sections are approved.
        </div>
      )}

      <div className="space-y-6">
        <SectionCard
          title="1. Identity"
          status={sectionStatus('identity')}
          actions={sectionReviewActions('identity')}
        >
          <InfoGrid
            items={[
              { label: 'Driver ID', value: driver._id },
              { label: 'Name', value: driver.name },
              { label: 'Phone', value: driver.phone },
              { label: 'Email', value: driver.email || '—' },
              { label: 'Experience', value: `${driver.experienceYears ?? 0} years` },
              {
                label: 'Availability',
                value: formatAvailability(driver.availability),
                capitalize: true,
              },
              { label: 'Joined', value: formatDate(driver.createdAt) },
            ]}
          />
          {(vehicleExperience.length > 0 || carLabels.length > 0) && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">
                Vehicle experience ({vehicleExperience.length || carLabels.length})
              </p>
              {vehicleExperience.length > 0 ? (
                <ul className="space-y-2">
                  {vehicleExperience.map((entry) => (
                    <li
                      key={entry._id}
                      className="text-sm text-slate-700 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 capitalize"
                    >
                      {formatVehicleExperienceLabel(entry)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {carLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700 capitalize"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="2. Credentials"
          status={sectionStatus('credentials')}
          actions={sectionReviewActions('credentials')}
        >
          <InfoGrid
            items={[
              { label: 'License number', value: driver.drivingLicense?.number },
              {
                label: 'License expiry',
                value: driver.drivingLicense?.expiryDate
                  ? formatDate(driver.drivingLicense.expiryDate)
                  : '—',
              },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="3. Bank details"
          status={sectionStatus('bank')}
          actions={sectionReviewActions('bank')}
        >
          {driver.bankDetails ? (
            <InfoGrid
              items={[
                { label: 'Account holder', value: driver.bankDetails.accountHolderName },
                { label: 'Account number', value: driver.bankDetails.accountNumber },
                { label: 'IFSC', value: driver.bankDetails.ifscCode },
                { label: 'Bank name', value: driver.bankDetails.bankName },
                { label: 'UPI ID', value: driver.bankDetails.upiId },
              ]}
            />
          ) : (
            <p className="text-sm text-slate-500">No bank details submitted.</p>
          )}
        </SectionCard>

        <SectionCard
          title="4. Safety & documents"
          status={sectionStatus('safety')}
          actions={sectionReviewActions('safety')}
        >
          <InfoGrid
            items={[
              {
                label: 'Safety declaration',
                value: driver.safetyDeclaration?.agreed ? 'Agreed' : 'Not completed',
              },
            ]}
          />
          <div className="pt-2">
            <DocumentGallery documents={driver.documents} />
          </div>
        </SectionCard>

        <SectionCard
          title="5. Live identity verification"
          status={sectionStatus('liveVerification')}
          actions={sectionReviewActions('liveVerification')}
        >
          {driver.liveVerificationVideo?.videoUrl ? (
            <>
              <p className="text-xs text-slate-500 mb-3">
                Recorded{' '}
                {driver.liveVerificationVideo.recordedAt
                  ? formatDate(driver.liveVerificationVideo.recordedAt)
                  : '—'}
                {driver.liveVerificationVideo.durationSeconds
                  ? ` · ${driver.liveVerificationVideo.durationSeconds}s`
                  : ''}
              </p>
              <video
                src={driver.liveVerificationVideo.videoUrl}
                controls
                playsInline
                className="w-full max-h-[420px] rounded-xl bg-black"
              />
              <p className="text-xs text-slate-500 mt-3">
                Driver should show Aadhaar and driving licence in this recording.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">No live verification video uploaded.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Training progress (post-approval)">
          <InfoGrid
            items={[
              {
                label: 'Status',
                value: trainingComplete ? 'Complete' : 'Incomplete / after approval',
              },
            ]}
          />
          {!training?.length ? (
            <p className="text-sm text-slate-500">No training videos configured.</p>
          ) : (
            <ul className="space-y-3">
              {training.map((item) => (
                <li key={item._id} className="flex items-start gap-3 text-sm">
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.isRequired ? 'Required · ' : ''}
                      {item.completed
                        ? 'Completed'
                        : `${Math.round(item.watchedSeconds || 0)}s watched`}
                    </p>
                  </div>
                  <Video className="w-4 h-4 text-slate-300 shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <DriverApprovalHistory
        history={driver.approvalHistory}
        submissionCount={driver.submissionCount || 0}
      />

      <DriverProfileActions
        driver={driver}
        stepReviews={stepReviews}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onSuccess={handleStatusUpdated}
        onReviewComplete={invalidateAfterReview}
      />
    </div>
  );
};

function BackLink() {
  return (
    <Link
      to="/admin/drivers"
      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to drivers
    </Link>
  );
}

export default DriverProfilePage;
