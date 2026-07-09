import { useMemo } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

/**
 * Canonical Google Maps loader for the entire app.
 *
 * Built on `@react-google-maps/api`'s `useJsApiLoader`, which under the hood
 * still uses the official `@googlemaps/js-api-loader` (bundled as a transitive
 * dependency) but exposes a tidy React-friendly API and a stable
 * "ready / error" surface. Critically the loader is idempotent: every
 * consumer in the tree gets the same Promise — calling it from twenty
 * components only loads the JS once.
 *
 * The library list and version are declared at module scope (rather than
 * inside the component) because `useJsApiLoader` requires referentially
 * stable values to avoid re-mounting the script tag.
 *
 *   - `places`  : Autocomplete for the pickup/drop pickers.
 *   - `geometry`: `decodePath` for encoded Directions polylines + spherical
 *                 helpers used by zone math.
 *   - `marker`  : Advanced Marker / Pin element (used by the legacy
 *                 imperative code paths that haven't migrated to the
 *                 declarative `<MarkerF>` yet).
 *   - `drawing` : Polygon / circle editor on the admin zone management page.
 *
 * Returned shape:
 *   { isLoaded, loadError, maps }
 *
 *   - `maps`   : `google.maps` namespace, or `null` until the loader resolves.
 *                Pages that need to call `new google.maps.DirectionsService()`
 *                or similar should read it from here so they don't have to
 *                touch `window.google` directly.
 */

const GOOGLE_MAPS_ID = 'sparedriver-gmaps-loader';
const GOOGLE_MAPS_VERSION = 'weekly';
// Loaded libraries — MUST stay stable across renders for the loader to be
// deduped. Adding a new library here loads it for every map automatically.
const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry', 'marker', 'drawing'];

export const MAPS_SETUP_HELP =
  'Enable Maps JavaScript API and Places API (New); add Geocoding API for reverse-geocode; whitelist http://localhost:5173/* on your API key.';

export function useGoogleMap() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';

  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: GOOGLE_MAPS_VERSION,
    // Surface auth failures (bad key, missing referrer) as a normal error
    // through `gm_authFailure` so consumers can render a help message.
    preventGoogleFontsLoading: false,
  });

  return useMemo(() => {
    if (!apiKey) {
      return {
        isLoaded: false,
        loadError: new Error('Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env'),
        maps: null,
      };
    }
    return {
      isLoaded,
      loadError: loadError || null,
      maps: isLoaded && typeof window !== 'undefined' ? window.google?.maps ?? null : null,
    };
  }, [apiKey, isLoaded, loadError]);
}

export default useGoogleMap;
