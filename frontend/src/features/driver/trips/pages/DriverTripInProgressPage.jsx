import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Phone, Navigation, Headphones, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import { useGeolocation } from '../../../../hooks/useGeolocation';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import SosEmergencyButton from '../../../user/tracking/components/SosEmergencyButton';
import { BOOKING_STATUS } from '../../../../constants/bookingStatus';

/**
 * Driver-side trip-in-progress screen — replaces the legacy mock with the
 * real, live booking the driver is actually on. The header subtitle now
 * reflects the booking's actual service type and duration, and the running
 * clock anchors on `timeline.startedAt` so a page refresh during the ride
 * resumes from the right time.
 */
const DriverTripInProgressPage = () => {
  const navigate = useNavigate();
  const booking = useDriverActiveTripStore((s) => s.booking);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const { coords: driverCoords } = useGeolocation({ enabled: true });
  const driverPoint = useMemo(() => {
    if (!driverCoords) return null;
    return { lat: driverCoords.lat, lng: driverCoords.lng };
  }, [driverCoords]);

  const pickupPoint = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  const dropPoint = useMemo(() => {
    const c = booking?.outstation?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.outstation]);

  // Live elapsed-time clock anchored on the real start timestamp.
  const startedAtMs = useMemo(() => {
    const ts = booking?.timeline?.startedAt;
    return ts ? new Date(ts).getTime() : null;
  }, [booking?.timeline?.startedAt]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = useMemo(() => {
    if (!startedAtMs) return 0;
    return Math.max(0, Math.floor((now - startedAtMs) / 1000));
  }, [startedAtMs, now]);

  const formatClock = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const subtitle = useMemo(() => {
    if (!booking?.serviceType) return 'Live Trip';
    const label = SERVICE_TYPE_LABELS[booking.serviceType] || 'Trip';
    if (booking.serviceType === SERVICE_TYPES.HOURLY && booking.hourly?.durationHours) {
      return `${label} · ${booking.hourly.durationHours}h`;
    }
    if (booking.serviceType === SERVICE_TYPES.OUTSTATION && booking.outstation?.days) {
      return `${label} · ${booking.outstation.days}d`;
    }
    return label;
  }, [booking]);

  const customer = typeof booking?.userId === 'object' ? booking.userId : null;
  const customerPhone = customer?.phone_no || customer?.phone || null;
  const customerCallHref = customerPhone
    ? `tel:+91${String(customerPhone).replace(/\D/g, '')}`
    : null;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-dark px-4 pt-4 pb-6 rounded-b-3xl text-center">
        <p className="text-white/60 text-xs mb-1">Trip in Progress</p>
        <p className="text-4xl font-bold text-white font-mono tracking-wider">
          {formatClock(elapsedSec)}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-white/80 text-xs">{subtitle}</span>
        </div>
      </div>

      {pickupPoint ? (
        <TripTrackingMap
          driver={driverPoint}
          pickup={pickupPoint}
          dropoff={dropPoint}
          height={200}
          showRoute
          followDriver
          emphasis="driver"
          className="mx-3 mt-3"
          bookingStatus={booking?.status || BOOKING_STATUS.STARTED}
        />
      ) : (
        <div className="h-48 bg-[#f4efe6] mx-3 mt-3 rounded-2xl flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      <div className="flex-1 p-4 space-y-4">
        <Card className="animate-fade-in-up">
          <Button fullWidth variant="danger" onClick={() => navigate('/driver/trip/completed')}>
            END TRIP
          </Button>
        </Card>
        {booking?._id ? (
          <div className="flex justify-center">
            <SosEmergencyButton
              tripId={booking._id}
              bookingStatus={booking.status || BOOKING_STATUS.STARTED}
              className="w-full h-12 text-sm"
            />
          </div>
        ) : null}
        <div className="flex gap-3 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <button
            type="button"
            disabled={!customerCallHref}
            onClick={() => {
              if (customerCallHref) window.location.href = customerCallHref;
            }}
            className="flex-1 flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl shadow-card disabled:opacity-50"
          >
            <Phone className="w-5 h-5 text-text-secondary" />
            <span className="text-[10px] text-text-muted">Call</span>
          </button>
          <button
            type="button"
            className="flex-1 flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl shadow-card"
          >
            <Navigation className="w-5 h-5 text-text-secondary" />
            <span className="text-[10px] text-text-muted">Navigation</span>
          </button>
          <button
            type="button"
            className="flex-1 flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl shadow-card"
          >
            <Headphones className="w-5 h-5 text-text-secondary" />
            <span className="text-[10px] text-text-muted">Support</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverTripInProgressPage;
