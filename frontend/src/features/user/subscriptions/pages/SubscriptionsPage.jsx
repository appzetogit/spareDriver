import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Star,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserSubscriptionPlansStore } from '../../../../store/user/useUserPricingStore';
import { SUBSCRIPTION_BANNER } from '../../home/constants/serviceCatalog';
import { calculateSubscriptionCheckout, formatCurrency } from '../../../../utils/fareCalculator';

const SubscriptionsPage = () => {
  const navigate = useNavigate();

  const { data, loading } = useCachedQuery(
    useUserSubscriptionPlansStore,
    buildCacheKey('user-subscriptions-active'),
  );

  const plans = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    return list
      .filter((p) => p?.isActive !== false)
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [data]);

  const handleSubscribeClick = (plan) => {
    navigate(`/user/subscriptions/checkout/${plan._id}`);
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">Subscriptions</h1>
            <p className="text-xs text-text-muted">A driver of your own, on your schedule.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <HeroCard />

        {loading && !plans.length ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plans.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {plans.map((plan, idx) => (
              <PlanCard
                key={plan._id}
                plan={plan}
                index={idx}
                onSubscribe={() => handleSubscribeClick(plan)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function HeroCard() {
  return (
    <div
      className="
        relative overflow-hidden rounded-3xl p-5
        bg-gradient-to-br from-[#1F1B2E] via-[#2D2640] to-[#4F3F89] shadow-lg
      "
    >
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-44 h-44 rounded-full bg-primary/15 blur-2xl pointer-events-none" />

      <div className="relative flex items-center gap-2 -mr-2 min-h-[180px]">
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="w-3 h-3" />
            Premium
          </span>
          <h2 className="text-white text-lg font-extrabold mt-3 leading-tight">
            {SUBSCRIPTION_BANNER.title}
          </h2>
          <p className="text-white/70 text-xs mt-1">{SUBSCRIPTION_BANNER.tagline}</p>
        </div>
        <div className="w-40 sm:w-44 shrink-0 self-stretch flex items-center justify-end">
          <img
            src={SUBSCRIPTION_BANNER.imageSrc}
            alt="Premium"
            className="w-full max-h-44 object-contain object-right drop-shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, index, onSubscribe }) {
  const isPercentage = plan.bookingDiscountType === 'percentage';
  const isFullTime = plan.includedHoursPerDay === 0;
  const checkout = calculateSubscriptionCheckout(plan);

  return (
    <Card
      className="animate-fade-in-up"
      style={{ animationDelay: `${0.1 + index * 0.06}s` }}
      padding="p-0"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-text">{plan.name}</h3>
            {plan.description && (
              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{plan.description}</p>
            )}
          </div>
          {index === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/15 text-[10px] font-bold text-primary-dark uppercase tracking-wide shrink-0">
              <Star className="w-3 h-3 fill-current" />
              Popular
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 mt-3">
          <span className="text-2xl font-extrabold text-text">{formatCurrency(checkout.totalPayable)}</span>
          <span className="text-xs text-text-muted">
            / {plan.durationMonths === 1 ? 'month' : `${plan.durationMonths} months`}
          </span>
        </div>
        {checkout.totalPayable !== checkout.basePrice && (
          <p className="text-[11px] text-text-muted mt-1">
            Base {formatCurrency(checkout.basePrice)} + fees & GST
          </p>
        )}

        <ul className="mt-4 space-y-2">
          <PerkRow
            label={
              isFullTime
                ? 'Full-time dedicated driver'
                : `${plan.includedHoursPerDay} hrs/day with your dedicated driver`
            }
          />
          {plan.bookingDiscountValue > 0 && (
            <PerkRow
              label={
                isPercentage
                  ? `${plan.bookingDiscountValue}% off extra bookings${plan.bookingDiscountMinAmount > 0 ? ` above ${formatCurrency(plan.bookingDiscountMinAmount)}` : ''}`
                  : `${formatCurrency(plan.bookingDiscountValue)} off extra bookings${plan.bookingDiscountMinAmount > 0 ? ` above ${formatCurrency(plan.bookingDiscountMinAmount)}` : ''}`
              }
            />
          )}
          {(plan.features || []).map((feature) => (
            <PerkRow key={feature} label={feature} />
          ))}
        </ul>

        <Button fullWidth className="mt-5" onClick={onSubscribe}>
          Subscribe now
        </Button>
      </div>
    </Card>
  );
}

function PerkRow({ label }) {
  return (
    <li className="flex items-start gap-2 text-sm text-text-secondary">
      <span className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center mt-0.5 shrink-0">
        <Check className="w-3 h-3 text-success" />
      </span>
      <span>{label}</span>
    </li>
  );
}

function EmptyState() {
  return (
    <Card className="text-center py-10">
      <p className="text-sm text-text-muted">
        We don&apos;t have any subscription plans listed yet. Check back soon!
      </p>
    </Card>
  );
}

export default SubscriptionsPage;
