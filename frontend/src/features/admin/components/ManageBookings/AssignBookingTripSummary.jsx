import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  Car as CarIcon,
  Clock,
  Compass,
  LifeBuoy,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Route as RouteIcon,
  User as UserIcon,
} from 'lucide-react';
import { formatDateTime12, formatPickupDateTime } from '../../../../utils/datetime';
import { displayBookingPaymentStatus } from '../../../../constants/bookingStatus';

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{children}</p>
    </div>
  );
}

function DetailTile({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-start gap-2.5 min-w-0">
      <div className="w-7 h-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
        <div className="text-xs font-semibold text-slate-800 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function Countdown({ to }) {
  if (!to) return null;
  const target = new Date(to).getTime();
  const diffMs = target - Date.now();
  const past = diffMs < 0;
  const sec = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const stamp = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <span className={past ? 'text-rose-500 font-semibold' : 'text-slate-400'}>
      {past ? `${stamp} overdue` : `in ${stamp}`}
    </span>
  );
}

function ConflictBanner({ conflicts = [] }) {
  if (!conflicts.length) return null;
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold">Vehicle has overlapping bookings</p>
          <p className="text-[11px] leading-snug mt-0.5 opacity-80">
            This car is already booked in the window below. Resolve before assigning.
          </p>
        </div>
      </div>
      <ul className="text-[11px] space-y-1.5 pl-6 list-disc">
        {conflicts.slice(0, 5).map((c) => (
          <li key={c._id}>
            <span className="font-mono text-[10px] mr-1.5 bg-white/60 px-1 py-0.5 rounded">
              {c.bookingNumber || c._id?.slice?.(-6)}
            </span>
            {formatPickupDateTime(c.startMs)} → {formatPickupDateTime(c.endMs)} · {c.serviceType}/{c.bookingType}
          </li>
        ))}
        {conflicts.length > 5 ? (
          <li className="list-none opacity-60">+{conflicts.length - 5} more</li>
        ) : null}
      </ul>
    </div>
  );
}

function vehicleFromBooking(booking, extraCar) {
  const car = extraCar || booking?.carId;
  if (!car || typeof car !== 'object') return null;
  return {
    label:
      `${car.brandId?.name || ''} ${car.modelId?.name || ''}`.trim() ||
      car.vehicleNumber ||
      'Vehicle',
    plate: car.vehicleNumber || null,
    type: car.carTypeId?.name || null,
    fuel: car.fuelTypeId?.name || null,
    transmission: car.transmission || null,
    image: car.image || null,
  };
}

const MODE_META = {
  outstation: { icon: Compass, gradient: 'from-slate-800 to-slate-900' },
  emergency_pool: { icon: LifeBuoy, gradient: 'from-amber-600 to-orange-600' },
};

const AssignBookingTripSummary = ({
  booking,
  mode,
  car: extraCar = null,
  bufferMinutes = null,
  vehicleConflicts = [],
  detailLoading = false,
  detailError = null,
}) => {
  if (!booking) return null;

  const isOutstation = booking.serviceType === 'outstation' || mode === 'outstation';
  const outstation = booking.outstation || {};
  const hourly = booking.hourly || {};
  const scheduled = booking.scheduled || {};
  const fare = booking.fareSnapshot || {};
  const user = booking.userId || {};
  const vehicle = vehicleFromBooking(booking, extraCar);
  const meta = MODE_META[mode] || MODE_META.emergency_pool;
  const ModeIcon = meta.icon;

  const startSrc = outstation.pickupAt || outstation.startDate || hourly.scheduledStartAt;
  const endSrc = outstation.expectedReturnAt || outstation.endDate;
  const start = startSrc ? new Date(startSrc) : null;
  const end = endSrc ? new Date(endSrc) : null;
  const fareTotal = Number(fare.total || 0);
  const days = outstation.days || 0;
  const nights = outstation.nights || 0;

  const destination =
    outstation.destinationAddress || booking.dropoff?.address || null;

  return (
    <>
      <div className={`bg-gradient-to-r ${meta.gradient} text-white px-5 py-5`}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
            <ModeIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-white/60 uppercase tracking-widest font-semibold">
              {isOutstation ? 'Round trip' : 'Scheduled ride'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold truncate">
                {booking.bookingNumber || `#${booking._id?.slice(-6)}`}
              </p>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  booking.bookingType === 'scheduled'
                    ? 'bg-indigo-400/30 text-white'
                    : 'bg-emerald-400/30 text-white'
                }`}
              >
                {booking.bookingType || 'instant'}
              </span>
              <span className="text-[10px] font-semibold uppercase text-white/70 capitalize">
                {booking.serviceType}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-1">
              Fare
            </p>
            <p className="text-lg font-extrabold text-primary">₹{fareTotal.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-1">
              Duration
            </p>
            <p className="text-lg font-extrabold">
              {isOutstation
                ? `${days}d · ${nights}n`
                : hourly.durationHours
                  ? `${hourly.durationHours}h`
                  : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-1">
              {isOutstation ? 'Departure' : 'Pickup'}
            </p>
            <p className="text-[11px] font-semibold leading-tight">
              {start ? formatDateTime12(start) : '—'}
            </p>
            {start ? (
              <p className="mt-0.5 text-[10px]">
                <Countdown to={start} />
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {(booking.zoneIds || []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {booking.zoneIds.map((z) => (
              <span
                key={z._id || z}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-semibold border border-indigo-100"
              >
                <MapPin className="w-2.5 h-2.5" />
                {z?.name || 'Zone'}
                {z?.city ? ` · ${z.city}` : ''}
              </span>
            ))}
          </div>
        ) : null}

        <section>
          <SectionLabel icon={RouteIcon}>Trip route</SectionLabel>
          <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/60 overflow-hidden">
            <div className="flex items-start gap-3 p-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pickup</p>
                <p className="text-sm text-slate-800 font-medium mt-0.5 leading-snug break-words">
                  {booking.pickup?.address || '—'}
                </p>
              </div>
            </div>
            {destination ? (
              <div className="flex items-start gap-3 p-4">
                <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    {isOutstation ? 'Destination' : 'Dropoff'}
                  </p>
                  <p className="text-sm text-slate-800 font-medium mt-0.5 leading-snug break-words">
                    {destination}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <SectionLabel icon={UserIcon}>Customer</SectionLabel>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DetailTile icon={UserIcon} label="Name">
              <span className="block truncate">{user.name || 'Unknown'}</span>
            </DetailTile>
            <DetailTile icon={Phone} label="Phone">
              {user.phone_no || '—'}
            </DetailTile>
            {user.email ? (
              <DetailTile icon={Mail} label="Email">
                <span className="block truncate">{user.email}</span>
              </DetailTile>
            ) : null}
          </div>
        </section>

        <section>
          <SectionLabel icon={CarIcon}>Customer vehicle</SectionLabel>
          {detailLoading && !vehicle ? (
            <p className="mt-2 text-xs text-slate-400">Loading vehicle details…</p>
          ) : vehicle ? (
            <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                {vehicle.image ? (
                  <img
                    src={vehicle.image}
                    alt={vehicle.label}
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <CarIcon className="w-6 h-6 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <p className="text-sm font-bold text-slate-900">{vehicle.label}</p>
                    {vehicle.plate ? (
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{vehicle.plate}</p>
                    ) : null}
                  </div>
                  {vehicle.type ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">Type</p>
                      <p className="text-xs font-semibold capitalize">{vehicle.type}</p>
                    </div>
                  ) : null}
                  {vehicle.fuel ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">Fuel</p>
                      <p className="text-xs font-semibold capitalize">{vehicle.fuel}</p>
                    </div>
                  ) : null}
                  {vehicle.transmission ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase">Transmission</p>
                      <p className="text-xs font-semibold capitalize">{vehicle.transmission}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400 italic">No vehicle linked to this booking</p>
          )}
        </section>

        <section>
          <SectionLabel icon={CalendarRange}>Trip details</SectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {isOutstation ? (
              <>
                <DetailTile icon={CalendarRange} label="Departure">
                  {start ? formatDateTime12(start) : '—'}
                </DetailTile>
                <DetailTile icon={Clock} label="Expected return">
                  {end ? formatDateTime12(end) : '—'}
                </DetailTile>
                {outstation.estimatedKm ? (
                  <DetailTile icon={RouteIcon} label="Est. distance">
                    {outstation.estimatedKm} km
                  </DetailTile>
                ) : null}
                <DetailTile icon={MapPin} label="Stay / food">
                  {outstation.needsStay ? 'Stay needed' : 'No stay'}
                  {' · '}
                  {outstation.needsFood ? 'Food needed' : 'No food'}
                </DetailTile>
              </>
            ) : (
              <>
                <DetailTile icon={CalendarClock} label="Scheduled pickup">
                  {start ? formatPickupDateTime(start) : '—'}
                </DetailTile>
                <DetailTile icon={Clock} label="Duration">
                  {hourly.durationHours ? `${hourly.durationHours} hours` : '—'}
                </DetailTile>
                {scheduled.tier ? (
                  <DetailTile icon={CalendarRange} label="Dispatch tier">
                    <span className="capitalize">{scheduled.tier.replace(/_/g, ' ')}</span>
                  </DetailTile>
                ) : null}
                {scheduled.assignAt ? (
                  <DetailTile icon={Clock} label="Assign at">
                    {formatDateTime12(scheduled.assignAt)}
                  </DetailTile>
                ) : null}
              </>
            )}
          </div>
          {bufferMinutes != null && isOutstation ? (
            <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex items-center gap-2 text-[11px] text-slate-500">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Conflict buffer: <strong className="text-slate-700">±{bufferMinutes} min</strong>
            </div>
          ) : null}
        </section>

        <section>
          <SectionLabel icon={Receipt}>Fare & payment</SectionLabel>
          <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2 text-sm">
            {fare.baseFare != null ? (
              <div className="flex justify-between">
                <span className="text-slate-500">Base fare</span>
                <span>₹{Number(fare.baseFare).toLocaleString('en-IN')}</span>
              </div>
            ) : null}
            {fare.extras != null && fare.extras > 0 ? (
              <div className="flex justify-between">
                <span className="text-slate-500">Extras</span>
                <span>₹{Number(fare.extras).toLocaleString('en-IN')}</span>
              </div>
            ) : null}
            {(Number(fare.couponDiscount) > 0 || fare.couponCode) && (
              <div className="flex justify-between text-amber-700">
                <span>
                  Coupon{fare.couponCode ? ` (${fare.couponCode})` : ''}
                </span>
                <span>
                  −₹{Number(fare.couponDiscount || 0).toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {fare.gst != null && fare.gst > 0 ? (
              <div className="flex justify-between">
                <span className="text-slate-500">GST</span>
                <span>₹{Number(fare.gst).toLocaleString('en-IN')}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="text-emerald-600">₹{fareTotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 pt-1">
              <span className="capitalize">{booking.paymentMethod || 'wallet'}</span>
              <span className="capitalize">{displayBookingPaymentStatus(booking)?.replace(/_/g, ' ') || '—'}</span>
            </div>
          </div>
        </section>

        {detailError ? (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {detailError}
          </div>
        ) : null}

        <ConflictBanner conflicts={vehicleConflicts} />
      </div>
    </>
  );
};

export default AssignBookingTripSummary;
