import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Navigation,
  Car as CarIcon,
  Plus,
  Check,
} from 'lucide-react';
import Button from '../../../../components/Button';
import { useGoogleMaps } from '../../../../hooks/useGoogleMaps';
import { useMapPlaceSearch } from '../../../../hooks/useMapPlaceSearch';
import { debounce } from '../../../../utils/debounce';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  GOOGLE_MAP_ID,
} from '../../../../constants/mapDefaults';
import {
  PIN_ASSETS,
  RAPIDO_MAP_OPTIONS,
  createImageMarkerContent,
} from '../../../../constants/mapTheme';
import api from '../../../../utils/api';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import { getCarBrandName, getCarModelName } from '../../../../utils/vehicleCatalog';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';

/**
 * Step 3 — Rapido-style pickup screen.
 *
 *   ┌──────────────────────────────┐
 *   │ ← Where are we going?        │
 *   │ ● Pickup …………………………………………… │
 *   │ ◎ Drop ……………………………………………… │   (drop only for outstation)
 *   ├──────────────────────────────┤
 *   │                              │
 *   │            [MAP]             │
 *   │                              │
 *   ├──────────────────────────────┤
 *   │ Choose your car              │
 *   │  ╭─────╮ ╭─────╮ ╭─────╮     │
 *   │  │ car │ │ car │ │ car │ …   │
 *   │  ╰─────╯ ╰─────╯ ╰─────╯     │
 *   │ [Confirm and review] →       │
 *   └──────────────────────────────┘
 *
 * Tapping a pickup/drop input row makes it "active". The map pin updates
 * the active field on click/drag.
 */
const SelectPickupPage = () => {
  const navigate = useNavigate();
  const serviceType = useBookingDraftStore((s) => s.serviceType);
  const pickup = useBookingDraftStore((s) => s.pickup);
  const dropoff = useBookingDraftStore((s) => s.dropoff);
  const carId = useBookingDraftStore((s) => s.carId);
  const setPickup = useBookingDraftStore((s) => s.setPickup);
  const setDropoff = useBookingDraftStore((s) => s.setDropoff);
  const setCarId = useBookingDraftStore((s) => s.setCarId);

  const isOutstation = serviceType === SERVICE_TYPES.OUTSTATION;

  const { maps, AdvancedMarkerElement, PinElement, ready, error } = useGoogleMaps();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropMarkerRef = useRef(null);
  const geocoderRef = useRef(null);
  const pickupInputRef = useRef(null);
  const dropInputRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

  const [localPickup, setLocalPickup] = useState(pickup);
  const [localDrop, setLocalDrop] = useState(dropoff);
  const [activeField, setActiveField] = useState('pickup');
  const [geocoding, setGeocoding] = useState(null); // 'pickup' | 'drop' | null

  /* ------------------------------------------------------------------ */
  /* Cars                                                                */
  /* ------------------------------------------------------------------ */

  const [cars, setCars] = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCarsLoading(true);
    api
      .get('/auth/cars')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data?.data) ? res.data.data : [];
        setCars(list);
        // Auto-pick the first car if nothing already chosen.
        if (!carId && list.length > 0) setCarId(list[0]._id);
      })
      .catch(() => {
        if (!cancelled) setCars([]);
      })
      .finally(() => {
        if (!cancelled) setCarsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------------ */
  /* Map helpers                                                          */
  /* ------------------------------------------------------------------ */

  const moveMapTo = useCallback(({ lat, lng }) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo({ lat, lng });
    mapInstanceRef.current.setZoom(15);
  }, []);

  const reverseGeocode = useCallback(
    async ({ lat, lng }, field) => {
      if (!geocoderRef.current) return null;
      setGeocoding(field);
      try {
        const { results } = await new Promise((resolve, reject) => {
          geocoderRef.current.geocode({ location: { lat, lng } }, (res, status) => {
            if (status === 'OK') resolve({ results: res });
            else reject(new Error(status));
          });
        });
        const top = results?.[0];
        const cityComp = top?.address_components?.find((c) =>
          c.types?.some((t) => ['locality', 'administrative_area_level_2'].includes(t)),
        );
        return {
          address: top?.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          city: cityComp?.long_name || '',
          lat,
          lng,
        };
      } catch {
        return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '', lat, lng };
      } finally {
        setGeocoding(null);
      }
    },
    [],
  );

  const applyLocation = useCallback(
    (point, field) => {
      if (field === 'pickup') {
        setLocalPickup(point);
        if (pickupMarkerRef.current) {
          pickupMarkerRef.current.position = { lat: point.lat, lng: point.lng };
        }
      } else {
        setLocalDrop(point);
        if (dropMarkerRef.current) {
          dropMarkerRef.current.position = { lat: point.lat, lng: point.lng };
        }
      }
    },
    [],
  );

  const applyLocationRef = useRef(applyLocation);
  const reverseGeocodeRef = useRef(reverseGeocode);
  applyLocationRef.current = applyLocation;
  reverseGeocodeRef.current = reverseGeocode;

  const debouncedMapGeocodeRef = useRef(
    debounce(async (lat, lng, field) => {
      const point = await reverseGeocodeRef.current({ lat, lng }, field);
      if (point) applyLocationRef.current(point, field);
    }, 500),
  );

  useEffect(
    () => () => {
      debouncedMapGeocodeRef.current.cancel();
    },
    [],
  );

  /* ------------------------------------------------------------------ */
  /* Place search bindings                                                */
  /* ------------------------------------------------------------------ */

  useMapPlaceSearch(pickupInputRef, {
    maps,
    map: mapInstance,
    enabled: ready,
    onSelect: ({ lat, lng, address, name }) => {
      const point = { address: address || name || '', city: '', lat, lng };
      applyLocation(point, 'pickup');
      setActiveField('pickup');
      moveMapTo({ lat, lng });
    },
  });

  useMapPlaceSearch(dropInputRef, {
    maps,
    map: mapInstance,
    enabled: ready && isOutstation,
    onSelect: ({ lat, lng, address, name }) => {
      const point = { address: address || name || '', city: '', lat, lng };
      applyLocation(point, 'drop');
      setActiveField('drop');
      moveMapTo({ lat, lng });
    },
  });

  /* ------------------------------------------------------------------ */
  /* Map init                                                             */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;

    const center = pickup ? { lat: pickup.lat, lng: pickup.lng } : DEFAULT_MAP_CENTER;
    const map = new maps.Map(mapRef.current, {
      ...RAPIDO_MAP_OPTIONS,
      center,
      zoom: pickup ? 15 : DEFAULT_MAP_ZOOM,
      mapId: GOOGLE_MAP_ID,
      zoomControl: true,
    });
    mapInstanceRef.current = map;
    setMapInstance(map);
    geocoderRef.current = new maps.Geocoder();

    const pickupMarker = new AdvancedMarkerElement({
      map,
      position: center,
      gmpDraggable: true,
      content: createImageMarkerContent(PIN_ASSETS.PICKUP, {
        size: 50,
        alt: 'Pickup location',
      }),
      zIndex: 6,
    });
    pickupMarkerRef.current = pickupMarker;

    pickupMarker.addListener('dragend', async () => {
      const pos = pickupMarker.position;
      const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
      const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
      const point = await reverseGeocode({ lat, lng }, 'pickup');
      if (point) applyLocation(point, 'pickup');
    });

    if (isOutstation) {
      const dropPin = new PinElement({
        background: '#EF4444',
        borderColor: '#7F1D1D',
        glyphColor: '#FFFFFF',
        scale: 1.2,
      });
      const dropStart = dropoff
        ? { lat: dropoff.lat, lng: dropoff.lng }
        : { lat: center.lat + 0.01, lng: center.lng + 0.01 };
      const dropMarker = new AdvancedMarkerElement({
        map,
        position: dropStart,
        gmpDraggable: true,
        content: dropPin.element,
      });
      dropMarkerRef.current = dropMarker;

      dropMarker.addListener('dragend', async () => {
        const pos = dropMarker.position;
        const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
        const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
        const point = await reverseGeocode({ lat, lng }, 'drop');
        if (point) applyLocation(point, 'drop');
      });
    }

    map.addListener('click', (event) => {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      moveMapTo({ lat, lng });
      const field = isOutstation ? activeFieldRef.current : 'pickup';
      const marker = field === 'pickup' ? pickupMarkerRef.current : dropMarkerRef.current;
      if (marker) marker.position = { lat, lng };
      debouncedMapGeocodeRef.current(lat, lng, field);
    });

    if (!pickup && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          moveMapTo({ lat, lng });
          if (pickupMarkerRef.current) pickupMarkerRef.current.position = { lat, lng };
          const point = await reverseGeocode({ lat, lng }, 'pickup');
          if (point) applyLocation(point, 'pickup');
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
      );
    }
  }, [
    ready,
    maps,
    AdvancedMarkerElement,
    PinElement,
    pickup,
    dropoff,
    isOutstation,
    moveMapTo,
    reverseGeocode,
    applyLocation,
  ]);

  // Keep a ref of the active field so the map click listener (registered once)
  // always sees the latest value without re-binding.
  const activeFieldRef = useRef(activeField);
  useEffect(() => {
    activeFieldRef.current = activeField;
  }, [activeField]);

  /* ------------------------------------------------------------------ */
  /* Continue                                                             */
  /* ------------------------------------------------------------------ */

  const canContinue = useMemo(() => {
    if (!localPickup?.address) return false;
    if (isOutstation && !localDrop?.address) return false;
    if (cars.length > 0 && !carId) return false;
    return true;
  }, [localPickup, localDrop, isOutstation, cars.length, carId]);

  const handleConfirm = () => {
    if (!canContinue) return;
    setPickup(localPickup);
    if (isOutstation) setDropoff(localDrop);
    navigate('/user/book/confirm');
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {/* Header + location inputs */}
      <div className="bg-white px-4 pt-4 pb-3 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text">
              {isOutstation ? 'Where are you going?' : 'Where should we pick you up?'}
            </h1>
            <p className="text-xs text-text-muted truncate">
              {isOutstation
                ? 'Search or drop a pin for both pickup and destination.'
                : 'Tap the map or search to set your pickup location.'}
            </p>
          </div>
        </div>

        <LocationField
          tone="green"
          icon={MapPin}
          label="Pickup"
          inputRef={pickupInputRef}
          placeholder="Search pickup location"
          active={activeField === 'pickup'}
          onFocus={() => setActiveField('pickup')}
          value={localPickup?.address || ''}
          loading={geocoding === 'pickup'}
          onChange={(v) =>
            setLocalPickup((p) => ({ ...(p || { lat: null, lng: null, city: '' }), address: v }))
          }
        />

        {isOutstation && (
          <LocationField
            tone="red"
            icon={Navigation}
            label="Drop"
            inputRef={dropInputRef}
            placeholder="Search destination"
            active={activeField === 'drop'}
            onFocus={() => setActiveField('drop')}
            value={localDrop?.address || ''}
            loading={geocoding === 'drop'}
            onChange={(v) =>
              setLocalDrop((p) => ({ ...(p || { lat: null, lng: null, city: '' }), address: v }))
            }
          />
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-[220px]">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-3 max-w-md text-center">
              {error}
            </div>
          </div>
        ) : (
          <div ref={mapRef} className="w-full h-full" />
        )}
      </div>

      {/* Bottom sheet — car selector + CTA */}
      <div className="bg-white border-t border-border-light rounded-t-3xl shadow-2xl px-4 pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text">Choose your car</h3>
            <p className="text-[11px] text-text-muted">
              Pick the vehicle the driver should drive on this trip.
            </p>
          </div>
          {cars.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/user/my-cars')}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Manage
            </button>
          )}
        </div>

        <CarStrip
          cars={cars}
          loading={carsLoading}
          selectedId={carId}
          onSelect={setCarId}
          onAdd={() => navigate('/user/add-car')}
        />

        <Button fullWidth disabled={!canContinue} onClick={handleConfirm}>
          Confirm and review
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function LocationField({
  tone,
  icon: Icon,
  label,
  inputRef,
  placeholder,
  active,
  onFocus,
  value,
  loading,
  onChange,
}) {
  const toneClasses = tone === 'red'
    ? 'bg-red-50 text-red-600'
    : 'bg-emerald-50 text-emerald-600';
  return (
    <button
      type="button"
      onClick={() => {
        inputRef.current?.focus();
        onFocus?.();
      }}
      className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-2 transition ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-gray-50'
      }`}
    >
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClasses}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            className="w-full bg-transparent border-0 p-0 text-sm font-medium text-text placeholder:text-text-muted focus:outline-none truncate"
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text-muted" />
          )}
        </div>
      </div>
    </button>
  );
}

function CarStrip({ cars, loading, selectedId, onSelect, onAdd }) {
  if (loading) {
    return (
      <div className="h-24 flex items-center justify-center text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (cars.length === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="w-full border-2 border-dashed border-border rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-gray-50"
      >
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <Plus className="w-5 h-5 text-text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">Add a vehicle</p>
          <p className="text-xs text-text-muted">You need at least one car to book a driver.</p>
        </div>
      </button>
    );
  }

  return (
    <div className="-mx-4 px-4 overflow-x-auto">
      <div className="flex gap-3 pb-1">
        {cars.map((car) => {
          const isSelected = car._id === selectedId;
          return (
            <button
              key={car._id}
              type="button"
              onClick={() => onSelect(car._id)}
              className={`shrink-0 w-32 rounded-2xl border-2 p-2.5 text-left transition relative ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-white hover:border-text-muted/40'
              }`}
            >
              <div className="w-full h-14 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center mb-2">
                {car.image ? (
                  <img src={car.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <CarIcon className="w-6 h-6 text-text-muted" />
                )}
              </div>
              <p className="text-xs font-bold text-text truncate">{getCarBrandName(car)}</p>
              <p className="text-[10px] text-text-muted truncate">{getCarModelName(car)}</p>
              <p className="mt-1 text-[10px] font-mono font-bold text-text-secondary truncate">
                {car.vehicleNumber}
              </p>
              {isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 w-32 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted hover:text-text hover:border-text-muted/60"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[11px] font-semibold">Add car</span>
        </button>
      </div>
    </div>
  );
}

export default SelectPickupPage;
