import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, LogOut, LifeBuoy } from 'lucide-react';
import Button from '../../../../components/Button';
import api from '../../../../utils/api';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

const DriverSuspendedPage = () => {
  const navigate = useNavigate();
  const { driver, isAuthenticated, updateDriver, logout } = useDriverAuthStore();
  const [support, setSupport] = useState({ email: '', phone: '' });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/driver/login', { replace: true });
      return;
    }
    if (driver?.approvalStatus && driver.approvalStatus !== 'suspended') {
      navigate('/driver/home', { replace: true });
    }
  }, [isAuthenticated, driver?.approvalStatus, navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, supportRes] = await Promise.all([
          api.get('/driver/profile').catch(() => null),
          api.get('/common/support-config').catch(() => null),
        ]);
        const profile = profileRes?.data?.data;
        if (profile) {
          updateDriver({
            approvalStatus: profile.approvalStatus,
            approvalNote: profile.approvalNote || '',
          });
          if (profile.approvalStatus && profile.approvalStatus !== 'suspended') {
            navigate('/driver/home', { replace: true });
          }
        }
        const cfg = supportRes?.data?.data || {};
        setSupport({
          email: cfg.supportEmail || '',
          phone: cfg.supportPhone || '',
        });
      } catch {
        /* keep store values */
      }
    };
    load();
  }, [updateDriver, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/driver/login', { replace: true });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 min-h-dvh px-6 py-10">
      <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center mb-6">
        <Ban className="w-10 h-10 text-slate-700" />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Account suspended</h1>
      <p className="text-sm text-slate-600 leading-relaxed text-center max-w-md mb-6">
        Your driver profile has been suspended. You cannot access the app until an admin restores
        your account. Please contact customer support for help.
      </p>

      <div className="w-full max-w-md space-y-4 mb-8">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl text-left">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Suspension reason
          </p>
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
            {driver?.approvalNote || 'No reason was provided. Contact support for details.'}
          </p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl text-left space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <LifeBuoy className="w-3.5 h-3.5" />
            Customer support
          </p>
          {support.email ? (
            <a href={`mailto:${support.email}`} className="block text-sm font-semibold text-primary">
              {support.email}
            </a>
          ) : null}
          {support.phone ? (
            <a href={`tel:${support.phone}`} className="block text-sm font-semibold text-slate-800">
              {support.phone}
            </a>
          ) : null}
          {!support.email && !support.phone ? (
            <p className="text-sm text-slate-600">
              Reach us through Help &amp; Support on the website or your onboarding contacts.
            </p>
          ) : null}
        </div>
      </div>

      <div className="w-full max-w-md">
        <Button
          fullWidth
          variant="outline"
          onClick={handleLogout}
          className="rounded-full py-4 border-slate-300 text-slate-800"
        >
          <LogOut className="w-4 h-4 mr-2 inline" />
          Log out
        </Button>
      </div>
    </div>
  );
};

export default DriverSuspendedPage;
