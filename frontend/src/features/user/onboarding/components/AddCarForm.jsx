import { useState } from 'react';
import Button from '../../../../components/Button';
import DocumentUploadField from '../../../../components/DocumentUploadField';
import VehicleDetailsForm, {
  emptyVehicleFormValues,
} from '../../../../components/vehicle/VehicleDetailsForm';
import api from '../../../../utils/api';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { useDocumentsManager } from '../../../../hooks/useDocumentsManager';
import { useFormDraft } from '../../../../hooks/useFormDraft';

const ADD_CAR_DRAFT_KEY = 'user-onboarding:add-car';

/**
 * Self-contained "Add a car" form. Handles validation, image upload and the
 * `POST /auth/cars` call. Used by both the standalone `AddCarPage` and the
 * in-flow `AddCarModal` from the booking screens.
 */
const AddCarForm = ({
  onSuccess,
  onCancel,
  cancelLabel = 'Cancel',
  submitLabel = 'Save & Continue',
  compact = false,
}) => {
  const setOnboarding = useUserAuthStore((s) => s.setOnboarding);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData, clearDraft] = useFormDraft(ADD_CAR_DRAFT_KEY, emptyVehicleFormValues);
  const [errors, setErrors] = useState({});

  const {
    documents,
    uploadDocument,
    uploadAllPending,
    isAnyUploading,
    allRequiredUploaded,
    toPayloadArray,
  } = useDocumentsManager(['car_image']);

  const validate = () => {
    const next = {};
    if (!formData.carTypeId) next.carTypeId = 'Select car category';
    if (!formData.brandId) next.brandId = 'Select car brand';
    if (!formData.modelId) next.modelId = 'Select car model';
    if (!formData.vehicleNumber?.trim()) next.vehicleNumber = 'Enter vehicle number';
    if (!formData.fuelTypeId) next.fuelTypeId = 'Select fuel type';
    if (!formData.transmission) next.transmission = 'Select transmission';
    if (!allRequiredUploaded(['car_image'])) next.image = 'Car image is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const uploadedDocs = await uploadAllPending();
      const imagePayload = toPayloadArray(uploadedDocs).find((d) => d.type === 'car_image');
      if (!imagePayload?.fileUrl) {
        setErrors((prev) => ({ ...prev, image: 'Car image is required' }));
        return;
      }

      const res = await api.post('/auth/cars', {
        carTypeId: formData.carTypeId,
        brandId: formData.brandId,
        modelId: formData.modelId,
        fuelTypeId: formData.fuelTypeId,
        vehicleNumber: formData.vehicleNumber.trim(),
        transmission: formData.transmission,
        image: imagePayload.fileUrl,
      });

      const data = res.data?.data ?? {};
      const carCount = data.carCount ?? 1;
      clearDraft();
      setOnboarding({
        carCount,
        hasCar: carCount > 0,
        hasChecklist: false,
      });
      onSuccess?.({ car: data.car, carCount });
    } catch (err) {
      console.error('Failed to add car', err);
      const message = err?.response?.data?.message || err?.message || 'Failed to add car';
      setErrors((prev) => ({ ...prev, submit: message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col ${compact ? 'gap-4' : 'gap-5'}`}
    >
      <DocumentUploadField
        label="Car Photo"
        doc={documents.car_image}
        onUpload={(file) => uploadDocument('car_image', file)}
        hint="Clear photo of the car"
        disabled={loading || isAnyUploading}
      />
      {errors.image && <p className="text-danger text-xs -mt-3">{errors.image}</p>}

      <VehicleDetailsForm
        values={formData}
        onChange={setFormData}
        errors={errors}
        disabled={loading || isAnyUploading}
      />

      {errors.submit && (
        <p className="text-sm text-danger bg-danger/10 rounded-xl px-3 py-2">
          {errors.submit}
        </p>
      )}

      <div className={`pt-2 flex flex-col gap-2 ${onCancel ? 'sm:flex-row-reverse' : ''}`}>
        <Button
          type="submit"
          fullWidth
          loading={loading || isAnyUploading}
          disabled={loading || isAnyUploading}
          className="rounded-full py-3.5 text-base font-bold"
        >
          {loading || isAnyUploading ? 'Uploading...' : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            fullWidth
            disabled={loading || isAnyUploading}
            onClick={onCancel}
            className="rounded-full py-3.5 text-base font-semibold"
          >
            {cancelLabel}
          </Button>
        )}
      </div>
    </form>
  );
};

export default AddCarForm;
