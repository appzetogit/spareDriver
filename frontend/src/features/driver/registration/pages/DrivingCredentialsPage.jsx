import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Select from '../../../../components/Select';
import StepIndicator from '../../../../components/StepIndicator';
import DocumentUploadField from '../../../../components/DocumentUploadField';
import DriverVehicleExperienceEditor, {
  MAX_DRIVER_VEHICLES,
} from '../../../../components/vehicle/DriverVehicleExperienceEditor';
import { emptyVehicleFormValues } from '../../../../components/vehicle/VehicleDetailsForm';
import { ArrowLeft, FileText, Calendar, Briefcase } from 'lucide-react';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useDocumentsManager } from '../../../../hooks/useDocumentsManager';
import { useFormDraft } from '../../../../hooks/useFormDraft';

import { DRIVER_ONBOARDING_STEPS } from '../../../../utils/driverOnboarding';
const CREDENTIAL_DOC_TYPES = ['driving_license', 'selfie'];
const CREDENTIALS_DRAFT_KEY = 'driver-onboarding:step2';

const CREDENTIAL_DOCUMENTS = [
  {
    type: 'driving_license',
    title: 'Driving licence (front)',
    hint: 'Clear photo of the front of your valid driving licence',
  },
  {
    type: 'selfie',
    title: 'Profile photo (selfie)',
    hint: 'Recent photo of your face, good lighting, no sunglasses or mask',
  },
];

const mapVehicleFromApi = (v) => ({
  carTypeId: String(v.carTypeId?._id || v.carTypeId || ''),
  brandId: String(v.brandId?._id || v.brandId || ''),
  modelId: String(v.modelId?._id || v.modelId || ''),
  fuelTypeId: String(v.fuelTypeId?._id || v.fuelTypeId || ''),
  transmission: v.transmission || 'manual',
  _labels: {
    brand: v.brandId?.name || '',
    carType: v.carTypeId?.name || '',
    model: v.modelId?.name || '',
    fuelType: v.fuelTypeId?.name || '',
  },
});

const validateVehicles = (vehicles) => {
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

const defaultForm = { license: '', expiry: '', experience: '', availability: '' };

const DrivingCredentialsPage = () => {
  const navigate = useNavigate();
  const updateDriver = useDriverAuthStore((state) => state.updateDriver);

  const [draft, setDraft, clearDraft, replaceDraft] = useFormDraft(CREDENTIALS_DRAFT_KEY, {
    form: defaultForm,
    vehicles: [{ ...emptyVehicleFormValues }],
  });
  const form = draft.form;
  const vehicles = draft.vehicles;

  const setForm = (updater) => {
    setDraft((prev) => ({
      ...prev,
      form: typeof updater === 'function' ? updater(prev.form) : updater,
    }));
  };
  const setVehicles = (updater) => {
    setDraft((prev) => ({
      ...prev,
      vehicles: typeof updater === 'function' ? updater(prev.vehicles) : updater,
    }));
  };

  const [licenseError, setLicenseError] = useState('');
  const [vehicleErrors, setVehicleErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    documents,
    loadFromApiDocuments,
    uploadDocument,
    uploadAllPending,
    isAnyUploading,
    allRequiredUploaded,
    toPayloadArray,
  } = useDocumentsManager(CREDENTIAL_DOC_TYPES);

  const handleSelectChange = (f) => (val) => setForm((p) => ({ ...p, [f]: val }));
  const handleChange = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const handleLicenseChange = (e) => {
    const rawVal = e.target.value;
    const hasHyphen = rawVal.includes('-');
    // Clean to alphanumeric uppercase only, maximum 15 chars
    const cleanedVal = rawVal.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);

    setForm((p) => ({ ...p, license: cleanedVal }));

    if (hasHyphen) {
      setLicenseError("Do not include hyphens ('-')");
    } else if (cleanedVal.length > 0 && cleanedVal.length !== 15) {
      setLicenseError("License number must be exactly 15 characters");
    } else {
      setLicenseError('');
    }
  };

  const handleExperienceChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
    setForm((p) => ({ ...p, experience: val }));
  };

  const handleContinue = async () => {
    if (!allRequiredUploaded(CREDENTIAL_DOC_TYPES)) {
      alert('Please upload both required documents');
      return;
    }

    const { valid, fieldErrors } = validateVehicles(vehicles);
    setVehicleErrors(fieldErrors);
    if (!valid) return;

    try {
      setIsSubmitting(true);
      const uploadedDocs = await uploadAllPending();

      const payloadVehicles = vehicles.map((v) => ({
        carTypeId: v.carTypeId,
        brandId: v.brandId,
        modelId: v.modelId,
        fuelTypeId: v.fuelTypeId,
        transmission: v.transmission,
      }));

      const documentsPayload = toPayloadArray(uploadedDocs);
      if (documentsPayload.length < CREDENTIAL_DOC_TYPES.length) {
        alert('Please select both required documents');
        return;
      }

      await api.put('/driver/onboarding/step', {
        stepNumber: 2,
        stepData: {
          drivingLicense: {
            number: form.license,
            expiryDate: form.expiry || null,
          },
          experienceYears: Number(form.experience) || 0,
          availability: form.availability.toLowerCase().replace(' ', '-'),
          vehicleExperience: payloadVehicles,
          documents: documentsPayload,
        },
      });

      clearDraft();
      updateDriver({ onboardingStep: 3 });
      navigate('/driver/register/bank');
    } catch (error) {
      console.error('Failed to save step 2', error);
      alert(error.response?.data?.message || 'Failed to save credentials. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const profileRes = await api.get('/driver/profile');
        const data = profileRes.data.data;
        if (!data) return;

        const licenseNum = data.drivingLicense?.number || '';
        const hasSavedStep =
          licenseNum ||
          data.vehicleExperience?.length ||
          data.carTypeExperience?.length;

        if (hasSavedStep) {
          replaceDraft({
            form: {
              license: licenseNum,
              expiry: data.drivingLicense?.expiryDate
                ? data.drivingLicense.expiryDate.split('T')[0]
                : '',
              experience: data.experienceYears?.toString() || '',
              availability:
                data.availability === 'full-time'
                  ? 'Full-time'
                  : data.availability === 'part-time'
                    ? 'Part-time'
                    : data.availability === 'weekends-only'
                      ? 'Weekends Only'
                      : '',
            },
            vehicles: data.vehicleExperience?.length
              ? data.vehicleExperience.map(mapVehicleFromApi)
              : data.carTypeExperience?.length
                ? data.carTypeExperience.map((t) => ({
                    ...emptyVehicleFormValues,
                    carTypeId: String(typeof t === 'object' ? t._id : t),
                  }))
                : [{ ...emptyVehicleFormValues }],
          });
        }

        if (licenseNum) {
          if (licenseNum.includes('-')) {
            setLicenseError("Do not include hyphens ('-')");
          } else if (licenseNum.length !== 15) {
            setLicenseError("License number must be exactly 15 characters");
          }
        }

        if (data.documents) loadFromApiDocuments(data.documents);
      } catch (error) {
        console.error('Failed to fetch initial data', error);
      }
    };
    fetchData();
  }, [loadFromApiDocuments, replaceDraft]);

  const continueDisabled =
    !form.license ||
    form.license.length !== 15 ||
    !!licenseError ||
    !form.experience ||
    !form.availability ||
    vehicles.length === 0 ||
    isSubmitting ||
    isAnyUploading ||
    !allRequiredUploaded(CREDENTIAL_DOC_TYPES);

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="px-6 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Driving Credentials</h1>
          <span className="text-xs text-text-muted bg-bg px-2 py-1 rounded-full">2/5</span>
        </div>
        <StepIndicator steps={DRIVER_ONBOARDING_STEPS} currentStep={2} />
        <p className="text-xs text-text-muted mt-3">
          License, experience & up to {MAX_DRIVER_VEHICLES} vehicles you can drive for customers
        </p>
      </div>
      <form className="flex-1 flex flex-col px-6 pb-8 overflow-y-auto">
        <div className="flex-1 space-y-5 animate-fade-in-up">
          <Input
            label="License number"
            placeholder="MH0120211234567"
            value={form.license}
            onChange={handleLicenseChange}
            maxLength={15}
            error={licenseError}
            icon={FileText}
          />
          <Input
            label="DL expiry"
            type="date"
            value={form.expiry}
            onChange={handleChange('expiry')}
            icon={Calendar}
          />
          <Input
            label="Experience (years)"
            type="number"
            placeholder="Years of driving"
            value={form.experience}
            onChange={handleExperienceChange}
            icon={Briefcase}
          />
          <Select
            label="Availability"
            options={['Full-time', 'Part-time', 'Weekends Only']}
            value={form.availability}
            onChange={handleSelectChange('availability')}
            placeholder="Select availability"
            openDirection="top"
          />

          <DriverVehicleExperienceEditor
            vehicles={vehicles}
            onChange={setVehicles}
            fieldErrors={vehicleErrors}
            disabled={isSubmitting || isAnyUploading}
          />

          <div>
            <h3 className="text-sm font-semibold text-text">Verification documents</h3>
            <p className="text-xs text-text-muted mt-1 mb-4 leading-relaxed">
              Upload both documents below. They are required before you can continue.
            </p>
            <div className="space-y-4">
              {CREDENTIAL_DOCUMENTS.map(({ type, title, hint }) => (
                <DocumentUploadField
                  key={type}
                  label={title}
                  hint={hint}
                  variant="card"
                  doc={documents[type]}
                  onUpload={(file) => uploadDocument(type, file)}
                  disabled={isAnyUploading}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="pt-5">
          <Button
            fullWidth
            onClick={handleContinue}
            disabled={continueDisabled}
            loading={isSubmitting}
            className="mt-6 rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20"
          >
            {isSubmitting || isAnyUploading ? 'UPLOADING...' : 'CONTINUE'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default DrivingCredentialsPage;
