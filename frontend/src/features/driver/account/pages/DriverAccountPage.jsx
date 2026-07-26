import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Building2,
  Car,
  HelpCircle,
  LogOut,
  ChevronRight,
  Package,
  ShoppingBag,
  History,
  Circle,
  Trash2,
  GraduationCap,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Avatar from '../../../../components/Avatar';
import Badge from '../../../../components/Badge';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useDriverHomeSummaryStore } from '../../../../store/driver/useDriverTripsStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { formatCurrency, formatPhone } from '../../../../utils/formatters';
import DriverScreenShell from '../../components/DriverScreenShell';
import DeleteAccountSheet from '../../../../components/DeleteAccountSheet';
import useDriverAccountDeletionStore from '../../../../store/driver/useDriverAccountDeletionStore';

const APPROVAL_BADGE = {
  approved: { variant: 'success', label: 'Approved' },
  pending: { variant: 'warning', label: 'Onboarding' },
  under_review: { variant: 'info', label: 'Under review' },
  rejected: { variant: 'danger', label: 'Rejected' },
  suspended: { variant: 'danger', label: 'Suspended' },
};

const MENU_GROUPS = [
  {
    title: 'Vehicle & kit',
    items: [
      { icon: Package, label: 'Driver Kit', path: '/driver/kit' },
      { icon: ShoppingBag, label: 'My Orders', path: '/driver/orders' },
      { icon: Car, label: 'Vehicle Preferences', path: '/driver/vehicle-preferences' },
    ],
  },
  {
    title: 'Account',
    items: [
      { icon: FileText, label: 'Profile & Documents', path: '/driver/account/documents' },
      { icon: Building2, label: 'Bank Details', path: '/driver/account/bank' },
      { icon: GraduationCap, label: 'Training & Certification', path: '/driver/register/training' },
      { icon: History, label: 'Payment History', path: '/driver/payments' },
    ],
  },
  {
    title: 'Help',
    items: [
      { icon: HelpCircle, label: 'Help & Support', path: '/driver/help-support' },
    ],
  },
];

const DriverAccountPage = () => {
  const navigate = useNavigate();
  const cachedDriver = useDriverAuthStore((s) => s.driver);
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const logout = useDriverAuthStore((s) => s.logout);

  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const deletionRequest = useDriverAccountDeletionStore((s) => s.request);
  const deletionLoading = useDriverAccountDeletionStore((s) => s.loading);
  const deletionSubmitting = useDriverAccountDeletionStore((s) => s.submitting);
  const fetchDeletionRequest = useDriverAccountDeletionStore((s) => s.fetchRequest);
  const submitDeletionRequest = useDriverAccountDeletionStore((s) => s.submitRequest);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    fetchDeletionRequest().catch(() => {});
  }, [fetchDeletionRequest]);

  useEffect(() => {
    if (!profile) return;
    updateDriver({
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      profilePicture: profile.profilePicture,
      approvalStatus: profile.approvalStatus,
      isOnline: profile.isOnline,
      canGoOnline: profile.canGoOnline,
    });
  }, [profile, updateDriver]);

  const driver = useMemo(
    () => profile || cachedDriver || {},
    [profile, cachedDriver],
  );
  const displayName = driver?.name || 'Driver';
  const phone = formatPhone(driver?.phone || '');
  const approval = APPROVAL_BADGE[driver?.approvalStatus] || {
    variant: 'default',
    label: '—',
  };
  const avatarSrc =
    driver?.profilePicture ||
    driver?.documents?.find((d) => d.type === 'selfie')?.fileUrl ||
    undefined;

  const handleLogout = () => {
    logout();
    navigate('/driver/login');
  };

  return (
    <DriverScreenShell
      header={
        <header className="bg-dark px-4 pt-5 pb-5 rounded-b-3xl">
          <div className="flex items-center gap-3">
            <Avatar
              src={avatarSrc}
              name={displayName}
              size="lg"
              online={driver?.isOnline}
              className="ring-2 ring-white/20"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white truncate">
                  {displayName}
                </h1>
                <Badge variant={approval.variant}>{approval.label}</Badge>
              </div>
              {phone && (
                <p className="text-xs text-white/70 mt-0.5">{phone}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-white/80">
                  <Circle
                    className={`w-2 h-2 fill-current ${
                      driver?.isOnline ? 'text-success' : 'text-white/40'
                    }`}
                  />
                  {driver?.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </header>
      }
      bodyClassName="p-4 pb-8 space-y-4"
    >
      {MENU_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-1 mb-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted">
            {group.title}
          </p>
          <Card padding="p-0">
            <ul className="divide-y divide-border-light">
              {group.items.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => item.path && navigate(item.path)}
                    disabled={!item.path}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-default text-left"
                  >
                    <div className="w-9 h-9 rounded-lg bg-bg flex items-center justify-center shrink-0">
                      <item.icon className="w-4.5 h-4.5 text-text-secondary" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-text">
                      {item.label}
                    </span>
                    {item.path && (
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}

      {/*
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-white rounded-2xl shadow-card text-danger font-medium text-sm hover:bg-danger-light transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Delete account
      </button>
      */}

      <button
        type="button"
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-white rounded-2xl shadow-card text-danger font-medium text-sm hover:bg-danger-light transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>

      <p className="text-center text-[11px] text-text-muted pt-1">
        Driver ID {driver?._id ? short(driver._id) : '—'}
      </p>

      <DeleteAccountSheet
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        audience="driver"
        walletBalance={Number(profile?.wallet?.balance) || 0}
        existingRequest={deletionRequest}
        loading={deletionLoading}
        submitting={deletionSubmitting}
        onSubmit={submitDeletionRequest}
      />
    </DriverScreenShell>
  );
};




function short(id) {
  const s = String(id);
  return s.slice(0, 6).toUpperCase();
}

export default DriverAccountPage;
