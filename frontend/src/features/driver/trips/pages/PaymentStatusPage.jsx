import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Badge from '../../../../components/Badge';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';
import { BOOKING_PAYMENT_STATUS } from '../../../../constants/bookingStatus';

/**
 * Driver-side post-payment summary. Reads the real payment status, mode
 * and amount off the booking the driver just finished so the badge and
 * total match exactly what the customer paid.
 */
const PaymentStatusPage = () => {
  const navigate = useNavigate();
  const booking = useDriverActiveTripStore((s) => s.booking);

  // If the store was cleared (e.g. user opened this URL directly after a
  // refresh) drop the driver back on the home dashboard rather than
  // pretending the trip is here.
  useEffect(() => {
    if (!booking) navigate('/driver/home', { replace: true });
  }, [booking, navigate]);

  const { totalPaid, modeLabel, statusVariant, statusLabel } = useMemo(() => {
    if (!booking) {
      return {
        totalPaid: null,
        modeLabel: '—',
        statusVariant: 'muted',
        statusLabel: 'Pending',
      };
    }
    // Drivers only ever see their own earning. `payment` and the
    // customer-facing `fareSnapshot.total` are stripped on the
    // backend for driver bookings, so we read the driver payout first
    // and fall back to `fareSnapshot.driverEarning` which the backend
    // always exposes.
    const total =
      booking.driverPayout?.totalRupees ??
      booking.fareSnapshot?.driverEarning ??
      null;

    const paymentMode = booking.paymentMode || 'online';
    const mode = paymentMode === 'cash' ? 'Cash collected' : 'Paid Online';

    const variant =
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID ? 'success' : 'warning';
    const label =
      booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID
        ? mode
        : 'Awaiting payment';
    return { totalPaid: total, modeLabel: mode, statusVariant: variant, statusLabel: label };
  }, [booking]);

  const isPaid = statusVariant === 'success';

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <Card className="w-full text-center animate-bounce-in">
        <div className="mb-4">
          <Badge variant={statusVariant} className="text-sm !px-4 !py-1.5">
            {statusLabel}
          </Badge>
        </div>
        <p className="text-4xl font-bold text-text mb-2">
          {totalPaid != null ? `₹${totalPaid}` : '—'}
        </p>
        <div className={`flex items-center justify-center gap-2 ${isPaid ? 'text-success' : 'text-warning'}`}>
          {isPaid ? <CheckCircle className="w-5 h-5" /> : null}
          <p className="text-sm font-medium">
            {isPaid ? 'Payment received successfully' : 'Awaiting customer payment'}
          </p>
        </div>
        <p className="mt-4 text-[11px] text-text-muted">{modeLabel}</p>
      </Card>
      <div className="w-full mt-6">
        <Button
          fullWidth
          onClick={() => {
            const id = booking?._id;
            navigate(
              id ? `/driver/trip/rate?bookingId=${id}` : '/driver/home',
              { replace: true },
            );
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

export default PaymentStatusPage;
