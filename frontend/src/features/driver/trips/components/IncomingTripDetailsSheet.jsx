import {
  MapPin,
  Clock,
  CalendarClock,
  IndianRupee,
  User as UserIcon,
  Car as CarIcon,
  Navigation,
} from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import Button from '../../../../components/Button';
import { formatCurrency, maskPersonName } from '../../../../utils/formatters';
import { SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { formatDistance } from '../../../../utils/geo';
import { formatLocationLabel } from '../../../../utils/locationLabel';

function DetailRow({ icon: Icon, label, value, multi = false }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-light last:border-0">
      <div className="w-8 h-8 rounded-xl bg-bg flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        <p
          className={`text-sm text-text font-medium mt-0.5 ${
            multi ? 'whitespace-pre-wrap' : 'truncate'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Full trip details for an incoming inbox offer.
 * Shows trip / customer / car / earning — never driver profile or contact.
 */
export default function IncomingTripDetailsSheet({
  open,
  onClose,
  request,
  busy = false,
  onAccept,
  onIgnore,
}) {
  if (!request) return null;

  const isSubscription =
    request?.kind === 'subscription' || request?.bookingType === 'subscription';
  const isOutstation =
    request?.bookingType === 'outstation' || !!request?.outstation;
  const pickupLabel = formatLocationLabel(
    request?.pickup?.address || request?.dailyPickup?.address,
  );
  const dropLabel = formatLocationLabel(
    request?.dropoff?.address || request?.dailyDropoff?.address,
  );
  const startAt =
    request?.hourly?.scheduledStartAt
    || request?.outstation?.pickupAt
    || request?.outstation?.startDate
    || request?.startDate;
  const endAt =
    request?.outstation?.expectedReturnAt
    || request?.outstation?.endDate
    || request?.expiryDate;
  const durationHrs = request?.hourly?.durationHours;
  const outDays = request?.outstation?.days;
  const outNights = request?.outstation?.nights;
  const earning = request?.fare?.driverEarning ?? request?.driverShareRupees;
  const serviceLabel = isSubscription
    ? 'Subscription'
    : (SERVICE_TYPE_LABELS[request.serviceType] || request.serviceType || 'Hourly');
  const customer = request?.customer;
  const car = request?.car;

  const badgeLabel = isSubscription
    ? 'Subscription'
    : isOutstation
      ? 'Round trip'
      : 'Scheduled';

  let whenLabel = null;
  if (startAt) {
    const d = new Date(startAt);
    whenLabel = d.toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  let untilLabel = null;
  if (endAt) {
    const d = new Date(endAt);
    untilLabel = d.toLocaleString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const durationParts = [];
  if (durationHrs != null) durationParts.push(`${Number(durationHrs)} hour${Number(durationHrs) === 1 ? '' : 's'}`);
  if (outDays != null) durationParts.push(`${Number(outDays)} day${Number(outDays) === 1 ? '' : 's'}`);
  if (outNights != null && Number(outNights) > 0) {
    durationParts.push(`${Number(outNights)} night${Number(outNights) === 1 ? '' : 's'}`);
  }
  if (request?.includedHoursPerDay != null && Number(request.includedHoursPerDay) > 0) {
    durationParts.push(`${Number(request.includedHoursPerDay)} h/day`);
  }

  const carLabel = car
    ? [
        car.brandName,
        car.modelName,
        car.carTypeName,
        car.fuelTypeName,
        car.transmission,
        car.vehicleNumber,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const refLabel = request.bookingNumber
    ? `#${request.bookingNumber}`
    : request.subscriptionNumber
      ? `#${request.subscriptionNumber}`
      : request.planName || null;

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Trip details">
      <div className="space-y-1 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            <CalendarClock className="w-3 h-3" />
            {badgeLabel}
          </span>
          <span className="text-xs text-text-muted">
            {serviceLabel}
            {refLabel ? ` · ${refLabel}` : ''}
          </span>
        </div>
        {earning != null && (
          <div className="mt-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-emerald-700/80">
                Your earning
              </p>
              <p className="text-lg font-bold text-emerald-900 inline-flex items-center gap-0.5 mt-0.5">
                <IndianRupee className="w-4 h-4" />
                {formatCurrency(earning).replace('₹', '')}
              </p>
            </div>
            {request.distanceMeters != null && (
              <p className="text-xs text-emerald-800/80 text-right">
                ~{formatDistance(request.distanceMeters)}
                <br />
                from you
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border-light px-3 mb-4">
        <DetailRow icon={MapPin} label="Pickup" value={pickupLabel} multi />
        <DetailRow icon={Navigation} label="Drop-off" value={dropLabel} multi />
        <DetailRow icon={Clock} label="Starts" value={whenLabel} />
        <DetailRow
          icon={CalendarClock}
          label={isSubscription ? 'Valid until' : 'Expected return'}
          value={untilLabel}
        />
        <DetailRow
          icon={Clock}
          label="Duration"
          value={durationParts.length ? durationParts.join(' · ') : null}
        />
        <DetailRow
          icon={UserIcon}
          label="Customer"
          value={
            customer?.name
              ? (isSubscription ? customer.name : (maskPersonName(customer.name) || 'Customer'))
              : null
          }
        />
        <DetailRow icon={CarIcon} label="Vehicle" value={carLabel} multi />
      </div>

      {isOutstation && request.locationRevealed === false && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 leading-snug">
          Exact map and pin unlock at midnight on the trip day. Address text is available above.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() => {
            onAccept?.(request);
            onClose?.();
          }}
        >
          Accept
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          disabled={busy}
          onClick={() => {
            onIgnore?.(request);
            onClose?.();
          }}
        >
          Ignore
        </Button>
      </div>
    </BottomSheet>
  );
}
