import { MapPin, Clock, Navigation, Calendar } from 'lucide-react';
import Card from '../../../../components/Card';
import Badge from '../../../../components/Badge';
import { formatCurrency } from '../../../../utils/formatters';
import { formatLocationLabel } from '../../../../utils/locationLabel';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import {
  BOOKING_STATUS,
  ACTIVE_BOOKING_STATUSES,
} from '../../../../constants/bookingStatus';

/**
 * Reusable list-row for a driver-facing booking. Used by:
 *   - MyTripsPage     → full history list
 *   - EarningsPage    → "recent payouts" feed
 *   - (and any future "today's trips" tile on home)
 *
 * Designed to be tolerant of partial data: every field falls back to a sane
 * placeholder so a half-populated socket patch can't blank the row.
 */

const STATUS_VARIANTS = {
  [BOOKING_STATUS.SEARCHING]: { variant: 'warning', label: 'Searching' },
  [BOOKING_STATUS.DRIVER_ASSIGNED]: { variant: 'primary', label: 'Assigned' },
  [BOOKING_STATUS.AWAITING_PAYMENT]: { variant: 'warning', label: 'Awaiting payment' },
  [BOOKING_STATUS.EN_ROUTE]: { variant: 'info', label: 'En route' },
  [BOOKING_STATUS.ARRIVED]: { variant: 'info', label: 'Arrived' },
  [BOOKING_STATUS.STARTED]: { variant: 'info', label: 'In progress' },
  [BOOKING_STATUS.COMPLETED]: { variant: 'success', label: 'Completed' },
  [BOOKING_STATUS.CANCELLED]: { variant: 'danger', label: 'Cancelled' },
  [BOOKING_STATUS.NO_DRIVERS_FOUND]: { variant: 'default', label: 'Unfulfilled' },
};

function statusBadge(status) {
  return STATUS_VARIANTS[status] || { variant: 'default', label: status || '—' };
}

function pickDate(trip) {
  return (
    trip?.timeline?.completedAt ||
    trip?.timeline?.startedAt ||
    trip?.timeline?.driverAssignedAt ||
    trip?.createdAt ||
    null
  );
}

function formatTripDate(trip) {
  const iso = pickDate(trip);
  if (!iso) return { primary: '—', secondary: '' };
  const d = new Date(iso);
  return {
    primary: d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    secondary: d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function formatDurationLabel(trip) {
  if (trip?.serviceType === SERVICE_TYPES.HOURLY && trip?.hourly?.durationHours) {
    const h = Number(trip.hourly.durationHours);
    return `${h} h booked`;
  }
  const start = trip?.timeline?.startedAt;
  const end = trip?.timeline?.completedAt;
  if (!start || !end) return null;
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const DriverTripCard = ({ trip, onClick, className = '', style }) => {
  if (!trip) return null;
  const badge = statusBadge(trip.status);
  const dateInfo = formatTripDate(trip);
  const duration = formatDurationLabel(trip);
  // Driver-side trip cards only ever display the driver's earning —
  // the customer's gross fare is stripped on the backend.
  const fare = trip?.fareSnapshot?.driverEarning;
  const serviceLabel = SERVICE_TYPE_LABELS[trip.serviceType] || trip.serviceType;
  const pickupLabel = formatLocationLabel(trip?.pickup?.address, 'Pickup pending');
  const dropoffLabel = formatLocationLabel(trip?.dropoff?.address);
  const isOngoing = ACTIVE_BOOKING_STATUSES.includes(trip.status);

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      className={className}
      style={style}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Calendar className="w-3.5 h-3.5" />
            <span className="font-semibold text-text">{dateInfo.primary}</span>
            {dateInfo.secondary && <span>· {dateInfo.secondary}</span>}
          </div>
          <p className="text-[11px] text-text-muted mt-0.5 truncate">
            {serviceLabel}
            {trip.bookingNumber ? ` · ${trip.bookingNumber}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {fare > 0 && (
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wide text-text-muted font-semibold leading-none">
                Earning
              </p>
              <p className="text-sm font-bold text-emerald-700 leading-tight">
                {formatCurrency(fare)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-text-secondary">
        <MapPin className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
        <span className="line-clamp-2">{pickupLabel}</span>
      </div>
      {dropoffLabel && (
        <div className="flex items-start gap-2 text-xs text-text-muted mt-1">
          <Navigation className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
          <span className="line-clamp-2">{dropoffLabel}</span>
        </div>
      )}

      {(duration || isOngoing) && (
        <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
          {duration && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {duration}
            </span>
          )}
          {isOngoing && (
            <span className="inline-flex items-center gap-1 text-primary font-semibold">
              Resume trip →
            </span>
          )}
        </div>
      )}
    </Card>
  );
};

export default DriverTripCard;
