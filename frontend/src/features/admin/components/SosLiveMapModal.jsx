import { useEffect, useMemo, useState } from 'react';
import TripTrackingMap from '../../../components/maps/TripTrackingMap';
import Modal from '../../../components/Modal';
import { useSocketEvent } from '../../../hooks/useSocket';
import { SOS_SOCKET_EVENTS } from '../../../constants/sos';

const SosLiveMapModal = ({ alert, isOpen, onClose }) => {
  const [liveLocation, setLiveLocation] = useState(alert?.currentLocation || null);
  const [driverPoint, setDriverPoint] = useState(null);

  useEffect(() => {
    setLiveLocation(alert?.currentLocation || null);
  }, [alert?.currentLocation, alert?._id]);

  useSocketEvent(SOS_SOCKET_EVENTS.SOS_LOCATION, (payload) => {
    if (!alert || String(payload.sosId) !== String(alert._id)) return;
    setLiveLocation({
      lat: payload.latitude ?? payload.currentLocation?.lat,
      lng: payload.longitude ?? payload.currentLocation?.lng,
    });
  });

  const pickupPoint = useMemo(() => {
    if (!liveLocation) return null;
    return { lat: liveLocation.lat, lng: liveLocation.lng };
  }, [liveLocation]);

  const passengerPoint = pickupPoint;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Live SOS Map" size="2xl">
      <div className="p-4 space-y-4">
        {passengerPoint ? (
          <TripTrackingMap
            driver={driverPoint || passengerPoint}
            pickup={passengerPoint}
            height={360}
            showRoute={false}
            followDriver
            emphasis="driver"
          />
        ) : (
          <div className="h-72 bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-500">
            Waiting for location updates…
          </div>
        )}

        {alert?.timeline?.length ? (
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-3">Timeline</p>
            <ul className="space-y-2">
              {alert.timeline.map((item, idx) => (
                <li key={`${item.event}-${idx}`} className="text-sm text-gray-600 flex gap-2">
                  <span className="text-gray-400 font-mono text-xs whitespace-nowrap">
                    {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span>{item.label || item.event}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default SosLiveMapModal;
