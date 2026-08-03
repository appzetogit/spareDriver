import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Wallet as WalletIcon, Loader2, ShieldCheck } from 'lucide-react';
import Button from '../../../../components/Button';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { useRazorpayCheckout } from '../../../../hooks/useRazorpayCheckout';

/**
 * Bottom-sheet wallet top-up flow.
 *
 *   props:
 *     - open               boolean
 *     - onClose            () => void          dismiss handler (X / backdrop)
 *     - suggestedAmount    number              prefilled top-up amount
 *                                              (e.g. exact shortfall from a 402)
 *     - title              string              optional header copy
 *     - subtitle           string              optional subhead copy
 *     - onSuccess(wallet)  () => void|Promise  fired after the backend
 *                                              verifies the Razorpay payment
 *                                              and the local wallet has been
 *                                              patched. The sheet auto-closes
 *                                              right after.
 *
 * The sheet rounds the suggested amount UP to the nearest ₹50 so the user
 * also has a small cushion for the next booking (avoids the
 * "top-up exactly, get charged exactly, balance is zero again" UX trap).
 */
const QUICK_AMOUNTS = [200, 500, 1000, 2000];

function roundUpToFifty(n) {
  const x = Math.max(0, Math.ceil(Number(n) || 0));
  if (!x) return 0;
  return Math.ceil(x / 50) * 50;
}

const TopupSheet = ({
  open,
  onClose,
  suggestedAmount = 0,
  title = 'Add money to wallet',
  subtitle = null,
  onSuccess,
}) => {
  const limits = useUserWalletStore((s) => s.limits);
  const createTopupOrder = useUserWalletStore((s) => s.createTopupOrder);
  const verifyTopup = useUserWalletStore((s) => s.verifyTopup);
  const topupLoading = useUserWalletStore((s) => s.topupLoading);
  const user = useUserAuthStore((s) => s.user);
  const { openCheckout, loading: checkoutLoading } = useRazorpayCheckout();

  const cushioned = useMemo(
    () => (suggestedAmount > 0 ? roundUpToFifty(suggestedAmount) : 0),
    [suggestedAmount],
  );

  const [amount, setAmount] = useState(() => cushioned || QUICK_AMOUNTS[1]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prefill on open
    if (cushioned > 0) setAmount(cushioned);
  }, [open, cushioned]);

  if (!open) return null;

  const min = limits?.MIN_TOPUP_RUPEES || 10;
  const max = limits?.MAX_TOPUP_RUPEES || 100_000;

  const amountValid =
    Number.isFinite(Number(amount)) &&
    Number(amount) >= min &&
    Number(amount) <= max;

  const handleSubmit = async () => {
    if (!amountValid || submitting || topupLoading || checkoutLoading) return;
    setSubmitting(true);
    try {
      const order = await createTopupOrder(Number(amount));
      if (!order?.orderId) {
        toast.error('Payments are not configured. Please try again later.');
        return;
      }
      await openCheckout({
        razorpay: {
          keyId: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: order.name,
          description: order.description,
        },
        order: { _id: order.orderId },
        driver: {
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone_no ? String(user.phone_no) : '',
        },
        onSuccess: async (response) => {
          const result = await verifyTopup({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          const credited = Number(
            result?.creditedRupees ?? result?.transaction?.amountRupees ?? amount,
          );
          toast.success(
            result?.alreadyCredited
              ? 'Wallet already credited.'
              : `₹${credited.toLocaleString('en-IN')} added to wallet.`,
          );
          await onSuccess?.(result?.wallet);
          onClose?.();
        },
        onDismiss: () => {
          toast('Top-up cancelled');
        },
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Top-up failed');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || topupLoading || checkoutLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <WalletIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-text">{title}</h3>
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose?.()}
            className="p-1.5 -mt-1 -mr-1 rounded-xl text-text-muted hover:bg-gray-100"
            aria-label="Close"
            disabled={busy}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {cushioned > 0 && cushioned !== Math.round(suggestedAmount) && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900">
            We suggested <strong>₹{cushioned}</strong> (rounded up from
            ₹{Math.round(suggestedAmount)}) so you have a small cushion
            for next time.
          </div>
        )}

        <div>
          <label className="block text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">
            Amount
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-white px-3">
            <span className="text-base font-semibold text-text-muted">₹</span>
            <input
              type="number"
              min={min}
              max={max}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className="flex-1 h-12 text-lg font-bold text-text bg-transparent focus:outline-none disabled:opacity-60"
            />
          </div>
          <p className="text-[11px] text-text-muted mt-1">
            Min ₹{min} · Max ₹{max.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-text-muted mt-1.5 leading-snug">
            The full amount is credited to your wallet.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(q)}
              disabled={busy}
              className={`h-10 rounded-xl text-sm font-semibold border transition ${
                Number(amount) === q
                  ? 'border-primary bg-primary/10 text-text'
                  : 'border-border bg-white text-text-secondary hover:bg-gray-50'
              }`}
            >
              ₹{q}
            </button>
          ))}
        </div>

        <Button
          fullWidth
          loading={busy}
          disabled={!amountValid || busy}
          onClick={handleSubmit}
        >
          {busy ? 'Processing…' : `Add ₹${Number(amount) || 0}`}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          Secured by Razorpay
        </p>

        {(topupLoading || checkoutLoading) && (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> opening checkout…
          </p>
        )}
      </div>
    </div>
  );
};

export default TopupSheet;
