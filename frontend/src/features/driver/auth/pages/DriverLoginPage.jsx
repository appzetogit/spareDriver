import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import { Phone, Lock, ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { navigateDriverAfterAuth } from '../../../auth/utils/authNavigation';
import { withFcmAuthPayload } from '../../../../utils/fcmTokenClient';
import { useStoreHydration } from '../../../../hooks/useStoreHydration';

const DriverLoginPage = () => {
  const navigate = useNavigate();
  const hydrated = useStoreHydration(useDriverAuthStore);
  const { isAuthenticated, driver, setAuth } = useDriverAuthStore();

  useEffect(() => {
    if (!hydrated || !isAuthenticated || !driver) return;
    navigateDriverAfterAuth(navigate, driver);
  }, [hydrated, isAuthenticated, driver?.id, driver?.phone, driver?.onboardingStep, driver?.approvalStatus, driver?.needsPhone, navigate]);

  const [formData, setFormData] = useState({ phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  if (!hydrated || (isAuthenticated && driver)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.phone) newErrors.phone = 'Phone number is required';
    else if (!/^[0-9]{10}$/.test(formData.phone)) newErrors.phone = 'Enter valid 10-digit number';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'Min 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    
    try {
      const res = await api.post('/driver/auth/login', await withFcmAuthPayload(formData));
      const { driver } = res.data.data;
      
      setAuth(driver);
      navigateDriverAfterAuth(navigate, driver);
    } catch (error) {
      console.error('Login failed', error);
      setErrors({ phone: error.response?.data?.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      {/* Header */}
      <div className="px-4 pt-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-6">
        {/* Title */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-text mb-1">Driver Login</h1>
          <p className="text-text-secondary text-sm">Welcome back, partner!</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div>
            <label className="text-sm font-medium text-text mb-1.5 block">Mobile number</label>
            <div
              className={`flex items-center h-12 bg-white border rounded-xl px-3 gap-2 transition-all duration-200 ${
                errors.phone
                  ? 'border-danger ring-2 ring-danger/30'
                  : 'border-border focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary'
              }`}
            >
              <div className="flex items-center gap-1.5 pr-2 border-r border-border shrink-0 text-sm font-semibold text-text-secondary pointer-events-none">
                <Phone className="w-4 h-4 text-text-muted" />
                <span>+91</span>
              </div>
              <input
                type="tel"
                placeholder="10-digit number"
                value={formData.phone}
                maxLength={10}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setFormData((prev) => ({ ...prev, phone: val }));
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                }}
                className="flex-1 h-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-danger mt-1">{errors.phone}</p>
            )}
          </div>

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={handleChange('password')}
            error={errors.password}
            icon={Lock}
          />

          <div className="flex justify-end">
            <Link to="/driver/forgot-password" className="text-sm text-primary font-medium hover:underline">
              Forgot Password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={loading} className="mt-2 rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20">
            LOGIN
          </Button>
        </form>

        {/*
        <AuthDivider />
        <GoogleSignInButton
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          text="signin_with"
          disabled={loading || googleLoading}
        />
        */}

        {/* Register Link */}
        <p className="text-center text-sm text-text-secondary mt-8 mb-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          Don't have an account?{' '}
          <Link to="/driver/signup" className="text-primary font-semibold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default DriverLoginPage;
