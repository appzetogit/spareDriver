import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import DriverVehicleExperienceEditor from '../../../../components/vehicle/DriverVehicleExperienceEditor';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import api from '../../../../utils/api';
import DriverAccountSubPage from '../components/DriverAccountSubPage';
import {
  vehiclesFromProfile,
  validateVehicles,
} from '../utils/vehicleExperienceForm';

const DriverVehiclePreferencesPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile, refetch: refetchProfile } = useCachedQuery(
    useDriverProfileStore,
    profileKey,
    {},
  );

  const [vehicles, setVehicles] = useState([]);
  const [vehicleErrors, setVehicleErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!profile || hydrated) return;
    setVehicles(vehiclesFromProfile(profile));
    setHydrated(true);
  }, [profile, hydrated]);

  const handleSave = async () => {
    const { valid, fieldErrors } = validateVehicles(vehicles);
    setVehicleErrors(fieldErrors);
    if (!valid) return;

    try {
      setIsSaving(true);
      const payload = vehicles.map((v) => ({
        carTypeId: v.carTypeId,
        brandId: v.brandId,
        modelId: v.modelId,
        fuelTypeId: v.fuelTypeId,
        transmission: v.transmission,
      }));

      await api.put('/driver/profile/vehicle-experience', {
        vehicleExperience: payload,
      });

      useDriverProfileStore.getState().invalidate(profileKey);
      await refetchProfile();
      toast.success('Vehicle experience updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save vehicle experience');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DriverAccountSubPage
      title="VEHICLE PREFERENCES"
      onBack={() => navigate('/driver/account')}
    >
      <p className="text-xs text-text-muted px-1">
        Cars you are experienced driving. You can register up to 5 vehicles.
      </p>
      <Card padding="p-4" className="space-y-4">
        <DriverVehicleExperienceEditor
          vehicles={vehicles}
          onChange={setVehicles}
          fieldErrors={vehicleErrors}
          disabled={isSaving}
        />
        <Button
          type="button"
          onClick={handleSave}
          loading={isSaving}
          disabled={isSaving}
          className="w-full"
        >
          Save vehicle experience
        </Button>
      </Card>
    </DriverAccountSubPage>
  );
};

export default DriverVehiclePreferencesPage;
