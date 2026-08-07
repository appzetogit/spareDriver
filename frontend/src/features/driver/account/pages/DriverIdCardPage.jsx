import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Headphones,
  Check,
  Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../../../../components/Avatar';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatPhone, formatDate } from '../../../../utils/formatters';

const APPROVAL_LABEL = {
  approved: 'Approved',
  pending: 'Onboarding',
  under_review: 'Under review',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

const DriverIdCardPage = () => {
  const navigate = useNavigate();
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const displayName = driver?.name || 'Driver';
  const phone = formatPhone(driver?.phone || '') || '—';
  const license = driver?.drivingLicense || {};
  const licenseNumber = license.number || '—';
  const licenseValidity = license.expiryDate
    ? formatDate(license.expiryDate)
    : '—';
  const approvalStatus = driver?.approvalStatus || '';
  const isApproved = approvalStatus === 'approved';
  const approvalLabel =
    APPROVAL_LABEL[approvalStatus] || (approvalStatus ? approvalStatus : '—');

  const avatarSrc =
    driver?.profilePicture ||
    driver?.documents?.find((d) => d.type === 'selfie')?.fileUrl ||
    undefined;

  const declaration = useMemo(() => {
    const agreed = !!driver?.safetyDeclaration?.agreed;
    return {
      agreed,
      agreedAt: driver?.safetyDeclaration?.agreedAt
        ? formatDate(driver.safetyDeclaration.agreedAt)
        : null,
    };
  }, [driver?.safetyDeclaration]);

  const handleShare = async () => {
    const text = [
      `${displayName} — SpareDriver Captain`,
      `Mobile: ${phone}`,
      `License: ${licenseNumber}`,
      `Valid till: ${licenseValidity}`,
      `Status: ${approvalLabel}`,
    ].join('\n');

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'SpareDriver ID Card',
          text,
        });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success('ID card details copied');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        toast.success('ID card details copied');
      } catch {
        toast.error('Unable to share right now');
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <header className="sticky top-0 z-50 bg-bg px-3 pt-3 pb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/driver/account')}
          className="p-2 -ml-1"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <h1 className="flex-1 text-base font-bold text-text">
          SpareDriver ID Card
        </h1>
        <button
          type="button"
          onClick={() => navigate('/driver/help-support')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-sm font-medium text-text"
        >
          <Headphones className="w-4 h-4" />
          Help
        </button>
      </header>

      <div className="flex-1 px-4 pt-3 pb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-border-light overflow-hidden">
          <div className="relative h-24 bg-primary">
            <div className="absolute top-3 right-3 w-14 h-14 rounded-full bg-white shadow-sm flex flex-col items-center justify-center leading-tight">
              <img
                src="/logo-square.png"
                alt=""
                className="w-5 h-5 object-contain"
              />
              <span className="text-[9px] font-bold text-text mt-0.5">
                Captain
              </span>
            </div>
          </div>

          <div className="relative px-5 pb-5">
            <div className="flex items-end justify-between -mt-10">
              <div className="rounded-full ring-4 ring-white bg-white">
                <Avatar src={avatarSrc} name={displayName} size="xl" />
              </div>
              <span
                className={`mb-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${
                  isApproved ? 'bg-success' : 'bg-warning'
                }`}
              >
                {isApproved && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                {approvalLabel}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold text-text">{displayName}</h2>

            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                Mobile number
              </p>
              <p className="text-sm font-medium text-text mt-0.5">{phone}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                  License number
                </p>
                <p className="text-sm font-medium text-text mt-0.5 break-all">
                  {licenseNumber}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                  License validity
                </p>
                <p className="text-sm font-medium text-text mt-0.5">
                  {licenseValidity}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-semibold text-text hover:bg-bg transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDeclarationOpen(true)}
          className="mt-5 w-full text-center text-sm font-medium text-info"
        >
          view declaration
        </button>
      </div>

      <Modal
        isOpen={declarationOpen}
        onClose={() => setDeclarationOpen(false)}
        title="Safety declaration"
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary leading-relaxed">
            As a SpareDriver captain, you agree to follow traffic laws, treat
            customers with respect, keep your documents valid, and never share
            trip OTPs or personal customer data.
          </p>
          <div className="rounded-xl bg-bg px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
              Status
            </p>
            <p className="text-sm font-semibold text-text mt-0.5">
              {declaration.agreed
                ? `Agreed${declaration.agreedAt ? ` on ${declaration.agreedAt}` : ''}`
                : 'Not completed'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/terms-and-conditions')}
            className="w-full text-center text-sm font-medium text-info py-1"
          >
            Read terms & conditions
          </button>
          <Button
            fullWidth
            onClick={() => setDeclarationOpen(false)}
          >
            Got it
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default DriverIdCardPage;
