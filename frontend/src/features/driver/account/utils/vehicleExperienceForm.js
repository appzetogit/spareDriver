import { emptyVehicleFormValues } from '../../../../components/vehicle/VehicleDetailsForm';

export const mapVehicleFromApi = (v) => ({
  carTypeId: String(v.carTypeId?._id || v.carTypeId || ''),
  brandId: String(v.brandId?._id || v.brandId || ''),
  modelId: String(v.modelId?._id || v.modelId || ''),
  fuelTypeId: String(v.fuelTypeId?._id || v.fuelTypeId || ''),
  transmission: v.transmission || 'manual',
  // Instant Select labels while catalog options are still fetching.
  _labels: {
    brand: v.brandId?.name || '',
    carType: v.carTypeId?.name || '',
    model: v.modelId?.name || '',
    fuelType: v.fuelTypeId?.name || '',
  },
});

export const vehiclesFromProfile = (profile) => {
  if (profile?.vehicleExperience?.length) {
    return profile.vehicleExperience.map(mapVehicleFromApi);
  }
  if (profile?.carTypeExperience?.length) {
    return profile.carTypeExperience.map((t) => ({
      ...emptyVehicleFormValues,
      carTypeId: String(t._id || t),
    }));
  }
  return [{ ...emptyVehicleFormValues }];
};

export const validateVehicles = (vehicles) => {
  const fieldErrors = {};
  let valid = true;

  if (!vehicles.length) {
    return { valid: false, fieldErrors: { _form: 'Add at least one vehicle' } };
  }

  vehicles.forEach((v, index) => {
    const err = {};
    if (!v.carTypeId) err.carTypeId = 'Required';
    if (!v.brandId) err.brandId = 'Required';
    if (!v.modelId) err.modelId = 'Required';
    if (!v.fuelTypeId) err.fuelTypeId = 'Required';
    if (!v.transmission) err.transmission = 'Required';
    if (Object.keys(err).length) {
      fieldErrors[index] = err;
      valid = false;
    }
  });

  return { valid, fieldErrors };
};
