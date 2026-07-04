import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle, Clock, Download, MapPin } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { formatDistance } from '../../../../utils/geo';

/**
 * Post-ride summary screen — pulls the real fare, distance, and duration
 * out of `useUserActiveBookingStore` so the figures match exactly what the
 * backend computed (including any accepted extensions). Falls back to a
 * "—" placeholder for any value we can't derive yet.
 */
const TripCompletedPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const downloadInvoicePdf = useUserActiveBookingStore((s) => s.downloadInvoicePdf);
  const [downloading, setDownloading] = useState(false);

  // We may have lost the booking from the store on a hard refresh — try to
  // re-hydrate once, but don't block if it 404s (server clears completed
  // bookings off the "active" endpoint).
  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const totalFare = useMemo(() => {
    if (!booking) return null;
    const base = booking.fareSnapshot?.total || 0;
    // Only paid extensions belong in the trip total.
    const extensions = (booking.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
      0,
    );
    return base + extensions || null;
  }, [booking]);

  const durationMinutes = useMemo(() => {
    const started = booking?.timeline?.startedAt;
    const completed = booking?.timeline?.completedAt;
    if (!started || !completed) return null;
    const diffMs = new Date(completed).getTime() - new Date(started).getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
    return Math.max(1, Math.round(diffMs / 60_000));
  }, [booking]);

  const distanceMeters =
    booking?.distanceMeters ??
    booking?.fareSnapshot?.distanceMeters ??
    booking?.tripSummary?.distanceMeters ??
    null;

  const handleDownloadInvoice = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf();
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not download invoice');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <div className="animate-bounce-in mb-6">
        <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-success" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-text mb-1 animate-fade-in-up">Trip Completed</h1>
      <p className="text-sm text-text-muted mb-6 animate-fade-in-up">
        Thank you for riding with us!
      </p>

      <Card className="w-full animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="text-center mb-4">
          <p className="text-sm text-text-muted">Total Fare</p>
          <p className="text-3xl font-bold text-text">
            {totalFare != null ? `₹${totalFare}` : '—'}
          </p>
          {booking?.bookingNumber ? (
            <p className="text-[11px] text-text-muted mt-1 font-mono">
              {booking.bookingNumber}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-bg rounded-xl">
            <Clock className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-sm font-bold">
              {durationMinutes != null ? `${durationMinutes} min` : '—'}
            </p>
            <p className="text-[10px] text-text-muted">Duration</p>
          </div>
          <div className="text-center p-3 bg-bg rounded-xl">
            <MapPin className="w-5 h-5 text-text-muted mx-auto mb-1" />
            <p className="text-sm font-bold">
              {distanceMeters != null ? formatDistance(distanceMeters) : '—'}
            </p>
            <p className="text-[10px] text-text-muted">Distance</p>
          </div>
        </div>
      </Card>

      <div className="w-full mt-6 animate-fade-in-up space-y-2" style={{ animationDelay: '0.3s' }}>
        <Button fullWidth onClick={() => navigate('/user/tracking/rate')}>Rate</Button>
        <Button
          fullWidth
          variant="secondary"
          icon={Download}
          loading={downloading}
          disabled={downloading || !booking?._id}
          onClick={handleDownloadInvoice}
        >
          Download Invoice
        </Button>
      </div>
    </div>
  );
};

export default TripCompletedPage;
