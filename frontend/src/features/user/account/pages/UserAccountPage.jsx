import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Car,
  Wallet,
  HelpCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  Gift,
  Trash2,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Avatar from '../../../../components/Avatar';
import DeleteAccountSheet from '../../../../components/DeleteAccountSheet';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import useUserAccountDeletionStore from '../../../../store/user/useUserAccountDeletionStore';
import { useUserSubscriptionStore } from '../../../../store/user/useUserPricingStore';
import { useAfterPaint } from '../../../../hooks/useAfterPaint';

const menuItems = [
  { id: 'profile', icon: User, label: 'My Profile', path: '/user/profile' },
  { id: 'cars', icon: Car, label: 'My Cars', path: '/user/my-cars' },
  { id: 'subscription', icon: Sparkles, label: 'My Subscription', path: '/user/account/subscription', dynamic: 'subscription' },
  // { id: 'payments', icon: CreditCard, label: 'Payment Methods', path: '#' },
  { id: 'wallet', icon: Wallet, label: 'My Wallet', path: '/user/wallet', dynamic: 'wallet' },
  { id: 'refer', icon: Gift, label: 'Refer & Earn', path: '/user/refer' },
  { id: 'help', icon: HelpCircle, label: 'Help & Support', path: '/user/help-support' },
];

const UserAccountPage = () => {
  const navigate = useNavigate();
  const user = useUserAuthStore((s) => s.user);
  const logout = useUserAuthStore((s) => s.logout);
  const wallet = useUserWalletStore((s) => s.wallet);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const mySubscriptions = useUserSubscriptionStore((s) => s.mySubscriptions);
  const fetchMySubscription = useUserSubscriptionStore((s) => s.fetchMySubscription);

  const deletionRequest = useUserAccountDeletionStore((s) => s.request);
  const deletionLoading = useUserAccountDeletionStore((s) => s.loading);
  const deletionSubmitting = useUserAccountDeletionStore((s) => s.submitting);
  const fetchDeletionRequest = useUserAccountDeletionStore((s) => s.fetchRequest);
  const submitDeletionRequest = useUserAccountDeletionStore((s) => s.submitRequest);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const secondaryReady = useAfterPaint({ delayMs: 100 });

  // Critical for labels: wallet. Important: subscription. Optional: deletion
  // status — only when the delete sheet opens.
  useEffect(() => {
    fetchWallet().catch(() => { });
  }, [fetchWallet]);

  useEffect(() => {
    if (!secondaryReady) return;
    fetchMySubscription().catch(() => { });
  }, [secondaryReady, fetchMySubscription]);

  useEffect(() => {
    if (!deleteOpen) return;
    fetchDeletionRequest().catch(() => { });
  }, [deleteOpen, fetchDeletionRequest]);

  const subscriptionLabel = useMemo(() => {
    const list = mySubscriptions || [];
    if (!list.length) return 'No active plan';
    if (list.length === 1) {
      return list[0].planNameSnapshot || list[0].planId?.name || 'Active';
    }
    return `${list.length} active subscriptions`;
  }, [mySubscriptions]);

  const walletLabel = useMemo(
    () =>
      `\u20B9${Number(wallet.balance || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
      })}`,
    [wallet.balance],
  );

  return (
    <div className="flex-1 flex flex-col bg-bg">
      {/* Profile Header */}
      <div className="bg-white px-4 pt-6 pb-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name || 'Customer'} size="xl" />
          <div>
            <h1 className="text-xl font-bold text-text">{user?.name || 'My Account'}</h1>
            <p className="text-sm text-text-secondary">
              {user?.phone_no ? `+91 ${user.phone_no}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 p-4">
        <Card className="divide-y divide-border-light">
          {menuItems.map((item) => {
            const sub =
              item.dynamic === 'wallet'
                ? walletLabel
                : item.dynamic === 'subscription'
                  ? subscriptionLabel
                  : null;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => item.path !== '#' && navigate(item.path)}
                className="w-full flex items-center gap-3 py-3.5 px-1 hover:bg-gray-50 transition-colors first:pt-1 last:pb-1"
              >
                <div className="w-9 h-9 rounded-lg bg-bg flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-text-secondary" />
                </div>
                <span className="flex-1 text-left text-sm font-medium text-text">
                  {item.label}
                </span>
                {sub && <span className="text-xs font-semibold text-text">{sub}</span>}
                <ChevronRight className="w-4 h-4 text-text-muted" />
              </button>
            );
          })}
        </Card>

        <button
          onClick={() => setDeleteOpen(true)}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 bg-white rounded-2xl shadow-card text-danger font-medium text-sm hover:bg-danger-light transition-colors"
        >
          <Trash2 className="w-5 h-5" />
          Delete account
        </button>

        <button
          onClick={logout}
          className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 bg-white rounded-2xl shadow-card text-danger font-medium text-sm hover:bg-danger-light transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      <DeleteAccountSheet
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        audience="user"
        walletBalance={Number(wallet.balance) || 0}
        existingRequest={deletionRequest}
        loading={deletionLoading}
        submitting={deletionSubmitting}
        onSubmit={submitDeletionRequest}
      />
    </div>
  );
};

export default UserAccountPage;
