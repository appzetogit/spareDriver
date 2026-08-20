import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, Settings2, Users, Clock, CheckCircle, Wallet, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Toggle from '../../../components/Toggle';
import Modal from '../../../components/Modal';
import Card from '../../../components/Card';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminReferralsStore } from '../../../store/admin/useAdminReferralsStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import StatsCard from '../components/StatsCard';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManagePlatformSettings } from '../../../constants/staffRoles';

const STATUS_OPTIONS = ['', 'pending', 'qualified', 'rewarded', 'rejected'];
const ROLE_OPTIONS = ['', 'user', 'driver'];

const defaultSettings = {
  user: {
    enabled: true,
    referrerRewardRupees: 100,
    referredRewardRupees: 0,
    minBookingAmountRupees: 0,
  },
  driver: {
    enabled: true,
    referrerRewardRupees: 500,
    referredRewardRupees: 0,
    requiredCompletedTrips: 5,
  },
};

const ManageReferrals = () => {
  const { admin } = useAdminAuthStore();
  const canEdit = canManagePlatformSettings(admin?.role);

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [debouncedCode, setDebouncedCode] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCode(referralCode.trim()), 300);
    return () => clearTimeout(t);
  }, [referralCode]);

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      status: status || undefined,
      role: role || undefined,
      referralCode: debouncedCode || undefined,
    }),
    [page, limit, status, role, debouncedCode],
  );

  const cacheKey = buildCacheKey('admin-referrals', queryParams);
  const { data, loading, refetch } = useCachedQuery(useAdminReferralsStore, cacheKey, queryParams);

  const referrals = data?.referrals ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };
  const stats = data?.stats ?? {};

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await api.get('/admin/settings/referrals');
      const payload = res.data?.data?.settings || res.data?.settings || defaultSettings;
      setSettings({
        user: { ...defaultSettings.user, ...payload.user },
        driver: { ...defaultSettings.driver, ...payload.driver },
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (settingsOpen) loadSettings();
  }, [settingsOpen, loadSettings]);

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await api.put('/admin/settings/referrals', settings);
      toast.success('Referral settings updated');
      setSettingsOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success('Referrals refreshed');
    } catch {
      toast.error('Failed to refresh referrals');
    }
  };

  const openDetail = async (row) => {
    try {
      const res = await api.get(`/admin/referrals/${row._id}`);
      setSelected(res.data?.data?.referral || res.data?.referral || row);
      setDetailOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load referral');
    }
  };

  const columns = useMemo(
    () => [
      { key: 'referrerName', label: 'Referrer' },
      { key: 'referralCode', label: 'Code' },
      { key: 'referredName', label: 'Referred' },
      {
        key: 'referrerRole',
        label: 'Role',
        render: (val) => (val === 'driver' ? 'Driver' : 'User'),
      },
      {
        key: 'status',
        label: 'Status',
        render: (val) => (
          <span className="capitalize text-xs font-semibold">{val}</span>
        ),
      },
      {
        key: 'referrerRewardRupees',
        label: 'Reward',
        render: (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`,
      },
      {
        key: 'createdAt',
        label: 'Created',
        render: (val) => (val ? new Date(val).toLocaleDateString('en-IN') : '—'),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gift className="w-7 h-7 text-primary" />
            Referrals
          </h1>
          <p className="text-sm text-slate-500 mt-1">Track referral relationships and rewards</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} className="gap-2" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setSettingsOpen(true)} className="gap-2">
            <Settings2 className="w-4 h-4" />
            Referral Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard icon={Users} label="Total" value={stats.total ?? 0} color="#3B82F6" />
        <StatsCard icon={Clock} label="Pending" value={stats.pending ?? 0} color="#F59E0B" />
        <StatsCard icon={CheckCircle} label="Rewarded" value={stats.rewarded ?? 0} color="#10B981" />
        <StatsCard
          icon={Wallet}
          label="Rewards Paid"
          value={`₹${Number(stats.totalRewardsPaid || 0).toLocaleString('en-IN')}`}
          color="#8B5CF6"
        />
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt || 'all'} value={opt}>
                {opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : 'All roles'}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt || 'all'} value={opt}>
                {opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : 'All statuses'}
              </option>
            ))}
          </select>
          <Input
            placeholder="Referral code"
            value={referralCode}
            onChange={(e) => {
              setReferralCode(e.target.value.toUpperCase());
              setPage(1);
            }}
          />
        </div>
      </Card>

      <ServerPaginatedTable
        columns={columns}
        data={referrals}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={openDetail}
        entityLabel="referrals"
        emptyMessage="No referrals found"
      />

      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title="Referral details">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <p><span className="font-medium">Referral ID:</span> {String(selected._id || selected.id || '—')}</p>
              <p><span className="font-medium">Code:</span> {selected.referralCode || '—'}</p>
              <p><span className="font-medium">Status:</span> <span className="capitalize">{selected.status || '—'}</span></p>
              <p><span className="font-medium">Qualification:</span> {selected.qualificationType || '—'}</p>
              <p><span className="font-medium">Referrer role:</span> <span className="capitalize">{selected.referrerRole || '—'}</span></p>
              <p><span className="font-medium">Referred role:</span> <span className="capitalize">{selected.referredRole || '—'}</span></p>
            </div>

            <div className="border-t pt-3">
              <p className="font-semibold mb-2">Referrer</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <p><span className="font-medium">Name:</span> {selected.referrerName || '—'}</p>
                <p><span className="font-medium">Phone:</span> {selected.referrerPhone || '—'}</p>
                <p className="sm:col-span-2"><span className="font-medium">Referrer ID:</span> {selected.referrerId ? String(selected.referrerId) : '—'}</p>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="font-semibold mb-2">Referred</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <p><span className="font-medium">Name:</span> {selected.referredName || '—'}</p>
                <p><span className="font-medium">Phone:</span> {selected.referredPhone || '—'}</p>
                <p className="sm:col-span-2"><span className="font-medium">Referred ID:</span> {selected.referredId ? String(selected.referredId) : '—'}</p>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="font-semibold mb-2">Rewards & rules</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <p><span className="font-medium">Referrer reward:</span> ₹{Number(selected.referrerRewardRupees || 0).toLocaleString('en-IN')}</p>
                <p><span className="font-medium">Referred reward:</span> ₹{Number(selected.referredRewardRupees || 0).toLocaleString('en-IN')}</p>
                <p><span className="font-medium">Min booking amount:</span> ₹{Number(selected.minBookingAmountRupees || 0).toLocaleString('en-IN')}</p>
                <p><span className="font-medium">Required completed trips:</span> {Number(selected.requiredCompletedTrips || 0)}</p>
                <p><span className="font-medium">Completed trips count:</span> {Number(selected.completedTripsCount || 0)}</p>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="font-semibold mb-2">Lifecycle</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <p><span className="font-medium">Created:</span> {selected.createdAt ? new Date(selected.createdAt).toLocaleString('en-IN') : '—'}</p>
                <p><span className="font-medium">Updated:</span> {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('en-IN') : '—'}</p>
                <p><span className="font-medium">Qualified:</span> {selected.qualifiedAt ? new Date(selected.qualifiedAt).toLocaleString('en-IN') : '—'}</p>
                <p><span className="font-medium">Rewarded:</span> {selected.rewardedAt ? new Date(selected.rewardedAt).toLocaleString('en-IN') : '—'}</p>
                <p><span className="font-medium">Qualification booking ID:</span> {selected.qualificationBookingId ? String(selected.qualificationBookingId) : '—'}</p>
                <p><span className="font-medium">Wallet txn ID:</span> {selected.walletTransactionId ? String(selected.walletTransactionId) : '—'}</p>
                <p><span className="font-medium">Driver payment ID:</span> {selected.driverPaymentId ? String(selected.driverPaymentId) : '—'}</p>
              </div>
            </div>

            {selected.rejectionReason && (
              <div className="border-t pt-3">
                <p><span className="font-medium">Rejection reason:</span> {selected.rejectionReason}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Referral settings">
        {settingsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">User referral</h3>
              <Toggle
                label="Enabled"
                checked={settings.user.enabled}
                onChange={(v) => setSettings((s) => ({ ...s, user: { ...s.user, enabled: v } }))}
                disabled={!canEdit}
              />
              <Input
                label="Referrer reward (₹)"
                type="number"
                min={0}
                value={settings.user.referrerRewardRupees}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    user: { ...s.user, referrerRewardRupees: Number(e.target.value) },
                  }))
                }
                disabled={!canEdit}
              />
              <Input
                label="New user reward (₹, optional)"
                type="number"
                min={0}
                value={settings.user.referredRewardRupees}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    user: { ...s.user, referredRewardRupees: Number(e.target.value) },
                  }))
                }
                disabled={!canEdit}
              />
              <Input
                label="Minimum booking amount (₹)"
                type="number"
                min={0}
                value={settings.user.minBookingAmountRupees}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    user: { ...s.user, minBookingAmountRupees: Number(e.target.value) },
                  }))
                }
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Driver referral</h3>
              <Toggle
                label="Enabled"
                checked={settings.driver.enabled}
                onChange={(v) => setSettings((s) => ({ ...s, driver: { ...s.driver, enabled: v } }))}
                disabled={!canEdit}
              />
              <Input
                label="Referrer reward (₹)"
                type="number"
                min={0}
                value={settings.driver.referrerRewardRupees}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    driver: { ...s.driver, referrerRewardRupees: Number(e.target.value) },
                  }))
                }
                disabled={!canEdit}
              />
              <Input
                label="New driver reward (₹, optional)"
                type="number"
                min={0}
                value={settings.driver.referredRewardRupees}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    driver: { ...s.driver, referredRewardRupees: Number(e.target.value) },
                  }))
                }
                disabled={!canEdit}
              />
              <Input
                label="Required completed trips"
                type="number"
                min={0}
                value={settings.driver.requiredCompletedTrips}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    driver: { ...s.driver, requiredCompletedTrips: Number(e.target.value) },
                  }))
                }
                disabled={!canEdit}
              />
              <p className="text-xs text-slate-500">
                Driver referrals are created only after admin approval. Rejected drivers do not get a referral record.
              </p>
            </div>

            {canEdit && (
              <Button fullWidth onClick={saveSettings} loading={settingsSaving}>
                Save settings
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManageReferrals;
