import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { IdCard, Briefcase, Calendar, Pencil } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import ImageLightbox from '../../../../components/ImageLightbox';
import { useDocumentsManager } from '../../../../hooks/useDocumentsManager';
import { DOCUMENT_LABELS } from '../../../../utils/documents';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatDate } from '../../../../utils/formatters';
import DriverAccountSubPage from '../components/DriverAccountSubPage';

const capitalise = (str) => (str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

const availabilityLabel = (value) => {
  switch (value) {
    case 'full-time':
      return 'Full time';
    case 'part-time':
      return 'Part time';
    case 'weekends-only':
      return 'Weekends only';
    default:
      return capitalise(value);
  }
};

const DOC_TYPES = ['driving_license', 'selfie', 'aadhaar_front', 'aadhaar_back', 'police_verification'];

const STATUS_STYLE = {
  verified: 'text-success',
  pending: 'text-warning',
  rejected: 'text-danger',
};

const DocTile = ({ label, doc, canEdit, disabled, onView, onPick }) => {
  const inputRef = useRef(null);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await onPick(file);
    } catch (err) {
      toast.error(err.message || 'Could not use that file');
    }
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onView}
        disabled={!doc?.url}
        className="w-full flex items-center gap-3 text-left"
        aria-label={`View ${label}`}
      >
        <div className="w-20 h-14 rounded-lg overflow-hidden bg-bg border border-border-light shrink-0">
          {doc?.url && <img src={doc.url} alt={label} className="w-full h-full object-cover" />}
        </div>
        <span className="flex-1 min-w-0 text-sm font-semibold text-text">{label}</span>
      </button>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            aria-label={`Replace ${label}`}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-bg border border-border-light flex items-center justify-center text-text-secondary hover:bg-border-light disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
        </>
      )}
    </div>
  );
};

const DriverDocumentsPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver } = useCachedQuery(useDriverProfileStore, profileKey, {});
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);

  const {
    documents,
    loadFromApiDocuments,
    uploadDocument,
    uploadAllPending,
    hasPendingUploads,
    isAnyUploading,
  } = useDocumentsManager(DOC_TYPES);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewer, setViewer] = useState(null);

  const canReupload = driver?.approvalStatus === 'approved';

  // Hydrate from the profile; never clobber files the driver just picked.
  useEffect(() => {
    if (driver?.documents && !hasPendingUploads) loadFromApiDocuments(driver.documents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.documents, loadFromApiDocuments]);

  const visibleTypes = useMemo(
    () => DOC_TYPES.filter((t) => documents[t]?.url || (driver?.documents || []).some((d) => d.type === t)),
    [documents, driver?.documents],
  );
  const statusByType = useMemo(
    () => Object.fromEntries((driver?.documents || []).map((d) => [d.type, d])),
    [driver?.documents],
  );

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const changedTypes = DOC_TYPES.filter((t) => documents[t]?.pendingFile);
      const uploaded = await uploadAllPending();
      const payload = changedTypes
        .map((type) => ({
          type,
          fileUrl: uploaded[type]?.url,
          ...(uploaded[type]?.publicId ? { cloudinaryPublicId: uploaded[type].publicId } : {}),
        }))
        .filter((d) => d.fileUrl);
      await api.post('/driver/documents/reupload', { documents: payload });
      updateDriver({ approvalStatus: 'under_review', isOnline: false });
      useDriverProfileStore.getState().invalidate(profileKey);
      toast.success('Documents sent for re-verification');
      setConfirmOpen(false);
      navigate('/driver/register/approval', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to submit documents');
    } finally {
      setSubmitting(false);
    }
  };

  const license = driver?.drivingLicense || {};
  const credentialRows = [
    license.number && {
      icon: IdCard,
      label: 'Driving license',
      value: license.number,
      sub: license.expiryDate ? `Expires ${formatDate(license.expiryDate)}` : null,
    },
    typeof driver?.experienceYears === 'number' && {
      icon: Briefcase,
      label: 'Experience',
      value: `${driver.experienceYears} year${driver.experienceYears === 1 ? '' : 's'}`,
    },
    driver?.availability && {
      icon: Calendar,
      label: 'Availability',
      value: availabilityLabel(driver.availability),
    },
  ].filter(Boolean);

  return (
    <DriverAccountSubPage
      title="Documents"
      onBack={() => navigate('/driver/account')}
    >
      {credentialRows.length > 0 && (
        <div>
          <p className="px-1 mb-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted">
            Driving credentials
          </p>
          <Card padding="p-0">
            <ul className="divide-y divide-border-light">
              {credentialRows.map((row) => (
                <li key={row.label} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center shrink-0 mt-0.5">
                    <row.icon className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-text-muted">{row.label}</p>
                    <p className="text-sm font-semibold text-text break-words">{row.value}</p>
                    {row.sub && (
                      <p className="text-[11px] text-text-muted mt-0.5">{row.sub}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div>
        <p className="px-1 mb-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted">
          Uploaded documents
        </p>
        <Card padding="p-4" className="space-y-4">
          {visibleTypes.length === 0 && (
            <p className="text-sm text-text-muted">No documents uploaded yet</p>
          )}
          {visibleTypes.map((type) => {
            const meta = statusByType[type];
            const changed = Boolean(documents[type]?.pendingFile);
            return (
              <div key={type}>
                <DocTile
                  label={DOCUMENT_LABELS[type]}
                  doc={documents[type]}
                  canEdit={canReupload}
                  disabled={submitting}
                  onView={() => setViewer({ src: documents[type]?.url, alt: DOCUMENT_LABELS[type] })}
                  onPick={(file) => uploadDocument(type, file)}
                />
                {meta && !changed && (
                  <p
                    className={`mt-1 px-1 text-[11px] font-medium capitalize ${
                      STATUS_STYLE[meta.verificationStatus] || 'text-text-muted'
                    }`}
                  >
                    {meta.verificationStatus}
                    {meta.verificationStatus === 'rejected' && meta.rejectionReason
                      ? ` — ${meta.rejectionReason}`
                      : ''}
                  </p>
                )}
                {changed && (
                  <p className="mt-1 px-1 text-[11px] font-medium text-warning">
                    New file selected — will be sent for verification
                  </p>
                )}
              </div>
            );
          })}
          {canReupload ? (
            <Button
              type="button"
              className="w-full"
              disabled={!hasPendingUploads || isAnyUploading || submitting}
              onClick={() => setConfirmOpen(true)}
            >
              Submit for re-verification
            </Button>
          ) : (
            <p className="text-xs text-text-muted">
              Documents can be re-uploaded once your profile is approved.
            </p>
          )}
        </Card>
      </div>

      <ImageLightbox src={viewer?.src} alt={viewer?.alt} onClose={() => setViewer(null)} />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSubmit}
        loading={submitting}
        variant="warning"
        title="Send documents for re-verification?"
        description="Your profile will go back under admin review. You will be offline and unable to take trips until it is approved again."
        confirmLabel="Submit"
      />
    </DriverAccountSubPage>
  );
};

export default DriverDocumentsPage;
