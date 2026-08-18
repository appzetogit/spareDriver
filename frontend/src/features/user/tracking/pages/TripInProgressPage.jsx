import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, DollarSign, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { useTripDriverLocation } from '../../../../hooks/useTripDriverLocation';
import useAppResumeSync from '../../../../hooks/useAppResumeSync';
import { BOOKING_STATUS } from '../../../../constants/bookingStatus';
import { formatDistance, haversineMeters } from '../../../../utils/geo';
import { SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import SosEmergencyButton from '../components/SosEmergencyButton';

/**
 * Live "trip in progress" screen — shows the driver gliding along the
 * route, a running ride clock and the latest fare snapshot pulled from
 * the active booking. Replaces the previous dummy-driven mock.
 */
const TripInProgressPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  // Coming back from the background: reconnect the socket and re-read the
  // booking, rather than waiting on reconnect backoff.
  useAppResumeSync(fetchActive);

  const { driver: liveDriver, isStale: driverLocationStale } =
    useTripDriverLocation(booking?._id);

  const pickupPoint = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  const dropPoint = useMemo(() => {
    const c = booking?.dropoff?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.dropoff]);

  const driverPoint = useMemo(() => {
    if (!liveDriver) return null;
    return { lat: liveDriver.lat, lng: liveDriver.lng, heading: liveDriver.heading };
  }, [liveDriver]);

  // Live ride clock — anchored on `timeline.startedAt` when available, so
  // a page refresh during the ride continues from the right elapsed time.
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

  useEffect(() => {
    if (!booking?.status) return;
    if (booking.status === BOOKING_STATUS.COMPLETED) {
      const id = booking?._id;
      navigate(
        id
          ? `/user/tracking/completed?bookingId=${id}`
          : '/user/tracking/completed',
        { replace: true },
      );
    } else if (booking.status === BOOKING_STATUS.CANCELLED) {
      navigate('/user/home', { replace: true });
    }
  }, [booking?.status, booking?._id, navigate]);

  const formatTime = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const totalFare = booking?.fareSnapshot?.total || 0;
  const minutesElapsed = Math.floor(elapsedSec / 60);
  const tripDistance = useMemo(() => {
    if (driverPoint && pickupPoint) return haversineMeters(driverPoint, pickupPoint);
    return null;
  }, [driverPoint, pickupPoint]);

  const tripLabel =
    booking?.serviceType && SERVICE_TYPE_LABELS[booking.serviceType]
      ? `${SERVICE_TYPE_LABELS[booking.serviceType]} trip`
      : 'Trip in progress';

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {pickupPoint ? (
        <TripTrackingMap
          driver={driverPoint}
          pickup={pickupPoint}
          dropoff={dropPoint}
          height={224}
          showRoute
          followDriver
          emphasis="driver"
          bookingStatus={booking?.status || BOOKING_STATUS.STARTED}
          isStale={driverLocationStale}
        />
      ) : (
        <div className="h-56 bg-[#f4efe6] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      <div className="flex-1 -mt-8 z-10 px-4 space-y-4">
        <Card className="text-center animate-fade-in-up">
          <p className="text-sm text-text-muted mb-1">{tripLabel}</p>
          <p className="text-4xl font-bold text-text font-mono tracking-wider">
            {formatTime(elapsedSec)}
          </p>
          {booking?.bookingNumber ? (
            <p className="text-[11px] text-text-muted mt-1 font-mono">
              {booking.bookingNumber}
            </p>
          ) : null}
        </Card>

        <div className="grid grid-cols-3 gap-3 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <Card className="text-center !p-3">
            <MapPin className="w-5 h-5 text-info mx-auto mb-1" />
            <p className="text-lg font-bold">
              {tripDistance != null ? formatDistance(tripDistance).replace(' km', '').replace(' m', '') : '—'}
            </p>
            <p className="text-[10px] text-text-muted">
              {tripDistance != null && tripDistance >= 1000 ? 'km' : 'm'}
            </p>
          </Card>
          <Card className="text-center !p-3">
            <Clock className="w-5 h-5 text-warning mx-auto mb-1" />
            <p className="text-lg font-bold">{minutesElapsed}</p>
            <p className="text-[10px] text-text-muted">minutes</p>
          </Card>
          <Card className="text-center !p-3">
            <DollarSign className="w-5 h-5 text-success mx-auto mb-1" />
            <p className="text-lg font-bold">₹{totalFare}</p>
            <p className="text-[10px] text-text-muted">fare</p>
          </Card>
        </div>

        <Button fullWidth variant="danger" onClick={() => navigate('/user/tracking/completed')}>
          View Trip Summary
        </Button>

        {booking?._id ? (
          <div className="flex justify-center pt-2">
            <SosEmergencyButton
              tripId={booking._id}
              bookingStatus={booking.status || BOOKING_STATUS.STARTED}
              className="w-full max-w-xs h-12 text-sm"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TripInProgressPage;
