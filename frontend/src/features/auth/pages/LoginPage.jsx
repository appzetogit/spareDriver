import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import { Phone, Lock, ArrowLeft } from 'lucide-react';
import api from '../../../utils/api';
import useUserAuthStore from '../../../store/useUserAuthStore';
import { navigateUserAfterAuth } from '../utils/authNavigation';

const LoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useUserAuthStore((state) => state.setAuth);
  const [formData, setFormData] = useState({ phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

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
      const res = await api.post('/auth/login', {
        phone: formData.phone,
        password: formData.password,
      });
      const { user } = res.data.data;
      setAuth(user);
      navigateUserAfterAuth(navigate, user);
    } catch (error) {
      setErrors({ phone: error.response?.data?.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh">
      <div className="px-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-6">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-2xl font-bold text-text mb-1">Welcome Back!</h1>
          <p className="text-text-secondary text-sm">Login to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div>
            <label className="text-sm font-medium text-text mb-1.5 block">Phone Number</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary font-semibold border-r pr-2 border-border flex items-center gap-1.5 z-10 pointer-events-none">
                <Phone className="w-4 h-4 text-text-muted" />
                <span>+91</span>
              </div>
              <Input
                type="tel"
                placeholder="10-digit number"
                value={formData.phone}
                onChange={handleChange('phone')}
                error={errors.phone}
                maxLength={10}
                className="pl-[4.5rem]"
                containerClassName="w-full"
              />
            </div>
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
            <Link to="/forgot-password" className="text-sm text-primary font-medium hover:underline">
              Forgot Password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={loading} className="rounded-full py-4 text-base font-bold shadow-lg shadow-primary/20">
            Login
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

        <p className="text-center text-sm text-text-secondary mt-8 mb-6 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-primary font-semibold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
