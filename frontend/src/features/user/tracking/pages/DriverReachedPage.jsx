import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Phone, MessageSquare, CheckCircle, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { useFirebaseDriverLocations } from '../../../../hooks/useFirebaseDriverLocations';
import { BOOKING_STATUS } from '../../../../constants/bookingStatus';
import { maskPersonName } from '../../../../utils/formatters';

/**
 * "Driver has arrived" screen — same layout as `DriverOnWayPage`, but
 * with the in-trip OTP and the start-trip CTA front-and-centre. Real
 * booking data is pulled from `useUserActiveBookingStore`.
 */
const DriverReachedPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const driverObj = typeof booking?.driverId === 'object' ? booking?.driverId : null;
  const driverId = driverObj?._id || (typeof booking?.driverId === 'string' ? booking.driverId : null);
  const { map: liveDrivers } = useFirebaseDriverLocations();
  const liveDriver = driverId ? liveDrivers[String(driverId)] : null;

  const pickupPoint = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  const driverPoint = useMemo(() => {
    if (!liveDriver) return null;
    return { lat: liveDriver.lat, lng: liveDriver.lng, heading: liveDriver.heading };
  }, [liveDriver]);

  useEffect(() => {
    if (!booking?.status) return;
    if (booking.status === BOOKING_STATUS.STARTED) {
      // In-progress UX now lives on the assigned page (it shows the
      // live map for STARTED too) — id-scoped so refresh keeps the
      // same booking even when the user has multiple active rides.
      const target = booking._id
        ? `/user/book/assigned/${booking._id}`
        : '/user/book/assigned';
      navigate(target, { replace: true });
    } else if (booking.status === BOOKING_STATUS.COMPLETED) {
      const id = booking?._id;
      navigate(
        id
          ? `/user/tracking/completed?bookingId=${id}`
          : '/user/tracking/completed',
        { replace: true },
      );
    }
  }, [booking?.status, booking?._id, navigate]);

  const driverName = driverObj?.name || 'Your driver';
  const displayDriverName = maskPersonName(driverName) || 'Your driver';
  const driverRating = driverObj?.rating;
  const otpCode = booking?.rideStartOtp?.code;
  const driverPhone = driverObj?.phone_no || driverObj?.phone || null;
  const driverCallHref = driverPhone
    ? `tel:+91${String(driverPhone).replace(/\D/g, '')}`
    : null;

  useEffect(() => {
    // Contact is stripped until arrived — refetch once so Call works.
    if (
      booking?.status === BOOKING_STATUS.ARRIVED &&
      driverObj &&
      !driverPhone
    ) {
      fetchActive().catch(() => {});
    }
  }, [booking?.status, driverObj, driverPhone, fetchActive]);

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {pickupPoint ? (
        <div className="relative">
          <TripTrackingMap
            driver={driverPoint}
            pickup={pickupPoint}
            height={256}
            showRoute={false}
            emphasis="driver"
            bookingStatus={booking?.status || BOOKING_STATUS.ARRIVED}
          />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-success/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-white" />
              <span className="text-white font-medium text-sm">Driver has arrived</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-64 bg-[#f4efe6] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      <div className="flex-1 -mt-6 z-10">
        <Card className="mx-4">
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={driverName} size="lg" online={!!liveDriver} />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-text truncate">{displayDriverName}</h3>
              {driverRating ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3.5 h-3.5 text-primary fill-primary" />
                  <span className="text-sm">{driverRating}</span>
                </div>
              ) : null}
            </div>
          </div>

          {otpCode ? (
            <div className="rounded-2xl bg-primary/10 border border-primary/30 px-4 py-3 mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Ride OTP</p>
                <p className="text-2xl font-bold text-primary-dark font-mono tracking-[0.4em]">
                  {otpCode}
                </p>
              </div>
              <p className="text-[11px] text-text-muted max-w-[140px] text-right leading-snug">
                Share this with the driver to start the trip.
              </p>
            </div>
          ) : null}

          <div className="flex gap-3 mb-2">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              icon={Phone}
              disabled={!driverCallHref}
              onClick={() => {
                if (driverCallHref) window.location.href = driverCallHref;
              }}
            >
              Call
            </Button>
            <Button variant="secondary" size="md" className="flex-1" icon={MessageSquare}>Message</Button>
          </div>
        </Card>

        <div className="px-4 mt-4">
          <Button
            fullWidth
            variant="success"
            disabled={!booking}
            onClick={() => navigate('/user/tracking/in-progress')}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DriverReachedPage;
