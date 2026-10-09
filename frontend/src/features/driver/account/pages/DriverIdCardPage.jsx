import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, Check, Download, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { formatPhone, formatDate } from '../../../../utils/formatters';
import api from '../../../../utils/api';

const STATUS = {
  approved: { label: 'Verified', className: 'bg-success' },
  pending: { label: 'Onboarding', className: 'bg-warning' },
  under_review: { label: 'Under review', className: 'bg-warning' },
  rejected: { label: 'Rejected', className: 'bg-danger' },
  suspended: { label: 'Suspended', className: 'bg-danger' },
};

const TERMS = [
  'This card is the property of SpareDriver and is not transferable.',
  'Carry it while on duty and show it to customers when asked.',
  'Report a lost or misused card at once through Help & Support in the SpareDriver app.',
  'Misuse or tampering can lead to suspension of the captain account.',
];

const initialsOf = (name) =>
  String(name || 'D')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'D';

const Field = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[9px] font-semibold tracking-[0.12em] text-zinc-400 uppercase">{label}</p>
    <p className="mt-0.5 text-[13px] font-bold text-white truncate">{value || '—'}</p>
  </div>
);

/** Both faces share the CR80 portrait ratio (54 x 85.6 mm). */
const CARD_BOX =
  'relative w-[290px] aspect-[54/85.6] rounded-[22px] overflow-hidden bg-dark text-white shadow-xl ring-1 ring-black/10';

const CardFront = ({ driver, photo }) => {
  const status = STATUS[driver?.approvalStatus] || {
    label: driver?.approvalStatus || '—',
    className: 'bg-warning',
  };
  const license = driver?.drivingLicense || {};
  return (
    <div className={CARD_BOX}>
      <div className="relative h-[26%] bg-primary">
        <div className="absolute -top-8 -right-6 w-36 h-36 rounded-full bg-[#f5c84f]/60" />
        <div className="relative px-5 pt-4">
          <img src="/images/black-logo.png" alt="SpareDriver" className="h-8 w-auto" />
          <p className="mt-1.5 text-[9px] font-extrabold tracking-[0.16em] text-dark">
            CAPTAIN IDENTITY CARD
          </p>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 top-[16%] w-[43%] aspect-[66/80] rounded-2xl p-[3px] bg-primary ring-[5px] ring-dark overflow-hidden">
        {photo ? (
          <img src={photo} alt={driver?.name} className="w-full h-full object-cover rounded-[13px]" />
        ) : (
          <div className="w-full h-full rounded-[13px] bg-dark-light flex items-center justify-center text-3xl font-extrabold text-primary">
            {initialsOf(driver?.name)}
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 top-[53%] px-4 text-center">
        <h2 className="text-[19px] leading-tight font-extrabold tracking-wide uppercase truncate">
          {driver?.name || 'Driver'}
        </h2>
        <p className="mt-1 text-[9px] font-bold tracking-[0.18em] text-primary">PROFESSIONAL CAPTAIN</p>
        <span
          className={`mt-2.5 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-bold tracking-[0.12em] uppercase text-white ${status.className}`}
        >
          {driver?.approvalStatus === 'approved' && <Check className="w-3 h-3" strokeWidth={3.5} />}
          {status.label}
        </span>
      </div>

      <div className="absolute inset-x-0 top-[73%] mx-6 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-3">
        <Field label="Driver ID" value={driver?.driverNumber} />
        <Field label="Mobile" value={formatPhone(driver?.phone || '')} />
        <Field label="Licence no." value={license.number} />
        <Field label="Licence valid till" value={license.expiryDate ? formatDate(license.expiryDate) : ''} />
      </div>

      <div className="absolute bottom-0 inset-x-0 h-6 bg-primary flex items-center justify-center">
        <p className="text-[8px] font-extrabold tracking-[0.16em] text-dark">VERIFIED SPAREDRIVER CAPTAIN</p>
      </div>
    </div>
  );
};

const CardBack = ({ driver }) => (
  <div className={CARD_BOX}>
    <div className="h-[14%] bg-primary px-5 flex items-center justify-between">
      <img src="/images/black-logo.png" alt="SpareDriver" className="h-7 w-auto" />
      <p className="text-[9px] font-extrabold tracking-[0.16em] text-dark">TERMS OF USE</p>
    </div>

    <ol className="px-5 pt-4 space-y-2.5">
      {TERMS.map((t, i) => (
        <li key={t} className="flex gap-2 text-[11px] leading-snug text-zinc-300">
          <span className="font-bold text-primary">{i + 1}.</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>

    <div className="absolute inset-x-0 top-[60%] mx-6 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-3">
      <Field
        label="Issued on"
        value={formatDate(driver?.approvedAt || driver?.createdAt) || ''}
      />
      <Field label="Valid" value="While account active" />
    </div>

    <div className="absolute inset-x-0 bottom-[11%] mx-8 text-center">
      <div className="border-t border-zinc-500" />
      <p className="mt-1 text-[9px] text-zinc-400">Authorised Signatory — SpareDriver</p>
    </div>

    <div className="absolute bottom-0 inset-x-0 h-6 bg-primary flex items-center justify-center">
      <p className="text-[8px] font-extrabold tracking-[0.14em] text-dark">
        IF FOUND, PLEASE RETURN TO SPAREDRIVER
      </p>
    </div>
  </div>
);

const DriverIdCardPage = () => {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [side, setSide] = useState('front');
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const photo =
    driver?.documents?.find((d) => d.type === 'selfie')?.fileUrl || driver?.profilePicture || undefined;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/driver/id-card/pdf', { responseType: 'blob' });
      const filenameSafe =
        (driver?.name || 'captain')
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
        <h1 className="flex-1 text-base font-bold text-text">SpareDriver ID Card</h1>
        <button
          type="button"
          onClick={() => navigate('/driver/help-support')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-sm font-medium text-text"
        >
          <Headphones className="w-4 h-4" />
          Help
        </button>
      </header>

      <div className="flex-1 px-4 pt-3 pb-8 flex flex-col items-center">
        <div className="inline-flex p-1 rounded-xl bg-white border border-border-light">
          {['front', 'back'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`px-6 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
                side === s ? 'bg-dark text-white' : 'text-text-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {side === 'front' ? <CardFront driver={driver} photo={photo} /> : <CardBack driver={driver} />}
        </div>

        {driver?.approvalStatus !== 'approved' && driver && (
          <p className="mt-4 max-w-[290px] text-center text-xs text-text-muted inline-flex items-start gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
            Your card shows as verified once your profile is approved.
          </p>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || !driver}
          className="mt-6 w-full max-w-[290px] flex items-center justify-center gap-2 py-3 rounded-xl bg-dark text-white text-sm font-semibold hover:bg-dark-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? 'Preparing PDF…' : 'Download ID card (PDF)'}
        </button>
        <p className="mt-2 text-[11px] text-text-muted text-center max-w-[290px]">
          Prints at card size (54 × 85.6 mm) with front and back.
        </p>
      </div>
    </div>
  );
};

export default DriverIdCardPage;
