import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Car, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import { useDriverLocationStatus } from '../../../../hooks/useDriverLocation';
import { BOOKING_STATUS } from '../../../../constants/bookingStatus';

/**
 * "You've arrived at pickup" — driver-side companion of the customer's
 * `DriverReachedPage`. Renders the real customer name, vehicle and
 * booking number from the active-trip store.
 */
const ArrivedStartTripPage = () => {
  const navigate = useNavigate();
  const booking = useDriverActiveTripStore((s) => s.booking);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const { coords: driverCoords } = useDriverLocationStatus();
  const driverPoint = useMemo(() => {
    if (!driverCoords) return null;
    return { lat: driverCoords.lat, lng: driverCoords.lng };
  }, [driverCoords]);

  const pickupPoint = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  const customer = typeof booking?.userId === 'object' ? booking.userId : null;
  const customerName = customer?.name || null;
  const customerPhoto = customer?.profilePicture || null;
  const vehiclePlate = booking?.vehicle?.vehicleNumber || booking?.car?.vehicleNumber || null;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {pickupPoint ? (
        <div className="relative">
          <TripTrackingMap
            driver={driverPoint}
            pickup={pickupPoint}
            height={192}
            showRoute={false}
            emphasis="pickup"
            bookingStatus={BOOKING_STATUS.ARRIVED}
          />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-success/90 backdrop-blur-sm px-5 py-2.5 rounded-2xl shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-white" />
              <span className="text-white font-medium text-sm">You have arrived at pickup</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-48 bg-[#f4efe6] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      <div className="flex-1 p-4 -mt-4 z-10 space-y-4">
        <Card className="animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <Avatar
              src={customerPhoto}
              name={customerName || 'Customer'}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold truncate">{customerName || 'Customer'}</h3>
              <p className="text-xs text-text-muted truncate">
                {vehiclePlate || booking?.bookingNumber || '—'}
              </p>
            </div>
          </div>
          <div className="p-3 bg-bg rounded-xl mb-3">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted">Driving customer&apos;s car</p>
                <p className="text-sm font-medium">Please drive safely</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-text-muted text-center">
            Ask the customer for the OTP and verify before starting the trip.
          </p>
        </Card>
        <Button fullWidth variant="success" onClick={() => navigate('/driver/trip/in-progress')}>
          START TRIP
        </Button>
      </div>
    </div>
  );
};

export default ArrivedStartTripPage;
