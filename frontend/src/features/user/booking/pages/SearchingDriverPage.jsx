import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, Loader2, X, AlertTriangle } from 'lucide-react';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import AdsCarousel from '../../../../components/AdsCarousel';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import { BOOKING_STATUS, BOOKING_TYPE } from '../../../../constants/bookingStatus';
import { SERVICE_TYPES } from '../../../../constants/serviceTypes';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';

const SearchingDriverPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const notePaymentRequired = useUserActiveBookingStore((s) => s.notePaymentRequired);
  const cancelBooking = useUserActiveBookingStore((s) => s.cancelBooking);
  const clearActiveBooking = useUserActiveBookingStore((s) => s.clear);
  const draftReset = useBookingDraftStore((s) => s.reset);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  // Surfaces the "driver bailed — searching again" popup the moment the
  // backend re-dispatches a previously-accepted booking. The popup is
  // dismissible; the underlying search continues regardless.
  //
  // `dismissedCancelledAt` keeps the popup closed for the *same*
  // re-dispatch event (so socket replays don't re-pop it), but a fresh
  // re-dispatch carries a new `timeline.cancelledAt` value and the
  // popup re-opens automatically.
  const [reassigning, setReassigning] = useState(false);
  const [dismissedCancelledAt, setDismissedCancelledAt] = useState(null);

  // Hydrate if the user landed here directly via URL.
  useEffect(() => {
    if (!booking) {
      fetchActive().catch(() => {});
    }
  }, [booking, fetchActive]);

  const bookingStatus = booking?.status;
  const bookingIdForRedirect = booking?._id;
  const serviceType = booking?.serviceType;
  const bookingType = booking?.bookingType;
  const paymentMethod = booking?.paymentMethod;
  useEffect(() => {
    if (!bookingStatus) return;
    const assignedRoute = bookingIdForRedirect
      ? `/user/book/assigned/${bookingIdForRedirect}`
      : '/user/book/assigned';

    // Scheduled / outstation should not sit on the instant spinner —
    // send them to the booked-success screen instead.
    const isDeferredAssign =
      serviceType === SERVICE_TYPES.OUTSTATION
      || bookingType === BOOKING_TYPE.OUTSTATION
      || bookingType === BOOKING_TYPE.SCHEDULED
      || bookingStatus === BOOKING_STATUS.PENDING_ASSIGNMENT
      || bookingStatus === BOOKING_STATUS.IN_EMERGENCY_POOL;
    if (
      isDeferredAssign
      && (bookingStatus === BOOKING_STATUS.SEARCHING
        || bookingStatus === BOOKING_STATUS.PENDING_ASSIGNMENT
        || bookingStatus === BOOKING_STATUS.IN_EMERGENCY_POOL)
    ) {
      navigate('/user/book/scheduled', { replace: true });
      return;
    }

    switch (bookingStatus) {
      case BOOKING_STATUS.DRIVER_ASSIGNED:
        navigate(assignedRoute);
        break;
      case BOOKING_STATUS.AWAITING_PAYMENT:
        // Wallet-paid bookings should never land here — but if the
        // server flips a wallet booking into AWAITING_PAYMENT for any
        // reason (legacy extension flow, etc.) we treat it as
        // assigned and let the assigned page handle the pay sheet.
        if (paymentMethod === 'wallet') {
          navigate(assignedRoute);
        } else {
          navigate('/user/book/payment');
        }
        break;
      case BOOKING_STATUS.PENDING_ASSIGNMENT:
      case BOOKING_STATUS.IN_EMERGENCY_POOL:
        navigate('/user/book/scheduled', { replace: true });
        break;
      case BOOKING_STATUS.NO_DRIVERS_FOUND: {
        // Soft-park: payment still held. Dedicated page offers Search
        // again or Cancel (refund only on cancel).
        navigate('/user/book/no-drivers', { replace: true });
        break;
      }
      case BOOKING_STATUS.CANCELLED:
        // Wallet-paid bookings: any refund landed in the wallet on the
        // server; refresh so the user sees the new balance.
        fetchWallet().catch(() => {});
        navigate('/user/home', { replace: true });
        break;
      default:
        break;
    }
  }, [
    bookingStatus,
    bookingIdForRedirect,
    serviceType,
    bookingType,
    paymentMethod,
    navigate,
  ]);

  // Live patches from the dispatcher.
  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    applyUpdate(payload);
  });

  useSocketEvent(S2C_EVENTS.BOOKING_PAYMENT_REQUIRED, (payload) => {
    notePaymentRequired(payload);
  });

  // Backend fires this once whenever a paid booking gets re-dispatched
  // because the previous driver cancelled. We open the popup; the
  // status flip back to SEARCHING is already handled by the standard
  // BOOKING_UPDATED merge above.
  useSocketEvent(S2C_EVENTS.BOOKING_DRIVER_REASSIGNING, () => {
    setReassigning(true);
  });

  // Derived state for the "driver bailed" popup: shows up automatically
  // when the user lands here via the BOOKING_UPDATED redirect path
  // (cancellation reason stamped on the booking).
  const cancelledAt = booking?.timeline?.cancelledAt || null;
  const reassignReasonActive =
    booking?.status === BOOKING_STATUS.SEARCHING &&
    booking?.cancellation?.reason === 'driver_cancelled_reassigning';
  const shouldShowReassign =
    reassigning ||
    (reassignReasonActive &&
      String(dismissedCancelledAt || '') !== String(cancelledAt || ''));

  const handleDismissReassign = () => {
    setDismissedCancelledAt(cancelledAt);
    setReassigning(false);
  };

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const result = await cancelBooking('cancelled_by_user');
      fetchWallet().catch(() => {});
      setCancelConfirmOpen(false);

      // cancelBooking may re-sync a booking the server already closed.
      // Leave routing to the status effect for no-drivers; handle cancel
      // redirect here.
      const status = result?.status;
      if (
        status === BOOKING_STATUS.NO_DRIVERS_FOUND ||
        status === BOOKING_STATUS.CANCELLED
      ) {
        if (status === BOOKING_STATUS.CANCELLED) {
          draftReset();
          clearActiveBooking();
          navigate('/user/home', { replace: true });
        }
        // NO_DRIVERS_FOUND: keep booking; useEffect → /user/book/no-drivers.
        return;
      }

      draftReset();
      clearActiveBooking();
      navigate('/user/home', { replace: true });
    } catch (err) {
      setCancelConfirmOpen(false);
      if (err?.alreadyTerminal || err?.code === 'BOOKING_ALREADY_TERMINAL') {
        fetchWallet().catch(() => {});
        clearActiveBooking();
        draftReset();
        navigate('/user/home', { replace: true });
        return;
      }
      toast.error(err?.response?.data?.message || err?.message || 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  };

  const canCancel =
    !!booking &&
    bookingStatus !== BOOKING_STATUS.NO_DRIVERS_FOUND &&
    bookingStatus !== BOOKING_STATUS.CANCELLED &&
    bookingStatus !== BOOKING_STATUS.COMPLETED;

  const attempt = booking?.dispatch?.attemptsCount || 0;
  const maxAttempts = booking?.dispatch?.maxAttempts || 5;

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <div className="flex flex-col items-center animate-fade-in-up text-center">
        <div className="relative w-40 h-40 mb-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border-2 border-primary/30"
              style={{ animation: `pulse-ring 2s ease-out ${i * 0.6}s infinite` }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-primary/15 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-text mb-2">Finding a nearby driver…</h2>
        <p className="text-sm text-text-muted">
          {attempt > 0
            ? `Reaching out to driver ${attempt} of ${maxAttempts}.`
            : 'We just sent your request to the closest available driver.'}
        </p>

        <div className="mt-8 flex items-center gap-2 text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">{booking?.bookingNumber || 'Preparing booking…'}</span>
        </div>

        <div className="mt-10 w-full max-w-sm space-y-4">
          <AdsCarousel />

          {canCancel && (
            <button
              type="button"
              disabled={cancelling}
              onClick={() => setCancelConfirmOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-red-600 font-semibold py-3 text-sm disabled:opacity-60 hover:bg-red-100 transition"
            >
              <X className="w-4 h-4" />
              {cancelling ? 'Cancelling…' : 'Cancel booking'}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => !cancelling && setCancelConfirmOpen(false)}
        onConfirm={handleCancel}
        title="Cancel search?"
        description="Are you sure you want to cancel? We are actively looking for the nearest available driver for you."
        confirmLabel="Yes, cancel"
        cancelLabel="Keep searching"
        variant="danger"
        loading={cancelling}
      />

      {shouldShowReassign && (
        <DriverReassigningModal onClose={handleDismissReassign} />
      )}
    </div>
  );
};

/**
 * Modal we surface the instant the previous driver cancels a paid
 * pre-STARTED booking. The actual re-dispatch happens on the backend;
 * this is purely a comms UI. Dismissible so the user can return to the
 * spinner — the search keeps running either way.
 */
function DriverReassigningModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-yellow-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text">Driver cancelled the ride</h3>
            <p className="text-xs text-text-muted mt-1">
              No worries — we&apos;re assigning a new driver right now.
              Your payment is safe and will be applied to the new ride.
              If we can&apos;t find a driver, you can search again or
              cancel for a full refund.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl text-sm font-semibold bg-primary text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default SearchingDriverPage;
