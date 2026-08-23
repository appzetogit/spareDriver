import { useEffect, useRef } from 'react';
import { useGoogleMaps } from './useGoogleMaps';
import {
  PIN_ASSETS,
  createImageMarkerContent,
} from '../constants/mapTheme';

/**
 * Diff-render driver pins on an existing Google Map.
 *
 * The pin-management logic was originally inlined inside `<NearbyDriversMap>`.
 * Extracting it here lets ANY screen that already owns a map instance — the
 * trip-details page, a future booking-tracking page, an admin debug view —
 * paint live driver pins with one line:
 *
 *   useDriverMarkers(mapInstance, drivers, { selectedId, onDriverClick });
 *
 * The hook never owns the map, never re-creates pins unless needed, and
 * cleans up its own markers on unmount.
 *
 * @param {google.maps.Map | null} map        the map instance to render on
 * @param {Array<{ _id?:string, driverId?:string, lat:number, lng:number,
 *                 name?:string, isOnTrip?:boolean }>} drivers
 * @param {object} [opts]
 * @param {string|null} [opts.selectedId]     driverId to highlight
 * @param {(driver:object) => void} [opts.onDriverClick]
 * @param {number} [opts.pinSize=40]
 * @param {number} [opts.selectedPinSize=50]
 * @param {number} [opts.zIndexBase=2]
 */
export function useDriverMarkers(
  map,
  drivers,
  {
    selectedId = null,
    onDriverClick,
    pinSize = 40,
    selectedPinSize = 50,
    zIndexBase = 2,
  } = {},
) {
  const { AdvancedMarkerElement } = useGoogleMaps();
  const markersRef = useRef(new Map());
  const handlerRef = useRef(onDriverClick);

  useEffect(() => {
    handlerRef.current = onDriverClick;
  }, [onDriverClick]);

  useEffect(() => {
    if (!map || !AdvancedMarkerElement) return;

    const seen = new Set();
    for (const d of drivers || []) {
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
      const id = String(d._id || d.driverId);
      seen.add(id);
      const isSelected = id === String(selectedId);

      const content = createImageMarkerContent(PIN_ASSETS.DRIVER, {
        size: isSelected ? selectedPinSize : pinSize,
        alt: d.name || 'Driver',
      });
      if (d.isOnTrip) {
        const img = content.querySelector('img');
        if (img) img.style.opacity = '0.55';
      }

      let marker = markersRef.current.get(id);
      if (!marker) {
        marker = new AdvancedMarkerElement({
          map,
          position: { lat: d.lat, lng: d.lng },
          content,
          title: d.name || `Driver ${id.slice(-4)}`,
          zIndex: isSelected ? zIndexBase + 2 : zIndexBase,
        });
        marker.addListener('click', () => handlerRef.current?.(d));
        markersRef.current.set(id, marker);
      } else {
        marker.position = { lat: d.lat, lng: d.lng };
        marker.content = content;
        marker.title = d.name || `Driver ${id.slice(-4)}`;
        marker.zIndex = isSelected ? zIndexBase + 2 : zIndexBase;
      }
    }

    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    }
  }, [map, drivers, selectedId, AdvancedMarkerElement, pinSize, selectedPinSize, zIndexBase]);

  // Unmount cleanup — drop every marker we ever attached.
  useEffect(() => {
    const markersMap = markersRef.current;
    return () => {
      for (const marker of markersMap.values()) {
        marker.map = null;
      }
      markersMap.clear();
    };
  }, []);
}
