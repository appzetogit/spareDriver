import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Select from '../../../../components/Select';
import StepIndicator from '../../../../components/StepIndicator';
import { ArrowLeft, User, Hash, Building2, CreditCard } from 'lucide-react';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useFormDraft } from '../../../../hooks/useFormDraft';

import { DRIVER_ONBOARDING_STEPS } from '../../../../utils/driverOnboarding';
import DriverRegistrationLogoutButton from '../components/DriverRegistrationLogoutButton';

const BANK_DRAFT_KEY = 'driver-onboarding:step3';
const defaultBankForm = { holder: '', account: '', ifsc: '', bank: '', upi: '' };

const BankDetailsPage = () => {
  const navigate = useNavigate();
  const updateDriver = useDriverAuthStore((state) => state.updateDriver);
  const [form, setForm, clearDraft, replaceDraft] = useFormDraft(BANK_DRAFT_KEY, defaultBankForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({ holder: '', account: '', ifsc: '', bank: '', upi: '' });
  const [bankOptions, setBankOptions] = useState([]);

  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await api.get('/common/banks');
        const list = res.data?.data || [];
        setBankOptions(
          list.map((b) => ({
            value: b.name,
            label: b.name,
          })),
        );
      } catch (error) {
        console.error('Failed to fetch banks', error);
      }
    };
    fetchBanks();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/driver/profile');
        const data = res.data.data;
        if (data?.bankDetails?.accountHolderName || data?.bankDetails?.accountNumber) {
          replaceDraft({
            holder: data.bankDetails.accountHolderName || '',
            account: data.bankDetails.accountNumber || '',
            ifsc: data.bankDetails.ifscCode || '',
            bank: data.bankDetails.bankName || '',
            upi: data.bankDetails.upiId || '',
          });
        }
      } catch (error) {
        console.error('Failed to fetch profile', error);
      }
    };
    fetchProfile();
  }, [replaceDraft]);

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
    const newErrors = {
      holder: validateField('holder', form.holder),
      account: validateField('account', form.account),
      ifsc: validateField('ifsc', form.ifsc),
      bank: validateField('bank', form.bank),
      upi: validateField('upi', form.upi),
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some((err) => err !== '');
  };

  const handleChange = (f) => (e) => {
    let val = e.target.value;
    if (f === 'account') {
      val = val.replace(/[^0-9]/g, '').slice(0, 18);
    } else if (f === 'ifsc') {
      val = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    }
    setForm((p) => ({ ...p, [f]: val }));
    const error = validateField(f, val);
    setErrors((prev) => ({ ...prev, [f]: error }));
  };

  const handleBankSelect = (value) => {
    setForm((p) => ({ ...p, bank: value }));
    setErrors((prev) => ({ ...prev, bank: validateField('bank', value) }));
  };

  const handleContinue = async () => {
    if (!validateForm()) return;
    try {
      setIsSubmitting(true);

      const stepData = {
        bankDetails: {
          accountHolderName: form.holder,
          accountNumber: form.account,
          ifscCode: form.ifsc,
          bankName: form.bank,
          upiId: form.upi,
        }
      };

      await api.put('/driver/onboarding/step', {
        stepNumber: 3,
        stepData
      });

      clearDraft();
      updateDriver({ onboardingStep: 4 });
      navigate('/driver/register/safety');
    } catch (error) {
      console.error('Failed to save step 3', error);
      alert(error.response?.data?.message || 'Failed to save bank details. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasRequired = form.holder && form.account && form.ifsc && form.bank;
  const hasErrors = Object.values(errors).some(err => err);
  const continueDisabled = !hasRequired || hasErrors || isSubmitting;

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <DriverRegistrationLogoutButton />
      </div>
      <div className="px-6 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Bank Details</h1>
          <span className="text-xs text-text-muted bg-bg px-2 py-1 rounded-full">3/5</span>
        </div>
        <StepIndicator steps={DRIVER_ONBOARDING_STEPS} currentStep={3} />
        <p className="text-xs text-text-muted mt-3">Payout routing setup</p>
      </div>
      <form className="flex-1 flex flex-col px-6 pb-8">
        <div className="flex-1 space-y-4 animate-fade-in-up relative z-10">
          <Input 
            label="Account holder name" 
            placeholder="Name as in bank" 
            value={form.holder} 
            onChange={handleChange('holder')} 
            error={errors.holder}
            icon={User} 
          />
          <Input 
            label="Account number" 
            placeholder="Bank account number" 
            value={form.account} 
            onChange={handleChange('account')} 
            maxLength={18}
            error={errors.account}
            icon={Hash} 
          />
          <Input 
            label="IFSC code" 
            placeholder="HDFC0001234" 
            value={form.ifsc} 
            onChange={handleChange('ifsc')} 
            maxLength={11}
            error={errors.ifsc}
            icon={Building2} 
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
          />
          <Input 
            label="UPI ID (optional)" 
            placeholder="user@upi" 
            value={form.upi} 
            onChange={handleChange('upi')} 
            error={errors.upi}
            icon={CreditCard} 
          />
        </div>
        <Button 
          fullWidth 
          onClick={handleContinue} 
          disabled={continueDisabled}
          className="rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20"
        >
          {isSubmitting ? 'SAVING...' : 'CONTINUE'}
        </Button>
      </form>
    </div>
  );
};

export default BankDetailsPage;
