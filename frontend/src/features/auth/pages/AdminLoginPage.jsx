import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import { Mail, Lock, Shield, Loader2 } from 'lucide-react';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { useStoreHydration } from '../../../hooks/useStoreHydration';
import { withFcmAuthPayload } from '../../../utils/fcmTokenClient';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const hydrated = useStoreHydration(useAdminAuthStore);
  const { isAuthenticated, admin, setAuth } = useAdminAuthStore();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hydrated || !isAuthenticated || !admin) return;
    if (admin.role === 'admin') navigate('/admin', { replace: true });
    else navigate('/admin/tasks', { replace: true });
  }, [hydrated, isAuthenticated, admin, navigate]);

  if (!hydrated || (isAuthenticated && admin)) {
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
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    
    try {
      const res = await api.post('/admin/auth/login', await withFcmAuthPayload(formData));
      const { admin } = res.data.data;
      
      setAuth(admin);
      if (admin.role === 'admin') navigate('/admin');
      else navigate('/admin/tasks');
    } catch (error) {
      console.error('Admin login failed', error);
      setErrors({ email: error.response?.data?.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-dark min-h-dvh px-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl relative z-10 animate-fade-in-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-text mb-1">Admin Portal</h1>
          <p className="text-sm text-text-secondary">Sign in to manage the platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="admin@sparedriver.com"
            value={formData.email}
            onChange={handleChange('email')}
            error={errors.email}
            icon={Mail}
          />
          
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange('password')}
            error={errors.password}
            icon={Lock}
          />

          <Button type="submit" fullWidth loading={loading} className="mt-8">
            ACCESS DASHBOARD
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AdminLoginPage;
