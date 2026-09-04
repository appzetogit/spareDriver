/**
 * Lightweight wrappers around the Google Maps Geocoding API.
 *
 * Centralized so callers don't need to know about the callback-style geocoder
 * or how to extract a sensible "city" out of the address components.
 */

import { INDIA_MAP_BOUNDS } from '../constants/mapDefaults';

const CITY_TYPES = ['locality', 'administrative_area_level_2'];

function buildFallback(lat, lng) {
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;
  return {
    address: `${safeLat.toFixed(5)}, ${safeLng.toFixed(5)}`,
    city: '',
    country: null,
    lat: safeLat,
    lng: safeLng,
  };
}

function pickCityFromComponents(components = []) {
  const match = components.find((c) =>
    c.types?.some((t) => CITY_TYPES.includes(t)),
  );
  return match?.long_name || '';
}

function pickCountryFromComponents(components = []) {
  const match = components.find((c) => c.types?.includes('country'));
  return match?.short_name || null;
}

/**
 * Cheap bounding-box test against `INDIA_MAP_BOUNDS`.
 *
 * The box is generous — it catches parts of Pakistan, China, Nepal, Bhutan,
 * Bangladesh and Myanmar — so this is only ever the first pass. The geocoder's
 * country code is the authoritative check; see `isPointInIndia`.
 */
export function isInsideIndiaBounds(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  return (
    lat >= INDIA_MAP_BOUNDS.south &&
    lat <= INDIA_MAP_BOUNDS.north &&
    lng >= INDIA_MAP_BOUNDS.west &&
    lng <= INDIA_MAP_BOUNDS.east
  );
}

/**
 * Authoritative "may we book from here?" check for a geocoded point.
 *
 * A point with no resolved `country` is trusted if it clears the bounding box:
 * a transient `OVER_QUERY_LIMIT` must not block a legitimate pin in Indore.
 *
 * @param {{ lat:number, lng:number, country?:string|null }|null} point
 */
export function isPointInIndia(point) {
  if (!point) return false;
  if (!isInsideIndiaBounds(point.lat, point.lng)) return false;
  if (point.country && point.country !== 'IN') return false;
  return true;
}

/**
 * Reverse geocode a lat/lng into a friendly `{ address, city, lat, lng }`.
 * Never throws — returns a coordinate-string fallback on any failure.
 *
 * @param {*} maps   The `google.maps` namespace from `useGoogleMaps`.
 * @param {{lat:number,lng:number}} point
 * @param {{geocoder?: google.maps.Geocoder}} [opts]
 */
export async function reverseGeocode(maps, { lat, lng }, opts = {}) {
  if (!maps || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return buildFallback(lat, lng);
  }
  const geocoder = opts.geocoder || new maps.Geocoder();
  try {
    const results = await new Promise((resolve, reject) => {
      geocoder.geocode({ location: { lat, lng } }, (res, status) => {
        if (status === 'OK') resolve(res || []);
        else reject(new Error(status));
      });
    });
    const top = results[0];
    if (!top) return buildFallback(lat, lng);
    return {
      address: top.formatted_address || buildFallback(lat, lng).address,
      city: pickCityFromComponents(top.address_components),
      country: pickCountryFromComponents(top.address_components),
      lat,
      lng,
    };
  } catch {
    return buildFallback(lat, lng);
  }
}

/**
 * Forward geocode a free-text query into a `{ address, city, lat, lng }`.
 * Returns `null` if no result is found.
 */
export async function forwardGeocode(maps, query, opts = {}) {
  if (!maps || !query?.trim()) return null;
  const geocoder = opts.geocoder || new maps.Geocoder();
  try {
    const results = await new Promise((resolve, reject) => {
      geocoder.geocode(
        opts.componentRestrictions
          ? { address: query, componentRestrictions: opts.componentRestrictions }
          : { address: query },
        (res, status) => {
          if (status === 'OK') resolve(res || []);
          else reject(new Error(status));
        },
      );
    });
    const top = results[0];
    if (!top?.geometry?.location) return null;
    const loc = top.geometry.location;
    const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
    return {
      address: top.formatted_address || query,
      city: pickCityFromComponents(top.address_components),
      country: pickCountryFromComponents(top.address_components),
      lat,
      lng,
    };
  } catch {
    return null;
  }
}
