import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Phone, Mail, User, Calendar } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Select from '../../../../components/Select';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { formatPhone } from '../../../../utils/formatters';
import api from '../../../../utils/api';
import DriverAccountSubPage from '../components/DriverAccountSubPage';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const emptyForm = { name: '', email: '', gender: '', dateOfBirth: '' };

const formFromDriver = (d = {}) => ({
  name: d.name || '',
  email: d.email || '',
  gender: d.gender || '',
  dateOfBirth: d.dateOfBirth ? String(d.dateOfBirth).slice(0, 10) : '',
});

const signature = (f) => Object.values(f).map((v) => String(v || '').trim()).join('|');

const validate = (f) => {
  const errors = {};
  if (f.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (f.dateOfBirth && new Date(f.dateOfBirth) > new Date()) {
    errors.dateOfBirth = 'Date of birth cannot be in the future';
  }
  return errors;
};

const DriverProfileInfoPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver, refetch } = useCachedQuery(useDriverProfileStore, profileKey, {});
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);

  const [form, setForm] = useState(emptyForm);
  const [baseline, setBaseline] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!driver || hydrated) return;
    const initial = formFromDriver(driver);
    setForm(initial);
    setBaseline(signature(initial));
    setHydrated(true);
  }, [driver, hydrated]);

  const isDirty = useMemo(() => hydrated && signature(form) !== baseline, [hydrated, form, baseline]);

  const handleChange = (field) => (e) => {
    const next = { ...form, [field]: e.target.value };
    setForm(next);
    setErrors(validate(next));
  };

  const handleGender = (value) => {
    const next = { ...form, gender: value };
    setForm(next);
    setErrors(validate(next));
  };

  const handleSave = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length || !isDirty) return;

    try {
      setIsSaving(true);
      const res = await api.put('/driver/profile', {
        name: form.name.trim(),
        email: form.email.trim(),
        gender: form.gender,
        dateOfBirth: form.dateOfBirth,
      });
      useDriverProfileStore.getState().invalidate(profileKey);
      const fresh = (await refetch()) || res?.data?.data;
      if (fresh) {
        const next = formFromDriver(fresh);
        setForm(next);
        setBaseline(signature(next));
        updateDriver({ name: fresh.name, email: fresh.email });
      }
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const saveDisabled = !isDirty || isSaving || Object.keys(validate(form)).length > 0;

  return (
    <DriverAccountSubPage title="Edit Profile" onBack={() => navigate('/driver/account')}>
      <p className="text-xs text-text-muted px-1">
        Update your personal details. Your phone number is your login ID — contact support to change it.
      </p>
      <Card padding="p-4" className="space-y-4">
        <Input
          label="Full name"
          placeholder="Your name"
          value={form.name}
          onChange={handleChange('name')}
          error={errors.name}
          icon={User}
          disabled={isSaving}
        />
        <Input
          label="Phone"
          value={formatPhone(driver?.phone || '') || ''}
          icon={Phone}
          disabled
          readOnly
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange('email')}
          error={errors.email}
          icon={Mail}
          disabled={isSaving}
        />
        <Select
          label="Gender"
          placeholder="Select gender"
          options={GENDER_OPTIONS}
          value={form.gender}
          onChange={handleGender}
          icon={User}
          disabled={isSaving}
        />
        <Input
          label="Date of birth"
          type="date"
          value={form.dateOfBirth}
          onChange={handleChange('dateOfBirth')}
          error={errors.dateOfBirth}
          icon={Calendar}
          max={new Date().toISOString().slice(0, 10)}
          disabled={isSaving}
        />
        <Button
          type="button"
          onClick={handleSave}
          loading={isSaving}
          disabled={saveDisabled}
          className="w-full"
        >
          Save changes
        </Button>
      </Card>
    </DriverAccountSubPage>
  );
};

export default DriverProfileInfoPage;
