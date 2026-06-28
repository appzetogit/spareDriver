import { ZONE_SHAPE } from '../constants/zoneShapes';

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointInPolygon(lat, lng, points = []) {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].lng;
    const yi = points[i].lat;
    const xj = points[j].lng;
    const yj = points[j].lat;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInCircle(lat, lng, center, radiusKm) {
  if (!center || radiusKm == null) return false;
  return haversineKm({ lat, lng }, center) <= Number(radiusKm);
}

/**
 * Returns true when `{ lat, lng }` lies inside an active service zone.
 * Supports circle (center + radiusKm) and polygon zones from admin API.
 */
export function pointInZone(lat, lng, zone) {
  if (lat == null || lng == null || !zone) return false;
  if (zone.shapeType === ZONE_SHAPE.POLYGON) {
    return pointInPolygon(lat, lng, zone.polygonPoints || []);
  }
  return pointInCircle(lat, lng, { lat: zone.lat, lng: zone.lng }, zone.radiusKm);
}

/** First matching active zone for a point, or null. */
export function findZoneForPoint(lat, lng, zones = []) {
  for (const zone of zones) {
    if (zone.isActive === false) continue;
    if (pointInZone(lat, lng, zone)) return zone;
  }
  return null;
}
