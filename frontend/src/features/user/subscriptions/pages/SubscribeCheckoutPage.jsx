import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Modal from '../../../../components/Modal';
import OutOfServiceDialog from '../../../../components/dialogs/OutOfServiceDialog';
import CarPickerSheet from '../../booking/components/CarPickerSheet';
import LocationPickerSheet from '../../booking/components/LocationPickerSheet';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { useZoneCheck } from '../../../../hooks/useZoneCheck';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import {
  useUserSubscriptionPlansStore,
  useUserSubscriptionStore,
} from '../../../../store/user/useUserPricingStore';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { useRazorpayCheckout } from '../../../../hooks/useRazorpayCheckout';
import { calculateSubscriptionCheckout, formatCurrency } from '../../../../utils/fareCalculator';
import CouponCodeInput from '../../booking/components/CouponCodeInput';
import api from '../../../../utils/api';
import { COUPON_APPLICABLE_SERVICES } from '../../../../constants/couponTypes';

const SubscribeCheckoutPage = () => {
  const navigate = useNavigate();
  const { planId } = useParams();
  const user = useUserAuthStore((s) => s.user);

  const { data, loading: plansLoading } = useCachedQuery(
    useUserSubscriptionPlansStore,
    buildCacheKey('user-subscriptions-active'),
  );

  const mySubscriptions = useUserSubscriptionStore((s) => s.mySubscriptions);
  const fetchMySubscription = useUserSubscriptionStore((s) => s.fetchMySubscription);
  const fetchSubscriptionTerms = useUserSubscriptionStore((s) => s.fetchSubscriptionTerms);
  const subscriptionTerms = useUserSubscriptionStore((s) => s.subscriptionTerms);
  const termsLoading = useUserSubscriptionStore((s) => s.termsLoading);
  const createPurchaseOrder = useUserSubscriptionStore((s) => s.createPurchaseOrder);
  const verifyPurchase = useUserSubscriptionStore((s) => s.verifyPurchase);
  const purchaseLoading = useUserSubscriptionStore((s) => s.purchaseLoading);

  const { openCheckout, loading: checkoutLoading } = useRazorpayCheckout();

  const [selectedCarId, setSelectedCarId] = useState('');
  const [selectedCar, setSelectedCar] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [dailyPickup, setDailyPickup] = useState(null);
  const [dailyDropoff, setDailyDropoff] = useState(null);
  const [pickupPickerOpen, setPickupPickerOpen] = useState(false);
  const [dropPickerOpen, setDropPickerOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [outOfServiceOpen, setOutOfServiceOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => {
    fetchMySubscription().catch(() => {});
  }, [fetchMySubscription]);

  const plan = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    return list.find((p) => String(p._id) === String(planId)) || null;
  }, [data, planId]);

  const subscribedCarIds = useMemo(
    () => new Set((mySubscriptions || []).map((s) => String(s.carId?._id || s.carId || ''))),
    [mySubscriptions],
  );

  const zoneCheck = useZoneCheck(dailyPickup, {
    enabled: Boolean(dailyPickup?.lat && dailyPickup?.lng),
  });
  const isOutOfService = zoneCheck.status === 'uncovered';

  const checkout = useMemo(
    () => (plan ? calculateSubscriptionCheckout(plan, appliedCoupon) : null),
    [plan, appliedCoupon],
  );

  const handleApplyCoupon = useCallback(async (code) => {
    if (!plan) return;
    setValidatingCoupon(true);
    setCouponError(null);
    try {
      const res = await api.post('/auth/coupons/validate', {
        code,
        serviceType: COUPON_APPLICABLE_SERVICES.SUBSCRIPTION,
        subtotal: plan.price,
      });
      setAppliedCoupon(res?.data?.data?.coupon || null);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err?.response?.data?.message || 'Invalid coupon code');
    } finally {
      setValidatingCoupon(false);
    }
  }, [plan]);

  const handleRemoveCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponError(null);
  }, []);

  const handleOpenTerms = useCallback(async () => {
    setTermsModalOpen(true);
    if (!subscriptionTerms?.content && !termsLoading) {
      try {
        await fetchSubscriptionTerms();
      } catch {
        toast.error('Could not load terms. Please try again.');
      }
    }
  }, [subscriptionTerms, termsLoading, fetchSubscriptionTerms]);

  const handleConfirmPurchase = useCallback(async () => {
    if (
      !plan
      || !selectedCarId
      || !dailyPickup
      || !dailyDropoff
      || !termsAccepted
      || subscribing
      || purchaseLoading
      || checkoutLoading
    ) {
      return;
    }
    if (subscribedCarIds.has(String(selectedCarId))) {
      toast.error('This car already has an active subscription');
      return;
    }
    if (isOutOfService || zoneCheck.status === 'checking' || !zoneCheck.zone?._id) {
      setOutOfServiceOpen(true);
      return;
    }

    setSubscribing(true);
    try {
      const order = await createPurchaseOrder(
        plan._id,
        zoneCheck.zone._id,
        selectedCarId,
        {
          termsAccepted: true,
          dailyPickup,
          dailyDropoff,
          couponCode: appliedCoupon?.code,
        },
      );
      if (!order?.orderId) {
        toast.error('Payments are not configured. Please try again later.');
        return;
      }

      await openCheckout({
        razorpay: {
          keyId: order.keyId,
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: order.name,
          description: order.description,
        },
        driver: {
          name: order.prefill?.name || user?.name,
          email: order.prefill?.email || user?.email,
          phone: order.prefill?.contact || user?.phone_no,
        },
        onSuccess: async (response) => {
          await verifyPurchase({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        },
      });

      toast.success('Subscription activated! We will assign your dedicated driver soon.');
      navigate('/user/account/subscription', { replace: true });
    } catch (err) {
      if (err?.message !== 'Payment cancelled') {
        toast.error(err?.response?.data?.message || err?.message || 'Could not complete subscription');
      }
    } finally {
      setSubscribing(false);
    }
  }, [
    plan,
    selectedCarId,
    dailyPickup,
    dailyDropoff,
    termsAccepted,
    subscribing,
    purchaseLoading,
    checkoutLoading,
    subscribedCarIds,
    isOutOfService,
    zoneCheck,
    createPurchaseOrder,
    openCheckout,
    verifyPurchase,
    user,
    navigate,
    appliedCoupon,
  ]);

  if (plansLoading && !plan) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh bg-bg">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 flex flex-col bg-bg min-h-dvh">
        <Header onBack={() => navigate('/user/subscriptions')} title="Subscribe" />
        <div className="flex-1 p-4">
          <Card className="text-center py-12">
            <p className="text-sm text-text-muted">This plan is no longer available.</p>
            <Button className="mt-5" onClick={() => navigate('/user/subscriptions')}>
              Browse plans
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const isPercentage = plan.bookingDiscountType === 'percentage';
  const isFullTime = plan.includedHoursPerDay === 0;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <Header onBack={() => navigate(-1)} title="Complete subscription" />

      <div className="flex-1 p-4 space-y-4 pb-28">
        <Card className="space-y-3">
          <div>
            <h2 className="text-lg font-extrabold text-text">{plan.name}</h2>
            {plan.description && (
              <p className="text-xs text-text-muted mt-1">{plan.description}</p>
            )}
          </div>

          {checkout && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-text">
                {formatCurrency(checkout.totalPayable)}
              </span>
              <span className="text-xs text-text-muted">
                / {plan.durationMonths === 1 ? 'month' : `${plan.durationMonths} months`}
              </span>
            </div>
          )}

          <ul className="space-y-2 pt-1">
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

          {checkout && <CheckoutLines checkout={checkout} />}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text mb-3">Have a coupon?</h3>
          <CouponCodeInput
            appliedCode={appliedCoupon?.code || null}
            onApply={handleApplyCoupon}
            onRemove={handleRemoveCoupon}
            applying={validatingCoupon}
            error={couponError}
          />
        </Card>

        <Card>
          <h3 className="text-sm font-bold text-text mb-3">Daily routes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PlacePickButton
              label="Daily pickup"
              place={dailyPickup}
              onClick={() => setPickupPickerOpen(true)}
            />
            <PlacePickButton
              label="Daily drop-off"
              place={dailyDropoff}
              onClick={() => setDropPickerOpen(true)}
            />
          </div>
        </Card>

        <Card>
          <p className="text-sm font-bold text-text mb-3">Your car</p>
          <CarPickerSheet
            selectedId={selectedCarId}
            onSelect={(id, car) => {
              setSelectedCarId(id);
              setSelectedCar(car || null);
            }}
            autoSelectFirst={!selectedCarId}
          />
          {selectedCar && subscribedCarIds.has(String(selectedCarId)) && (
            <p className="text-[11px] text-amber-600 mt-2">
              This car already has an active subscription. Pick another car.
            </p>
          )}
        </Card>

        <label className="flex items-start gap-2 text-sm text-text cursor-pointer px-1">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span>
            I agree to the{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleOpenTerms();
              }}
              className="text-primary font-semibold underline underline-offset-2"
            >
              terms and conditions
            </button>
          </span>
        </label>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-border-light safe-area-pb">
        <Button
          fullWidth
          disabled={
            !selectedCarId
            || !dailyPickup
            || !dailyDropoff
            || !termsAccepted
            || subscribedCarIds.has(String(selectedCarId))
            || subscribing
            || purchaseLoading
            || checkoutLoading
            || zoneCheck.status === 'checking'
          }
          onClick={handleConfirmPurchase}
        >
          {subscribing || purchaseLoading || checkoutLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing…
            </span>
          ) : (
            `Pay ${formatCurrency(checkout?.totalPayable || 0)} & subscribe`
          )}
        </Button>
      </div>

      <LocationPickerSheet
        open={pickupPickerOpen}
        onClose={() => setPickupPickerOpen(false)}
        title="Daily pickup location"
        hideCurrentLocation
        onSelect={(place) => {
          setDailyPickup(place);
          setPickupPickerOpen(false);
        }}
      />
      <LocationPickerSheet
        open={dropPickerOpen}
        onClose={() => setDropPickerOpen(false)}
        title="Daily drop-off location"
        hideCurrentLocation
        onSelect={(place) => {
          setDailyDropoff(place);
          setDropPickerOpen(false);
        }}
      />

      <Modal
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        title={subscriptionTerms?.title || 'Terms & conditions'}
        size="lg"
      >
        <div className="p-5">
          {termsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </div>
          ) : subscriptionTerms?.content ? (
            <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
              {subscriptionTerms.content}
            </div>
          ) : (
            <p className="text-sm text-amber-600">
              Subscription terms are not configured yet. Please contact support.
            </p>
          )}
        </div>
      </Modal>

      <OutOfServiceDialog
        open={outOfServiceOpen}
        onClose={() => setOutOfServiceOpen(false)}
        onChangeLocation={() => {
          setOutOfServiceOpen(false);
          setPickupPickerOpen(true);
        }}
        locationLabel={dailyPickup?.address}
        cityHint={zoneCheck.zone?.city}
      />
    </div>
  );
};

function Header({ onBack, title }) {
  return (
    <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-text">{title}</h1>
          <p className="text-xs text-text-muted">Pick your car and daily routes.</p>
        </div>
      </div>
    </div>
  );
}

function PerkRow({ label }) {
  return (
    <li className="flex items-start gap-2 text-sm text-text-secondary list-none">
      <span className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center mt-0.5 shrink-0">
        <Check className="w-3 h-3 text-success" />
      </span>
      <span>{label}</span>
    </li>
  );
}

function CheckoutLines({ checkout }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 text-sm space-y-1.5 mt-2">
      <div className="flex justify-between text-text-secondary">
        <span>Base</span>
        <span>{formatCurrency(checkout.basePrice)}</span>
      </div>
      {checkout.couponDiscount > 0 && (
        <div className="flex justify-between text-success">
          <span>Coupon discount</span>
          <span>-{formatCurrency(checkout.couponDiscount)}</span>
        </div>
      )}
      {checkout.couponDiscount > 0 && (
        <div className="flex justify-between text-text-secondary">
          <span>Net subtotal</span>
          <span>{formatCurrency(checkout.netBasePrice)}</span>
        </div>
      )}
      {checkout.serviceCharge > 0 && (
        <div className="flex justify-between text-text-secondary">
          <span>Service charge ({checkout.serviceChargePercent}%)</span>
          <span>{formatCurrency(checkout.serviceCharge)}</span>
        </div>
      )}
      {checkout.gstAmount > 0 && (
        <div className="flex justify-between text-text-secondary">
          <span>GST ({checkout.gstPercent}%)</span>
          <span>{formatCurrency(checkout.gstAmount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-text pt-1 border-t border-border-light">
        <span>Total</span>
        <span>{formatCurrency(checkout.totalPayable)}</span>
      </div>
    </div>
  );
}

function PlacePickButton({ label, place, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-3 rounded-xl border border-border-light bg-white hover:border-primary/30 transition"
    >
      <p className="text-[10px] font-bold uppercase text-text-muted">{label}</p>
      <p className="text-xs text-text mt-1 line-clamp-2">
        {place?.address || 'Tap to select on map'}
      </p>
    </button>
  );
}

export default SubscribeCheckoutPage;
