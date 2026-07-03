import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, QrCode, Wallet, Image as ImageIcon, Clock } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Badge from '../../../../components/Badge';
import DriverAccountSubPage from '../components/DriverAccountSubPage';
import useDriverWithdrawalStore from '../../../../store/driver/useDriverWithdrawalStore';
import { formatCurrency } from '../../../../utils/formatters';
import {
  MIN_DRIVER_WALLET_BALANCE,
  WITHDRAWAL_STATUS_LABELS,
} from '../../../../constants/withdrawal';

const statusVariant = {
  pending: 'warning',
  processed: 'success',
  rejected: 'danger',
};

const DriverWithdrawPage = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [amount, setAmount] = useState('');
  const [qrPreview, setQrPreview] = useState('');
  const [qrFile, setQrFile] = useState(null);

  const limits = useDriverWithdrawalStore((s) => s.limits);
  const withdrawals = useDriverWithdrawalStore((s) => s.withdrawals);
  const loading = useDriverWithdrawalStore((s) => s.loading);
  const submitting = useDriverWithdrawalStore((s) => s.submitting);
  const fetchLimits = useDriverWithdrawalStore((s) => s.fetchLimits);
  const fetchWithdrawals = useDriverWithdrawalStore((s) => s.fetchWithdrawals);
  const submitWithdrawal = useDriverWithdrawalStore((s) => s.submitWithdrawal);

  useEffect(() => {
    fetchLimits().catch(() => {});
    fetchWithdrawals().catch(() => {});
  }, [fetchLimits, fetchWithdrawals]);

  const maxWithdrawable = limits?.maxWithdrawable || 0;
  const hasPending = limits?.hasPendingRequest;

  const parsedAmount = useMemo(() => Number(amount) || 0, [amount]);

  const onQrChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (hasPending) {
      toast.error('You already have a pending withdrawal request');
      return;
    }
    if (parsedAmount <= 0 || parsedAmount > maxWithdrawable) {
      toast.error(`Enter an amount up to ${formatCurrency(maxWithdrawable)}`);
      return;
    }
    try {
      await submitWithdrawal({ amount: parsedAmount, qrFile });
      toast.success('Withdrawal request submitted');
      setAmount('');
      setQrFile(null);
      setQrPreview('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not submit request');
    }
  };

  return (
    <DriverAccountSubPage title="Withdraw" onBack={() => navigate('/driver/earnings')}>
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-xl border border-white/5 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center">
            <Wallet className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <p className="text-[11px] text-white/60 uppercase tracking-wider font-semibold">Available to withdraw</p>
            <p className="text-3xl font-extrabold tracking-tight mt-0.5">{formatCurrency(maxWithdrawable)}</p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
          <span>Wallet balance: <strong>{formatCurrency(limits?.balance || 0)}</strong></span>
          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full">₹{MIN_DRIVER_WALLET_BALANCE} min required</span>
        </div>
      </div>

      {hasPending && (
        <div className="flex gap-3 bg-amber-50/80 border border-amber-200/60 rounded-3xl p-4 text-amber-900 text-sm shadow-sm animate-pulse">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-xs uppercase tracking-wider text-amber-800">Request Pending</p>
            <p className="text-xs mt-1 text-amber-700 leading-relaxed">
              You already have a pending withdrawal request. Please wait for the admin to process it.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <Card padding="p-5" className="space-y-4 rounded-3xl shadow-sm border border-slate-100">
          <label className="block text-sm font-semibold text-slate-800">
            Amount to withdraw
            <div className="relative mt-2">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
              <input
                type="number"
                min="1"
                max={maxWithdrawable}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={hasPending || maxWithdrawable <= 0}
                className="w-full rounded-2xl border border-slate-200 pl-8 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50 disabled:bg-slate-50"
                placeholder={`Max ${maxWithdrawable}`}
              />
            </div>
          </label>

          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">Payment QR (UPI / bank)</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={hasPending}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary/50 hover:bg-slate-50/50 transition-all text-left group disabled:opacity-50 disabled:pointer-events-none"
            >
              {qrPreview ? (
                <div className="relative shrink-0">
                  <img src={qrPreview} alt="QR preview" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                  <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-white font-medium">Change</span>
                  </div>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0">
                  <QrCode className="w-7 h-7 text-slate-500 group-hover:text-primary transition-colors" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-850 truncate">
                  {qrFile ? qrFile.name : 'Upload Payment QR'}
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-normal">
                  UPI QR code or Bank details QR. Admin will scan this to process payout.
                </p>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onQrChange} />
          </div>

          <Button
            type="submit"
            fullWidth
            disabled={submitting || hasPending || maxWithdrawable <= 0}
            className="h-12 text-sm font-bold shadow-lg shadow-primary/20 mt-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Request withdrawal'}
          </Button>
        </Card>
      </form>

      <div className="space-y-3">
        <p className="px-1 text-[11px] uppercase tracking-wide font-extrabold text-slate-400">
          Your requests
        </p>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}
        {!loading && withdrawals.length === 0 && (
          <Card padding="p-6" className="text-center text-sm text-slate-400 rounded-3xl border border-slate-100 shadow-sm">
            No withdrawal requests yet
          </Card>
        )}
        <div className="space-y-3">
          {withdrawals.map((w) => (
            <div key={w._id} className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900 text-base">{formatCurrency(w.amountRupees)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(w.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant[w.status] || 'default'}>
                  <span className="font-semibold text-xs tracking-wider uppercase">{WITHDRAWAL_STATUS_LABELS[w.status] || w.status}</span>
                </Badge>
              </div>
              {w.status === 'processed' && w.transactionDetails && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5 bg-slate-50/50 rounded-2xl p-3">
                  {w.transactionDetails.utr && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400">UTR Number</span>
                      <span className="font-mono text-slate-800 font-medium">{w.transactionDetails.utr}</span>
                    </div>
                  )}
                  {w.transactionDetails.transactionId && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Transaction ID</span>
                      <span className="font-mono text-slate-800 font-medium">{w.transactionDetails.transactionId}</span>
                    </div>
                  )}
                  {w.transactionDetails.mode && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Payment Mode</span>
                      <span className="font-medium text-slate-800 capitalize">{w.transactionDetails.mode}</span>
                    </div>
                  )}
                  {w.paymentProof?.url && (
                    <div className="flex justify-end pt-1">
                      <a
                        href={w.paymentProof.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary font-bold hover:underline"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        View payment proof
                      </a>
                    </div>
                  )}
                </div>
              )}
              {w.status === 'rejected' && w.rejectionReason && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="bg-red-50 text-red-800 text-xs rounded-2xl p-3 leading-relaxed">
                    <span className="font-bold block text-[10px] uppercase tracking-wider text-red-600 mb-0.5">Reason for Rejection</span>
                    {w.rejectionReason}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </DriverAccountSubPage>
  );
};

export default DriverWithdrawPage;
