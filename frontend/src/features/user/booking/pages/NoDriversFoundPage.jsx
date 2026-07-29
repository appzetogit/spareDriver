import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { SearchX, Loader2, RotateCcw, X } from 'lucide-react';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { useSocketEvent } from '../../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../../constants/socketEvents';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import { BOOKING_STATUS } from '../../../../constants/bookingStatus';

/**
 * Soft-park screen after dispatch waves exhaust with no accept.
 * Payment stays held until the user Cancels (refund) or Search again.
 */
const NoDriversFoundPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const searchAgain = useUserActiveBookingStore((s) => s.searchAgain);
  const cancelBooking = useUserActiveBookingStore((s) => s.cancelBooking);
  const clearActiveBooking = useUserActiveBookingStore((s) => s.clear);
  const draftReset = useBookingDraftStore((s) => s.reset);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);

  const [searchingAgain, setSearchingAgain] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  useEffect(() => {
    if (!booking) {
      fetchActive().catch(() => {});
    }
  }, [booking, fetchActive]);

  const bookingStatus = booking?.status;
  const bookingId = booking?._id;

  useEffect(() => {
    if (!bookingStatus) return;

    if (bookingStatus === BOOKING_STATUS.SEARCHING) {
      navigate('/user/book/searching', { replace: true });
      return;
    }
    if (bookingStatus === BOOKING_STATUS.DRIVER_ASSIGNED && bookingId) {
      navigate(`/user/book/assigned/${bookingId}`, { replace: true });
      return;
    }
    if (bookingStatus === BOOKING_STATUS.CANCELLED) {
      fetchWallet().catch(() => {});
      draftReset();
      clearActiveBooking();
      navigate('/user/home', { replace: true });
      return;
    }
    if (bookingStatus !== BOOKING_STATUS.NO_DRIVERS_FOUND) {
      // Unexpected status (e.g. deep-link after booking moved on) — leave.
      if (
        bookingStatus === BOOKING_STATUS.COMPLETED ||
        bookingStatus === BOOKING_STATUS.EN_ROUTE ||
        bookingStatus === BOOKING_STATUS.ARRIVED ||
        bookingStatus === BOOKING_STATUS.STARTED
      ) {
        navigate(bookingId ? `/user/book/assigned/${bookingId}` : '/user/home', {
          replace: true,
        });
      }
    }
  }, [
    bookingStatus,
    bookingId,
    navigate,
    draftReset,
    clearActiveBooking,
    fetchWallet,
  ]);

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    applyUpdate(payload);
  });

  const handleSearchAgain = async () => {
    if (searchingAgain || cancelling) return;
    setSearchingAgain(true);
    try {
      await searchAgain();
      navigate('/user/book/searching', { replace: true });
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not search again',
      );
    } finally {
      setSearchingAgain(false);
    }
  };

  const handleCancel = async () => {
    if (cancelling || searchingAgain) return;
    setCancelling(true);
    try {
      await cancelBooking('cancelled_by_user_after_no_drivers');
      fetchWallet().catch(() => {});
      setCancelConfirmOpen(false);
      toast.success('Booking cancelled — refund credited to your wallet.');
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

  if (!booking && !bookingStatus) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const paid = Number(booking?.payment?.amountPaidRupees) || 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <div className="flex flex-col items-center text-center max-w-sm w-full animate-fade-in-up">
        <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mb-6">
          <SearchX className="w-10 h-10 text-rose-500" />
        </div>

        <h2 className="text-xl font-bold text-text mb-2">No driver found</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          We couldn&apos;t find an available driver nearby right now. Your payment
          is still held
          {paid > 0 ? ` (\u20B9${paid.toFixed(0)})` : ''}. Search again, or cancel
          to get a full refund.
        </p>

        {booking?.bookingNumber && (
          <p className="mt-3 text-xs text-text-muted">{booking.bookingNumber}</p>
        )}

        <div className="mt-10 w-full space-y-3">
          <button
            type="button"
            disabled={searchingAgain || cancelling}
            onClick={handleSearchAgain}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white font-semibold py-3.5 text-sm disabled:opacity-60 hover:opacity-95 transition"
          >
            {searchingAgain ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            {searchingAgain ? 'Searching…' : 'Search again'}
          </button>

          <button
            type="button"
            disabled={searchingAgain || cancelling}
            onClick={() => setCancelConfirmOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-red-600 font-semibold py-3.5 text-sm disabled:opacity-60 hover:bg-red-100 transition"
          >
            <X className="w-4 h-4" />
            Cancel &amp; refund
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => !cancelling && setCancelConfirmOpen(false)}
        onConfirm={handleCancel}
        title="Cancel booking?"
        description={
          paid > 0
            ? `We'll refund \u20B9${paid.toFixed(0)} to your wallet. You can book again anytime.`
            : 'This booking will be closed. You can book again anytime.'
        }
        confirmLabel="Yes, cancel & refund"
        cancelLabel="Keep booking"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
};

export default NoDriversFoundPage;
