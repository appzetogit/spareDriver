import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  Image as ImageIcon,
  Loader2,
  Mail,
  Phone,
  Star,
  User,
  Wallet,
} from 'lucide-react';
import AdminDetailModal from './AdminDetailModal';
import Badge from '../../../components/Badge';
import ImageLightbox from '../../../components/ImageLightbox';
import api from '../../../utils/api';
import { MIN_DRIVER_WALLET_BALANCE, WITHDRAWAL_STATUS_LABELS } from '../../../constants/withdrawal';
import StatusBadge from './StatusBadge';
import { InfoGrid } from './DetailBlocks';

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeMaxWithdrawable(balance, fullSettlement = false) {
  const bal = Number(balance) || 0;
  if (bal <= 0) return 0;
  if (fullSettlement) return bal;
  return Math.max(0, bal - MIN_DRIVER_WALLET_BALANCE);
}

const STATUS_VARIANT = {
  pending: 'warning',
  processed: 'success',
  rejected: 'danger',
};

export default function WithdrawalDetailModal({ withdrawal, open, onClose }) {
  const [driverProfile, setDriverProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const driverId = withdrawal?.driverId;

  useEffect(() => {
    if (!open || !driverId) {
      setDriverProfile(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get(`/admin/drivers/${driverId}`)
      .then((res) => {
        if (!cancelled) setDriverProfile(res?.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Could not load driver');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, driverId]);

  if (!open || !withdrawal) return null;

  const driver = driverProfile?.driver;
  const wallet = driver?.wallet || {};
  const balance = Number(wallet.balance) || 0;
  const maxWithdrawable = computeMaxWithdrawable(balance, withdrawal.isFullSettlement);

  return (
    <AdminDetailModal
      isOpen={open}
      onClose={onClose}
      title="Withdrawal request"
      subtitle={`${withdrawal.driverName || 'Driver'} · ${formatCurrency(withdrawal.amountRupees)}`}
      footer={
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          {driverId && (
            <Link
              to={`/admin/drivers/${driverId}/profile`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90"
            >
              <User className="w-4 h-4" />
              View driver profile
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Request details</h3>
            </div>
            <Badge variant={STATUS_VARIANT[withdrawal.status] || 'warning'}>
              {WITHDRAWAL_STATUS_LABELS[withdrawal.status] || withdrawal.status}
            </Badge>
          </div>
          <InfoGrid
            items={[
              { label: 'Requested amount', value: formatCurrency(withdrawal.amountRupees) },
              { label: 'Balance at request', value: formatCurrency(withdrawal.walletBalanceAtRequest) },
              { label: 'Requested on', value: formatDateTime(withdrawal.createdAt) },
              {
                label: 'Type',
                value: withdrawal.isFullSettlement ? 'Full settlement (account deletion)' : 'Normal withdrawal',
              },
              {
                label: 'Payout method',
                value:
                  withdrawal.payoutMethod === 'bank'
                    ? 'Bank transfer'
                    : withdrawal.qrImage?.url
                      ? 'QR code'
                      : withdrawal.bankDetails?.accountNumber
                        ? 'Bank transfer'
                        : '—',
              },
              ...(withdrawal.status === 'processed'
                ? [{ label: 'Processed on', value: formatDateTime(withdrawal.processedAt) }]
                : []),
              ...(withdrawal.status === 'rejected'
                ? [
                    { label: 'Rejected on', value: formatDateTime(withdrawal.rejectedAt) },
                    { label: 'Rejection reason', value: withdrawal.rejectionReason || '—' },
                  ]
                : []),
            ]}
          />
          {withdrawal.qrImage?.url && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Driver payment QR</p>
              <button
                type="button"
                onClick={() =>
                  setImagePreview({ url: withdrawal.qrImage.url, alt: 'Driver payment QR' })
                }
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium"
              >
                View QR image <ImageIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {withdrawal.bankDetails?.accountNumber && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Bank details</p>
              <InfoGrid
                items={[
                  { label: 'Account holder', value: withdrawal.bankDetails.accountHolderName || '—' },
                  { label: 'Account number', value: withdrawal.bankDetails.accountNumber || '—' },
                  { label: 'IFSC', value: withdrawal.bankDetails.ifscCode || '—' },
                  { label: 'Bank', value: withdrawal.bankDetails.bankName || '—' },
                  ...(withdrawal.bankDetails.upiId
                    ? [{ label: 'UPI ID', value: withdrawal.bankDetails.upiId }]
                    : []),
                ]}
              />
            </div>
          )}
          {withdrawal.paymentProof?.url && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Payment proof</p>
              <button
                type="button"
                onClick={() =>
                  setImagePreview({ url: withdrawal.paymentProof.url, alt: 'Payment proof' })
                }
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium"
              >
                View proof <ImageIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Driver wallet</h3>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading wallet details…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-rose-600 py-2">{error}</p>
          )}

          {!loading && driver && (
            <InfoGrid
              items={[
                { label: 'Current balance', value: formatCurrency(balance) },
                { label: 'Total earnings', value: formatCurrency(wallet.totalEarnings) },
                { label: 'Total withdrawn', value: formatCurrency(wallet.totalWithdrawn) },
                {
                  label: withdrawal.isFullSettlement ? 'Max full settlement' : 'Max withdrawable now',
                  value: formatCurrency(maxWithdrawable),
                },
                { label: 'Min balance required', value: formatCurrency(MIN_DRIVER_WALLET_BALANCE) },
              ]}
            />
          )}

          {!loading && !driver && !error && (
            <p className="text-sm text-slate-500">Driver wallet unavailable</p>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Driver details</h3>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading driver…
            </div>
          )}

          {!loading && driver && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <p className="text-base font-bold text-slate-900">{driver.name}</p>
                <StatusBadge status={driver.approvalStatus} />
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-4">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  {driver.phone || '—'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-4 h-4" />
                  {driver.email || '—'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Star className="w-4 h-4" />
                  {Number(driver.rating || 0).toFixed(1)} ({driver.ratingCount || 0} trips)
                </span>
              </div>
              <InfoGrid
                items={[
                  { label: 'Experience', value: `${driver.experienceYears ?? 0} years` },
                  {
                    label: 'Status',
                    value: driver.isOnline
                      ? driver.isOnTrip
                        ? 'On trip'
                        : 'Online'
                      : 'Offline',
                  },
                  { label: 'Joined', value: formatDateTime(driver.createdAt) },
                  { label: 'Driver ID', value: String(driver._id) },
                ]}
              />
            </>
          )}

          {!loading && !driver && !error && (
            <InfoGrid
              items={[
                { label: 'Name', value: withdrawal.driverName || '—' },
                { label: 'Phone', value: withdrawal.driverPhone || '—' },
              ]}
            />
          )}
        </div>
      </div>
      <ImageLightbox
        src={imagePreview?.url}
        alt={imagePreview?.alt}
        onClose={() => setImagePreview(null)}
      />
    </AdminDetailModal>
  );
}
