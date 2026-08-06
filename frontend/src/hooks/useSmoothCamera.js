import { useEffect, useRef } from 'react';
import { expSmooth, lerp } from '../utils/mapAnimation';
import {
  CAMERA_FOLLOW_OFFSET_Y,
  CAMERA_ZOOM_EPSILON,
  resolveFollowZoom,
} from '../utils/mapCamera';

/**
 * Offset a lat/lng by screen pixels using the map projection.
 * Positive `offsetY` moves the returned centre so the original point
 * appears lower on screen (navigation-style framing).
 */
function offsetLatLngByPixels(map, maps, latLng, offsetX, offsetY) {
  const projection = map.getProjection?.();
  if (!projection || !maps?.Point || !maps?.LatLng) {
    return latLng;
  }
  const zoom = map.getZoom?.() ?? 17;
  const scale = 2 ** zoom;
  const world = projection.fromLatLngToPoint(new maps.LatLng(latLng.lat, latLng.lng));
  // Move centre opposite to the desired on-screen marker offset.
  const next = new maps.Point(
    world.x - offsetX / scale,
    world.y - offsetY / scale,
  );
  const out = projection.fromPointToLatLng(next);
  return { lat: out.lat(), lng: out.lng() };
}

/**
 * RAF-driven camera that smoothly trails a moving target (the animated
 * driver pin). Uses setCenter/setZoom each frame so we never fight
 * Google's panTo animation queue.
 *
 *   useSmoothCamera({
 *     mapRef, maps, enabled, target, speedKmh, distanceMeters, offsetY
 *   });
 */
export function useSmoothCamera({
  mapRef,
  maps = null,
  enabled = false,
  /** Latest follow target. Prefer `animatedTargetRef` to avoid 60fps React renders. */
  target = null,
  /** Optional ref updated by DriverMarker each frame — wins over `target`. */
  animatedTargetRef = null,
  speedKmh = 0,
  distanceMeters = null,
  offsetY = CAMERA_FOLLOW_OFFSET_Y,
}) {
  const cameraRef = useRef({
    lat: null,
    lng: null,
    zoom: null,
    lastAppliedLat: null,
    lastAppliedLng: null,
    lastAppliedZoom: null,
  });
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);

  const targetRef = useRef(target);
  const enabledRef = useRef(enabled);
  const speedRef = useRef(speedKmh);
  const distanceRef = useRef(distanceMeters);
  const offsetYRef = useRef(offsetY);
  const mapsRef = useRef(maps);
  const animatedRef = useRef(animatedTargetRef);

  targetRef.current = target;
  enabledRef.current = enabled;
  speedRef.current = speedKmh;
  distanceRef.current = distanceMeters;
  offsetYRef.current = offsetY;
  mapsRef.current = maps;
  animatedRef.current = animatedTargetRef;

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
      cameraRef.current = {
        lat: null,
        lng: null,
        zoom: null,
        lastAppliedLat: null,
        lastAppliedLng: null,
        lastAppliedZoom: null,
      };
      return undefined;
    }

    const tick = (ts) => {
      rafRef.current = requestAnimationFrame(tick);

      const mapHandle = mapRef?.current;
      const map = mapHandle?.getMap?.();
      const nextTarget =
        animatedRef.current?.current || targetRef.current;
      if (!map || !nextTarget) return;

      const cam = cameraRef.current;
      const dtSec =
        lastTsRef.current == null
          ? 0.016
          : Math.min(0.048, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const desiredZoom = resolveFollowZoom(
        speedRef.current,
        distanceRef.current,
      );

      // Seed on first frame after follow enables.
      if (cam.lat == null || cam.lng == null) {
        cam.lat = nextTarget.lat;
        cam.lng = nextTarget.lng;
        cam.zoom = desiredZoom;
        const centre = offsetLatLngByPixels(
          map,
          mapsRef.current,
          nextTarget,
          0,
          offsetYRef.current,
        );
        map.setCenter(centre);
        if (typeof map.setZoom === 'function') map.setZoom(desiredZoom);
        cam.lastAppliedLat = centre.lat;
        cam.lastAppliedLng = centre.lng;
        cam.lastAppliedZoom = desiredZoom;
        return;
      }

      const posAlpha = expSmooth(dtSec, 5.5);
      const zoomAlpha = expSmooth(dtSec, 3.0);

      cam.lat = lerp(cam.lat, nextTarget.lat, posAlpha);
      cam.lng = lerp(cam.lng, nextTarget.lng, posAlpha);
      cam.zoom = lerp(cam.zoom ?? desiredZoom, desiredZoom, zoomAlpha);

      const centre = offsetLatLngByPixels(
        map,
        mapsRef.current,
        { lat: cam.lat, lng: cam.lng },
        0,
        offsetYRef.current,
      );

      const latDelta = Math.abs((cam.lastAppliedLat ?? 0) - centre.lat);
      const lngDelta = Math.abs((cam.lastAppliedLng ?? 0) - centre.lng);
      const zoomDelta = Math.abs((cam.lastAppliedZoom ?? 0) - cam.zoom);

      if (latDelta > 1e-7 || lngDelta > 1e-7) {
        map.setCenter(centre);
        cam.lastAppliedLat = centre.lat;
        cam.lastAppliedLng = centre.lng;
      }

      if (zoomDelta > CAMERA_ZOOM_EPSILON) {
        map.setZoom(cam.zoom);
        cam.lastAppliedZoom = cam.zoom;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [enabled, mapRef]);
}

export default useSmoothCamera;
