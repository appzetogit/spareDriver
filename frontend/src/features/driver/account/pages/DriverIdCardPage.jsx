import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Headphones,
  Check,
  Download,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../../../../components/Avatar';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatPhone, formatDate } from '../../../../utils/formatters';
import api from '../../../../utils/api';

const APPROVAL_LABEL = {
  approved: 'Approved',
  pending: 'Onboarding',
  under_review: 'Under review',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

const DriverIdCardPage = () => {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
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

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/driver/id-card/pdf', {
        responseType: 'blob',
      });
      const filenameSafe =
        displayName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '') || 'captain';
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sparedriver-id-card-${filenameSafe}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast.success('ID card downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not download PDF');
    } finally {
      setDownloading(false);
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
            <div className="absolute top-3 right-3 w-14 h-14 rounded-full bg-white shadow-sm overflow-hidden flex items-center justify-center p-1">
              <img
                src="/images/captainSparedriver.jpg"
                alt="SpareDriver Captain"
                className="w-full h-full object-contain"
              />
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
            {driver?.driverNumber ? (
              <p className="mt-1 text-sm font-mono text-text-muted">{driver.driverNumber}</p>
            ) : null}

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
              onClick={handleDownload}
              disabled={downloading}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-semibold text-text hover:bg-bg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverIdCardPage;
