import mongoose from 'mongoose';
import { Driver } from '../models/driverModels/driver.model.js';

/**
 * Reusable driver-finder service.
 *
 * Two helpers, both Mongo-backed (no Firebase reads — Mongo's snapshot is at
 * most ~60s stale and is the single source of truth for `$geoNear`):
 *
 *   - `findDriversWithinRadius`      one shot, returns sorted-by-distance
 *   - `findDriversInExpandingRadius`  starts small, grows until N drivers
 *                                     fit (1 km → 2 km → ... → max)
 *
 * The home page calls the first one (2 km, no expansion). The booking
 * dispatcher calls the second one (start 1 km, expand to 5 km or the
 * zone radius). The driver schema returned is identical so both callers
 * can render the same UI / payload.
 */

const ONE_KM_METERS = 1000;

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateCoords({ lat, lng }) {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeRadius(meters, fallback) {
  const n = Number(meters);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.round(n), 100), 100_000); // 100m..100km hard cap
}

function shapeDriverHit(raw) {
  const [lng = 0, lat = 0] = raw.location?.coordinates || [];
  const primaryCarType = Array.isArray(raw.carTypes) && raw.carTypes[0];
  return {
    _id: String(raw._id),
    name: raw.name,
    profilePicture: raw.profilePicture || '',
    rating: raw.rating || 0,
    isOnTrip: !!raw.isOnTrip,
    isOnline: !!raw.isOnline,
    vehicleType: primaryCarType?.name || '',
    vehicleTypeId: primaryCarType?._id ? String(primaryCarType._id) : null,
    experienceYears: Number(raw.experienceYears) || 0,
    lat,
    lng,
    lastLocationAt: raw.lastLocationAt || null,
    distanceMeters: Math.round(raw.distanceMeters || 0),
  };
}

/**
 * Find online, approved drivers within a radius of the given point.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} [params.radiusMeters=2000]
 * @param {number} [params.limit=10]
 * @param {string[]} [params.carTypeIds]      Optional — restrict to drivers
 *                                            who can drive any of these car types.
 * @param {string[]} [params.excludeDriverIds] Driver IDs to skip (e.g. already offered)
 * @param {boolean} [params.includeOnTrip=false] Include drivers who are mid-trip.
 * @returns {Promise<Array<{
 *   _id:string, name:string, profilePicture:string, rating:number,
 *   isOnTrip:boolean, isOnline:boolean, vehicleType:string,
 *   vehicleTypeId:string|null, lat:number, lng:number,
 *   lastLocationAt:Date|null, distanceMeters:number
 * }>>}
 */
export async function findDriversWithinRadius({
  lat,
  lng,
  radiusMeters = 2000,
  limit = 10,
  carTypeIds,
  excludeDriverIds,
  includeOnTrip = false,
  extraMatch = null,
} = {}) {
  if (!validateCoords({ lat, lng })) return [];

  const radius = normalizeRadius(radiusMeters, 2000);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const excludeIds = (excludeDriverIds || [])
    .map(toObjectId)
    .filter(Boolean);

  const match = {
    isOnline: true,
    approvalStatus: 'approved',
    isDeleted: false,
    ...(extraMatch && typeof extraMatch === 'object' ? extraMatch : {}),
  };
  if (!includeOnTrip) match.isOnTrip = false;
  if (excludeIds.length) match._id = { $nin: excludeIds };
  if (carTypeIds?.length) {
    const carTypeOids = carTypeIds.map(toObjectId).filter(Boolean);
    if (carTypeOids.length) match.carTypeExperience = { $in: carTypeOids };
  }

  // We sort by experienceYears DESC then distance ASC. `$geoNear`'s
  // default ordering is distance ASC, so we over-fetch (3x the limit,
  // capped at 50) within the radius and re-sort in-memory so the most
  // experienced drivers get the offer first while still preferring
  // nearby drivers as the tie-breaker.
  const overFetch = Math.min(50, safeLimit * 3);
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: radius,
        spherical: true,
        key: 'location',
        query: match,
      },
    },
    { $limit: overFetch },
    {
      $lookup: {
        from: 'cartypes',
        localField: 'carTypeExperience',
        foreignField: '_id',
        as: 'carTypes',
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    { $sort: { experienceYears: -1, distanceMeters: 1 } },
    { $limit: safeLimit },
    {
      $project: {
        _id: 1,
        name: 1,
        profilePicture: 1,
        rating: 1,
        isOnTrip: 1,
        isOnline: 1,
        location: 1,
        lastLocationAt: 1,
        distanceMeters: 1,
        carTypes: 1,
        experienceYears: 1,
      },
    },
  ];

  const rows = await Driver.aggregate(pipeline);
  return rows.map(shapeDriverHit);
}

/**
 * Expanding-ring search. Starts at `startMeters` and grows in `stepMeters`
 * increments until the result set is satisfactory or the radius hits
 * `maxMeters`. Used by the dispatcher so we always start small (better UX —
 * drivers closer to the pickup get the offer first) but never give up
 * until the whole zone has been searched.
 *
 * Returns:
 *   { drivers, radiusMeters }   — the radius the result was found at.
 *
 * Behaviour:
 *   - If `minResults` is met at any radius, returns immediately.
 *   - If never met, returns whatever was found at `maxMeters` (could be
 *     fewer than `limit`).
 *   - If nothing is found at any radius, returns `{ drivers: [], radiusMeters: maxMeters }`.
 *
 * @param {object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} [params.startMeters=1000]
 * @param {number} [params.stepMeters=1000]
 * @param {number} [params.maxMeters=5000]
 * @param {number} [params.limit=5]            cap drivers returned at this radius
 * @param {number} [params.minResults=1]       expand if fewer than this many found
 * @param {string[]} [params.carTypeIds]
 * @param {string[]} [params.excludeDriverIds]
 */
export async function findDriversInExpandingRadius({
  lat,
  lng,
  startMeters = ONE_KM_METERS,
  stepMeters = ONE_KM_METERS,
  maxMeters = 5 * ONE_KM_METERS,
  limit = 5,
  minResults = 1,
  carTypeIds,
  excludeDriverIds,
} = {}) {
  if (!validateCoords({ lat, lng })) {
    return { drivers: [], radiusMeters: maxMeters };
  }

  const safeStart = normalizeRadius(startMeters, ONE_KM_METERS);
  const safeStep = Math.max(100, Number(stepMeters) || ONE_KM_METERS);
  const safeMax = Math.max(safeStart, normalizeRadius(maxMeters, 5 * ONE_KM_METERS));
  const target = Math.max(1, Number(minResults) || 1);

  let radius = safeStart;
  let drivers = [];

  while (radius <= safeMax) {
    // eslint-disable-next-line no-await-in-loop
    drivers = await findDriversWithinRadius({
      lat,
      lng,
      radiusMeters: radius,
      limit,
      carTypeIds,
      excludeDriverIds,
    });

    if (drivers.length >= target) {
      return { drivers, radiusMeters: radius };
    }
    if (radius >= safeMax) break;
    radius = Math.min(radius + safeStep, safeMax);
  }

  return { drivers, radiusMeters: radius };
}
