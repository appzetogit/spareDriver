import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, ArrowLeft, Package, AlertCircle, CreditCard } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import toast from 'react-hot-toast';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useDriverKitsListStore, useDriverKitActiveStore } from '../../../../store/driver/useDriverKitStore';
import { useKitOrderPayment } from '../../../../hooks/useKitOrderPayment';
import KitCatalogCard from './KitCatalogCard';
import KitItemSelector, { buildItemSelectionsPayload, validateSelections } from './KitItemSelector';
import KitOrderItemsList from './KitOrderItemsList';
import PayNowButton from './PayNowButton';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

/**
 * Full kit purchase flow for driver home: browse kits → select → sizes → address → pay.
 */
const DriverKitPurchaseSection = ({ onPurchaseComplete, compact = false }) => {
  const navigate = useNavigate();
  const { createAndPay, paying } = useKitOrderPayment();

  const kitsKey = buildCacheKey('driver-kits-list', {});
  const activeKey = buildCacheKey('driver-kit-active', {});

  const { data: kitsData, loading: kitsLoading } = useCachedQuery(
    useDriverKitsListStore,
    kitsKey,
    {},
  );
  const kits = Array.isArray(kitsData) ? kitsData : [];
  const { data: activeData, loading: activeLoading, refetch: refetchActive } = useCachedQuery(
    useDriverKitActiveStore,
    activeKey,
    {},
  );

  const eligibility = activeData?.eligibility;
  const orders = Array.isArray(activeData?.orders) ? activeData.orders : [];
  const latestOrder = orders[0];
  const pendingOrder = orders.find((o) => o.paymentStatus === 'pending');

  const isKitApproved = eligibility?.allowed && latestOrder?.adminStatus === 'approved';
  const awaitingApproval =
    latestOrder?.paymentStatus === 'paid' && latestOrder?.adminStatus === 'pending';

  const [step, setStep] = useState('browse');
  const [selectedKitId, setSelectedKitId] = useState(null);
  const [selections, setSelections] = useState({});
  const [lastPaymentIssue, setLastPaymentIssue] = useState(null);
  const driver = useDriverAuthStore((s) => s.driver);
  const [address, setAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
  });

  useEffect(() => {
    if (driver?.phone && !address.phone) {
      setAddress((a) => ({ ...a, phone: driver.phone }));
    }
  }, [driver?.phone, address.phone]);

  const selectedKit = useMemo(
    () => kits.find((k) => k._id === selectedKitId) || null,
    [kits, selectedKitId],
  );
  const kitItems = selectedKit?.items || [];

  useEffect(() => {
    if (awaitingApproval && latestOrder?.kitId) {
      setSelectedKitId(latestOrder.kitId);
      setStep('status');
      setLastPaymentIssue(null);
    } else if (pendingOrder && !awaitingApproval) {
      setStep('pending_payment');
    }
  }, [awaitingApproval, latestOrder?.kitId, pendingOrder]);

  const handleSelectKit = (kit) => {
    if (pendingOrder) {
      setStep('pending_payment');
      toast('Complete payment on your saved order first.', { icon: 'ℹ️' });
      return;
    }
    setSelectedKitId(kit._id);
    setSelections({});
    setLastPaymentIssue(null);
    setStep('checkout');
  };

  const handleBackToBrowse = () => {
    if (awaitingApproval || pendingOrder) return;
    setStep('browse');
    setSelectedKitId(null);
    setSelections({});
  };

  const handlePurchase = async () => {
    if (!selectedKit) return;
    if (!address.line1?.trim() || !address.city?.trim() || !address.pincode?.trim()) {
      toast.error('Please fill delivery address');
      return;
    }
    if (!/^[0-9]{6}$/.test(address.pincode)) {
      toast.error('PIN code must be exactly 6 digits');
      return;
    }
    const selectionError = validateSelections(kitItems, selections);
    if (selectionError) {
      toast.error(selectionError);
      return;
    }

    const result = await createAndPay({
      kitId: selectedKit._id,
      shippingAddress: address,
      itemSelections: buildItemSelectionsPayload(kitItems, selections),
    });

    await refetchActive();

    if (result?.success) {
      setLastPaymentIssue(null);
      setStep('status');
      onPurchaseComplete?.();
    } else if (result?.cancelled || result?.failed) {
      setLastPaymentIssue(result.failed ? 'failed' : 'cancelled');
      setStep('pending_payment');
      onPurchaseComplete?.();
    }
  };

  const handlePaymentComplete = async () => {
    setLastPaymentIssue(null);
    await refetchActive();
    setStep('status');
    onPurchaseComplete?.();
  };

  if (kitsLoading || activeLoading) {
    return (
      <Card className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-700 animate-spin" />
      </Card>
    );
  }

  if (isKitApproved) {
    return (
      <Card className="border-l-4 border-l-emerald-500">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-text">Driver kit active</p>
            <p className="text-xs text-text-muted mt-0.5">
              {latestOrder?.kitSnapshot?.name || 'Your kit'} is approved. You can go online.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!kits.length) {
    return (
      <Card>
        <p className="text-sm text-text-secondary text-center py-4">
          No driver kits available. Contact support.
        </p>
      </Card>
    );
  }

  const pendingDisplay = pendingOrder || (lastPaymentIssue && latestOrder?.paymentStatus === 'pending' ? latestOrder : null);

  return (
    <div id="driver-kit-section" className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Driver kit</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose a kit, confirm sizes, then pay to unlock going online
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/driver/payments')}
            className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
          >
            History
          </button>
        </div>
      )}

      {step === 'status' && awaitingApproval && (
        <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/30">
          <p className="text-sm font-semibold text-slate-900">Payment received</p>
          <p className="text-xs text-slate-600 mt-1">
            {latestOrder?.kitSnapshot?.name} — waiting for admin approval before you can go online.
          </p>
          {latestOrder?.itemSelections?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-emerald-100">
              <KitOrderItemsList selections={latestOrder.itemSelections} title="Your order" />
            </div>
          )}
        </Card>
      )}

      {(step === 'pending_payment' || pendingDisplay) && pendingDisplay && !awaitingApproval && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center shrink-0">
              {lastPaymentIssue === 'failed' ? (
                <AlertCircle className="w-5 h-5 text-rose-600" />
              ) : (
                <CreditCard className="w-5 h-5 text-amber-700" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                {lastPaymentIssue === 'failed' ? 'Payment did not go through' : 'Complete your payment'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {pendingDisplay.kitSnapshot?.name} · {pendingDisplay.orderNumber}
              </p>
              <p className="text-lg font-bold text-slate-900 mt-2">
                ₹{pendingDisplay.amount?.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {lastPaymentIssue === 'failed'
                  ? 'No money was charged. Tap Pay now to try again with another method.'
                  : 'Your order is saved. Pay securely with Razorpay (UPI, card, netbanking).'}
              </p>
            </div>
          </div>
          <PayNowButton
            orderId={pendingDisplay._id}
            onPaid={handlePaymentComplete}
            label={lastPaymentIssue === 'failed' ? 'Try payment again' : 'Pay now'}
            className="mt-4 py-3.5"
          />
          <div className="flex gap-3 mt-3">
            <button
              type="button"
              onClick={() => navigate('/driver/orders')}
              className="flex-1 text-center text-xs font-semibold text-slate-700 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            >
              View order
            </button>
            <button
              type="button"
              onClick={() => {
                setLastPaymentIssue(null);
                setStep('browse');
              }}
              className="flex-1 text-center text-xs font-semibold text-slate-600 py-2 rounded-xl hover:bg-white/80"
            >
              Browse other kits
            </button>
          </div>
        </Card>
      )}

      {step === 'browse' && !awaitingApproval && !pendingDisplay && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Step 1 — Choose a kit
          </p>
          {kits.map((kit) => (
            <KitCatalogCard
              key={kit._id}
              kit={kit}
              selected={selectedKitId === kit._id}
              onSelect={handleSelectKit}
            />
          ))}
          {selectedKitId && (
            <Button
              variant="driver"
              size="md"
              fullWidth
              onClick={() => setStep('checkout')}
              className="rounded-full py-3.5 font-bold"
            >
              Continue with selected kit
            </Button>
          )}
        </div>
      )}

      {step === 'checkout' && selectedKit && !awaitingApproval && !pendingDisplay && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleBackToBrowse}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Change kit
          </button>

          <Card>
            <div className="flex items-start gap-3 mb-4 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 ring-2 ring-primary/30">
                <Package className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-semibold">Step 2 — Your kit</p>
                <h3 className="font-bold text-slate-900">{selectedKit.name}</h3>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  ₹{selectedKit.price?.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {kitItems.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-3">
                  Step 3 — Item preferences
                </p>
                <KitItemSelector
                  kitItems={kitItems}
                  selections={selections}
                  onChange={setSelections}
                  disabled={paying}
                />
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase">
                Step 4 — Delivery details
              </p>
              <Input
                label="Address line 1"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                placeholder="House no., street"
              />
              <Input
                label="Address line 2 (optional)"
                value={address.line2}
                onChange={(e) => setAddress({ ...address, line2: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="City"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
                <Input
                  label="PIN code"
                  type="tel"
                  value={address.pincode}
                  maxLength={6}
                  placeholder="6-digit PIN"
                  onKeyDown={(e) => {
                    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (!allowed.includes(e.key) && !/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) =>
                    setAddress({ ...address, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })
                  }
                />
              </div>
              <Input
                label="State"
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
              />
              <Input
                label="Phone"
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
              />
            </div>

            <Button
              variant="driver"
              size="md"
              fullWidth
              loading={paying}
              onClick={handlePurchase}
              className="rounded-full py-4 font-bold mt-6"
            >
              Pay ₹{selectedKit.price?.toLocaleString('en-IN')}
            </Button>
            <p className="text-[10px] text-slate-500 text-center mt-2 flex items-center justify-center gap-1">
              <CreditCard className="w-3 h-3" />
              Secure Razorpay checkout opens next
            </p>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DriverKitPurchaseSection;
