import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Shield, CreditCard, Loader2, Timer, X } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { useRazorpayCheckout } from '../../../../hooks/useRazorpayCheckout';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import {
  BOOKING_STATUS,
  PAYMENT_MODE,
  PAYMENT_POLICY,
} from '../../../../constants/bookingStatus';

/**
 * Payment screen for the Pay Now flow.
 *
 * Reached from `SearchingDriverPage` the moment a driver accepts.
 * Two CTAs live here:
 *   1. "Pay ₹X" — opens Razorpay, verifies, advances to /assigned.
 *   2. "Cancel ride" — terminates the booking. Free of charge as long
 *                       as the user hasn't paid yet (which is always
 *                       true on this page since we're still in
 *                       AWAITING_PAYMENT).
 *
 * The countdown header mirrors `timeline.paymentDeadlineAt` exactly so
 * a Razorpay retry that refreshes the deadline shows up immediately.
 */
const PaymentPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const createPaymentOrder = useUserActiveBookingStore((s) => s.createPaymentOrder);
  const verifyPayment = useUserActiveBookingStore((s) => s.verifyPayment);
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const cancelBooking = useUserActiveBookingStore((s) => s.cancelBooking);
  const { openCheckout, loading: checkoutLoading } = useRazorpayCheckout();

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    applyUpdate(payload);
  });

  // Tick the countdown header every second. We keep the tick tight (1s)
  // because users tend to hover the page until the very last moment.
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);

  // Once the booking flips out of AWAITING_PAYMENT we jump to the next screen.
  useEffect(() => {
    if (!booking) return;
    if (
      booking.paymentMode === PAYMENT_MODE.PRE_RIDE &&
      booking.status === BOOKING_STATUS.DRIVER_ASSIGNED
    ) {
      navigate(`/user/book/assigned/${booking._id}`, { replace: true });
    } else if (
      booking.status === BOOKING_STATUS.CANCELLED
    ) {
      const reason = booking.cancellation?.reason;
      if (reason === 'payment_timeout') {
        toast.error('Booking cancelled — payment was not completed in time.', {
          duration: 6000,
        });
      } else if (reason === 'cancelled_by_driver' || reason === 'cancelled_by_driver_after_start') {
        toast('Driver cancelled the ride.', { icon: 'ℹ️' });
      }
      navigate('/user/home', { replace: true });
    } else if (booking.status === BOOKING_STATUS.NO_DRIVERS_FOUND) {
      navigate('/user/book/no-drivers', { replace: true });
    } else if (booking.status === BOOKING_STATUS.SEARCHING) {
      // Re-dispatch path: driver bailed, we're searching again. The
      // "we're finding another driver" popup itself lives on the
      // searching page so we just route there.
      navigate('/user/book/searching', { replace: true });
    }
  }, [booking, navigate]);

  // Pulled out so the React Compiler can statically verify dependencies;
  // wrapping inline reads behind an optional-chain confuses its inference.
  const paymentDeadlineAt = booking?.timeline?.paymentDeadlineAt;
  const driverAssignedAt = booking?.timeline?.driverAssignedAt;
  const { remainingSec, expired } = useMemo(() => {
    const deadlineSrc = paymentDeadlineAt || driverAssignedAt;
    if (!deadlineSrc) return { remainingSec: 0, expired: false };
    const deadlineMs = paymentDeadlineAt
      ? new Date(paymentDeadlineAt).getTime()
      : new Date(driverAssignedAt).getTime() +
        PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000;
    const remaining = Math.max(0, Math.ceil((deadlineMs - now) / 1000));
    return { remainingSec: remaining, expired: remaining <= 0 };
  }, [paymentDeadlineAt, driverAssignedAt, now]);

  const handlePay = useCallback(async () => {
    if (!booking?._id) return;
    setCreatingOrder(true);
    try {
      const order = await createPaymentOrder();
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
        order: { _id: order.bookingId },
        driver: null,
        onSuccess: async (response) => {
          await verifyPayment({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        },
        onDismiss: () => {
          toast('Payment cancelled');
        },
      });
      toast.success('Payment successful');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Payment failed');
    } finally {
      setCreatingOrder(false);
    }
  }, [booking?._id, createPaymentOrder, openCheckout, verifyPayment]);

  const handleCancelConfirm = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelBooking('cancelled_before_payment');
      toast.success('Ride cancelled — no amount charged.');
      navigate('/user/home', { replace: true });
    } catch (err) {
      if (err?.alreadyTerminal || err?.code === 'BOOKING_ALREADY_TERMINAL') {
        navigate('/user/home', { replace: true });
        return;
      }
      const status = useUserActiveBookingStore.getState().booking?.status;
      if (status === BOOKING_STATUS.CANCELLED) {
        navigate('/user/home', { replace: true });
        return;
      }
      if (status === BOOKING_STATUS.NO_DRIVERS_FOUND) {
        navigate('/user/book/no-drivers', { replace: true });
        return;
      }
      toast.error(err?.response?.data?.message || err?.message || 'Could not cancel');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }, [cancelBooking, cancelling, navigate]);

  if (!booking) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg min-h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  const fareTotal = booking.fareSnapshot?.total || 0;
  // Waiting buffer is *held* in the wallet (no debit yet) — surfaced on
  // this legacy Razorpay screen for parity with the wallet flow.
  const bufferRupees = Number(booking.waiting?.bufferRupees || 0);
  const total = fareTotal;
  const busy = creatingOrder || checkoutLoading || cancelling;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => !busy && navigate(-1)}
            disabled={busy}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 disabled:opacity-40"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">Pay to start the ride</h1>
            <p className="text-xs text-text-muted">
              Your driver is held until payment lands.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted">Booking</p>
              <p className="text-sm font-semibold text-text truncate">
                {booking.bookingNumber}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Amount due</p>
              <p className="text-lg font-bold text-text">₹{total}</p>
              {bufferRupees > 0 && (
                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
                  + ₹{bufferRupees} held in wallet as waiting reserve
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="border border-red-100 bg-red-50/60">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <Timer className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text">
                {expired ? 'Payment window closed' : 'Pay within the next minute'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {expired
                  ? 'The driver has been released. Please try booking again.'
                  : 'If you don\'t pay in time, your driver is released and the booking auto-cancels.'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">
                Time left
              </p>
              <p
                className={`text-xl font-bold tabular-nums ${
                  expired ? 'text-text-muted' : remainingSec <= 10 ? 'text-red-600' : 'text-text'
                }`}
              >
                {Math.floor(remainingSec / 60)
                  .toString()
                  .padStart(2, '0')}
                :{(remainingSec % 60).toString().padStart(2, '0')}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text mb-3">What&apos;s included</h3>
          <ul className="space-y-2 text-xs text-text-secondary">
            <li>• Secure Razorpay checkout (UPI, cards, wallets, netbanking)</li>
            <li>• Free cancellation any time before you pay</li>
            <li>• Full refund (minus platform charge) if the driver cancels</li>
          </ul>
        </Card>
      </div>

      <div className="p-4 bg-white border-t border-border-light space-y-3">
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <Shield className="w-3.5 h-3.5 text-success" />
          100% secure payments
        </div>
        <Button
          fullWidth
          loading={creatingOrder || checkoutLoading}
          disabled={busy || expired}
          onClick={handlePay}
        >
          {`Pay \u20B9${total}`}
        </Button>
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-red-600 font-semibold py-3 text-sm disabled:opacity-50 hover:bg-red-100 transition"
        >
          <X className="w-4 h-4" />
          Cancel ride (no charge)
        </button>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => !cancelling && setConfirmCancel(false)}
        onConfirm={handleCancelConfirm}
        title="Cancel this ride?"
        description="You haven't paid yet, so no amount will be charged. The driver will be released and you can book a new ride."
        confirmLabel="Cancel ride"
        cancelLabel="Keep ride"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
};

export default PaymentPage;
