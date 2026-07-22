import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import StarRating from '../../../../components/StarRating';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';

/**
 * Post-ride rating screen — the driver header is now backed by the real
 * driver object the booking ended on, so the user is rating the actual
 * person who drove them rather than a hardcoded mock.
 *
 * Submitting POSTs `{ stars, review }` to
 * `/auth/bookings/:id/rate-driver`. The backend stamps the rating on
 * the booking and rolls it into the driver's running average; we then
 * route the customer to the invoice screen.
 *
 * If the rating was already submitted on a prior visit (e.g. the user
 * came back via deep-link), we surface the previously captured value
 * and disable the form so they can't double-rate.
 */
const RatePayPage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const rateDriver = useUserActiveBookingStore((s) => s.rateDriver);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const previousRating = booking?.rating?.customer;
  const alreadyRated = previousRating?.stars != null;
  // Hydrate the form with the previously captured rating so the user
  // can see what they submitted without making it look like a fresh
  // form they have to fill out again.
  useEffect(() => {
    if (alreadyRated) {
      setRating(Number(previousRating.stars) || 0);
      setReview(previousRating.review || '');
    }
  }, [alreadyRated, previousRating?.stars, previousRating?.review]);

  const driverObj = typeof booking?.driverId === 'object' ? booking?.driverId : null;
  const driverName = driverObj?.name || 'Your driver';
  const totalFare = useMemo(() => {
    const base = Number(booking?.fareSnapshot?.total) || 0;
    const waiting = Number(booking?.waiting?.chargeRupees) || 0;
    const extensions = (booking?.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
      0,
    );
    return base + waiting + extensions || null;
  }, [booking]);

  const handleSubmit = async () => {
    if (!rating || submitting) return;
    if (alreadyRated) {
      navigate('/user/tracking/invoice');
      return;
    }
    setSubmitting(true);
    try {
      await rateDriver({ stars: rating, review: review.trim() });
      toast.success('Thanks for your feedback');
      navigate('/user/tracking/invoice');
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Could not submit rating';
      toast.error(message);
      // A 409 means another submit already landed — treat as success
      // for the user's purposes and let them through.
      if (err?.response?.status === 409) {
        navigate('/user/tracking/invoice');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-dvh px-6 pt-16 pb-8">
      <div className="flex-1 flex flex-col items-center">
        <h1 className="text-xl font-bold text-text mb-2 animate-fade-in-up">
          How was your experience?
        </h1>
        <p className="text-sm text-text-muted mb-6 animate-fade-in-up">
          Rate {driverName}
        </p>

        <div className="animate-fade-in-up mb-6 flex items-center gap-3">
          <Avatar name={driverName} size="xl" />
          <div className="text-left">
            <p className="font-semibold text-text">{driverName}</p>
            {totalFare != null ? (
              <p className="text-xs text-text-muted">Trip total · ₹{totalFare}</p>
            ) : null}
          </div>
        </div>

        <div className="animate-bounce-in mb-8">
          <StarRating
            value={rating}
            onChange={alreadyRated ? () => {} : setRating}
            size="lg"
            showLabel
          />
        </div>

        <Card className="w-full animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
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
          <p className="mt-3 text-[11px] text-text-muted">
            You already rated this trip. Thanks!
          </p>
        ) : null}
      </div>

      <Button
        fullWidth
        loading={submitting}
        onClick={handleSubmit}
        disabled={!rating || submitting}
      >
        {alreadyRated ? 'Continue' : 'Submit'}
      </Button>
    </div>
  );
};

export default RatePayPage;
