import { useState } from 'react';
import toast from 'react-hot-toast';
import AdminDetailModal from '../AdminDetailModal';
import Badge from '../../../../components/Badge';
import Button from '../../../../components/Button';
import api from '../../../../utils/api';
import { BOOKING_STATUS_LIST } from '../../../../constants/bookingStatus';
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
} from 'lucide-react';

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
const fmtMoney = (n) => `\u20B9${Number(n || 0).toLocaleString('en-IN')}`;

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

  if (!booking) return null;

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
  const timeline = booking.timeline || {};
  const scheduled = booking.scheduled || {};

  const statusVariant = STATUS_VARIANTS[booking.status] || 'default';

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

  const vehicleLabel = vehicle
    ? `${vehicle.brandId?.name || ''} ${vehicle.modelId?.name || ''}`.trim() ||
      vehicle.vehicleNumber ||
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
                {BOOKING_STATUS_LIST.map((s) => (
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
          <Section title="Outstation trip" icon={Compass}>
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

        {(vehicle || loadingExtra) && (
          <Section title="Vehicle" icon={Car}>
            {vehicle ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Vehicle" value={vehicleLabel} />
                {vehicle.vehicleNumber && (
                  <Field
                    label="Number plate"
                    value={
                      <span className="font-mono">{vehicle.vehicleNumber}</span>
                    }
                  />
                )}
                {vehicle.carTypeId?.name && (
                  <Field
                    label="Type"
                    value={
                      <span className="capitalize">
                        {vehicle.carTypeId.name}
                      </span>
                    }
                  />
                )}
                {vehicle.fuelTypeId?.name && (
                  <Field
                    label="Fuel"
                    value={
                      <span className="capitalize">
                        {vehicle.fuelTypeId.name}
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
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Base fare</span>
              <span>{fmtMoney(fareSnapshot.baseFare)}</span>
            </div>
            {fareSnapshot.extras != null && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Extras</span>
                <span>{fmtMoney(fareSnapshot.extras)}</span>
              </div>
            )}
            {fareSnapshot.gst != null && fareSnapshot.gst > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">GST</span>
                <span>{fmtMoney(fareSnapshot.gst)}</span>
              </div>
            )}
            {fareSnapshot.serviceCharge != null && fareSnapshot.serviceCharge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Service charge</span>
                <span>{fmtMoney(fareSnapshot.serviceCharge)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="text-emerald-600">
                {fmtMoney(fareSnapshot.total)}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-sm pt-2 border-t border-slate-100">
              <div className="inline-flex items-center gap-1 text-slate-500">
                <Wallet className="w-3.5 h-3.5" />
                <span className="capitalize">
                  {booking.paymentMethod || 'wallet'}
                </span>
                <span className="text-slate-300">·</span>
                <span className="capitalize">{booking.paymentMode}</span>
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
    </AdminDetailModal>
  );
};

export default BookingDetailsModal;
