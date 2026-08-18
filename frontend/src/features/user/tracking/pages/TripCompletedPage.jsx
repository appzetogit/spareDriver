import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle, Download } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import StarRating from '../../../../components/StarRating';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

function driverPhoto(driver) {
  if (!driver || typeof driver !== 'object') return null;
  const selfie = driver.documents?.find((d) => d.type === 'selfie');
  return selfie?.fileUrl || driver.profilePicture || null;
}

function isDriverOnlySession() {
  return (
    useDriverAuthStore.getState().isAuthenticated
    && !useUserAuthStore.getState().isAuthenticated
  );
}

/**
 * Post-ride summary — duration/distance, inline driver rating, and
 * invoice download on one screen (no hop to a separate rate page).
 *
 * Used for instant, scheduled, and round-trip (outstation) bookings.
 * Deep links pass `?bookingId=` so the page still works after the
 * booking leaves `/active` (common for multi-day round trips).
 */
const TripCompletedPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingIdParam = searchParams.get('bookingId');

  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const fetchById = useUserActiveBookingStore((s) => s.fetchById);
  const downloadInvoicePdf = useUserActiveBookingStore((s) => s.downloadInvoicePdf);
  const rateDriver = useUserActiveBookingStore((s) => s.rateDriver);

  const [downloading, setDownloading] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isDriverOnlySession()) return undefined;
    navigate(
      bookingIdParam
        ? `/driver/trip/rate?bookingId=${bookingIdParam}`
        : '/driver/home',
      { replace: true },
    );
    return undefined;
  }, [bookingIdParam, navigate]);

  // Always refetch by id so admin-complete / socket patches still show
  // the populated driver (name, photo) instead of a bare ObjectId.
  useEffect(() => {
    if (isDriverOnlySession()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (bookingIdParam) {
          await fetchById(bookingIdParam);
          return;
        }
        if (!useUserActiveBookingStore.getState().booking) {
          await fetchActive();
        }
      } catch {
        if (!cancelled) {
          /* completed bookings leave /active — stay quiet */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingIdParam, fetchById, fetchActive]);

  const previousRating = booking?.rating?.customer;
  const alreadyRated = previousRating?.stars != null;
  useEffect(() => {
    if (alreadyRated) {
      setRating(Number(previousRating.stars) || 0);
      setReview(previousRating.review || '');
    }
  }, [alreadyRated, previousRating?.stars, previousRating?.review]);

  const driverObj = typeof booking?.driverId === 'object' ? booking?.driverId : null;
  const driverName = driverObj?.name || 'Your driver';
  const driverAvatar = driverPhoto(driverObj);

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

  const handleSubmitRating = async () => {
    if (!rating || submitting || alreadyRated) return;
    setSubmitting(true);
    try {
      await rateDriver({ stars: rating, review: review.trim() });
      toast.success('Thanks for your feedback');
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Could not submit rating';
      toast.error(message);
      if (err?.response?.status !== 409) {
        setSubmitting(false);
        return;
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh px-6 pt-14 pb-8">
      <div className="flex flex-col items-center mb-6">
        <div className="animate-bounce-in mb-4">
          <div className="w-16 h-16 bg-success-light rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-text mb-1 animate-fade-in-up">
          Trip Completed
        </h1>
        <p className="text-sm text-text-muted animate-fade-in-up">
          Thank you for riding with us!
        </p>
        {booking?.bookingNumber ? (
          <p className="text-[11px] text-text-muted mt-1 font-mono animate-fade-in-up">
            {booking.bookingNumber}
          </p>
        ) : null}
      </div>

      <div className="w-full flex-1 flex flex-col animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={driverName} size="lg" src={driverAvatar} />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Rate your driver</p>
            <p className="font-semibold text-text truncate">{driverName}</p>
          </div>
        </div>

        <div className="mb-4 flex justify-center">
          <StarRating
            value={rating}
            onChange={alreadyRated ? () => {} : setRating}
            size="lg"
            showLabel
          />
        </div>

        <Card className="w-full mb-3">
          <textarea
            placeholder="Write a review (optional)"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={alreadyRated || submitting}
            className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-70"
          />
        </Card>

        {alreadyRated ? (
          <p className="text-[11px] text-text-muted text-center mb-4">
            You already rated this trip. Thanks!
          </p>
        ) : (
          <Button
            fullWidth
            className="mb-3"
            loading={submitting}
            onClick={handleSubmitRating}
            disabled={!rating || submitting || !booking?._id}
          >
            Submit rating
          </Button>
        )}
      </div>

      <div className="w-full space-y-2 mt-auto pt-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
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
        <Button
          fullWidth
          variant="ghost"
          onClick={() => {
            navigate(isDriverOnlySession() ? '/driver/home' : '/user/home');
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
};

export default TripCompletedPage;
