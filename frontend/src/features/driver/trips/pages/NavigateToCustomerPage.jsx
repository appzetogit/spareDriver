import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MessageSquare, Footprints, Bike, Car, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import { useDriverLocationStatus } from '../../../../hooks/useDriverLocation';
import { formatDistance, estimateEtaMinutes, haversineMeters } from '../../../../utils/geo';
import { BOOKING_STATUS, isBookingContactRevealed } from '../../../../constants/bookingStatus';
import { maskPersonName } from '../../../../utils/formatters';

/**
 * Driver-side "navigate to customer" screen — replaces the static mock
 * with the production trip-tracking map. Pulls the active trip from
 * `useDriverActiveTripStore`, the driver's own coordinates from the
 * shared live GPS bridge, and the customer's pickup from the booking.
 */
const NavigateToCustomerPage = () => {
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

  const { distanceMeters, etaMinutes } = useMemo(() => {
    if (!driverPoint || !pickupPoint) return { distanceMeters: null, etaMinutes: null };
    const d = haversineMeters(driverPoint, pickupPoint);
    return { distanceMeters: d, etaMinutes: estimateEtaMinutes(d) };
  }, [driverPoint, pickupPoint]);

  const customer = typeof booking?.userId === 'object' ? booking.userId : null;
  const contactRevealed = isBookingContactRevealed(booking);
  const customerName = contactRevealed
    ? customer?.name || null
    : maskPersonName(customer?.name) || 'Customer';
  const customerPhone = contactRevealed
    ? customer?.phone_no || customer?.phone || null
    : null;
  const customerPhoto = customer?.profilePicture || null;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-3 shadow-sm">
        <h1 className="text-lg font-bold">Navigate to Customer</h1>
        {distanceMeters != null && etaMinutes != null ? (
          <p className="text-xs text-text-muted mt-0.5">
            {formatDistance(distanceMeters)} · ~{etaMinutes} min to pickup
          </p>
        ) : (
          <p className="text-xs text-text-muted mt-0.5">Locating pickup…</p>
        )}
      </div>

      {pickupPoint ? (
        <TripTrackingMap
          driver={driverPoint}
          pickup={pickupPoint}
          height={240}
          showRoute
          emphasis="pickup"
          bookingStatus={BOOKING_STATUS.EN_ROUTE}
        />
      ) : (
        <div className="h-56 bg-[#f4efe6] flex items-center justify-center">
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
              <h3 className="font-bold text-text truncate">{customerName || 'Customer'}</h3>
              <p className="text-xs text-text-muted truncate">
                {customerPhone ||
                  (contactRevealed
                    ? booking?.bookingNumber || '—'
                    : 'Contact unlocks when you start heading to pickup')}
              </p>
            </div>
          </div>
          <div className="flex gap-3 mb-4">
            <Button
              variant="secondary"
              size="md"
              className="flex-1"
              icon={Phone}
              disabled={!customerPhone}
              onClick={() => {
                if (customerPhone) {
                  window.location.href = `tel:+91${String(customerPhone).replace(/\D/g, '')}`;
                }
              }}
            >
              Call
            </Button>
            <Button variant="secondary" size="md" className="flex-1" icon={MessageSquare}>Message</Button>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-2">Travel Mode</p>
            <div className="flex gap-2">
              {[
                { icon: Footprints, label: 'Walk' },
                { icon: Bike, label: 'Bike' },
                { icon: Car, label: 'Car' },
              ].map((mode, i) => (
                <button
                  key={mode.label}
                  type="button"
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs transition-colors
                    ${i === 2 ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-text-muted'}`}
                >
                  <mode.icon className="w-4 h-4" />
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {booking?.pickup?.address ? (
          <Card>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Pickup address</p>
            <p className="text-sm font-medium text-text mt-0.5 break-words">
              {booking.pickup.address}
            </p>
          </Card>
        ) : null}

        <Button fullWidth variant="success" onClick={() => navigate('/driver/trip/arrived')}>
          I&apos;ve arrived
        </Button>
      </div>
    </div>
  );
};

export default NavigateToCustomerPage;
