import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import MapView from './MapView';
import UserMarker from './UserMarker';
import DriverMarker from './DriverMarker';
import RoutePolyline from './RoutePolyline';
import { useGoogleMap } from '../../hooks/useGoogleMap';
import { useDirectionsRoute } from '../../hooks/useDirectionsRoute';
import { formatDistance, estimateEtaMinutes, haversineMeters } from '../../utils/geo';
import { ROUTE_POLYLINE, driverPinForStatus } from '../../constants/mapTheme';

/**
 * <TripTrackingMap /> — the live ride map used by both the customer and
 * driver post-acceptance flows. Composes the new declarative map
 * primitives:
 *
 *   <MapView>
 *     <UserMarker kind="pickup" />
 *     <UserMarker kind="drop" />       (outstation only)
 *     <DriverMarker />                  (smoothly animated)
 *     <RoutePolyline path={…} />        (road-following + premium stroke)
 *   </MapView>
 *
 * Props (kept identical to the previous imperative implementation so
 * `DriverAssignedPage` and `DriverActiveTripPage` need zero changes):
 *
 *   - driver         { lat, lng, heading? }   live driver location
 *   - pickup         { lat, lng }             customer pickup point
 *   - dropoff        Optional { lat, lng }    outstation destination
 *   - height         CSS height (default 260)
 *   - showRoute      true → fetch & draw road-following route + ETA badge
 *   - followDriver   true → camera smoothly trails the driver (default off,
 *                    enabled by callers during ride-in-progress flows)
 *   - emphasis       'driver' | 'pickup' — which marker renders larger
 *   - className      extra wrapper classes
 *   - onEtaChange    callback called with `{ distanceMeters, etaMinutes }`
 *   - showOutline    true → premium double-stroke polyline (default).
 *                    false → single clean stroke. Centralised in
 *                    `ROUTE_POLYLINE.OUTLINE_DEFAULT` (mapTheme.js).
 *   - strokeOptions  per-instance overrides forwarded to `<RoutePolyline>`
 *                    (e.g. brand colour on a specific screen). Falls back
 *                    to `ROUTE_POLYLINE.STROKE` otherwise.
 *   - outlineOptions per-instance overrides for the outline halo.
 *   - bookingStatus  booking status → picks en-route arrow vs in-trip car
 *   - driverImageSrc optional explicit pin override (wins over status)
 *
 * Camera behaviour:
 *   - First mount + every endpoint change → `fitBounds` so both pins are
 *     visible with the entire route polyline.
 *   - While following the driver → smooth `panTo` to the latest position
 *     each animation tick (we let `<DriverMarker>` interpolate the pin and
 *     piggy-back on the same prop update for the camera).
 *   - We never call `setZoom` mid-follow to avoid the jarring "snap-to-
 *     close-up" zoom that looks bad on mobile.
 */

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
}) {
  const { isLoaded, loadError, maps } = useGoogleMap();
  const viewRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const fittedKeyRef = useRef(null);

  const driverPinSrc = driverImageSrc || driverPinForStatus(bookingStatus);

  /* ------------------------------------------------------------------ */
  /* Directions: road-following polyline                                 */
  /* ------------------------------------------------------------------ */
  const {
    path: routePath,
    distanceMeters: routeDistanceMeters,
    durationSeconds: routeDurationSeconds,
  } = useDirectionsRoute({
    maps,
    origin: showRoute ? driver : null,
    destination: showRoute ? pickup : null,
    enabled: showRoute && Boolean(driver && pickup),
  });

  /* ------------------------------------------------------------------ */
  /* Initial centre — picks the most "useful" point on first mount so
   * the map doesn't start zoomed into the Pacific while we wait for the
   * effect below to call `fitBounds`.                                    */
  /* ------------------------------------------------------------------ */
  const initialCenter = useMemo(() => {
    return pickup || driver || { lat: 28.6139, lng: 77.209 };
  }, [pickup, driver]);

  /* ------------------------------------------------------------------ */
  /* Fit-bounds: re-runs whenever the endpoints (or the route) change.   */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!mapReady || !maps || !viewRef.current) return;
    if (!pickup && !driver) return;

    // While in "follow driver" mode we deliberately skip fitBounds — the
    // dedicated follow effect below owns the camera. Without this skip the
    // bounds would yank the camera away from the driver each tick.
    if (followDriver) return;

    const points = [];
    if (pickup) points.push(pickup);
    if (driver) points.push(driver);
    if (dropoff) points.push(dropoff);
    if (Array.isArray(routePath) && routePath.length > 1) {
      // Anchor the bounds against the route endpoints too — long detours
      // would otherwise scroll off-screen on the initial fit.
      points.push(routePath[0], routePath[routePath.length - 1]);
    }

    if (points.length === 0) return;

    const key = points
      .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
      .join('|');
    if (fittedKeyRef.current === key) return;
    fittedKeyRef.current = key;

    if (points.length === 1) {
      viewRef.current.panTo(points[0]);
      return;
    }

    const bounds = new maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    if (Array.isArray(routePath)) routePath.forEach((p) => bounds.extend(p));
    viewRef.current.fitBounds(bounds, 64);
  }, [mapReady, maps, pickup, driver, dropoff, routePath, followDriver]);

  /* ------------------------------------------------------------------ */
  /* Smooth follow: pan the camera to each new driver sample.            */
  /*                                                                     */
  /* We piggy-back on the parent's `driver` prop change rather than
   * polling the DriverMarker's animated position — keeping the camera
   * on the *target* (not the in-flight interpolated point) avoids the
   * compounded jitter you'd otherwise get from two animation loops.    */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!mapReady || !followDriver || !driver) return;
    viewRef.current?.panTo(driver);
  }, [mapReady, followDriver, driver]);

  /* ------------------------------------------------------------------ */
  /* ETA derivation — prefer the Directions response, fall back to a
   * straight-line haversine + avg-urban-speed estimate so the badge
   * never reads "—" just because the API call hasn't returned.          */
  /* ------------------------------------------------------------------ */
  const { distanceMeters, etaMinutes } = useMemo(() => {
    if (!driver || !pickup) return { distanceMeters: null, etaMinutes: null };
    if (Number.isFinite(routeDistanceMeters) && Number.isFinite(routeDurationSeconds)) {
      return {
        distanceMeters: routeDistanceMeters,
        etaMinutes: Math.max(1, Math.round(routeDurationSeconds / 60)),
      };
    }
    const d = haversineMeters(driver, pickup);
    return { distanceMeters: d, etaMinutes: estimateEtaMinutes(d) };
  }, [driver, pickup, routeDistanceMeters, routeDurationSeconds]);

  useEffect(() => {
    if (!onEtaChange) return;
    onEtaChange({ distanceMeters, etaMinutes });
  }, [distanceMeters, etaMinutes, onEtaChange]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
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

  const hasRoute = showRoute && Array.isArray(routePath) && routePath.length > 1;
  const showFallback =
    showRoute && driver && pickup && (!routePath || routePath.length < 2);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#f4efe6] ${className}`}
      style={{ height }}
    >
      <MapView
        ref={viewRef}
        center={initialCenter}
        zoom={14}
        height="100%"
        rounded={false}
        onLoad={() => setMapReady(true)}
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
            imageSrc={driverPinSrc}
            size={emphasis === 'driver' ? 52 : 44}
            animateMs={1200}
          />
        )}

        {hasRoute && (
          <RoutePolyline
            path={routePath}
            animate={false}
            showOutline={false}
            strokeOptions={strokeOptions}
            outlineOptions={outlineOptions}
          />
        )}

        {showFallback && (
          <RoutePolyline
            path={[driver, pickup]}
            animate={false}
            dashed
          />
        )}
      </MapView>

      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}

      {distanceMeters != null && etaMinutes != null && (
        <div className="absolute top-3 left-3 right-3 flex justify-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur rounded-full shadow px-3.5 py-1.5 flex items-center gap-2 text-[12px] font-semibold text-text">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{formatDistance(distanceMeters)}</span>
            <span className="text-text-muted">·</span>
            <span>~{etaMinutes} min</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TripTrackingMap);
