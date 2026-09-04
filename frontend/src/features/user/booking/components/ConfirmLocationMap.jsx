import { useCallback, useEffect, useRef, useState } from 'react';
import { MarkerF } from '@react-google-maps/api';
import { ArrowLeft, Loader2, LocateFixed, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import MapView from '../../../../components/maps/MapView';
import Button from '../../../../components/Button';
import { useGoogleMap } from '../../../../hooks/useGoogleMap';
import { reverseGeocode, isInsideIndiaBounds, isPointInIndia } from '../../../../utils/geocoding';

/**
 * "Where exactly should the driver come?" — the step between picking a place
 * and committing to it.
 *
 * Autocomplete returns a *place*, and a place is a centroid: pick "Vijay Nagar"
 * and you get the middle of the colony, not the gate you are standing at. That
 * gap is what produced a booking whose pickup sat a kilometre from the
 * customer, so every downstream distance — "1.2 km away", the arrival
 * geofence, the driver's ETA — was measured from the wrong end. No amount of
 * GPS accuracy fixes a pickup coordinate that was never where the customer is.
 *
 * So the coordinate is confirmed by the one party who actually knows: drag the
 * pin, read back the address, then commit.
 *
 * Two ways to move the pin, because people reach for both: drag the marker, or
 * pan the map under it. Both settle into the same `commitPoint`.
 */

const CONFIRM_ZOOM = 18;

/** Ignore sub-metre camera settles so panning does not spam the geocoder. */
const MIN_MOVE_DEGREES = 0.00002;

export default function ConfirmLocationMap({
  open,
  initialPoint,
  title = 'Confirm pickup point',
  confirmLabel = 'Confirm pickup',
  onConfirm,
  onBack,
}) {
  const { maps } = useGoogleMap();
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const resolveSeqRef = useRef(0);
  const suppressIdleRef = useRef(false);

  const [point, setPoint] = useState(initialPoint || null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!maps || geocoderRef.current) return;
    geocoderRef.current = new maps.Geocoder();
  }, [maps]);

  // Re-seed whenever the sheet hands over a different place. Guarded on `open`
  // so closing does not wipe the pin mid-animation.
  useEffect(() => {
    if (!open || !initialPoint) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot seed when the step opens
    setPoint(initialPoint);
  }, [open, initialPoint]);

  /**
   * Resolve a dragged/panned coordinate back into an address.
   *
   * The coordinate is applied immediately and the address catches up, so the
   * pin never lags the finger. `resolveSeqRef` drops the answer to a drag the
   * user has already moved on from.
   */
  const commitPoint = useCallback(
    async (lat, lng) => {
      if (!isInsideIndiaBounds(lat, lng)) {
        toast.error('Pickup must be inside India.', { id: 'confirm-india-only' });
        return;
      }

      const seq = ++resolveSeqRef.current;
      setPoint((prev) => ({ ...(prev || {}), lat, lng }));
      setResolving(true);

      const resolved = await reverseGeocode(maps, { lat, lng }, {
        geocoder: geocoderRef.current,
      });

      if (seq !== resolveSeqRef.current) return;
      setResolving(false);

      if (!isPointInIndia(resolved)) {
        toast.error('Pickup must be inside India.', { id: 'confirm-india-only' });
        return;
      }
      setPoint(resolved);
    },
    [maps],
  );

  const handleMarkerDragEnd = useCallback(
    (event) => {
      const lat = event?.latLng?.lat?.();
      const lng = event?.latLng?.lng?.();
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      // The marker drag pans the camera with it; letting `onIdle` fire too
      // would resolve the same coordinate twice.
      suppressIdleRef.current = true;
      commitPoint(lat, lng);
    },
    [commitPoint],
  );

  const handleIdle = useCallback(() => {
    if (suppressIdleRef.current) {
      suppressIdleRef.current = false;
      return;
    }
    const map = mapRef.current?.getMap?.();
    const center = map?.getCenter?.();
    if (!center) return;
    const lat = center.lat();
    const lng = center.lng();
    if (
      point
      && Math.abs(lat - point.lat) < MIN_MOVE_DEGREES
      && Math.abs(lng - point.lng) < MIN_MOVE_DEGREES
    ) {
      return;
    }
    commitPoint(lat, lng);
  }, [commitPoint, point]);

  const recenterOnPin = useCallback(() => {
    if (!point) return;
    suppressIdleRef.current = true;
    mapRef.current?.panTo?.({ lat: point.lat, lng: point.lng });
  }, [point]);

  if (!open || !point) return null;

  const address = point.address || 'Move the pin to set your exact pickup';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-text"
          aria-label="Back to search"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-text truncate">{title}</h2>
      </header>

      <div className="relative flex-1 min-h-0">
        <MapView
          ref={mapRef}
          center={{ lat: point.lat, lng: point.lng }}
          zoom={CONFIRM_ZOOM}
          height="100%"
          rounded={false}
          onIdle={handleIdle}
        >
          <MarkerF
            position={{ lat: point.lat, lng: point.lng }}
            draggable
            onDragEnd={handleMarkerDragEnd}
          />
        </MapView>

        <button
          type="button"
          onClick={recenterOnPin}
          className="absolute right-4 bottom-4 w-11 h-11 rounded-full bg-white shadow-lg border border-border flex items-center justify-center text-text hover:bg-gray-50"
          aria-label="Recentre on pin"
        >
          <LocateFixed className="w-5 h-5" />
        </button>
      </div>

      <div className="shrink-0 border-t border-border bg-white px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-primary/15 text-primary-dark flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">
              Pickup point
            </p>
            <p className="text-sm font-semibold text-text break-words">
              {address}
            </p>
            {point.city ? (
              <p className="text-[11px] text-text-muted">{point.city}</p>
            ) : null}
          </div>
          {resolving && (
            <Loader2 className="w-4 h-4 animate-spin text-text-muted shrink-0 mt-1" />
          )}
        </div>

        <p className="text-[11px] text-text-muted">
          Drag the pin or move the map so it sits exactly where your driver
          should arrive.
        </p>

        <Button
          fullWidth
          disabled={resolving}
          onClick={() => onConfirm?.(point)}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
