import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { User, Hash, Building2, CreditCard } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Select from '../../../../components/Select';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import api from '../../../../utils/api';
import DriverAccountSubPage from '../components/DriverAccountSubPage';

const emptyForm = { holder: '', account: '', ifsc: '', bank: '', upi: '' };

const formFromBank = (bank = {}) => ({
  holder: bank.accountHolderName || '',
  account: bank.accountNumber || '',
  ifsc: bank.ifscCode || '',
  bank: bank.bankName || '',
  upi: bank.upiId || '',
});

const formSignature = (form) =>
  [form.holder, form.account, form.ifsc, form.bank, form.upi]
    .map((v) => String(v || '').trim())
    .join('|');

const DriverBankDetailsPage = () => {
  const navigate = useNavigate();
  const profileKey = buildCacheKey('driver-profile', {});
  const { data: driver, refetch: refetchProfile } = useCachedQuery(
    useDriverProfileStore,
    profileKey,
    {},
  );

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState(emptyForm);
  const [bankOptions, setBankOptions] = useState([]);
  const [baselineSignature, setBaselineSignature] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/common/banks')
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.data || [];
        setBankOptions(list.map((b) => ({ value: b.name, label: b.name })));
      })
      .catch((error) => {
        console.error('Failed to fetch banks', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!driver || hydrated) return;
    const initial = formFromBank(driver.bankDetails);
    setForm(initial);
    setBaselineSignature(formSignature(initial));
    setHydrated(true);
  }, [driver, hydrated]);

  const isDirty = useMemo(
    () => hydrated && formSignature(form) !== baselineSignature,
    [hydrated, form, baselineSignature],
  );

  const validateField = (name, value) => {
    let error = '';
    switch (name) {
      case 'holder':
        if (!value.trim()) {
          error = 'Account holder name is required';
        } else if (value.trim().length < 3) {
          error = 'Name must be at least 3 characters';
        } else if (!/^[a-zA-Z\s.]+$/.test(value)) {
          error = 'Name can only contain letters, spaces, and dots';
        }
        break;
      case 'account':
        if (!value.trim()) {
          error = 'Account number is required';
        } else if (!/^\d+$/.test(value)) {
          error = 'Account number must contain digits only';
        } else if (value.length < 9 || value.length > 18) {
          error = 'Account number must be between 9 and 18 digits';
        }
        break;
      case 'ifsc':
        if (!value.trim()) {
          error = 'IFSC code is required';
        } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(value)) {
          error = 'Invalid IFSC format (e.g. SBIN0001234)';
        }
        break;
      case 'bank':
        if (!value.trim()) {
          error = 'Please select a bank';
        } else if (
          bankOptions.length > 0 &&
          !bankOptions.some((opt) => opt.value === value.trim())
        ) {
          error = 'Please select a bank from the list';
        }
        break;
      case 'upi':
        if (value.trim() && !/^[\w.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(value.trim())) {
          error = 'Invalid UPI ID format (e.g. name@bank)';
        }
        break;
      default:
        break;
    }
    return error;
  };

  const validateForm = () => {
    const next = {
      holder: validateField('holder', form.holder),
      account: validateField('account', form.account),
      ifsc: validateField('ifsc', form.ifsc),
      bank: validateField('bank', form.bank),
      upi: validateField('upi', form.upi),
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const handleChange = (field) => (e) => {
    let val = e.target.value;
    if (field === 'account') {
      val = val.replace(/[^0-9]/g, '').slice(0, 18);
    } else if (field === 'ifsc') {
      val = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    }
    setForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: validateField(field, val) }));
  };

  const handleBankSelect = (value) => {
    setForm((prev) => ({ ...prev, bank: value }));
    setErrors((prev) => ({ ...prev, bank: validateField('bank', value) }));
  };

  const handleSave = async () => {
    if (!isDirty) return;
    if (!validateForm()) return;

    try {
      setIsSaving(true);
      const saveRes = await api.put('/driver/profile/bank-details', {
        bankDetails: {
          accountHolderName: form.holder.trim(),
          accountNumber: form.account.trim(),
          ifscCode: form.ifsc.trim().toUpperCase(),
          bankName: form.bank.trim(),
          upiId: form.upi.trim(),
        },
      });
      const savedProfile = saveRes?.data?.data;

      useDriverProfileStore.getState().invalidate(profileKey);
      const freshProfile = (await refetchProfile()) || savedProfile;
      if (freshProfile) {
        const next = formFromBank(freshProfile.bankDetails);
        setForm(next);
        setBaselineSignature(formSignature(next));
        setHydrated(true);
      } else {
        setBaselineSignature(formSignature(form));
      }
      toast.success('Bank details updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save bank details');
    } finally {
      setIsSaving(false);
    }
  };

  const hasRequired = form.holder && form.account && form.ifsc && form.bank;
  const hasErrors = Object.values(errors).some(Boolean);
  const saveDisabled = !isDirty || !hasRequired || hasErrors || isSaving;

  return (
    <DriverAccountSubPage
      title="Bank Details"
      onBack={() => navigate('/driver/account')}
    >
      <p className="text-xs text-text-muted px-1">
        Payout account used for withdrawals. Update anytime if your bank details change.
      </p>
      <Card padding="p-4" className="space-y-4">
        <Input
          label="Account holder name"
          placeholder="Name as in bank"
          value={form.holder}
          onChange={handleChange('holder')}
          error={errors.holder}
          icon={User}
          disabled={isSaving}
        />
        <Input
          label="Account number"
          placeholder="Bank account number"
          value={form.account}
          onChange={handleChange('account')}
          maxLength={18}
          error={errors.account}
          icon={Hash}
          disabled={isSaving}
        />
        <Input
          label="IFSC code"
          placeholder="HDFC0001234"
          value={form.ifsc}
          onChange={handleChange('ifsc')}
          maxLength={11}
          error={errors.ifsc}
          icon={Building2}
          disabled={isSaving}
        />
        <Select
          label="Bank name"
          placeholder="Select your bank"
          options={bankOptions}
          value={form.bank}
          onChange={handleBankSelect}
          error={errors.bank}
          icon={Building2}
          searchable
          prefilledLabel={form.bank || undefined}
          disabled={isSaving}
        />
        <Input
          label="UPI ID (optional)"
          placeholder="user@upi"
          value={form.upi}
          onChange={handleChange('upi')}
          error={errors.upi}
          icon={CreditCard}
          disabled={isSaving}
        />
        <Button
          type="button"
          onClick={handleSave}
          loading={isSaving}
          disabled={saveDisabled}
          className="w-full"
        >
          Save bank details
        </Button>
      </Card>
    </DriverAccountSubPage>
  );
};

export default DriverBankDetailsPage;
