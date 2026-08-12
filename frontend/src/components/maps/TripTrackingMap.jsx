import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Loader2, MapPin, Navigation } from 'lucide-react';
import MapView from './MapView';
import UserMarker from './UserMarker';
import DriverMarker from './DriverMarker';
import RoutePolyline from './RoutePolyline';
import { useGoogleMap } from '../../hooks/useGoogleMap';
import { useDirectionsRoute } from '../../hooks/useDirectionsRoute';
import { useSmoothCamera } from '../../hooks/useSmoothCamera';
import { useDriverSpeed } from '../../hooks/useDriverSpeed';
import { useMapFollowControl } from '../../hooks/useMapFollowControl';
import { formatDistance, estimateEtaMinutes, haversineMeters } from '../../utils/geo';
import { ROUTE_POLYLINE, driverPinForStatus } from '../../constants/mapTheme';
import { BOOKING_STATUS } from '../../constants/bookingStatus';

/**
 * <TripTrackingMap /> — live ride map for customer + driver post-acceptance.
 *
 * Camera phases (driven by `bookingStatus` + props):
 *   EN_ROUTE  → fit driver + pickup + route (unless followDriver)
 *   ARRIVED   → hide route, fit pickup + driver
 *   STARTED   → follow driver with dynamic zoom; route to destination
 *
 * Interaction:
 *   - Pan / two-finger rotate exits follow mode and shows Recenter.
 *   - Recenter re-enables follow and resets heading to north-up.
 *
 * Props kept compatible with existing callers (DriverAssignedPage, etc.).
 */

const ARRIVING_METERS = 150;
const ARRIVED_METERS = 50;

/** Allow two-finger rotate on vector maps; keep UI chrome off. */
const TRACKING_MAP_OPTIONS = Object.freeze({
  rotateControl: false,
  tilt: 0,
});

function tripStatusLabel({ bookingStatus, distanceMeters }) {
  if (
    bookingStatus === BOOKING_STATUS.ARRIVED ||
    (Number.isFinite(distanceMeters) && distanceMeters <= ARRIVED_METERS)
  ) {
    return 'Driver has arrived';
  }
  if (Number.isFinite(distanceMeters) && distanceMeters <= ARRIVING_METERS) {
    return 'Driver is arriving';
  }
  if (bookingStatus === BOOKING_STATUS.STARTED) {
    return 'Trip in progress';
  }
  return 'Driver is on the way';
}

function TripTrackingMap({
  driver,
  pickup,
  dropoff = null,
  height = 260,
  showRoute = true,
  followDriver = false,
  emphasis = 'driver',
  className = '',
  onEtaChange,
  showOutline = ROUTE_POLYLINE.OUTLINE_DEFAULT,
  strokeOptions,
  outlineOptions,
  bookingStatus = null,
  driverImageSrc = null,
  /** Extra classes for the Recenter control (e.g. clear a bottom sheet). */
  controlClassName = '',
  /** When false, map gestures are blocked but Recenter stays clickable. */
  mapInteractive = true,
}) {
  const { isLoaded, loadError, maps } = useGoogleMap();
  const viewRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const fittedKeyRef = useRef(null);
  const animatedDriverRef = useRef(null);
  const [mapHeading, setMapHeading] = useState(0);

  const driverPinSrc = driverImageSrc || driverPinForStatus(bookingStatus);
  const isArrivedStatus = bookingStatus === BOOKING_STATUS.ARRIVED;
  const isStartedStatus = bookingStatus === BOOKING_STATUS.STARTED;

  // EN_ROUTE → driver→pickup. STARTED → driver→dropoff (when we have one).
  // Without this swap the polyline either points at the pin the driver just
  // left, or is suppressed entirely by the "within 50 m of destination"
  // hide rule that fires as soon as the ride starts at pickup.
  const routeDestination = useMemo(() => {
    if (isStartedStatus && dropoff) return dropoff;
    return pickup;
  }, [isStartedStatus, dropoff, pickup]);

  const straightLineMeters = useMemo(() => {
    if (!driver || !routeDestination) return null;
    const d = haversineMeters(driver, routeDestination);
    return Number.isFinite(d) ? d : null;
  }, [driver, routeDestination]);

  const routeVisible =
    showRoute &&
    !isArrivedStatus &&
    Boolean(routeDestination) &&
    !(Number.isFinite(straightLineMeters) && straightLineMeters <= ARRIVED_METERS);

  const resetMapHeading = useCallback(() => {
    viewRef.current?.setHeading?.(0);
    setMapHeading(0);
  }, []);

  const {
    following,
    showRecenter,
    onUserGesture,
    recenter,
    isGestureSuppressed,
  } = useMapFollowControl({
    enabled: followDriver,
    onRecenter: resetMapHeading,
  });

  const speedKmh = useDriverSpeed(driver);

  const {
    path: routePath,
    distanceMeters: routeDistanceMeters,
    durationSeconds: routeDurationSeconds,
  } = useDirectionsRoute({
    maps,
    origin: routeVisible ? driver : null,
    destination: routeVisible ? routeDestination : null,
    enabled: routeVisible && Boolean(driver && routeDestination),
  });

  const initialCenter = useMemo(() => {
    return pickup || driver || { lat: 28.6139, lng: 77.209 };
  }, [pickup, driver]);

  const onAnimatedPositionChange = useCallback((pos) => {
    animatedDriverRef.current = pos;
  }, []);

  const { distanceMeters, etaMinutes } = useMemo(() => {
    if (!driver || !routeDestination) return { distanceMeters: null, etaMinutes: null };
    if (Number.isFinite(routeDistanceMeters) && Number.isFinite(routeDurationSeconds)) {
      return {
        distanceMeters: routeDistanceMeters,
        etaMinutes: Math.max(1, Math.round(routeDurationSeconds / 60)),
      };
    }
    const d = haversineMeters(driver, routeDestination);
    return { distanceMeters: d, etaMinutes: estimateEtaMinutes(d) };
  }, [driver, routeDestination, routeDistanceMeters, routeDurationSeconds]);

  useEffect(() => {
    if (!onEtaChange) return;
    onEtaChange({ distanceMeters, etaMinutes });
  }, [distanceMeters, etaMinutes, onEtaChange]);

  const statusText = useMemo(
    () => tripStatusLabel({ bookingStatus, distanceMeters }),
    [bookingStatus, distanceMeters],
  );

  useSmoothCamera({
    mapRef: viewRef,
    maps,
    enabled: mapReady && following && Boolean(driver),
    target: driver,
    animatedTargetRef: animatedDriverRef,
    speedKmh,
    distanceMeters,
  });

  /* Detect two-finger rotate — exits follow and shows Recenter. */
  useEffect(() => {
    if (!mapReady || !maps?.event || !followDriver) return undefined;
    const map = viewRef.current?.getMap?.();
    if (!map) return undefined;

    const onHeadingChanged = () => {
      const heading =
        typeof map.getHeading === 'function' ? map.getHeading() || 0 : 0;
      setMapHeading(heading);
      if (isGestureSuppressed?.()) return;
      if (Math.abs(heading) > 2) onUserGesture();
    };

    const listener = maps.event.addListener(map, 'heading_changed', onHeadingChanged);
    return () => {
      maps.event.removeListener(listener);
    };
  }, [mapReady, maps, followDriver, onUserGesture, isGestureSuppressed]);

  /* Phase-aware fitBounds when NOT following. */
  useEffect(() => {
    if (!mapReady || !maps || !viewRef.current) return;
    if (!pickup && !driver) return;
    if (following) return;

    const points = [];
    if (pickup) points.push(pickup);
    if (driver) points.push(driver);
    if (!isArrivedStatus && dropoff) points.push(dropoff);

    const includeRoute =
      routeVisible &&
      !isArrivedStatus &&
      Array.isArray(routePath) &&
      routePath.length > 1;

    if (includeRoute) {
      points.push(routePath[0], routePath[routePath.length - 1]);
    }

    if (points.length === 0) return;

    const key = [
      bookingStatus || 'none',
      points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|'),
      includeRoute ? `r${routePath.length}` : 'nr',
    ].join('::');
    if (fittedKeyRef.current === key) return;
    fittedKeyRef.current = key;

    if (points.length === 1) {
      viewRef.current.panTo(points[0]);
      return;
    }

    const bounds = new maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    if (includeRoute) {
      const stride = Math.max(1, Math.floor(routePath.length / 40));
      for (let i = 0; i < routePath.length; i += stride) {
        bounds.extend(routePath[i]);
      }
    }

    const padding = isArrivedStatus ? 80 : isStartedStatus ? 56 : 64;
    viewRef.current.fitBounds(bounds, padding);
  }, [
    mapReady,
    maps,
    pickup,
    driver,
    dropoff,
    routePath,
    following,
    routeVisible,
    isArrivedStatus,
    isStartedStatus,
    bookingStatus,
  ]);

  const handleMapLoad = useCallback(() => {
    setMapReady(true);
  }, []);

  const isRotated = Math.abs(mapHeading) > 2;
  const showControl = showRecenter || (followDriver && isRotated && !following);

  if (loadError) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-rose-50 ${className}`}
        style={{ height }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          <MapPin className="w-7 h-7 text-rose-400" />
          <p className="text-sm font-medium text-rose-800 mt-2">
            {loadError.message || 'Failed to load Google Maps'}
          </p>
        </div>
      </div>
    );
  }

  const hasRoute = routeVisible && Array.isArray(routePath) && routePath.length > 1;
  const showFallback =
    routeVisible &&
    driver &&
    routeDestination &&
    (!routePath || routePath.length < 2);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#f5f0e8] ${className}`}
      style={{ height }}
    >
      <div
        className="absolute inset-0"
        style={{ pointerEvents: mapInteractive ? 'auto' : 'none' }}
      >
        <MapView
          ref={viewRef}
          center={initialCenter}
          zoom={15}
          height="100%"
          rounded={false}
          options={TRACKING_MAP_OPTIONS}
          onLoad={handleMapLoad}
          onDragStart={onUserGesture}
        >
          {pickup && (
            <UserMarker
              position={pickup}
              kind="pickup"
              size={emphasis === 'pickup' ? 52 : 44}
              ariaLabel="Pickup"
            />
          )}

          {dropoff && (
            <UserMarker
              position={dropoff}
              kind="drop"
              size={40}
              ariaLabel="Drop"
            />
          )}

          {driver && (
            <DriverMarker
              position={driver}
              heading={typeof driver.heading === 'number' ? driver.heading : undefined}
              mapHeading={mapHeading}
              imageSrc={driverPinSrc}
              size={emphasis === 'driver' ? 54 : 46}
              animateMs={1400}
              onAnimatedPositionChange={onAnimatedPositionChange}
            />
          )}

          {hasRoute && (
            <RoutePolyline
              path={routePath}
              animate={false}
              showOutline={showOutline}
              strokeOptions={strokeOptions}
              outlineOptions={outlineOptions}
            />
          )}

          {showFallback && (
            <RoutePolyline
              path={[driver, routeDestination]}
              animate={false}
              dashed
            />
          )}
        </MapView>
      </div>

      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      {distanceMeters != null && etaMinutes != null && (
        <div className="absolute top-3 left-3 right-3 flex justify-center pointer-events-none z-[2]">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-md px-4 py-2.5 min-w-[200px] text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-xl font-bold text-slate-900 tracking-tight tabular-nums">
                {etaMinutes} min
              </span>
              <span className="text-sm font-semibold text-slate-500 tabular-nums">
                {formatDistance(distanceMeters)}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              {statusText}
            </p>
          </div>
        </div>
      )}

      {/* Recenter / north-up — pan or rotate exits follow */}
      {showControl && (
        <button
          type="button"
          onClick={recenter}
          className={`absolute z-[3] flex items-center gap-1.5 rounded-full bg-white shadow-lg border border-slate-200/80 px-3.5 py-2 text-[12px] font-semibold text-slate-800 active:scale-[0.97] transition-transform pointer-events-auto bottom-4 right-4 ${controlClassName}`}
          aria-label="Recenter map on driver"
        >
          {isRotated ? (
            <Compass className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Navigation className="w-3.5 h-3.5 text-emerald-600" />
          )}
          Recenter
        </button>
      )}
    </div>
  );
}

export default memo(TripTrackingMap);
