import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import StarRating from '../../../../components/StarRating';
import useDriverActiveTripStore from '../../../../store/driver/useDriverActiveTripStore';

function goHome(navigate, clear) {
  clear();
  navigate('/driver/home', { replace: true });
}

/**
 * Driver-side rating screen after a completed trip.
 *
 * Submitting POSTs `{ stars, review }` to
 * `/driver/bookings/:id/rate-customer`. After a successful submit (or
 * skip), we clear the active trip and route the driver back to home —
 * never to the login screen.
 */
const RateCustomerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingIdParam = searchParams.get('bookingId');

  const booking = useDriverActiveTripStore((s) => s.booking);
  const clear = useDriverActiveTripStore((s) => s.clear);
  const fetchById = useDriverActiveTripStore((s) => s.fetchById);
  const rateCustomer = useDriverActiveTripStore((s) => s.rateCustomer);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = bookingIdParam || booking?._id;
    if (!id) {
      goHome(navigate, clear);
      return undefined;
    }
    if (booking && String(booking._id) === String(id)) return undefined;
    let cancelled = false;
    fetchById(id).catch(() => {
      if (!cancelled) goHome(navigate, clear);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingIdParam, booking, fetchById, navigate, clear]);

  const customer = booking?.userId;
  const customerName =
    typeof customer === 'object' && customer?.name ? customer.name : 'Customer';

  const previousRating = booking?.rating?.driver;
  const alreadyRated = previousRating?.stars != null;
  useEffect(() => {
    if (alreadyRated) {
      setRating(Number(previousRating.stars) || 0);
      setReview(previousRating.review || '');
    }
  }, [alreadyRated, previousRating?.stars, previousRating?.review]);

  const handleSubmit = async () => {
    if (!rating || submitting) return;
    if (alreadyRated) {
      goHome(navigate, clear);
      return;
    }
    setSubmitting(true);
    try {
      await rateCustomer({ stars: rating, review: review.trim() });
      toast.success('Thanks for your feedback');
      goHome(navigate, clear);
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Could not submit rating';
      toast.error(message);
      if (err?.response?.status === 409) {
        goHome(navigate, clear);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    goHome(navigate, clear);
  };

  if (!booking) return null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh px-6">
      <h1 className="text-xl font-bold text-text mb-2 animate-fade-in-up">
        Rate Customer
      </h1>
      <p className="text-sm text-text-muted mb-6 animate-fade-in-up">
        How was your experience with the customer?
      </p>

      <Card className="w-full animate-fade-in-up mb-6">
        <div className="flex items-center gap-3">
          <Avatar name={customerName} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text truncate">{customerName}</p>
            <p className="text-xs text-text-muted truncate">
              {booking?.bookingNumber || 'Recent trip'}
            </p>
          </div>
        </div>
      </Card>

      <div className="animate-bounce-in mb-6">
        <StarRating
          value={rating}
          onChange={alreadyRated ? () => {} : setRating}
          size="lg"
          showLabel
        />
      </div>

      <Card className="w-full animate-fade-in-up mb-6" style={{ animationDelay: '0.2s' }}>
        <textarea
          placeholder="Add a note (optional)"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={2}
          maxLength={500}
          disabled={alreadyRated || submitting}
          className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-70"
        />
      </Card>

      <div className="w-full animate-fade-in-up space-y-2" style={{ animationDelay: '0.2s' }}>
        <Button
          fullWidth
          loading={submitting}
          disabled={!rating || submitting}
          onClick={handleSubmit}
        >
          {alreadyRated ? 'CONTINUE' : 'SUBMIT RATING'}
        </Button>
        {!alreadyRated && (
          <Button
            fullWidth
            variant="ghost"
            disabled={submitting}
            onClick={handleSkip}
          >
            Skip
          </Button>
        )}
      </div>
    </div>
  );
};

export default RateCustomerPage;
