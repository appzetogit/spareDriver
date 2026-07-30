import { useEffect } from 'react';
import Select from '../Select';
import Input from '../Input';
import { Car } from 'lucide-react';
import { useVehicleCatalog } from '../../hooks/useVehicleCatalog';
import { TRANSMISSION_OPTIONS } from '../../utils/vehicleCatalog';

function toDateInputValue(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const emptyValues = {
  brandId: '',
  carTypeId: '',
  modelId: '',
  fuelTypeId: '',
  vehicleNumber: '',
  transmission: 'manual',
  insuranceExpiry: '',
  pucExpiry: '',
};

/**
 * Reusable vehicle detail fields for user car registration.
 * Order: brand → category → model → number → fuel/transmission → expiry dates.
 * Categories are limited to those that have models for the selected brand.
 */
const VehicleDetailsForm = ({
  values = emptyValues,
  onChange,
  errors = {},
  disabled = false,
  showVehicleNumber = true,
  showExpiryDates = true,
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

  // Drop a stale category when the brand changes and that category has no
  // models for the new brand.
  useEffect(() => {
    if (!values.brandId || !values.carTypeId || modelsLoading) return;
    const stillValid = categoryOptions.some(
      (opt) => String(opt.value) === String(values.carTypeId),
    );
    if (!stillValid) {
      onChange({ ...values, carTypeId: '', modelId: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to catalog/brand changes
  }, [values.brandId, values.carTypeId, categoryOptions, modelsLoading]);

  const setField = (field) => (val) => {
    const next = { ...values, [field]: val };
    if (field === 'carTypeId') {
      next.modelId = '';
    }
    if (field === 'brandId') {
      next.carTypeId = '';
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
        label="Car category"
        options={categoryOptions}
        value={values.carTypeId}
        onChange={setField('carTypeId')}
        placeholder={
          !values.brandId
            ? 'Select brand first'
            : modelsLoading
              ? 'Loading...'
              : categoryOptions.length
                ? 'Select category'
                : 'No categories for this brand'
        }
        error={errors.carTypeId}
        searchable
        disabled={disabled || loading || !values.brandId || modelsLoading}
        prefilledLabel={editLabels?.carType}
      />

      <Select
        label="Car model"
        options={modelOptions}
        value={values.modelId}
        onChange={setField('modelId')}
        placeholder={
          !values.brandId
            ? 'Select brand first'
            : !values.carTypeId
              ? 'Select category first'
              : modelsLoading
                ? 'Loading models...'
                : modelOptions.length
                  ? 'Select model'
                  : 'No models for this category'
        }
        error={errors.modelId}
        searchable
        disabled={disabled || !values.brandId || !values.carTypeId || modelsLoading}
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

      {showExpiryDates && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Insurance expiry"
            type="date"
            value={toDateInputValue(values.insuranceExpiry)}
            onChange={(e) => setField('insuranceExpiry')(e.target.value)}
            error={errors.insuranceExpiry}
            disabled={disabled}
          />
          <Input
            label="PUC expiry"
            type="date"
            value={toDateInputValue(values.pucExpiry)}
            onChange={(e) => setField('pucExpiry')(e.target.value)}
            error={errors.pucExpiry}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
};

export default VehicleDetailsForm;
export { emptyValues as emptyVehicleFormValues };
