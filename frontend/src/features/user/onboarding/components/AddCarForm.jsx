import { useState, useEffect, useMemo } from 'react';
import Button from '../../../../components/Button';
import DocumentUploadField from '../../../../components/DocumentUploadField';
import VehicleDetailsForm, {
  emptyVehicleFormValues,
} from '../../../../components/vehicle/VehicleDetailsForm';
import api from '../../../../utils/api';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { useDocumentsManager } from '../../../../hooks/useDocumentsManager';
import { useVehicleCatalog } from '../../../../hooks/useVehicleCatalog';
import { useFormDraft } from '../../../../hooks/useFormDraft';
import {
  buildConditionPayload,
  isChecklistFormComplete,
  countChecklistProgress,
} from '../../../../utils/safetyChecklist';
import SafetyChecklistQuestion from './SafetyChecklistQuestion';

const ADD_CAR_DRAFT_KEY = 'user-onboarding:add-car';
const CAR_IMAGE_DOC_TYPES = ['car_image'];

/**
 * Self-contained "Add a car" form. Handles validation, image upload, per-car
 * safety checklist, and the `POST /auth/cars` call. Used by both the standalone
 * `AddCarPage` and the in-flow `AddCarModal` from the booking screens.
 */
const AddCarForm = ({
  onSuccess,
  onCancel,
  cancelLabel = 'Cancel',
  submitLabel = 'Save & Continue',
  compact = false,
  editCar,
}) => {
  const setOnboarding = useUserAuthStore((s) => s.setOnboarding);
  const [loading, setLoading] = useState(false);

  const [draftData, setDraftData, clearDraft] = useFormDraft(ADD_CAR_DRAFT_KEY, emptyVehicleFormValues);

  // In edit mode we keep a local copy of the car fields so the draft
  // (sessionStorage) for the "add" flow is never corrupted.
  const [localData, setLocalData] = useState(() => {
    if (!editCar) return null;
    return {
      brandId:      editCar.brandId?._id      || String(editCar.brandId      || ''),
      carTypeId:    editCar.carTypeId?._id    || String(editCar.carTypeId    || ''),
      modelId:      editCar.modelId?._id      || String(editCar.modelId      || ''),
      fuelTypeId:   editCar.fuelTypeId?._id   || String(editCar.fuelTypeId   || ''),
      vehicleNumber: editCar.vehicleNumber || '',
      transmission:  editCar.transmission  || '',
      insuranceExpiry: editCar.insuranceExpiry
        ? String(editCar.insuranceExpiry).slice(0, 10)
        : '',
      pucExpiry: editCar.pucExpiry
        ? String(editCar.pucExpiry).slice(0, 10)
        : '',
    };
  });

  // Name strings from the populated API response — used as instant display
  // labels in the selects while the catalog options are still fetching.
  const editLabels = editCar ? {
    brand:      editCar.brandId?.name    || '',
    carType:    editCar.carTypeId?.name  || '',
    model:      editCar.modelId?.name    || '',
    fuelType:   editCar.fuelTypeId?.name || '',
  } : null;

  const formData = editCar ? (localData || emptyVehicleFormValues) : draftData;
  const setFormData = editCar
    ? (next) => {
        const val = typeof next === 'function' ? next(localData || emptyVehicleFormValues) : next;
        setLocalData(val);
      }
    : setDraftData;

  const { conditions, loading: catalogLoading } = useVehicleCatalog({
    brandId: formData.brandId,
    carTypeId: formData.carTypeId,
  });

  const [errors, setErrors] = useState({});
  const [answers, setAnswers] = useState({});

  const {
    documents,
    loadFromApiDocuments,
    uploadDocument,
    uploadAllPending,
    isAnyUploading,
    allRequiredUploaded,
    toPayloadArray,
  } = useDocumentsManager(CAR_IMAGE_DOC_TYPES);

  useEffect(() => {
    if (editCar?.image) {
      loadFromApiDocuments([{ type: 'car_image', fileUrl: editCar.image }]);
    }
  }, [editCar?._id, editCar?.image, loadFromApiDocuments]);

  useEffect(() => {
    if (!conditions.length) return;
    const initialAnswers = {};
    conditions.forEach((c) => {
      const fromConditions = editCar?.conditions?.find(
        (ec) => String(ec.conditionId?._id || ec.conditionId) === String(c._id),
      );
      const fromChecklist = editCar?.checklist?.find(
        (item) => String(item._id) === String(c._id),
      );
      if (fromConditions && (fromConditions.value === true || fromConditions.value === false)) {
        initialAnswers[c._id] = fromConditions.value;
      } else if (fromChecklist && (fromChecklist.value === true || fromChecklist.value === false)) {
        initialAnswers[c._id] = fromChecklist.value;
      } else {
        initialAnswers[c._id] = null;
      }
    });
    setAnswers(initialAnswers);
  }, [conditions, editCar?._id, editCar?.conditions, editCar?.checklist]);

  const checklistProgress = useMemo(
    () => countChecklistProgress(conditions, answers),
    [conditions, answers],
  );

  const checklistComplete = useMemo(
    () => isChecklistFormComplete(conditions, answers),
    [conditions, answers],
  );

  const setAnswer = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      if (!prev.checklist) return prev;
      const next = { ...prev };
      delete next.checklist;
      return next;
    });
  };

  const validate = () => {
    const next = {};
    if (!formData.brandId) next.brandId = 'Select car brand';
    if (!formData.carTypeId) next.carTypeId = 'Select car category';
    if (!formData.modelId) next.modelId = 'Select car model';
    const rawNum = formData.vehicleNumber?.trim() || '';
    const cleanNum = rawNum.replace(/[\s-]/g, '').toUpperCase();
    const vehicleRegex = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$|^BH\d{2}[A-Z]{1,2}\d{4}$/;

    if (!rawNum) {
      next.vehicleNumber = 'Enter vehicle number';
    } else if (!vehicleRegex.test(cleanNum)) {
      next.vehicleNumber = 'Enter valid vehicle number (e.g., MP09 AB 1234 or 22BH1234AB)';
    }
    if (!formData.fuelTypeId) next.fuelTypeId = 'Select fuel type';
    if (!formData.transmission) next.transmission = 'Select transmission';
    if (!formData.insuranceExpiry) next.insuranceExpiry = 'Select insurance expiry date';
    if (!formData.pucExpiry) next.pucExpiry = 'Select PUC expiry date';
    if (!allRequiredUploaded(['car_image'])) next.image = 'Car image is required';
    if (!checklistComplete && conditions.length) {
      const { answered, total, requiredYes, requiredTotal } = checklistProgress;
      if (answered < total) {
        next.checklist = `Answer all ${total} safety questions (${answered}/${total} done)`;
      } else if (requiredTotal > 0 && requiredYes < requiredTotal) {
        next.checklist = `Required items must be answered Yes (${requiredYes}/${requiredTotal})`;
      } else {
        next.checklist = 'Complete the safety checklist to continue';
      }
    }
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

      const payload = {
        carTypeId: formData.carTypeId,
        brandId: formData.brandId,
        modelId: formData.modelId,
        fuelTypeId: formData.fuelTypeId,
        vehicleNumber: formData.vehicleNumber.trim(),
        transmission: formData.transmission,
        image: imagePayload.fileUrl,
        insuranceExpiry: formData.insuranceExpiry,
        pucExpiry: formData.pucExpiry,
        conditions: buildConditionPayload(conditions, answers),
      };

      let res;
      if (editCar) {
        res = await api.put(`/auth/cars/${editCar._id}`, payload);
      } else {
        res = await api.post('/auth/cars', payload);
      }

      const data = res.data?.data ?? {};
      const carCount = data.carCount ?? 1;
      clearDraft();
      setOnboarding({
        carCount,
        hasCar: carCount > 0,
        hasChecklist: Boolean(data.hasChecklist),
      });
      onSuccess?.({ car: data.car, carCount, hasChecklist: data.hasChecklist });
    } catch (err) {
      console.error(editCar ? 'Failed to update car' : 'Failed to add car', err);
      const message = err?.response?.data?.message || err?.message || (editCar ? 'Failed to update car' : 'Failed to add car');
      setErrors((prev) => ({ ...prev, submit: message }));
    } finally {
      setLoading(false);
    }
  };

  // Fields are only locked during the actual submit/upload — NOT during
  // conditions loading so the user can see & change the prefilled values
  // immediately when the modal opens.
  const fieldsDisabled = loading || isAnyUploading;
  // Submit is additionally blocked until the checklist has loaded.
  const submitDisabled = fieldsDisabled || catalogLoading;

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
        disabled={fieldsDisabled}
      />
      {errors.image && <p className="text-danger text-xs -mt-3">{errors.image}</p>}

      <VehicleDetailsForm
        values={formData}
        onChange={(next) => {
          setFormData(next);
          if (next.vehicleNumber !== formData.vehicleNumber) {
            const rawNum = next.vehicleNumber?.trim() || '';
            const cleanNum = rawNum.replace(/[\s-]/g, '').toUpperCase();
            const vehicleRegex = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$|^BH\d{2}[A-Z]{1,2}\d{4}$/;

            setErrors((prev) => {
              const updated = { ...prev };
              if (!rawNum) {
                delete updated.vehicleNumber;
              } else if (!vehicleRegex.test(cleanNum)) {
                updated.vehicleNumber = 'Enter valid vehicle number (e.g., MP09 AB 1234 or 22BH1234AB)';
              } else {
                delete updated.vehicleNumber;
              }
              return updated;
            });
          }
        }}
        errors={errors}
        disabled={fieldsDisabled}
        editLabels={editLabels}
      />

      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-text">Safety checklist</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Answer for this vehicle so we can match the right driver.
            </p>
          </div>
          {conditions.length > 0 && (
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
              {checklistProgress.answered}/{checklistProgress.total}
            </span>
          )}
        </div>

        {catalogLoading ? (
          <p className="text-sm text-text-muted py-4 text-center">Loading checklist...</p>
        ) : conditions.length === 0 ? (
          <p className="text-sm text-text-muted">No checklist questions configured.</p>
        ) : (
          <div className="space-y-3">
            {conditions.map((item, idx) => (
              <SafetyChecklistQuestion
                key={item._id}
                index={idx + 1}
                question={item.question}
                description={item.description}
                isRequired={item.isRequired}
                value={answers[item._id] ?? null}
                onChange={(val) => setAnswer(item._id, val)}
                disabled={fieldsDisabled}
              />
            ))}
          </div>
        )}
        {errors.checklist && (
          <p className="text-sm text-danger bg-danger/10 rounded-xl px-3 py-2">{errors.checklist}</p>
        )}
      </div>

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
          disabled={submitDisabled}
          className="rounded-full py-3.5 text-base font-bold"
        >
          {loading || isAnyUploading ? 'Uploading...' : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            fullWidth
            disabled={fieldsDisabled}
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
