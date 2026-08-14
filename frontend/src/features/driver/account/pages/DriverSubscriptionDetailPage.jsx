import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Car,
  Clock,
  IndianRupee,
  Loader2,
  MapPin,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useDriverSubscriptionsStore from '../../../../store/driver/useDriverSubscriptionsStore';
import { formatCurrency } from '../../../../utils/formatters';
import { formatLocationLabel } from '../../../../utils/locationLabel';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function DriverSubscriptionDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const detail = useDriverSubscriptionsStore((s) => s.detail);
  const loading = useDriverSubscriptionsStore((s) => s.detailLoading);
  const error = useDriverSubscriptionsStore((s) => s.detailError);
  const fetchDetail = useDriverSubscriptionsStore((s) => s.fetchDetail);
  const clearDetail = useDriverSubscriptionsStore((s) => s.clearDetail);

  useEffect(() => {
    fetchDetail(id).catch(() => {});
    return () => clearDetail();
  }, [id, fetchDetail, clearDetail]);

  if (loading && !detail) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh bg-bg">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex-1 flex flex-col min-h-dvh bg-bg">
        <Header onBack={() => navigate(-1)} />
        <div className="flex-1 p-4">
          <Card className="text-center py-10">
            <p className="text-sm text-text-muted">{error || 'Subscription not found'}</p>
            <Button className="mt-4" onClick={() => navigate('/driver/home')}>
              Back to home
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const hoursLabel =
    Number(detail.includedHoursPerDay) > 0
      ? `${detail.includedHoursPerDay} h / day`
      : 'Full-time chauffeur';

  return (
    <div className="flex-1 flex flex-col min-h-dvh bg-bg">
      <Header onBack={() => navigate(-1)} title={detail.planName || 'Subscription'} />

      <div className="flex-1 p-4 space-y-3 pb-8">
        <Card className="border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-white">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Assigned to you
              </p>
              <h1 className="text-lg font-bold text-text mt-0.5 truncate">
                {detail.planName || 'Dedicated driver plan'}
              </h1>
              {detail.subscriptionNumber && (
                <p className="text-[11px] font-mono text-text-muted mt-0.5">
                  {detail.subscriptionNumber}
                </p>
              )}
              <p className="text-xs text-text-muted mt-1">
                {detail.durationMonths || '—'} month
                {Number(detail.durationMonths) === 1 ? '' : 's'} · {hoursLabel}
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
            Customer & vehicle
          </p>
          <Row
            icon={UserIcon}
            label="Customer"
            value={detail.customer?.name || '—'}
            sub={detail.customer?.phone || null}
          />
          <Row
            icon={Car}
            label="Vehicle"
            value={
              [detail.car?.brandName, detail.car?.modelName, detail.car?.vehicleNumber]
                .filter(Boolean)
                .join(' · ') || '—'
            }
            sub={detail.car?.carTypeName || null}
          />
          {(detail.zone?.name || detail.zone?.city) && (
            <Row
              icon={MapPin}
              label="Zone"
              value={[detail.zone?.name, detail.zone?.city].filter(Boolean).join(' · ')}
            />
          )}
        </Card>

        <Card className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
            Daily routine
          </p>
          <Row
            icon={MapPin}
            label="Daily pickup"
            value={formatLocationLabel(detail.dailyPickup?.address, 'Not set')}
          />
          <Row
            icon={MapPin}
            label="Daily drop-off"
            value={formatLocationLabel(detail.dailyDropoff?.address, 'Not set')}
          />
        </Card>

        <Card className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">
            Assignment window
          </p>
          <Row icon={Calendar} label="Plan start" value={formatDate(detail.startDate)} />
          <Row icon={Calendar} label="Plan ends" value={formatDate(detail.expiryDate)} />
          <Row icon={Clock} label="Assigned since" value={formatDate(detail.assignedAt)} />
          {detail.assignedWorkingEndDate && (
            <Row
              icon={Clock}
              label="Working until"
              value={formatDate(detail.assignedWorkingEndDate)}
            />
          )}
          {detail.driverShareRupees != null && (
            <Row
              icon={IndianRupee}
              label="Your share"
              value={formatCurrency(detail.driverShareRupees)}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function Header({ onBack, title = 'Subscription' }) {
  return (
    <header className="bg-dark px-4 pt-4 pb-5 rounded-b-3xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-bold text-white truncate">{title}</h1>
      </div>
    </header>
  );
}

function Row({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-bg flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-text-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-text mt-0.5 break-words">{value}</p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
