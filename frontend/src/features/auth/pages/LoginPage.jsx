import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import { Phone, Lock, ArrowLeft, Mail, Smartphone } from 'lucide-react';
import api from '../../../utils/api';
import useUserAuthStore from '../../../store/useUserAuthStore';
import { navigateUserAfterAuth } from '../utils/authNavigation';
import { withFcmAuthPayload } from '../../../utils/fcmTokenClient';

const LoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useUserAuthStore((state) => state.setAuth);
  const [mode, setMode] = useState('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (mode === 'phone') {
      if (!phone) newErrors.identifier = 'Phone number is required';
      else if (!/^[0-9]{10}$/.test(phone)) newErrors.identifier = 'Enter valid 10-digit number';
    } else {
      if (!email.trim()) newErrors.identifier = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        newErrors.identifier = 'Enter a valid email address';
      }
    }
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Min 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    try {
      const payload = await withFcmAuthPayload(
        mode === 'phone'
          ? { phone, password }
          : { email: email.trim().toLowerCase(), password },
      );
      const res = await api.post('/auth/login', payload);
      const { user } = res.data.data;
      setAuth(user);
      navigateUserAfterAuth(navigate, user);
    } catch (error) {
      setErrors({ identifier: error.response?.data?.message || 'Login failed' });
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
          <p className="text-text-secondary text-sm">Login with phone or email</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1 gap-1">
            {['phone', 'email'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setErrors({});
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === m ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {m === 'phone' ? <Smartphone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                {m === 'phone' ? 'Phone' : 'Email'}
              </button>
            ))}
          </div>

          {mode === 'phone' ? (
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
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                    if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: '' }));
                  }}
                  error={errors.identifier}
                  maxLength={10}
                  className="pl-[4.5rem]"
                  containerClassName="w-full"
                />
              </div>
            </div>
          ) : (
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.identifier) setErrors((prev) => ({ ...prev, identifier: '' }));
              }}
              error={errors.identifier}
              icon={Mail}
            />
          )}

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
            }}
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
