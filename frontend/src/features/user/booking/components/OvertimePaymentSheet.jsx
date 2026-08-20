import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, Loader2 } from 'lucide-react';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import { useRazorpayCheckout } from '../../../../hooks/useRazorpayCheckout';
import useUserAuthStore from '../../../../store/useUserAuthStore';

function fmtMoney(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

/**
 * Post-grace overtime: pay the live server quote via Razorpay, then the
 * trip completes. Amount is display-only — the backend recalculates.
 */
const OvertimePaymentSheet = ({
  open,
  onClose,
  overtime,
  onCreateOrder,
  onVerify,
  onRefresh,
  onExtend,
}) => {
  const user = useUserAuthStore((s) => s.user);
  const { openCheckout, loading: checkoutLoading } = useRazorpayCheckout();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !onRefresh) return undefined;
    const id = setInterval(() => {
      onRefresh().catch(() => null);
    }, 30_000);
    return () => clearInterval(id);
  }, [open, onRefresh]);

  const minutes = Number(overtime?.billableMinutes) || 0;
  const rate = Number(overtime?.ratePerHour) || 0;
  const subtotal = Number(overtime?.subtotal) || 0;
  const platformFee = Number(overtime?.platformFee) || 0;
  const gst = Number(overtime?.gst) || 0;
  const total = Number(overtime?.totalPayable ?? overtime?.amountRupees) || 0;
  const pending = overtime?.paymentStatus === 'pending';
  const failed = overtime?.paymentStatus === 'failed';

  const handlePay = async () => {
    if (!onCreateOrder || !onVerify) return;
    setBusy(true);
    try {
      const razorpay = await onCreateOrder();
      if (!razorpay?.orderId) {
        throw new Error('Could not create payment order');
      }
      await openCheckout({
        razorpay,
        onSuccess: async (response) => {
          await onVerify({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          setSuccess(true);
          toast.success('Additional trip payment received');
        },
        onFailed: () => {
          toast.error('Additional payment failed. Your trip is still active.');
        },
        driver: {
          name: user?.name,
          email: user?.email,
          phone: user?.phone_no || user?.phone,
        },
      });
    } catch (err) {
      if (err?.message === 'Payment cancelled') {
        toast('Payment pending — complete it to finish your trip.');
      } else {
        toast.error(
          err?.response?.data?.message || err?.message || 'Payment could not start',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={success ? 'Payment successful' : 'Trip duration exceeded'}
      size="sm"
      showClose
    >
      {success ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Your additional trip charge has been paid. Completing your trip…
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-sm text-amber-900 leading-snug">
              Your booked trip duration and grace period have ended. Pay the overdue
              amount to finish the trip, or extend and pay overdue time plus extra time.
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              Overdue amount
            </p>
            <p className="text-3xl font-extrabold text-amber-950 tabular-nums mt-0.5">
              {fmtMoney(total)}
            </p>
            <p className="text-xs text-amber-800 mt-1">
              {minutes > 0 ? `${minutes} min past grace` : 'Chargeable time after booked duration'}
            </p>
          </div>

          {pending && (
            <p className="text-xs font-semibold text-amber-700">Payment pending</p>
          )}
          {failed && (
            <p className="text-xs font-semibold text-red-600">
              Last payment failed — retry with the current amount.
            </p>
          )}

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Overdue time</span>
              <span className="font-medium tabular-nums">{minutes} min</span>
            </div>
            {rate > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Overtime rate</span>
                <span className="font-medium tabular-nums">{fmtMoney(rate)}/hour</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Overdue charge</span>
              <span className="tabular-nums">{fmtMoney(subtotal)}</span>
            </div>
            {platformFee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Platform fee</span>
                <span className="tabular-nums">{fmtMoney(platformFee)}</span>
              </div>
            )}
            {gst > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">GST</span>
                <span className="tabular-nums">{fmtMoney(gst)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="font-semibold">Total</span>
              <span className="font-extrabold tabular-nums">{fmtMoney(total)}</span>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={busy || checkoutLoading || !(total > 0)}
            onClick={handlePay}
          >
            {(busy || checkoutLoading) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {total > 0 ? `Pay ${fmtMoney(total)} to finish trip` : 'Waiting for chargeable time'}
          </Button>
          {onExtend && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy || checkoutLoading}
              onClick={onExtend}
            >
              Extend trip (overdue + extra time)
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
};

export default OvertimePaymentSheet;
