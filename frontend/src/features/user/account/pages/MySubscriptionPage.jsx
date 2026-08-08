import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Calendar,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  UserCheck,
  IndianRupee,
  Percent,
  Clock,
  Car,
  XCircle,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Badge from '../../../../components/Badge';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { useUserSubscriptionStore } from '../../../../store/user/useUserPricingStore';
import {
  SUBSCRIPTION_ASSIGNMENT_STATUS,
  SUBSCRIPTION_CANCEL_REQUEST_STATUS,
} from '../../../../constants/serviceTypes';
import { formatCurrency } from '../../../../utils/fareCalculator';
import { formatCarLabel } from '../../../admin/components/DriverCarExperienceChips';
import RescheduleSubscriptionSheet from '../components/RescheduleSubscriptionSheet';
import api from '../../../../utils/api';

const MySubscriptionPage = () => {
  const navigate = useNavigate();
  const mySubscriptions = useUserSubscriptionStore((s) => s.mySubscriptions);
  const loading = useUserSubscriptionStore((s) => s.loading);
  const fetchMySubscription = useUserSubscriptionStore((s) => s.fetchMySubscription);
  const patchMySubscription = useUserSubscriptionStore((s) => s.patchMySubscription);

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
          <SubscriptionDetailCard
            key={sub._id}
            sub={sub}
            onUpdated={(next) => {
              if (next?._id) patchMySubscription(next);
              else fetchMySubscription({ force: true }).catch(() => {});
            }}
          />
        ))}

        <Button variant="outline" fullWidth onClick={() => navigate('/user/subscriptions')}>
          Add subscription for another car
        </Button>
      </div>
    </div>
  );
};

function SubscriptionDetailCard({ sub, onUpdated }) {
  const assigned = sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.ASSIGNED;
  const cancelPending =
    sub.cancellationRequest?.status === SUBSCRIPTION_CANCEL_REQUEST_STATUS.PENDING;
  const canReschedule =
    sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING && !cancelPending;
  const canCancel =
    sub.assignmentStatus === SUBSCRIPTION_ASSIGNMENT_STATUS.PENDING && !cancelPending;
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const isFullTime = sub.includedHoursPerDay === 0;
  const fmt = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

  const handleCancelRequest = async () => {
    setCancelling(true);
    try {
      const res = await api.post(`/auth/subscriptions/${sub._id}/cancel-request`, {
        reason: cancelReason.trim() || undefined,
      });
      const updated = res?.data?.data;
      toast.success('Cancellation request sent. We will review and process your refund.');
      setCancelOpen(false);
      setCancelReason('');
      onUpdated?.(updated || { ...sub, cancellationRequest: { status: 'pending' } });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not submit cancellation request');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 to-white space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Active</Badge>
            {cancelPending && <Badge variant="warning">Cancel requested</Badge>}
          </div>
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

      {cancelPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          Your cancellation request is under review. Refund will be processed after admin approval.
          {sub.cancellationRequest?.reason ? (
            <p className="text-xs text-amber-800 mt-1">Reason: {sub.cancellationRequest.reason}</p>
          ) : null}
        </div>
      )}

      {canReschedule && (
        <button
          type="button"
          onClick={() => setRescheduleOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 text-primary font-semibold text-sm py-2.5 hover:bg-primary/10 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
          Change start date
        </button>
      )}

      {canCancel && (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-sm py-2.5 hover:bg-rose-100 transition"
        >
          <XCircle className="w-3.5 h-3.5" />
          Request cancellation
        </button>
      )}

      {assigned && (
        <p className="text-xs text-text-muted text-center">
          After a driver is assigned, only support can cancel this subscription.
        </p>
      )}

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

      <RescheduleSubscriptionSheet
        open={rescheduleOpen}
        subscription={sub}
        onClose={() => setRescheduleOpen(false)}
        onSaved={(next) => onUpdated?.(next)}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => !cancelling && setCancelOpen(false)}
        onConfirm={handleCancelRequest}
        title="Request cancellation?"
        description="Your request will be reviewed by our team. Refund is issued after approval."
        confirmLabel="Submit request"
        variant="danger"
        loading={cancelling}
      >
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={3}
          placeholder="Reason (optional)"
          className="w-full rounded-xl border border-border-light px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </ConfirmDialog>
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
