import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Phone, RefreshCw, Shield } from 'lucide-react';
import Avatar from '../../../components/Avatar';
import api from '../../../utils/api';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { STAFF_ROLE_LABELS } from '../../../constants/staffRoles';
import { SectionCard, InfoGrid } from '../components/DetailBlocks';

const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}/${month}/${year}, ${time}`;
};

const StaffProfilePage = () => {
  const setAuth = useAdminAuthStore((state) => state.setAuth);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/auth/me');
      const admin = res.data.data.admin;
      setProfile(admin);
      setAuth(admin);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [setAuth]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-slate-500">Loading your profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error || 'Profile not found'}
      </div>
    );
  }

  const roleLabel = STAFF_ROLE_LABELS[profile.role] || profile.role;

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in-up pb-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">My Profile</h2>
          <p className="text-sm text-slate-500 mt-1">Your account details for the admin panel</p>
        </div>
        <button
          type="button"
          onClick={fetchProfile}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar
            name={profile.name}
            size="lg"
            src={profile.profilePicture}
            className="ring-2 ring-white shadow-md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  profile.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {profile.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="w-4 h-4" />
                {profile.phone_no}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" />
                {profile.email}
              </span>
            </div>
            <p className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <Shield className="w-3.5 h-3.5" />
              {roleLabel}
            </p>
          </div>
        </div>
      </div>

      <SectionCard title="Account details">
        <InfoGrid
          items={[
            { label: 'Staff ID', value: profile._id },
            { label: 'Role', value: roleLabel },
            { label: 'Email', value: profile.email },
            { label: 'Phone', value: profile.phone_no },
            { label: 'Email verified', value: profile.isEmailVerified ? 'Yes' : 'No' },
            { label: 'Phone verified', value: profile.isPhoneVerified ? 'Yes' : 'No' },
            { label: 'Member since', value: formatDate(profile.createdAt) },
            { label: 'Last updated', value: formatDate(profile.updatedAt) },
          ]}
        />
      </SectionCard>
    </div>
  );
};

export default StaffProfilePage;
