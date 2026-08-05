import mongoose from 'mongoose';
import FuelType from '../models/fuelType.model.js';
import CarBrand from '../models/carBrand.model.js';
import CarModel from '../models/carModel.model.js';
import CarType from '../models/carType.model.js';
import { ApiError } from '../utils/apiError.js';
import { resolveCarBrandLogoUrl } from '../utils/carBrandLogo.js';

const normalizeName = (name) => String(name || '').trim().toUpperCase();

async function assertUniqueName(Model, name, excludeId = null) {
  const filter = { name: normalizeName(name) };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await Model.findOne(filter);
  if (exists) throw new ApiError(400, 'An item with this name already exists');
}

// ─── Fuel types ───────────────────────────────────────────────────────────────

export const createFuelTypeService = async (data) => {
  const name = normalizeName(data.name);
  if (!name) throw new ApiError(400, 'Name is required');
  await assertUniqueName(FuelType, name);
  return FuelType.create({
    name,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive !== false,
  });
};

export const getFuelTypesService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return FuelType.find(filter).sort({ name: 1 });
};

export const updateFuelTypeService = async (id, data) => {
  if (data.name) {
    await assertUniqueName(FuelType, data.name, id);
    data.name = normalizeName(data.name);
  }
  const item = await FuelType.findByIdAndUpdate(id, data, { new: true });
  if (!item) throw new ApiError(404, 'Fuel type not found');
  return item;
};

export const deleteFuelTypeService = async (id) => {
  const item = await FuelType.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Fuel type not found');
  return { id };
};

// ─── Car brands ───────────────────────────────────────────────────────────────

export const createCarBrandService = async (data) => {
  const name = normalizeName(data.name);
  if (!name) throw new ApiError(400, 'Name is required');
  await assertUniqueName(CarBrand, name);
  const logo =
    typeof data.logo === 'string' && data.logo.trim()
      ? data.logo.trim()
      : resolveCarBrandLogoUrl(name);
  return CarBrand.create({
    name,
    logo,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive !== false,
  });
};

export const getCarBrandsService = async (onlyActive = false) => {
  const filter = onlyActive ? { isActive: true } : {};
  return CarBrand.find(filter).sort({ name: 1 });
};

export const updateCarBrandService = async (id, data) => {
  const patch = { ...data };
  if (patch.name) {
    await assertUniqueName(CarBrand, patch.name, id);
    patch.name = normalizeName(patch.name);
  }
  if (typeof patch.logo === 'string') {
    patch.logo = patch.logo.trim();
  }
  // If name changed and logo was not explicitly sent, refresh CDN logo only
  // when the current logo is empty or still a jsDelivr brand-logos URL.
  if (patch.name && patch.logo === undefined) {
    const existing = await CarBrand.findById(id).select('logo');
    if (!existing) throw new ApiError(404, 'Car brand not found');
    const current = existing.logo || '';
    const isCdnOrEmpty =
      !current || current.includes('vehiclespecs/brand-logos');
    if (isCdnOrEmpty) {
      patch.logo = resolveCarBrandLogoUrl(patch.name);
    }
  }
  const item = await CarBrand.findByIdAndUpdate(id, patch, { new: true });
  if (!item) throw new ApiError(404, 'Car brand not found');
  return item;
};

export const deleteCarBrandService = async (id) => {
  const item = await CarBrand.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Car brand not found');
  await CarModel.deleteMany({ brandId: id });
  return { id };
};

// ─── Car models ─────────────────────────────────────────────────────────────────

export const createCarModelService = async (data) => {
  const name = normalizeName(data.name);
  const { brandId, carTypeId } = data;
  if (!name || !brandId) throw new ApiError(400, 'Name and brand are required');

  const brand = await CarBrand.findById(brandId);
  if (!brand) throw new ApiError(400, 'Invalid car brand');

  if (carTypeId) {
    const category = await CarType.findById(carTypeId);
    if (!category) throw new ApiError(400, 'Invalid car category');
  }

  const exists = await CarModel.findOne({ brandId, name });
  if (exists) throw new ApiError(400, 'This model already exists for the selected brand');

  return CarModel.create({
    name,
    brandId,
    carTypeId: carTypeId || null,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive !== false,
  });
};

export const getCarModelsService = async ({ onlyActive = false, brandId, carTypeId } = {}) => {
  const filter = {};
  if (onlyActive) filter.isActive = true;
  if (brandId) filter.brandId = brandId;
  if (carTypeId) {
    filter.$or = [{ carTypeId }, { carTypeId: null }];
  }

  return CarModel.find(filter)
    .populate('brandId', 'name')
    .populate('carTypeId', 'name')
    .sort({ name: 1 });
};

export const updateCarModelService = async (id, data) => {
  const existing = await CarModel.findById(id);
  if (!existing) throw new ApiError(404, 'Car model not found');

  if (data.name) data.name = normalizeName(data.name);
  if (data.brandId) {
    const brand = await CarBrand.findById(data.brandId);
    if (!brand) throw new ApiError(400, 'Invalid car brand');
  }
  if (data.carTypeId) {
    const category = await CarType.findById(data.carTypeId);
    if (!category) throw new ApiError(400, 'Invalid car category');
  }

  const brandId = data.brandId || existing.brandId;
  const name = data.name || existing.name;
  const duplicate = await CarModel.findOne({
    _id: { $ne: id },
    brandId,
    name,
  });
  if (duplicate) throw new ApiError(400, 'This model already exists for the selected brand');

  return CarModel.findByIdAndUpdate(id, data, { new: true })
    .populate('brandId', 'name')
    .populate('carTypeId', 'name');
};

export const deleteCarModelService = async (id) => {
  const item = await CarModel.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Car model not found');
  return { id };
};

/** Validate catalog refs for user car registration */
export async function validateCarCatalogRefs({ carTypeId, brandId, modelId, fuelTypeId }) {
  if (!mongoose.Types.ObjectId.isValid(carTypeId)) {
    throw new ApiError(400, 'Invalid car category');
  }
  if (!mongoose.Types.ObjectId.isValid(brandId)) {
    throw new ApiError(400, 'Invalid car brand');
  }
  if (!mongoose.Types.ObjectId.isValid(modelId)) {
    throw new ApiError(400, 'Invalid car model');
  }
  if (!mongoose.Types.ObjectId.isValid(fuelTypeId)) {
    throw new ApiError(400, 'Invalid fuel type');
  }

  const [category, brand, model, fuel] = await Promise.all([
    CarType.findById(carTypeId),
    CarBrand.findById(brandId),
    CarModel.findById(modelId),
    FuelType.findById(fuelTypeId),
  ]);

  if (!category?.isActive) throw new ApiError(400, 'Selected car category is not available');
  if (!brand?.isActive) throw new ApiError(400, 'Selected car brand is not available');
  if (!model?.isActive) throw new ApiError(400, 'Selected car model is not available');
  if (!fuel?.isActive) throw new ApiError(400, 'Selected fuel type is not available');

  if (String(model.brandId) !== String(brandId)) {
    throw new ApiError(400, 'Car model does not belong to the selected brand');
  }

  if (model.carTypeId && String(model.carTypeId) !== String(carTypeId)) {
    throw new ApiError(400, 'Car model does not match the selected category');
  }

  return { category, brand, model, fuel };
}
