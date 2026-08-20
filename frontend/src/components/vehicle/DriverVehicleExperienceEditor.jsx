import { Plus, Trash2, Car } from 'lucide-react';
import VehicleDetailsForm, { emptyVehicleFormValues } from './VehicleDetailsForm';
import { MAX_DRIVER_CARS } from '../../utils/constants';

const MAX_VEHICLES = MAX_DRIVER_CARS;

/**
 * Up to 10 full vehicle experience entries for driver onboarding.
 */
const DriverVehicleExperienceEditor = ({
  vehicles = [],
  onChange,
  fieldErrors = {},
  disabled = false,
}) => {
  const addVehicle = () => {
    if (vehicles.length >= MAX_VEHICLES) return;
    onChange([...vehicles, { ...emptyVehicleFormValues }]);
  };

  const updateVehicle = (index, values) => {
    const next = vehicles.map((v, i) => (i === index ? values : v));
    onChange(next);
  };

  const removeVehicle = (index) => {
    onChange(vehicles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-text">Vehicles you can drive</label>
          <p className="text-xs text-text-muted mt-0.5">
            Add up to {MAX_VEHICLES} cars you have experience with (category, brand, model, fuel)
          </p>
        </div>
        <span className="text-xs font-semibold text-text-muted">
          {vehicles.length}/{MAX_VEHICLES}
        </span>
      </div>

      {vehicles.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <Car className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">No vehicles added yet</p>
        </div>
      )}

      {vehicles.map((vehicle, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border bg-bg/50 p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wide">
              Vehicle {index + 1}
            </span>
            <button
              type="button"
              onClick={() => removeVehicle(index)}
              disabled={disabled}
              className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40"
              aria-label="Remove vehicle"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <VehicleDetailsForm
            values={vehicle}
            onChange={(vals) => updateVehicle(index, vals)}
            errors={fieldErrors[index] || {}}
            disabled={disabled}
            showVehicleNumber={false}
            showExpiryDates={false}
            editLabels={vehicle._labels || null}
          />
        </div>
      ))}

      {fieldErrors._form && (
        <p className="text-xs text-rose-600">{fieldErrors._form}</p>
      )}

      {vehicles.length < MAX_VEHICLES && (
        <button
          type="button"
          onClick={addVehicle}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-text hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add additional car
        </button>
      )}
    </div>
  );
};

export default DriverVehicleExperienceEditor;
export { MAX_VEHICLES as MAX_DRIVER_VEHICLES };
