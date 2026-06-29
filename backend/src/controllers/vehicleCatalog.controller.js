import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import * as catalogService from '../services/vehicleCatalog.service.js';
import * as platformService from '../services/platform.service.js';

const onlyActive = (req) => req.query.active === 'true';

/** Single request for car registration dropdowns + safety checklist. */
export const getVehicleCatalog = asyncHandler(async (req, res) => {
  const active = onlyActive(req);
  const [carTypes, fuelTypes, carBrands, conditions] = await Promise.all([
    platformService.getAllCarTypesService(active),
    catalogService.getFuelTypesService(active),
    catalogService.getCarBrandsService(active),
    platformService.getAllConditionsService(active),
  ]);
  return res.status(200).json(
    new ApiResponse(
      200,
      { carTypes, fuelTypes, carBrands, conditions },
      'Vehicle catalog fetched successfully',
    ),
  );
});

// ─── Fuel types ───────────────────────────────────────────────────────────────

export const getFuelTypes = asyncHandler(async (req, res) => {
  const data = await catalogService.getFuelTypesService(onlyActive(req));
  return res.status(200).json(new ApiResponse(200, data, 'Fuel types fetched successfully'));
});

export const getAdminFuelTypes = asyncHandler(async (_req, res) => {
  const data = await catalogService.getFuelTypesService(false);
  return res.status(200).json(new ApiResponse(200, data, 'Fuel types fetched successfully'));
});

export const createFuelType = asyncHandler(async (req, res) => {
  const data = await catalogService.createFuelTypeService(req.body);
  return res.status(201).json(new ApiResponse(201, data, 'Fuel type created successfully'));
});

export const updateFuelType = asyncHandler(async (req, res) => {
  const data = await catalogService.updateFuelTypeService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, data, 'Fuel type updated successfully'));
});

export const deleteFuelType = asyncHandler(async (req, res) => {
  await catalogService.deleteFuelTypeService(req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Fuel type deleted successfully'));
});

// ─── Car brands ───────────────────────────────────────────────────────────────

export const getCarBrands = asyncHandler(async (req, res) => {
  const data = await catalogService.getCarBrandsService(onlyActive(req));
  return res.status(200).json(new ApiResponse(200, data, 'Car brands fetched successfully'));
});

export const getAdminCarBrands = asyncHandler(async (_req, res) => {
  const data = await catalogService.getCarBrandsService(false);
  return res.status(200).json(new ApiResponse(200, data, 'Car brands fetched successfully'));
});

export const createCarBrand = asyncHandler(async (req, res) => {
  const data = await catalogService.createCarBrandService(req.body);
  return res.status(201).json(new ApiResponse(201, data, 'Car brand created successfully'));
});

export const updateCarBrand = asyncHandler(async (req, res) => {
  const data = await catalogService.updateCarBrandService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, data, 'Car brand updated successfully'));
});

export const deleteCarBrand = asyncHandler(async (req, res) => {
  await catalogService.deleteCarBrandService(req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Car brand deleted successfully'));
});

// ─── Car models ───────────────────────────────────────────────────────────────

export const getCarModels = asyncHandler(async (req, res) => {
  const data = await catalogService.getCarModelsService({
    onlyActive: onlyActive(req),
    brandId: req.query.brandId,
    carTypeId: req.query.carTypeId,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Car models fetched successfully'));
});

export const getAdminCarModels = asyncHandler(async (req, res) => {
  const data = await catalogService.getCarModelsService({
    onlyActive: false,
    brandId: req.query.brandId,
    carTypeId: req.query.carTypeId,
  });
  return res.status(200).json(new ApiResponse(200, data, 'Car models fetched successfully'));
});

export const createCarModel = asyncHandler(async (req, res) => {
  const data = await catalogService.createCarModelService(req.body);
  return res.status(201).json(new ApiResponse(201, data, 'Car model created successfully'));
});

export const updateCarModel = asyncHandler(async (req, res) => {
  const data = await catalogService.updateCarModelService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, data, 'Car model updated successfully'));
});

export const deleteCarModel = asyncHandler(async (req, res) => {
  await catalogService.deleteCarModelService(req.params.id);
  return res.status(200).json(new ApiResponse(200, null, 'Car model deleted successfully'));
});
