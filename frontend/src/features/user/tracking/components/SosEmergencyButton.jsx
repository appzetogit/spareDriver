import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldAlert } from 'lucide-react';
import SosConfirmationModal from './SosConfirmationModal';
import { useGeolocation } from '../../../../hooks/useGeolocation';
import { useActiveSos } from '../../../../hooks/useActiveSos';
import { SOS_ELIGIBLE_BOOKING_STATUSES } from '../../../../constants/sos';

/**
 * Prominent red SOS control for active trips. Shows confirmation before
 * dispatching and streams location while an alert is active.
 */
const SosEmergencyButton = ({ tripId, bookingStatus, className = '' }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const eligible = SOS_ELIGIBLE_BOOKING_STATUSES.includes(bookingStatus);
  const { coords, loading: geoLoading } = useGeolocation({ enabled: eligible });
  const {
    activeSos,
    isSosActive,
    loading: sosLoading,
    triggerSos,
    startLocationStreaming,
  } = useActiveSos(tripId, { enabled: eligible });

  const resolveCoords = useCallback(() => {
    if (coords) return Promise.resolve(coords);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
      );
    });
  }, [coords]);

  useEffect(() => {
    if (!isSosActive) return undefined;
    startLocationStreaming(resolveCoords);
    return undefined;
  }, [isSosActive, startLocationStreaming, resolveCoords]);

  if (!eligible) return null;

  const handleSendSos = async () => {
    try {
      const position = await resolveCoords();
      if (!position) {
        toast.error('Enable location access to send SOS');
        return;
      }
      await triggerSos(position.lat, position.lng);
      toast.success('SOS sent. Help is on the way.');
      setModalOpen(false);
    } catch (err) {
      const message = err?.response?.data?.message || 'Could not send SOS';
      toast.error(message);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={isSosActive}
        className={`flex items-center justify-center gap-2 rounded-full font-bold text-white shadow-lg active:scale-95 transition ${
          isSosActive
            ? 'bg-red-400 cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-700 animate-pulse'
        } ${className}`}
        aria-label="Emergency SOS"
      >
        <ShieldAlert className="w-5 h-5" />
        <span>{isSosActive ? 'SOS Active' : 'SOS'}</span>
      </button>

      <SosConfirmationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSendSos={handleSendSos}
        onCallEmergency={() => setModalOpen(false)}
        loading={sosLoading || geoLoading}
      />

      {isSosActive && activeSos ? (
        <p className="text-[11px] text-red-600 font-medium text-center mt-1">
          Emergency services notified · location sharing active
        </p>
      ) : null}
    </>
  );
};

export default SosEmergencyButton;
