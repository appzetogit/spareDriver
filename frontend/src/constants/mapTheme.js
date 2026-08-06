/**
 * Shared map look-and-feel for every consumer-facing screen.
 *
 *   1. `PIN_ASSETS`         — paths to the in-app pin images.
 *   2. `RAPIDO_MAP_STYLES`  — a Rapido-style colour palette for the basemap.
 *                             Applied to maps without a vector mapId or to
 *                             raster mapIds. (Vector-mapId maps must be
 *                             styled in Google Cloud Console — see the
 *                             `VITE_GOOGLE_MAP_ID` env to point at a custom
 *                             cloud style.)
 *   3. `RAPIDO_MAP_OPTIONS` — common `google.maps.Map` options consumer
 *                             screens should spread on construction.
 *   4. `createImageMarkerContent` — builds the HTML element used as
 *                             `AdvancedMarkerElement.content` so any image
 *                             from `PIN_ASSETS` can sit on a map.
 *
 * Use this from `NearbyDriversMap`, `HourlyTripDetailsPage`,
 * `SelectPickupPage`, and any future consumer map. Admin tools keep their
 * data-dense default Google styling intact.
 */

import { BOOKING_STATUS } from './bookingStatus';

export const PIN_ASSETS = Object.freeze({
  /** Where the user themself is right now. Green pin with a person. */
  CURRENT_LOCATION: '/images/pin/location.png',
  /** Each nearby/online driver. Coral pin with a person silhouette. */
  DRIVER: '/images/pin/user.png',
  /** Driver heading to pickup (en route). Direction arrow. */
  DRIVER_EN_ROUTE: '/images/pin/right-arrow.png',
  /** Driver on an active trip (after start). Car pin. */
  DRIVER_IN_TRIP: '/images/pin/car.png',
  /** The pickup location for a booking. Coral pin with a car. */
  PICKUP: '/images/pin/gps.png',
});

/**
 * Live-trip driver pin: arrow while heading to pickup, car pin once
 * the trip has started. Falls back to the generic nearby-driver pin.
 *
 * @param {string|null|undefined} status  Booking status enum value
 * @returns {string} Public image path
 */
export function driverPinForStatus(status) {
  if (status === BOOKING_STATUS.STARTED) return PIN_ASSETS.DRIVER_IN_TRIP;
  if (
    status === BOOKING_STATUS.EN_ROUTE ||
    status === BOOKING_STATUS.DRIVER_ASSIGNED ||
    status === BOOKING_STATUS.AWAITING_PAYMENT ||
    status === BOOKING_STATUS.ARRIVED
  ) {
    return PIN_ASSETS.DRIVER_EN_ROUTE;
  }
  return PIN_ASSETS.DRIVER;
}

/* -------------------------------------------------------------------------- */
/* Polyline theme                                                             */
/* -------------------------------------------------------------------------- */
/**
 * Single source of truth for the route polyline's look — colour, opacity,
 * weight, the (optional) outline behind it, and the dashed-loading style.
 */
export const ROUTE_POLYLINE = Object.freeze({
  STROKE: Object.freeze({
    strokeColor: '#1a1a1a',
    strokeOpacity: 0.95,
    strokeWeight: 5,
    geodesic: true,
    clickable: false,
  }),
  OUTLINE: Object.freeze({
    strokeColor: '#ffffff',
    strokeOpacity: 0.85,
    strokeWeight: 9,
    geodesic: true,
    clickable: false,
  }),
  DASHED: Object.freeze({
    strokeColor: '#1F8A4C',
    repeat: '12px',
    dotScale: 2.5,
  }),
  /** Default for the `showOutline` prop on `<RoutePolyline>`. */
  OUTLINE_DEFAULT: true,
});

/* -------------------------------------------------------------------------- */
/* Z-index layering for overlays                                              */
/* -------------------------------------------------------------------------- */
export const MAP_Z_INDEX = Object.freeze({
  POLYLINE_OUTLINE: 1,
  POLYLINE_STROKE: 2,
  USER_MARKER: 50,
  DRIVER_MARKER: 60,
});

/**
 * Low-clutter basemap: roads stay visible, POIs / business labels / transit
 * are stripped so the driver pin + route read first.
 *
 * NB: When a *vector* mapId is in use, Google ignores `styles`. Cloud-styled
 * Map IDs are the long-term fix via `VITE_GOOGLE_MAP_ID`.
 */
export const RAPIDO_MAP_STYLES = Object.freeze([
  { elementType: 'geometry', stylers: [{ color: '#f5f0e8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8074' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fdfbf6' }] },

  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },

  // Strip all POIs (businesses, attractions, etc.)
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
  // Soft parks only — geometry, no labels.
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e4eedc' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },

  // Roads — keep hierarchy readable, hide minor road names to reduce clutter.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e4ddd2' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fff8ec' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#9a9084' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffe2a8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e6b86e' }] },
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#ffd07a' }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9dce8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5a7f96' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#f0ebe3' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ebe6dc' }] },
]);

/** Defaults every consumer map should start with. */
export const RAPIDO_MAP_OPTIONS = Object.freeze({
  disableDefaultUI: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
  backgroundColor: '#f5f0e8',
  styles: RAPIDO_MAP_STYLES,
});

/**
 * Builds an HTMLElement to feed into `AdvancedMarkerElement.content`. The
 * marker's anchor is the bottom-centre of the element (Google default), so
 * the pin's tip will sit on the requested coordinate.
 *
 * @param {string} src              Public path of the pin image.
 * @param {object} [opts]
 * @param {number} [opts.size=48]   Pin width in CSS pixels.
 * @param {string} [opts.alt='Pin'] Image alt text.
 * @param {boolean} [opts.bounce]   Adds a gentle entry bounce — use sparingly.
 * @returns {HTMLDivElement}
 */
export function createImageMarkerContent(src, { size = 48, alt = 'Pin', bounce = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'gmap-image-pin';
  wrapper.style.cssText = [
    `width:${size}px`,
    `height:${Math.round(size * 1.25)}px`,
    'display:flex',
    'align-items:flex-end',
    'justify-content:center',
    'margin-bottom:-4px',
    'pointer-events:auto',
    bounce ? 'animation:gmap-pin-bounce 280ms ease-out;' : '',
  ].join(';');

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  img.style.cssText = [
    'width:100%',
    'height:100%',
    'object-fit:contain',
    'filter:drop-shadow(0 4px 6px rgba(15, 23, 42, 0.22))',
    'transition:transform 140ms ease-out',
  ].join(';');
  wrapper.appendChild(img);
  return wrapper;
}
