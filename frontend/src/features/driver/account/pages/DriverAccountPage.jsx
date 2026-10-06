import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Building2,
  Car,
  LogOut,
  ChevronRight,
  Package,
  ShoppingBag,
  History,
  GraduationCap,
  IdCard,
  FileText,
  Headphones,
  Star,
  Gift,
  Trash2,
} from 'lucide-react';
import Avatar from '../../../../components/Avatar';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { useDriverProfileStore } from '../../../../store/driver/useDriverProfileStore';
import { useDriverTripsListStore } from '../../../../store/driver/useDriverTripsStore';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import DriverScreenShell from '../../components/DriverScreenShell';
import DeleteAccountSheet from '../../../../components/DeleteAccountSheet';
import useDriverAccountDeletionStore from '../../../../store/driver/useDriverAccountDeletionStore';

const APPROVAL_LABEL = {
  approved: 'Approved',
  pending: 'Onboarding',
  under_review: 'Under review',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

const MENU_GROUPS = [
  {
    title: 'Profile',
    items: [
      { icon: User, label: 'Profile Info', path: '/driver/account/info' },
      { icon: IdCard, label: 'SpareDriver ID Card', path: '/driver/account/id-card' },
      { icon: FileText, label: 'Documents', path: '/driver/account/documents' },
    ],
  },
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
      { icon: Gift, label: 'Refer & Earn', path: '/driver/refer' },
      { icon: Building2, label: 'Bank Details', path: '/driver/account/bank' },
      { icon: GraduationCap, label: 'Training & Certification', path: '/driver/register/training' },
      { icon: History, label: 'Payment History', path: '/driver/payments' },
    ],
  },
];

function tenureYears(date) {
  if (!date) return '—';
  const start = new Date(date).getTime();
  if (Number.isNaN(start)) return '—';
  const years = (Date.now() - start) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0) return '—';
  if (years < 0.1) return '0';
  return years.toFixed(1);
}

function short(id) {
  const s = String(id);
  return s.slice(0, 6).toUpperCase();
}

const DriverAccountPage = () => {
  const navigate = useNavigate();
  const cachedDriver = useDriverAuthStore((s) => s.driver);
  const updateDriver = useDriverAuthStore((s) => s.updateDriver);
  const logout = useDriverAuthStore((s) => s.logout);

  const profileKey = buildCacheKey('driver-profile', {});
  const { data: profile } = useCachedQuery(useDriverProfileStore, profileKey, {});

  const tripsKey = buildCacheKey('driver-trips-list', {
    tab: 'completed',
    page: 1,
    limit: 1,
  });
  const { data: trips } = useCachedQuery(useDriverTripsListStore, tripsKey, {
    tab: 'completed',
    page: 1,
    limit: 1,
  });

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
      driverNumber: profile.driverNumber,
    });
  }, [profile, updateDriver]);

  const driver = useMemo(
    () => profile || cachedDriver || {},
    [profile, cachedDriver],
  );
  const displayName = driver?.name || 'Driver';
  const avatarSrc =
    driver?.profilePicture ||
    driver?.documents?.find((d) => d.type === 'selfie')?.fileUrl ||
    undefined;
  const approvalLabel =
    APPROVAL_LABEL[driver?.approvalStatus] || (driver?.approvalStatus ? driver.approvalStatus : null);

  const ratingValue = Number(driver?.rating || 0);
  const ratingLabel = ratingValue > 0 ? ratingValue.toFixed(1) : '—';
  const tripCount = trips?.pagination?.total ?? null;
  const years = useMemo(
    () => tenureYears(driver?.approvedAt || driver?.createdAt),
    [driver?.approvedAt, driver?.createdAt],
  );

  const handleLogout = () => {
    logout();
    navigate('/driver/login');
  };

  return (
    <DriverScreenShell
      className="bg-white"
      header={
        <header className="bg-white px-3 pt-3 pb-2 flex items-center gap-2">
          <h1 className="flex-1 text-base font-bold text-text px-1">My Profile</h1>
          <button
            type="button"
            onClick={() => navigate('/driver/help-support')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-text"
          >
            <Headphones className="w-4 h-4" />
            Help
          </button>
        </header>
      }
      bodyClassName="pb-8"
    >
      <div className="relative px-4 pt-2">
        <div className="h-28 rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary-dark to-amber-500 relative">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 80%, rgba(0,0,0,0.25) 0%, transparent 45%), radial-gradient(circle at 85% 25%, rgba(255,255,255,0.35) 0%, transparent 40%)',
            }}
          />
          <svg
            className="absolute bottom-0 left-0 right-0 w-full h-16 text-black/15"
            viewBox="0 0 400 80"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M0 80 V48 Q40 20 80 40 T160 35 T240 45 T320 28 T400 50 V80 Z"
            />
          </svg>
        </div>

        <div className="flex flex-col items-center -mt-10">
          <div className="rounded-full ring-4 ring-white bg-white relative">
            <Avatar
              src={avatarSrc}
              name={displayName}
              size="xl"
              online={driver?.isOnline}
            />
          </div>
          <h2 className="mt-3 text-xl font-bold text-text text-center">
            {displayName}
          </h2>
          {approvalLabel && (
            <p className="mt-1 text-xs font-medium text-text-muted">
              {approvalLabel}
              {driver?.isOnline != null && (
                <span className="text-text-muted">
                  {' · '}
                  {driver.isOnline ? 'Online' : 'Offline'}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 px-6 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-lg font-bold text-text inline-flex items-center justify-center gap-1">
            {ratingLabel}
            <Star className="w-4 h-4 fill-primary text-primary" />
          </p>
          <p className="text-[11px] font-semibold tracking-wide text-text-muted mt-0.5">
            RATING
          </p>
        </div>
        <div className="text-center border-x border-border-light">
          <p className="text-lg font-bold text-text">
            {tripCount == null ? '—' : tripCount}
          </p>
          <p className="text-[11px] font-semibold tracking-wide text-text-muted mt-0.5">
            TRIPS
          </p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text">{years}</p>
          <p className="text-[11px] font-semibold tracking-wide text-text-muted mt-0.5">
            YEARS
          </p>
        </div>
      </div>

      <div className="mt-6 px-4 space-y-5">
        {MENU_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-1 mb-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted">
              {group.title}
            </p>
            <div className="space-y-2.5">
              {group.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-bg hover:bg-border-light transition-colors text-left"
                >
                  <item.icon className="w-5 h-5 text-text shrink-0" />
                  <span className="flex-1 text-sm font-medium text-text">
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-muted" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="mx-4 mt-4 w-[calc(100%-2rem)] flex items-center justify-center gap-2 py-3.5 bg-bg rounded-xl text-danger font-medium text-sm hover:bg-danger-light transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Delete account
      </button>

      <div className="px-4 mt-4 space-y-3">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-bg text-danger font-medium text-sm hover:bg-danger-light transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>

        <p className="text-center text-[11px] text-text-muted">
          Driver ID {driver?.driverNumber || (driver?._id ? short(driver._id) : '—')}
        </p>
      </div>

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

export default DriverAccountPage;
