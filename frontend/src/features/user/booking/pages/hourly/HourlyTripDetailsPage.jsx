import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Crosshair,
  Loader2,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import Button from '../../../../../components/Button';
import OutOfServiceDialog from '../../../../../components/dialogs/OutOfServiceDialog';
import { useGoogleMaps } from '../../../../../hooks/useGoogleMaps';
import { useGeolocation } from '../../../../../hooks/useGeolocation';
import { useNearbyDrivers } from '../../../../../hooks/useNearbyDrivers';
import { useDriverMarkers } from '../../../../../hooks/useDriverMarkers';
import { useZoneCheck } from '../../../../../hooks/useZoneCheck';
import { reverseGeocode } from '../../../../../utils/geocoding';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  GOOGLE_MAP_ID,
} from '../../../../../constants/mapDefaults';
import {
  PIN_ASSETS,
  RAPIDO_MAP_OPTIONS,
  createImageMarkerContent,
} from '../../../../../constants/mapTheme';
import { debounce } from '../../../../../utils/debounce';
import useBookingDraftStore from '../../../../../store/user/useBookingDraftStore';
import CarPickerSheet from '../../components/CarPickerSheet';
import LocationPickerSheet from '../../components/LocationPickerSheet';

const NEARBY_RADIUS_METERS = 2000;
const NEARBY_LIMIT = 6;

/**
 * Hourly booking — Step 2.
 *
 * Rapido-style screen: a full-bleed map with a pickup pin at the centre, a
 * top pill showing the currently selected pickup, and a bottom card with the
 * car selector + continue button.
 *
 * Hourly bookings do not capture a drop-off location: the driver stays with
 * the user for the booked duration. The pickup defaults to the user's
 * current location (the most common case) and can be overridden from the
 * `LocationPickerSheet` (search, current location, or saved places).
 */
const HourlyTripDetailsPage = () => {
  const navigate = useNavigate();
  const draftPickup = useBookingDraftStore((s) => s.pickup);
  const carId = useBookingDraftStore((s) => s.carId);
  const setPickup = useBookingDraftStore((s) => s.setPickup);
  const setDropoff = useBookingDraftStore((s) => s.setDropoff);
  const setCarId = useBookingDraftStore((s) => s.setCarId);

  const { maps, AdvancedMarkerElement, ready, error } = useGoogleMaps();
  const { coords, loading: locating, error: geoError, refresh } = useGeolocation();

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const autoCenteredRef = useRef(Boolean(draftPickup));
  const setPickupPointRef = useRef(null);
  const mapsRef = useRef(maps);

  const [pickup, setLocalPickup] = useState(draftPickup);
  const [geocoding, setGeocoding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [outOfServiceOpen, setOutOfServiceOpen] = useState(false);

  const resolvePoint = useCallback(
    async ({ lat, lng }) => {
      setGeocoding(true);
      try {
        return await reverseGeocode(maps, { lat, lng }, { geocoder: geocoderRef.current });
      } finally {
        setGeocoding(false);
      }
    },
    [maps],
  );

  const moveMapTo = useCallback(({ lat, lng }, zoom = 16) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo({ lat, lng });
    mapInstanceRef.current.setZoom(zoom);
  }, []);

  const setPickupPoint = useCallback(
    (point) => {
      setLocalPickup(point);
      if (markerRef.current) {
        markerRef.current.position = { lat: point.lat, lng: point.lng };
      }
    },
    [],
  );

  setPickupPointRef.current = setPickupPoint;
  mapsRef.current = maps;

  const debouncedMapGeocodeRef = useRef(null);
  if (!debouncedMapGeocodeRef.current) {
    debouncedMapGeocodeRef.current = debounce(async (lat, lng) => {
      const point = await reverseGeocode(
        mapsRef.current,
        { lat, lng },
        { geocoder: geocoderRef.current },
      );
      if (point) setPickupPointRef.current?.(point);
    }, 500);
  }

  /* ---- Nearby drivers (live) -------------------------------------- */

  const driversCenter = useMemo(() => {
    if (pickup?.lat && pickup?.lng) return { lat: pickup.lat, lng: pickup.lng };
    if (coords) return { lat: coords.lat, lng: coords.lng };
    return null;
  }, [pickup, coords]);

  const { drivers: nearbyDrivers } = useNearbyDrivers({
    center: driversCenter,
    radiusMeters: NEARBY_RADIUS_METERS,
    limit: NEARBY_LIMIT,
    enabled: Boolean(driversCenter),
  });

  useDriverMarkers(mapInstance, nearbyDrivers);

  /* ---- Service-area zone check ------------------------------------ */

  // The check runs in the background as the user picks pickup, but its
  // verdict is *only* surfaced when the user presses Continue — keeps the
  // selection step distraction-free.
  const zoneCheck = useZoneCheck(pickup, { enabled: Boolean(pickup?.lat && pickup?.lng) });
  const isOutOfService = zoneCheck.status === 'uncovered';

  // Initialise the map once Google Maps is ready.
  useEffect(() => {
    if (!ready || !maps || !mapRef.current || mapInstanceRef.current) return;
    const center = draftPickup
      ? { lat: draftPickup.lat, lng: draftPickup.lng }
      : DEFAULT_MAP_CENTER;

    const map = new maps.Map(mapRef.current, {
      ...RAPIDO_MAP_OPTIONS,
      center,
      zoom: draftPickup ? 16 : DEFAULT_MAP_ZOOM,
      mapId: GOOGLE_MAP_ID,
    });
    mapInstanceRef.current = map;
    setMapInstance(map);
    geocoderRef.current = new maps.Geocoder();

    const marker = new AdvancedMarkerElement({
      map,
      position: center,
      gmpDraggable: true,
      content: createImageMarkerContent(PIN_ASSETS.PICKUP, {
        size: 52,
        alt: 'Pickup location',
      }),
      zIndex: 6,
    });
    markerRef.current = marker;

    const reverseToPickup = async (lat, lng) => {
      const point = await reverseGeocode(maps, { lat, lng }, { geocoder: geocoderRef.current });
      if (point) setPickupPoint(point);
    };

    marker.addListener('dragend', async () => {
      const pos = marker.position;
      const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
      const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
      await reverseToPickup(lat, lng);
    });

    map.addListener('click', (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      moveMapTo({ lat, lng });
      if (markerRef.current) markerRef.current.position = { lat, lng };
      debouncedMapGeocodeRef.current(lat, lng);
    });

    // Hydrate the address if the draft was just coordinates.
    if (draftPickup && !draftPickup.address) {
      reverseToPickup(draftPickup.lat, draftPickup.lng);
    }

    return () => {
      debouncedMapGeocodeRef.current.cancel();
    };
  }, [ready, maps, AdvancedMarkerElement, draftPickup, moveMapTo, setPickupPoint]);

  // Once we have the geolocation, snap to it (unless the user already has a
  // pickup or has manually moved the marker).
  useEffect(() => {
    if (!ready || !coords || autoCenteredRef.current) return;
    autoCenteredRef.current = true;
    moveMapTo({ lat: coords.lat, lng: coords.lng });
    if (markerRef.current) {
      markerRef.current.position = { lat: coords.lat, lng: coords.lng };
    }
    (async () => {
      const point = await reverseGeocode(
        maps,
        { lat: coords.lat, lng: coords.lng },
        { geocoder: geocoderRef.current },
      );
      if (point) setPickupPoint(point);
    })();
  }, [coords, ready, maps, moveMapTo, setPickupPoint]);

  const handleSelectFromSheet = (point) => {
    setPickupPoint(point);
    moveMapTo({ lat: point.lat, lng: point.lng });
  };

  // Used by LocationPickerSheet's "Use my current location" button. Returns the
  // reverse-geocoded point so the sheet can hand it back to us.
  const handleUseCurrentLocation = useCallback(async () => {
    if (!coords) {
      refresh();
      return null;
    }
    const point = await resolvePoint({ lat: coords.lat, lng: coords.lng });
    return point;
  }, [coords, resolvePoint, refresh]);

  const handleRecenter = useCallback(async () => {
    if (!coords) {
      refresh();
      return;
    }
    moveMapTo({ lat: coords.lat, lng: coords.lng });
    const point = await resolvePoint({ lat: coords.lat, lng: coords.lng });
    if (point) setPickupPoint(point);
  }, [coords, refresh, moveMapTo, resolvePoint, setPickupPoint]);

  const canContinue = useMemo(() => Boolean(pickup?.address && carId), [pickup, carId]);

  const handleConfirm = () => {
    if (!canContinue) return;
    // Defer the zone verdict to this exact moment — if we're outside our
    // service area, block the navigation and surface the modal instead.
    if (isOutOfService) {
      setOutOfServiceOpen(true);
      return;
    }
    setPickup(pickup);
    // Hourly trips end where they start; mirror dropoff to keep the backend
    // payload consistent without exposing it to the user.
    setDropoff(pickup);
    navigate('/user/book/hourly/slab');
  };

  const pickupLine = pickup?.address || 'Detecting your location…';

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh relative">
      {/* Map fills the screen behind the floating UI */}
      <div className="absolute inset-0">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-3 max-w-md text-center">
              {error}
            </div>
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-full" />
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-gray-50">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        )}
      </div>

      {/* Top floating back button + location pill */}
      <div className="relative z-10 pt-3 px-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-3 rounded-2xl bg-white shadow-lg px-3 py-3 text-left hover:bg-gray-50 transition active:scale-[0.99]"
        >
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-wide font-semibold text-text-muted">
              Pickup location
            </span>
            <span className="flex items-center gap-1.5">
              <span className="block text-sm font-semibold text-text truncate">
                {pickupLine}
              </span>
              {(geocoding || locating) && (
                <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin shrink-0" />
              )}
            </span>
          </span>
          <ChevronRight className="w-5 h-5 text-text-muted shrink-0" />
        </button>

        {geoError && !pickup?.address && (
          <p className="text-[11px] text-text-muted bg-white/80 backdrop-blur rounded-xl px-3 py-2">
            {geoError} — drag the pin or search to choose your pickup.
          </p>
        )}
      </div>

      {/* Recenter FAB above the bottom card */}
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute z-10 right-4 bottom-[270px] w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 disabled:opacity-50"
        disabled={locating}
        aria-label="Recenter to my location"
      >
        {locating ? (
          <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        ) : (
          <Crosshair className="w-5 h-5 text-text-secondary" />
        )}
      </button>

      {/* Bottom card */}
      <div className="relative z-10 mt-auto bg-white border-t border-border-light rounded-t-3xl shadow-2xl px-4 pt-4 pb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text">Choose your car</h3>
            <p className="text-[11px] text-text-muted">
              Pick which vehicle the driver should drive.
            </p>
          </div>
        </div>

        <CarPickerSheet selectedId={carId} onSelect={setCarId} />

        <Button fullWidth disabled={!canContinue} onClick={handleConfirm}>
          Continue
        </Button>
      </div>

      <LocationPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Pickup location"
        onSelect={handleSelectFromSheet}
        onRequestCurrentLocation={handleUseCurrentLocation}
        currentLocationLoading={locating}
        currentLocationError={geoError}
        currentPickup={pickup}
      />

      <OutOfServiceDialog
        open={outOfServiceOpen}
        onClose={() => setOutOfServiceOpen(false)}
        onChangeLocation={() => setPickerOpen(true)}
        locationLabel={pickup?.address || ''}
        cityHint={pickup?.city || ''}
      />
    </div>
  );
};

export default HourlyTripDetailsPage;
