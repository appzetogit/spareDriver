import {
  MapPin,
  Clock,
  CalendarClock,
  IndianRupee,
  Loader2,
  SkipForward,
  User as UserIcon,
  Car as CarIcon,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import { formatCurrency } from '../../../../utils/formatters';
import { SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { formatDistance } from '../../../../utils/geo';

/**
 * Open scheduled inbox request — full trip details + Accept / Ignore.
 */
export default function IncomingScheduledCard({
  request,
  busy = false,
  onAccept,
  onIgnore,
  className = '',
  style,
}) {
  if (!request) return null;

  const pickupLabel = request?.pickup?.address || request?.dailyPickup?.address || 'Pickup pending';
  const dropLabel = request?.dropoff?.address || request?.dailyDropoff?.address;
  const isSubscription =
    request?.kind === 'subscription' || request?.bookingType === 'subscription';
  const isOutstation = request?.bookingType === 'outstation' || !!request?.outstation;
  const startAt =
    request?.hourly?.scheduledStartAt
    || request?.outstation?.pickupAt
    || request?.outstation?.startDate
    || request?.startDate;
  const durationHrs = request?.hourly?.durationHours;
  const outDays = request?.outstation?.days;
  const earning = request?.fare?.driverEarning ?? request?.driverShareRupees;
  const serviceLabel = isSubscription
    ? 'Subscription'
    : (SERVICE_TYPE_LABELS[request.serviceType] || request.serviceType || 'Hourly');
  const customer = request?.customer;
  const car = request?.car;
  const badgeLabel = isSubscription
    ? 'Subscription'
    : isOutstation
      ? 'Outstation'
      : 'Scheduled';
  const badgeClass = isSubscription
    ? 'text-emerald-700 bg-emerald-50'
    : isOutstation
      ? 'text-amber-800 bg-amber-50'
      : 'text-indigo-700 bg-indigo-50';

  let whenPrimary = '—';
  let whenSecondary = '';
  if (startAt) {
    const d = new Date(startAt);
    whenPrimary = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    whenSecondary = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (request?.expiryDate && isSubscription) {
    const end = new Date(request.expiryDate);
    whenSecondary = `until ${end.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  }

  return (
    <Card className={className} style={style}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
              <CalendarClock className="w-3 h-3" />
              {badgeLabel}
            </span>
            <span className="text-[11px] text-text-muted truncate">
              {serviceLabel}
              {request.bookingNumber
                ? ` · #${request.bookingNumber}`
                : request.planName
                  ? ` · ${request.planName}`
                  : ''}
            </span>
          </div>
          <p className="text-sm font-semibold text-text mt-1.5 flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span className="line-clamp-2">{pickupLabel}</span>
          </p>
          {dropLabel && (
            <p className="text-xs text-text-muted mt-1 pl-5 line-clamp-1">{dropLabel}</p>
          )}
        </div>
        {earning != null && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Earn</p>
            <p className="text-sm font-bold text-text inline-flex items-center gap-0.5">
              <IndianRupee className="w-3.5 h-3.5" />
              {formatCurrency(earning).replace('₹', '')}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-bg/80 border border-border-light px-3 py-2 space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-xs text-text">
          <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span>
            {whenPrimary}
            {whenSecondary ? ` · ${whenSecondary}` : ''}
            {durationHrs != null ? ` · ${Number(durationHrs)} h` : ''}
            {outDays != null ? ` · ${Number(outDays)} day${Number(outDays) === 1 ? '' : 's'}` : ''}
            {request?.includedHoursPerDay != null && Number(request.includedHoursPerDay) > 0
              ? ` · ${Number(request.includedHoursPerDay)} h/day`
              : ''}
          </span>
        </div>
        {customer?.name && (
          <div className="flex items-center gap-2 text-xs text-text">
            <UserIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span className="truncate">{customer.name}</span>
          </div>
        )}
        {car && (
          <div className="flex items-center gap-2 text-xs text-text">
            <CarIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span className="truncate">
              {[car.brandName, car.modelName, car.vehicleNumber]
                .filter(Boolean)
                .join(' · ') || 'Vehicle details'}
            </span>
          </div>
        )}
        {request.distanceMeters != null && (
          <p className="text-[11px] text-text-muted pl-5">
            ~{formatDistance(request.distanceMeters)} from you
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() => onAccept?.(request)}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Accept'}
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          disabled={busy}
          onClick={() => onIgnore?.(request)}
        >
          <SkipForward className="w-4 h-4 mr-1" />
          Ignore
        </Button>
      </div>
    </Card>
  );
}
