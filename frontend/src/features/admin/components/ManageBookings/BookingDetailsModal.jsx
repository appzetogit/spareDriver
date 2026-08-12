import { useState } from 'react';
import toast from 'react-hot-toast';
import AdminDetailModal from '../AdminDetailModal';
import Badge from '../../../../components/Badge';
import Button from '../../../../components/Button';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import api from '../../../../utils/api';
import { BOOKING_STATUS_LIST } from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import useAdminAuthStore from '../../../../store/useAdminAuthStore';
import {
  CalendarClock,
  Car,
  Clock,
  Compass,
  Loader2,
  MapPin,
  Phone,
  Receipt,
  Route as RouteIcon,
  User as UserIcon,
  Wallet,
  AlertCircle,
  Ticket,
} from 'lucide-react';
import { formatExtensionHours } from '../../../../utils/formatters';

const STATUS_VARIANTS = {
  completed: 'success',
  started: 'primary',
  driver_assigned: 'primary',
  arrived: 'primary',
  en_route: 'primary',
  searching: 'warning',
  pending_assignment: 'info',
  awaiting_payment: 'warning',
  in_emergency_pool: 'danger',
  no_drivers_found: 'danger',
  cancelled: 'danger',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : null);
const fmtMoney = (n) => {
  const v = Number(n) || 0;
  const sign = v < 0 ? '\u2212' : '';
  return `${sign}\u20B9${Math.abs(v).toLocaleString('en-IN')}`;
};

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 mb-3">
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, multiline = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </p>
      <p
        className={`text-sm font-medium text-slate-900 ${multiline ? 'break-words' : 'truncate'}`}
      >
        {value ?? '\u2014'}
      </p>
    </div>
  );
}

function FareRow({ label, value, muted = false, emphasize = false, note = null, cost = false }) {
  const amount = Number(value) || 0;
  const isDiscount = amount < 0;
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span
        className={
          emphasize
            ? 'font-semibold text-slate-900'
            : muted
              ? 'text-slate-500'
              : 'text-slate-600'
        }
      >
        {label}
        {note ? (
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {note}
          </span>
        ) : null}
      </span>
      <span
        className={`tabular-nums shrink-0 ${
          emphasize
            ? 'font-bold text-emerald-600'
            : cost
              ? 'font-medium text-amber-700'
              : isDiscount
                ? 'font-medium text-emerald-600'
                : muted
                  ? 'text-slate-500'
                  : 'font-medium text-slate-900'
        }`}
      >
        {fmtMoney(amount)}
      </span>
    </div>
  );
}

/**
 * Build the admin fare line items from the persisted fareSnapshot +
 * live waiting/extensions. Mirrors the customer TripDetails breakdown
 * but keeps admin-only rows (commission, driver earning).
 */
function buildAdminFareRows(booking) {
  const snap = booking?.fareSnapshot || {};
  const bd = snap.breakdown || {};
  const isOutstation = booking?.serviceType === SERVICE_TYPES.OUTSTATION;
  const isHourly = booking?.serviceType === SERVICE_TYPES.HOURLY;
  const rows = [];

  if (isOutstation) {
    const days = Number(bd.days) || booking?.outstation?.days || 0;
    const nights = Number(bd.nights) || booking?.outstation?.nights || 0;
    const dailyRate = Number(bd.dailyRate) || 0;
    const daily = Number(bd.dailyRateTotal) || 0;
    const food = Number(bd.foodAllowanceTotal) || 0;
    const stay = Number(bd.stayAllowanceTotal) || 0;
    const legacy = Number(bd.legacyAllowanceTotal) || 0;
    const foodPerDay = Number(bd.foodAllowancePerDay) || 0;
    const stayPerNight = Number(bd.stayAllowancePerNight) || 0;

    if (daily > 0) {
      rows.push({
        label:
          days > 0
            ? `Daily rate ${fmtMoney(dailyRate)} \u00d7 ${days} day${days === 1 ? '' : 's'}`
            : 'Daily rate',
        value: daily,
      });
    }
    if (food > 0) {
      rows.push({
        label:
          days > 0
            ? `Driver food ${fmtMoney(foodPerDay)} \u00d7 ${days} day${days === 1 ? '' : 's'}`
            : 'Driver food',
        value: food,
      });
    }
    if (stay > 0) {
      rows.push({
        label:
          nights > 0
            ? `Driver stay ${fmtMoney(stayPerNight)} \u00d7 ${nights} night${nights === 1 ? '' : 's'}`
            : 'Driver stay',
        value: stay,
      });
    }
    if (legacy > 0) {
      rows.push({
        label:
          nights > 0
            ? `Driver allowance \u00d7 ${nights} night${nights === 1 ? '' : 's'}`
            : 'Driver allowance',
        value: legacy,
      });
    }
  } else if (isHourly) {
    const hours =
      Number(bd.hours) ||
      Number(bd.slabMaxHours) ||
      booking?.hourly?.durationHours ||
      0;
    const packagePrice =
      Number(bd.packagePrice) ||
      Number(bd.slabTotal) ||
      Number(bd.hourlyTotal) ||
      Number(snap.baseFare) ||
      0;
    if (packagePrice > 0) {
      rows.push({
        label: hours > 0 ? `Hourly package \u00d7 ${hours}h` : 'Hourly package',
        value: packagePrice,
      });
    }
    const extraHours = Number(bd.extraHours) || 0;
    const extraHourCharge = Number(bd.extraHourCharge) || 0;
    if (extraHours > 0 && extraHourCharge > 0) {
      rows.push({
        label: `Extra hours (${extraHours})`,
        value: extraHourCharge,
      });
    }
    const nightCharge = Number(bd.nightCharge) || 0;
    if (nightCharge > 0) {
      rows.push({
        label: 'Night charge',
        value: nightCharge,
        note: bd.nightChargeTriggered ? 'applied' : null,
      });
    }
    const stayAllowance = Number(bd.stayAllowance) || 0;
    if (stayAllowance > 0) {
      rows.push({ label: 'Stay allowance', value: stayAllowance });
    }
    const foodAllowance = Number(bd.foodAllowance) || 0;
    if (foodAllowance > 0) {
      rows.push({ label: 'Food allowance', value: foodAllowance });
    }
    const tollParking = Number(bd.tollParking) || 0;
    if (tollParking > 0) {
      rows.push({ label: 'Toll & parking', value: tollParking });
    }
    // Snapshot waiting charge (estimated at book time) — live accrued
    // waiting is added separately below from booking.waiting.
    const snapWaiting = Number(bd.waitingCharge) || 0;
    if (snapWaiting > 0 && !(Number(booking?.waiting?.chargeRupees) > 0)) {
      rows.push({ label: 'Waiting (estimated)', value: snapWaiting, muted: true });
    }
  }

  // Legacy / incomplete snapshots: fall back to flattened fields.
  if (rows.length === 0) {
    if (Number(snap.baseFare) > 0) {
      rows.push({ label: 'Base fare', value: Number(snap.baseFare) });
    }
    if (Number(snap.extras) > 0) {
      rows.push({ label: 'Extras', value: Number(snap.extras) });
    }
  }

  const subtotal = Number(bd.subtotal) || 0;
  if (subtotal > 0 && rows.length > 0) {
    rows.push({ label: 'Ride fare', value: subtotal, muted: true, separatorBefore: true });
  }

  const couponDiscount =
    Number(bd.couponDiscount) || Number(snap.couponDiscount) || 0;
  const couponCode = snap.couponCode || bd.couponCode || null;
  if (couponDiscount > 0 || couponCode) {
    rows.push({
      label: couponCode
        ? `Coupon ${couponCode} (platform absorbs)`
        : 'Coupon discount (platform absorbs)',
      value: -couponDiscount,
      muted: true,
      coupon: true,
    });
  }

  const netSubtotal = Number(bd.netSubtotal);
  if (couponDiscount > 0 && Number.isFinite(netSubtotal) && netSubtotal >= 0) {
    rows.push({ label: 'Net ride subtotal', value: netSubtotal, muted: true });
  }

  const platformFee =
    Number(bd.platformFee ?? bd.serviceCharge) ||
    Number(snap.platformFee ?? snap.serviceCharge) ||
    0;
  if (platformFee > 0) {
    const feeNote =
      bd.platformFeeType === 'flat'
        ? 'flat'
        : (bd.platformFeeAmount ?? bd.serviceChargePercent) > 0
          ? `${bd.platformFeeAmount ?? bd.serviceChargePercent}%`
          : null;
    rows.push({
      label: 'Platform fee',
      value: platformFee,
      muted: true,
      note: feeNote,
    });
  }

  const gst = Number(bd.gstAmount ?? bd.gst) || Number(snap.gst) || 0;
  if (gst > 0) {
    rows.push({
      label: 'GST',
      value: gst,
      muted: true,
      note: bd.gstPercent > 0 ? `${bd.gstPercent}%` : null,
    });
  }

  const subscriptionDiscount =
    Number(bd.subscriptionDiscount) ||
    Math.max(0, Number(snap.discount || 0) - couponDiscount) ||
    0;
  if (subscriptionDiscount > 0) {
    rows.push({
      label: 'Subscription discount',
      value: -subscriptionDiscount,
      muted: true,
    });
  }

  return rows;
}

const BookingDetailsModal = ({
  isOpen,
  onClose,
  booking,
  vehicle = null,
  bufferMinutes = null,
  loadingExtra = false,
  canEditStatus = false,
  onStatusUpdated,
}) => {
  const [statusDraft, setStatusDraft] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const admin = useAdminAuthStore((s) => s.admin);

  if (!booking) return null;

  const resolvedVehicle =
    vehicle ||
    (booking.carId && typeof booking.carId === 'object' ? booking.carId : null);

  const currentStatus = statusDraft || booking.status;
  const isScheduled = booking.bookingType === 'scheduled';
  const isOutstation = booking.serviceType === 'outstation';
  const outstation = booking.outstation || {};
  const outstationStart =
    outstation.pickupAt || outstation.startDate || null;
  const outstationEnd =
    outstation.expectedReturnAt || outstation.endDate || null;
  const pickupAt =
    outstationStart ||
    booking.hourly?.scheduledStartAt ||
    booking.timeline?.createdAt;
  const fareSnapshot = booking.fareSnapshot || {};
  const fareBreakdown = fareSnapshot.breakdown || {};
  const timeline = booking.timeline || {};
  const scheduled = booking.scheduled || {};
  const waiting = booking.waiting || {};
  const payment = booking.payment || {};
  const acceptedExtensions = (booking.extensions || []).filter(
    (e) => e.status === 'accepted' || e.status === 'pending',
  );
  const extensionTotal = acceptedExtensions.reduce(
    (sum, e) => sum + (Number(e.fareDelta) || 0),
    0,
  );
  const baseTotal = Number(fareSnapshot.total) || 0;
  const waitingCharge = Number(waiting.chargeRupees) || 0;
  const effectiveTotal = Math.round((baseTotal + waitingCharge + extensionTotal) * 100) / 100;
  const amountPaid = Number(payment.amountPaidRupees) || 0;
  const amountDue = Math.max(0, Math.round((effectiveTotal - amountPaid) * 100) / 100);
  const fareRows = buildAdminFareRows(booking);
  const couponCode = fareSnapshot.couponCode || fareBreakdown.couponCode || null;
  const couponDiscount =
    Number(fareBreakdown.couponDiscount) || Number(fareSnapshot.couponDiscount) || 0;
  const driverEarning = Number(fareBreakdown.driverEarning) || 0;
  const platformCommission = Number(fareBreakdown.platformCommission) || 0;
  const platformFee =
    Number(fareBreakdown.platformFee ?? fareBreakdown.serviceCharge) ||
    Number(fareSnapshot.platformFee ?? fareSnapshot.serviceCharge) ||
    0;
  const grossPlatformRevenue = Math.round((platformCommission + platformFee) * 100) / 100;
  const netPlatformRevenue = Math.round((grossPlatformRevenue - couponDiscount) * 100) / 100;

  const statusVariant = STATUS_VARIANTS[booking.status] || 'default';
  const canCancel =
    ['admin', 'sub_admin'].includes(admin?.role) &&
    [
      'pending_assignment',
      'searching',
      'driver_assigned',
      'awaiting_payment',
      'en_route',
      'arrived',
      'started',
      'in_emergency_pool',
    ].includes(booking.status);

  const saveStatus = async () => {
    if (!currentStatus || currentStatus === booking.status) {
      toast.error('Pick a different status');
      return;
    }
    setStatusSaving(true);
    try {
      const res = await api.patch(`/admin/bookings/${booking._id}/status`, {
        status: currentStatus,
        reason: statusReason.trim() || undefined,
      });
      const updated = res?.data?.data?.booking;
      toast.success('Booking status updated');
      setStatusDraft('');
      setStatusReason('');
      onStatusUpdated?.(updated || { ...booking, status: currentStatus });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update status');
    } finally {
      setStatusSaving(false);
    }
  };

  const cancelBooking = async () => {
    setStatusSaving(true);
    try {
      const res = await api.patch(`/admin/bookings/${booking._id}/status`, {
        status: 'cancelled',
        reason: cancelReason.trim() || 'Cancelled by admin',
      });
      const updated = res?.data?.data?.booking;
      toast.success('Trip cancelled. Any paid fare was sent for a full refund.');
      setCancelOpen(false);
      setCancelReason('');
      if (onStatusUpdated) {
        onStatusUpdated(updated || { ...booking, status: 'cancelled' });
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not cancel trip');
    } finally {
      setStatusSaving(false);
    }
  };

  const vehicleLabel = resolvedVehicle
    ? `${resolvedVehicle.brandId?.name || ''} ${resolvedVehicle.modelId?.name || ''}`.trim() ||
      resolvedVehicle.vehicleNumber ||
      'Vehicle'
    : null;

  return (
    <AdminDetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Booking ${booking.bookingNumber || ''}`}
      subtitle={`Created on ${new Date(booking.createdAt).toLocaleString()}`}
      headerExtra={
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 break-all">
                {booking.bookingNumber || booking._id?.slice(-8)}
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isScheduled
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {booking.bookingType || 'instant'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(booking.createdAt).toLocaleString()}
            </p>
          </div>
          <Badge variant={statusVariant} className="capitalize shrink-0">
            {booking.status?.replace(/_/g, ' ') || ''}
          </Badge>
        </div>
      }
    >
      <div className="space-y-4">
        {canCancel && (
          <Section title="Cancel trip" icon={AlertCircle}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-xs text-slate-500 flex-1">
                Cancelling releases the driver and active timers. Paid fares receive a full
                refund with no cancellation fee.
              </p>
              <Button type="button" variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel trip
              </Button>
            </div>
          </Section>
        )}

        {canEditStatus && (
          <Section title="Admin status override" icon={AlertCircle}>
            <p className="text-xs text-slate-500 mb-3">
              Change trip status to cancel stuck bookings or unblock account deletions.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={currentStatus}
                onChange={(e) => setStatusDraft(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                {BOOKING_STATUS_LIST.filter((s) => s !== 'cancelled').map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <input
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason (optional)"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <Button
                type="button"
                onClick={saveStatus}
                disabled={statusSaving || currentStatus === booking.status}
                className="shrink-0"
              >
                {statusSaving ? 'Saving…' : 'Update status'}
              </Button>
            </div>
          </Section>
        )}

        <Section title="Service & schedule" icon={CalendarClock}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Service type"
              value={
                <span className="capitalize">{booking.serviceType}</span>
              }
            />
            <Field
              label="Booking type"
              value={
                <span className="capitalize">{booking.bookingType}</span>
              }
            />
            {pickupAt && (
              <Field label="Pickup time" value={fmtDate(pickupAt)} />
            )}
            {booking.hourly?.durationHours ? (
              <Field
                label="Duration"
                value={`${booking.hourly.durationHours} h`}
              />
            ) : null}
            {isScheduled && (
              <>
                {scheduled.tier && (
                  <Field
                    label="Dispatch tier"
                    value={
                      <span className="capitalize">
                        {scheduled.tier.replace(/_/g, ' ')}
                      </span>
                    }
                  />
                )}
                {scheduled.assignAt && (
                  <Field
                    label="Assign at"
                    value={fmtDate(scheduled.assignAt)}
                  />
                )}
                {scheduled.escalateAt && (
                  <Field
                    label="Escalate at"
                    value={fmtDate(scheduled.escalateAt)}
                  />
                )}
              </>
            )}
          </div>
        </Section>

        {isOutstation && (
          <Section title="Round trip" icon={Compass}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Start"
                value={outstationStart ? fmtDate(outstationStart) : null}
              />
              <Field
                label="Expected return"
                value={outstationEnd ? fmtDate(outstationEnd) : null}
              />
              <Field
                label="Duration"
                value={
                  outstation.days != null || outstation.nights != null
                    ? `${outstation.days || 0} day${
                        outstation.days === 1 ? '' : 's'
                      } · ${outstation.nights || 0} night${
                        outstation.nights === 1 ? '' : 's'
                      }`
                    : null
                }
              />
              {outstation.estimatedKm ? (
                <Field
                  label="Estimated distance"
                  value={`${outstation.estimatedKm} km`}
                />
              ) : null}
              <Field
                label="Needs stay"
                value={outstation.needsStay ? 'Yes' : 'No'}
              />
              <Field
                label="Needs food"
                value={outstation.needsFood ? 'Yes' : 'No'}
              />
              {bufferMinutes != null && (
                <Field
                  label="Conflict buffer"
                  value={`±${bufferMinutes} min`}
                />
              )}
              {outstation.destinationAddress && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                    Destination
                  </p>
                  <p className="text-sm font-medium text-slate-900 break-words inline-flex items-start gap-1.5">
                    <RouteIcon className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                    {outstation.destinationAddress}
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        <Section title="Trip locations" icon={MapPin}>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                Pickup
              </p>
              <p className="text-sm text-slate-900 break-words">
                {booking.pickup?.address || '\u2014'}
              </p>
            </div>
            {booking.dropoff?.address && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  Dropoff
                </p>
                <p className="text-sm text-slate-900 break-words">
                  {booking.dropoff.address}
                </p>
              </div>
            )}
            {!isOutstation && booking.outstation?.destinationAddress && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                  Destination
                </p>
                <p className="text-sm text-slate-900 break-words">
                  {booking.outstation.destinationAddress}
                </p>
              </div>
            )}
            {(booking.zoneIds || []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {booking.zoneIds.map((z) => (
                  <span
                    key={z._id || z}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold"
                  >
                    <MapPin className="w-3 h-3" />
                    {z?.name || 'Zone'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Customer" icon={UserIcon}>
            {booking.userId ? (
              <div className="space-y-1">
                <p className="font-semibold text-sm text-slate-900">
                  {booking.userId.name}
                </p>
                {booking.userId.phone_no && (
                  <p className="text-xs text-slate-600 inline-flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {booking.userId.phone_no}
                  </p>
                )}
                {booking.userId.email && (
                  <p className="text-xs text-slate-500 truncate">
                    {booking.userId.email}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">Unknown</p>
            )}
          </Section>

          <Section title="Driver" icon={UserIcon}>
            {booking.driverId ? (
              <div className="space-y-1">
                <p className="font-semibold text-sm text-slate-900">
                  {booking.driverId.name}
                </p>
                {booking.driverId.phone_no && (
                  <p className="text-xs text-slate-600 inline-flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {booking.driverId.phone_no}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">Unassigned</p>
            )}
          </Section>
        </div>

        {(resolvedVehicle || loadingExtra) && (
          <Section title="Vehicle" icon={Car}>
            {resolvedVehicle ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Vehicle" value={vehicleLabel} />
                {resolvedVehicle.vehicleNumber && (
                  <Field
                    label="Number plate"
                    value={
                      <span className="font-mono">{resolvedVehicle.vehicleNumber}</span>
                    }
                  />
                )}
                {resolvedVehicle.carTypeId?.name && (
                  <Field
                    label="Type"
                    value={
                      <span className="capitalize">
                        {resolvedVehicle.carTypeId.name}
                      </span>
                    }
                  />
                )}
                {resolvedVehicle.fuelTypeId?.name && (
                  <Field
                    label="Fuel"
                    value={
                      <span className="capitalize">
                        {resolvedVehicle.fuelTypeId.name}
                      </span>
                    }
                  />
                )}
                {resolvedVehicle.transmission && (
                  <Field
                    label="Transmission"
                    value={
                      <span className="capitalize">
                        {resolvedVehicle.transmission}
                      </span>
                    }
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading vehicle details…
              </div>
            )}
          </Section>
        )}

        <Section title="Fare & payment" icon={Receipt}>
          <div className="space-y-2">
            {(couponCode || couponDiscount > 0) && (
              <div className="flex items-center gap-2 mb-2 px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-100">
                <Ticket className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-amber-900">
                    {couponCode ? (
                      <>
                        Coupon{' '}
                        <span className="font-mono tracking-wide">{couponCode}</span>
                      </>
                    ) : (
                      'Coupon applied'
                    )}
                  </p>
                  {couponDiscount > 0 && (
                    <p className="text-[11px] text-amber-800">
                      Customer saved {fmtMoney(couponDiscount)} — platform absorbs this cost
                      (driver earning unchanged)
                    </p>
                  )}
                </div>
              </div>
            )}

            {fareRows.map((row, idx) => (
              <div key={`${row.label}-${idx}`}>
                {row.separatorBefore && (
                  <div className="border-t border-slate-100 my-1.5" />
                )}
                <FareRow
                  label={row.label}
                  value={row.value}
                  muted={row.muted}
                  note={row.note}
                />
              </div>
            ))}

            {waitingCharge > 0 && (
              <FareRow
                label={`Waiting (${waiting.billableMinutes || 0} min)`}
                value={waitingCharge}
                note={waiting.noShow ? 'No-show' : null}
              />
            )}
            {acceptedExtensions.map((ext, idx) => {
              const prefix =
                acceptedExtensions.length > 1
                  ? `Extension ${idx + 1}`
                  : 'Extension';
              const duration =
                Number(ext.additionalDays) > 0
                  ? `+${ext.additionalDays}d`
                  : `+${formatExtensionHours(ext.additionalHours)}`;
              return (
                <FareRow
                  key={ext._id || idx}
                  label={`${prefix} (${duration})`}
                  value={ext.fareDelta}
                />
              );
            })}
            {Number(waiting.bufferRefundRupees) > 0 && (
              <FareRow
                label="Waiting buffer refunded"
                value={-Number(waiting.bufferRefundRupees)}
                muted
              />
            )}

            <div className="border-t border-slate-200 pt-2 mt-1 space-y-1.5">
              <FareRow label="Fare total" value={baseTotal} muted />
              {(waitingCharge > 0 || extensionTotal > 0) && (
                <FareRow label="Effective total" value={effectiveTotal} emphasize />
              )}
              {!(waitingCharge > 0 || extensionTotal > 0) && (
                <FareRow label="Total" value={effectiveTotal} emphasize />
              )}
              <FareRow label="Paid so far" value={amountPaid} muted />
              {amountDue > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-rose-700">Outstanding</span>
                  <span className="font-semibold text-rose-700 tabular-nums">
                    {fmtMoney(amountDue)}
                  </span>
                </div>
              )}
            </div>

            {(driverEarning > 0 ||
              platformCommission > 0 ||
              platformFee > 0 ||
              couponDiscount > 0) && (
              <div className="border-t border-slate-100 pt-2 mt-1 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">
                  Platform revenue
                </p>
                {platformCommission > 0 && (
                  <FareRow
                    label="Platform commission"
                    value={platformCommission}
                    muted
                    note={
                      fareBreakdown.platformCommissionPercent > 0
                        ? `${fareBreakdown.platformCommissionPercent}%`
                        : null
                    }
                  />
                )}
                {platformFee > 0 && (
                  <FareRow
                    label="Platform fee"
                    value={platformFee}
                    muted
                    note={
                      fareBreakdown.platformFeeType === 'flat'
                        ? 'flat'
                        : (fareBreakdown.platformFeeAmount ??
                            fareBreakdown.serviceChargePercent) > 0
                          ? `${fareBreakdown.platformFeeAmount ?? fareBreakdown.serviceChargePercent}%`
                          : null
                    }
                  />
                )}
                {couponDiscount > 0 && (
                  <FareRow
                    label={
                      couponCode
                        ? `Coupon absorbed (${couponCode})`
                        : 'Coupon absorbed'
                    }
                    value={-couponDiscount}
                    note="admin cost"
                    cost
                  />
                )}
                {(platformCommission > 0 || platformFee > 0) && (
                  <FareRow
                    label="Net platform revenue"
                    value={netPlatformRevenue}
                    emphasize={couponDiscount > 0}
                  />
                )}
                {driverEarning > 0 && (
                  <FareRow label="Driver earning" value={driverEarning} muted />
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2 text-sm pt-2 border-t border-slate-100">
              <div className="inline-flex items-center gap-1 text-slate-500">
                <Wallet className="w-3.5 h-3.5" />
                <span className="capitalize">
                  {booking.paymentMethod || 'wallet'}
                </span>
                {booking.paymentMode && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="capitalize">
                      {String(booking.paymentMode).replace(/_/g, ' ')}
                    </span>
                  </>
                )}
              </div>
              <Badge
                variant={
                  booking.paymentStatus === 'paid'
                    ? 'success'
                    : booking.paymentStatus === 'failed'
                      ? 'danger'
                      : 'warning'
                }
                className="capitalize"
              >
                {booking.paymentStatus?.replace(/_/g, ' ')}
              </Badge>
            </div>

            {booking.razorpay?.orderId && (
              <div className="pt-1 space-y-1 text-xs text-slate-500">
                <div className="flex justify-between gap-2">
                  <span>Razorpay order</span>
                  <span className="font-mono text-slate-700 truncate">
                    {booking.razorpay.orderId}
                  </span>
                </div>
                {booking.razorpay.paymentId && (
                  <div className="flex justify-between gap-2">
                    <span>Payment ID</span>
                    <span className="font-mono text-slate-700 truncate">
                      {booking.razorpay.paymentId}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        {(timeline.searchingAt ||
          timeline.driverAssignedAt ||
          timeline.enRouteAt ||
          timeline.arrivedAt ||
          timeline.startedAt ||
          timeline.completedAt ||
          timeline.cancelledAt) && (
          <Section title="Timeline" icon={Clock}>
            <div className="space-y-2 text-sm">
              {timeline.searchingAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Searching</span>
                  <span>{fmtDate(timeline.searchingAt)}</span>
                </div>
              )}
              {timeline.driverAssignedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Driver assigned</span>
                  <span>{fmtDate(timeline.driverAssignedAt)}</span>
                </div>
              )}
              {timeline.enRouteAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">En route</span>
                  <span>{fmtDate(timeline.enRouteAt)}</span>
                </div>
              )}
              {timeline.arrivedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Arrived</span>
                  <span>{fmtDate(timeline.arrivedAt)}</span>
                </div>
              )}
              {timeline.startedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Started</span>
                  <span>{fmtDate(timeline.startedAt)}</span>
                </div>
              )}
              {timeline.completedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed</span>
                  <span>{fmtDate(timeline.completedAt)}</span>
                </div>
              )}
              {timeline.cancelledAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Cancelled</span>
                  <span>{fmtDate(timeline.cancelledAt)}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {booking.cancellation?.reason && (
          <Section title="Cancellation" icon={AlertCircle}>
            <div className="space-y-2 text-sm">
              <Field
                label="Reason"
                value={booking.cancellation.reason}
                multiline
              />
              {booking.cancellation.cancelledBy && (
                <Field
                  label="By"
                  value={booking.cancellation.cancelledBy}
                />
              )}
              {booking.cancellation.feeCharged != null && (
                <Field
                  label="Fee charged"
                  value={fmtMoney(booking.cancellation.feeCharged)}
                />
              )}
            </div>
          </Section>
        )}
      </div>
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => {
          if (!statusSaving) {
            setCancelOpen(false);
            setCancelReason('');
          }
        }}
        onConfirm={cancelBooking}
        title="Cancel this trip?"
        description="This cannot be undone. The driver will be released and any paid fare will be fully refunded."
        confirmLabel="Cancel trip"
        variant="danger"
        loading={statusSaving}
      >
        <label className="block">
          <span className="font-semibold text-slate-700">Reason (optional)</span>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why is the admin cancelling this trip?"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </ConfirmDialog>
    </AdminDetailModal>
  );
};

export default BookingDetailsModal;
