import { useCallback, useMemo, useState } from 'react';
import { haversineMeters, estimateEtaMinutes } from '../utils/geo';

/**
 * One distance per trip screen.
 *
 * `TripTrackingMap` already asks Google Directions for a road-following route
 * and reports what it found through `onEtaChange`. Every page around it was
 * separately computing its own straight-line haversine, so the same screen
 * could show "2.4 km" on the map and "1.6 km away" in the sheet below it — two
 * different questions answered as if they were one.
 *
 * This hook is the single answer. Hand its `onEtaChange` to the map, render
 * what it returns, and the numbers agree because there is only one of them.
 *
 * Straight-line distance stays as the fallback for the moment before
 * Directions replies (and for when it fails), and `isRoadDistance` says which
 * you are looking at — a crow-flies number is not wrong, it is just answering a
 * different question, and a caller phrasing a label deserves to know.
 *
 * Freshness is deliberately part of the contract. A frozen position keeps
 * producing a perfectly computable distance; `isReliable` is what stops that
 * from being rendered as though the driver were still moving.
 *
 * @param {{
 *   origin?: {lat:number,lng:number}|null,
 *   destination?: {lat:number,lng:number}|null,
 *   isStale?: boolean,
 *   accuracyMeters?: number|null,
 * }} params
 */

/**
 * Worst driver-fix accuracy we will quote an exact distance from.
 *
 * Past this the honest answer is "somewhere around here". The ingest pipeline
 * already refuses looser fixes while a customer is watching, so this mostly
 * catches positions recorded before that gate existed.
 */
const MAX_QUOTABLE_ACCURACY_M = 150;

export function useTripEta({
  origin = null,
  destination = null,
  isStale = false,
  accuracyMeters = null,
} = {}) {
  const [route, setRoute] = useState({ distanceMeters: null, etaMinutes: null });

  // Stable identity: the map passes this straight into a `useEffect`
  // dependency list, and a new function each render would re-fire it.
  const onEtaChange = useCallback((next) => {
    setRoute({
      distanceMeters: Number.isFinite(next?.distanceMeters) ? next.distanceMeters : null,
      etaMinutes: Number.isFinite(next?.etaMinutes) ? next.etaMinutes : null,
    });
  }, []);

  const straightLineMeters = useMemo(() => {
    if (!origin || !destination) return null;
    const d = haversineMeters(origin, destination);
    return Number.isFinite(d) ? d : null;
  }, [origin, destination]);

  const isRoadDistance = Number.isFinite(route.distanceMeters);

  const distanceMeters = isRoadDistance ? route.distanceMeters : straightLineMeters;

  const etaMinutes = Number.isFinite(route.etaMinutes)
    ? route.etaMinutes
    : estimateEtaMinutes(straightLineMeters ?? NaN);

  const isReliable =
    distanceMeters != null
    && !isStale
    && (!Number.isFinite(accuracyMeters) || accuracyMeters <= MAX_QUOTABLE_ACCURACY_M);

  return {
    /** Metres — road distance when Directions has answered, else crow-flies. */
    distanceMeters,
    etaMinutes,
    /** True once the number came from a real route rather than a straight line. */
    isRoadDistance,
    /** False when the position is stale or too vague to quote a figure from. */
    isReliable,
    /** Pass to `<TripTrackingMap onEtaChange={...} />`. */
    onEtaChange,
  };
}

export default useTripEta;
