import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Loader2,
  MapPin,
  Sparkles,
  UserCheck,
  IndianRupee,
  Percent,
  Clock,
  Car,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Badge from '../../../../components/Badge';
import { useUserSubscriptionStore } from '../../../../store/user/useUserPricingStore';
import { SUBSCRIPTION_ASSIGNMENT_STATUS } from '../../../../constants/serviceTypes';
import { formatCurrency } from '../../../../utils/fareCalculator';
import { formatCarLabel } from '../../../admin/components/DriverCarExperienceChips';

const MySubscriptionPage = () => {
  const navigate = useNavigate();
  const mySubscriptions = useUserSubscriptionStore((s) => s.mySubscriptions);
  const loading = useUserSubscriptionStore((s) => s.loading);
  const fetchMySubscription = useUserSubscriptionStore((s) => s.fetchMySubscription);

  useEffect(() => {
    fetchMySubscription().catch(() => {});
  }, [fetchMySubscription]);

  if (loading && !mySubscriptions?.length) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh bg-bg">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!mySubscriptions?.length) {
    return (
      <div className="flex-1 flex flex-col bg-bg min-h-dvh">
        <Header onBack={() => navigate(-1)} />
        <div className="flex-1 p-4">
          <Card className="text-center py-12">
            <Sparkles className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">You don&apos;t have any active subscriptions.</p>
            <Button className="mt-5" onClick={() => navigate('/user/subscriptions')}>
              Browse plans
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <Header onBack={() => navigate(-1)} count={mySubscriptions.length} />

      <div className="flex-1 p-4 space-y-4 pb-8">
        {mySubscriptions.map((sub) => (
          <SubscriptionDetailCard key={sub._id} sub={sub} />
        ))}

        <Button variant="outline" fullWidth onClick={() => navigate('/user/subscriptions')}>
          Add subscription for another car
        </Button>
      </div>
    </div>
  );
};

function SubscriptionDetailCard({ sub }) {
  const assigned = sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED;
  const isFullTime = sub.includedHoursPerDay === 0;
  const fmt = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 to-white space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="primary">Active</Badge>
          <h2 className="text-lg font-extrabold text-text mt-2">
            {sub.planNameSnapshot || sub.planId?.name || 'Subscription'}
          </h2>
          {sub.subscriptionNumber && (
            <p className="text-xs font-mono text-text-muted mt-0.5">{sub.subscriptionNumber}</p>
          )}
          <p className="text-sm text-text-muted mt-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {sub.zoneId?.name || 'Your zone'}
            {sub.zoneId?.city ? ` · ${sub.zoneId.city}` : ''}
          </p>
          <p className="text-sm text-text-muted mt-1 flex items-center gap-1">
            <Car className="w-3.5 h-3.5" />
            {formatCarLabel(sub.carId)}
          </p>
          {(sub.dailyPickup || sub.dailyDropoff) && (
            <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs text-text-secondary space-y-1">
              {sub.dailyPickup && (
                <p><span className="font-semibold text-text">Pickup:</span> {sub.dailyPickup.address}</p>
              )}
              {sub.dailyDropoff && (
                <p><span className="font-semibold text-text">Drop:</span> {sub.dailyDropoff.address}</p>
              )}
            </div>
          )}
        </div>
        <Sparkles className="w-7 h-7 text-primary shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoTile icon={Calendar} label="Started" value={fmt(sub.startDate)} />
        <InfoTile icon={Calendar} label="Valid till" value={fmt(sub.expiryDate)} />
        <InfoTile
          icon={Clock}
          label="Driver hours"
          value={isFullTime ? 'Full-time' : `${sub.includedHoursPerDay} hrs/day`}
        />
        <InfoTile icon={IndianRupee} label="Paid" value={formatCurrency(sub.amount)} />
      </div>

      {(sub.bookingDiscountValue > 0) && (
        <div className="rounded-xl bg-white/80 px-3 py-2.5 text-sm text-text-secondary">
          <p className="font-semibold text-text flex items-center gap-1.5 mb-1">
            <Percent className="w-3.5 h-3.5 text-primary" />
            Extra booking discount
          </p>
          {sub.bookingDiscountType === 'percentage'
            ? `${sub.bookingDiscountValue}% off`
            : `${formatCurrency(sub.bookingDiscountValue)} off`}
          {' '}on hourly & outstation bookings for this car
          {(sub.bookingDiscountMinAmount || 0) > 0 && (
            <> when fare is {formatCurrency(sub.bookingDiscountMinAmount)} or more</>
          )}
        </div>
      )}

      <div className="rounded-xl bg-white/80 px-3 py-2.5">
        <p className="text-sm font-bold text-text mb-2 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" />
          Dedicated driver
        </p>
        {assigned && sub.assignedDriver ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold">
              {(sub.assignedDriver.name || 'D').charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-text">{sub.assignedDriver.name}</p>
              <p className="text-xs text-text-muted">{sub.assignedDriver.phone || '—'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700">
            We will assign the best driver for this car soon.
          </p>
        )}
      </div>
    </Card>
  );
}

function Header({ onBack, count = 0 }) {
  return (
    <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-text">My Subscriptions</h1>
          <p className="text-xs text-text-muted">
            {count > 1 ? `${count} active plans` : 'Plan details & benefits'}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-white/80 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-text-muted font-semibold flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </p>
      <p className="text-sm font-bold text-text mt-1">{value}</p>
    </div>
  );
}

export default MySubscriptionPage;
