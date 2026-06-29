import Select from '../Select';
import Input from '../Input';
import { Car } from 'lucide-react';
import { useVehicleCatalog } from '../../hooks/useVehicleCatalog';
import { TRANSMISSION_OPTIONS } from '../../utils/vehicleCatalog';

const emptyValues = {
  carTypeId: '',
  brandId: '',
  modelId: '',
  fuelTypeId: '',
  vehicleNumber: '',
  transmission: 'manual',
};

/**
 * Reusable vehicle detail fields for user car registration.
 */
const VehicleDetailsForm = ({
  values = emptyValues,
  onChange,
  errors = {},
  disabled = false,
  showVehicleNumber = true,
  editLabels = null,
}) => {
  const {
    categoryOptions,
    fuelOptions,
    brandOptions,
    modelOptions,
    loading,
    modelsLoading,
    error: catalogError,
  } = useVehicleCatalog({
    brandId: values.brandId,
    carTypeId: values.carTypeId,
  });

  const setField = (field) => (val) => {
    const next = { ...values, [field]: val };
    if (field === 'carTypeId') {
      next.modelId = '';
    }
    if (field === 'brandId') {
      next.modelId = '';
    }
    onChange(next);
  };

  return (
    <div className="space-y-5">
      {catalogError && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {catalogError}
        </p>
      )}

      <Select
        label="Car category"
        options={categoryOptions}
        value={values.carTypeId}
        onChange={setField('carTypeId')}
        placeholder={loading ? 'Loading...' : 'Select category'}
        error={errors.carTypeId}
        searchable
        disabled={disabled || loading}
        prefilledLabel={editLabels?.carType}
      />

      <Select
        label="Car brand"
        options={brandOptions}
        value={values.brandId}
        onChange={setField('brandId')}
        placeholder={loading ? 'Loading...' : 'Select brand'}
        error={errors.brandId}
        searchable
        disabled={disabled || loading}
        prefilledLabel={editLabels?.brand}
      />

      <Select
        label="Car model"
        options={modelOptions}
        value={values.modelId}
        onChange={setField('modelId')}
        placeholder={
          !values.brandId
            ? 'Select brand first'
            : modelsLoading
              ? 'Loading models...'
              : modelOptions.length
                ? 'Select model'
                : 'No models for this brand'
        }
        error={errors.modelId}
        searchable
        disabled={disabled || !values.brandId || modelsLoading}
        prefilledLabel={editLabels?.model}
      />

      {showVehicleNumber && (
        <Input
          label="Vehicle number"
          placeholder="e.g. MP09 AB 1234"
          value={values.vehicleNumber}
          onChange={(e) => setField('vehicleNumber')(e.target.value)}
          error={errors.vehicleNumber}
          icon={Car}
          className="uppercase"
          disabled={disabled}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Fuel type"
          options={fuelOptions}
          value={values.fuelTypeId}
          onChange={setField('fuelTypeId')}
          placeholder="Fuel"
          error={errors.fuelTypeId}
          disabled={disabled || loading}
          prefilledLabel={editLabels?.fuelType}
        />
        <Select
          label="Transmission"
          options={TRANSMISSION_OPTIONS}
          value={values.transmission}
          onChange={setField('transmission')}
          placeholder="Transmission"
          error={errors.transmission}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default VehicleDetailsForm;
export { emptyValues as emptyVehicleFormValues };
