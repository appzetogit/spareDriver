import { ApiError } from './apiError.js';
import { validateCarCatalogRefs } from '../services/vehicleCatalog.service.js';

export const MAX_DRIVER_VEHICLE_EXPERIENCE = 10;

/**
 * Validate and normalize vehicle experience entries from onboarding.
 */
export async function normalizeDriverVehicleExperience(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ApiError(400, 'Add at least one vehicle you have experience driving');
  }

  if (entries.length > MAX_DRIVER_VEHICLE_EXPERIENCE) {
    throw new ApiError(
      400,
      `You can add up to ${MAX_DRIVER_VEHICLE_EXPERIENCE} vehicles only`,
    );
  }

  const normalized = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const {
      carTypeId,
      brandId,
      modelId,
      fuelTypeId,
      transmission,
    } = entry || {};

    if (!carTypeId || !brandId || !modelId || !fuelTypeId || !transmission) {
      throw new ApiError(400, `Vehicle ${i + 1}: all fields are required`);
    }

    await validateCarCatalogRefs({ carTypeId, brandId, modelId, fuelTypeId });

    normalized.push({
      carTypeId,
      brandId,
      modelId,
      fuelTypeId,
      transmission: String(transmission).toLowerCase(),
    });
  }

  return normalized;
}

/** Unique category IDs for driver–customer matching index. */
export function syncCarTypeExperienceFromVehicles(vehicles) {
  const seen = new Set();
  const ids = [];
  for (const v of vehicles) {
    const id = String(v.carTypeId);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(v.carTypeId);
    }
  }
  return ids;
}
