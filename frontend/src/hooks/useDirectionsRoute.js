import { useEffect, useRef, useState } from 'react';
import { distanceToPathMeters, haversineMeters } from '../utils/geo';

/**
 * Pulls a road-following route between two LatLngs from
 * `google.maps.DirectionsService`. Built for the live trip-tracking map so
 * the line on screen follows actual streets — i.e. the Rapido/Uber look —
 * instead of a geodesic stripe through buildings.
 *
 * Refresh only when:
 *   - origin moved > MIN_REFRESH_METERS (80 m), OR
 *   - driver is off the current route, OR
 *   - destination changed
 *
 * Never requests Directions on every GPS tick. Keeps the last successful
 * polyline visible while a replacement is in flight.
 */

const MIN_REFRESH_METERS = 80;
const OFF_ROUTE_METERS = 55;
const ARRIVAL_THRESHOLD_METERS = 50;
const MIN_REFRESH_MS = 4_000;

const sameLatLng = (a, b) =>
  !!a && !!b && a.lat === b.lat && a.lng === b.lng;

export function useDirectionsRoute({
  maps,
  origin,
  destination,
  travelMode = 'DRIVING',
  enabled = true,
}) {
  const [route, setRoute] = useState({
    path: null,
    distanceMeters: null,
    durationSeconds: null,
    status: 'idle',
  });

  const serviceRef = useRef(null);
  const lastOriginRef = useRef(null);
  const lastDestinationRef = useRef(null);
  const lastRequestAtRef = useRef(0);
  const hasPathRef = useRef(false);
  const pathRef = useRef(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !maps || !origin || !destination) return undefined;

    if (!serviceRef.current) {
      serviceRef.current = new maps.DirectionsService();
    }

    const prevOrigin = lastOriginRef.current;
    const prevDestination = lastDestinationRef.current;
    const destinationChanged = !sameLatLng(prevDestination, destination);
    const originMovedM =
      prevOrigin && Number.isFinite(haversineMeters(prevOrigin, origin))
        ? haversineMeters(prevOrigin, origin)
        : Infinity;
    const originMovedEnough = originMovedM >= MIN_REFRESH_METERS;

    const remaining = haversineMeters(origin, destination);
    if (
      Number.isFinite(remaining) &&
      remaining < ARRIVAL_THRESHOLD_METERS &&
      hasPathRef.current &&
      !destinationChanged
    ) {
      return undefined;
    }

    const offRoute =
      hasPathRef.current &&
      Array.isArray(pathRef.current) &&
      pathRef.current.length > 1 &&
      (() => {
        const d = distanceToPathMeters(origin, pathRef.current);
        return Number.isFinite(d) && d > OFF_ROUTE_METERS;
      })();

    const recentlyFetched = Date.now() - lastRequestAtRef.current < MIN_REFRESH_MS;
    const firstFetch = !prevOrigin || !prevDestination;

    // Skip unless first fetch, destination change, meaningful move, or off-route.
    if (!firstFetch && !destinationChanged && !originMovedEnough && !offRoute) {
      return undefined;
    }
    // Off-route / destination change bypass the time throttle; small moves don't.
    if (!firstFetch && !destinationChanged && !offRoute && recentlyFetched) {
      return undefined;
    }
    if (inFlightRef.current && !destinationChanged && !offRoute) {
      return undefined;
    }

    requestIdRef.current += 1;
    const myReq = requestIdRef.current;
    lastOriginRef.current = origin;
    lastDestinationRef.current = destination;
    lastRequestAtRef.current = Date.now();
    inFlightRef.current = true;

    // Mark loading without clearing the previous path (no flicker).
    setRoute((prev) => ({
      ...prev,
      status: prev.path ? 'refreshing' : 'loading',
    }));

    const travel = maps.TravelMode?.[travelMode] || maps.TravelMode?.DRIVING;
    serviceRef.current.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: travel,
        provideRouteAlternatives: false,
      },
      (result, status) => {
        if (myReq !== requestIdRef.current) return;
        inFlightRef.current = false;

        if (status === 'OK' && result?.routes?.[0]) {
          const r = result.routes[0];
          const stepPaths = (r.legs || []).flatMap((leg) =>
            (leg.steps || []).flatMap((step) =>
              (step.path || []).map((p) => ({ lat: p.lat(), lng: p.lng() })),
            ),
          );
          const overviewPath = (r.overview_path || []).map((p) => ({
            lat: p.lat(),
            lng: p.lng(),
          }));
          const path = stepPaths.length > 1 ? stepPaths : overviewPath;
          const leg = r.legs?.[0];
          if (path.length > 1) {
            hasPathRef.current = true;
            pathRef.current = path;
          }
          setRoute({
            path: path.length > 1 ? path : pathRef.current,
            distanceMeters: leg?.distance?.value ?? null,
            durationSeconds: leg?.duration?.value ?? null,
            status: 'ok',
          });
        } else {
          // Keep last good path on failure.
          setRoute((prev) => ({ ...prev, status: status || 'error' }));
        }
      },
    );

    return undefined;
  }, [maps, origin, destination, travelMode, enabled]);

  // Clear when disabled so a later re-enable starts fresh.
  useEffect(() => {
    if (enabled) return;
    hasPathRef.current = false;
    pathRef.current = null;
    lastOriginRef.current = null;
    lastDestinationRef.current = null;
    setRoute({
      path: null,
      distanceMeters: null,
      durationSeconds: null,
      status: 'idle',
    });
  }, [enabled]);

  return route;
}

export default useDirectionsRoute;
