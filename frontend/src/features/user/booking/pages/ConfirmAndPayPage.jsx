import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Wallet as WalletIcon,
  MapPin,
  CircleDot,
  Calendar,
  Clock,
  Car,
  Plus,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Utensils,
  Moon,
  Pencil,
  X,
  CalendarClock,
  HandCoins,
  AlertCircle,
  Lock,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import api from '../../../../utils/api';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  SCHEDULED_BOOKING,
  mergeScheduledDispatchConfig,
  readDispatchNumber,
} from '../../../../constants/bookingStatus';
import { MAX_USER_CARS } from '../../../../constants/limits';
import { formatPickupDateTime } from '../../../../utils/datetime';
import { computeOutstationDuration, addCalendarDays, startOfLocalDay } from '../../../../utils/outstationSchedule';
import { getCarBrandName, getCarModelName } from '../../../../utils/vehicleCatalog';
import FareCard from '../components/FareCard';
import CouponCodeInput from '../components/CouponCodeInput';
import AddCarModal from '../components/AddCarModal';
import useFareEstimate from '../hooks/useFareEstimate';
import TopupSheet from '../../wallet/components/TopupSheet';
import DateTimePickerField from '../../../../components/inputs/DateTimePickerField';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../../store/lib/buildCacheKey';
import { useUserServicePricingsStore } from '../../../../store/user/useUserPricingStore';

/**
 * Combined Review + Confirm & pay screen.
 *
 * Earlier the booking flow had two near-identical screens:
 *   /user/book/review   – trip summary + fare estimate + outstation
 *                         food/stay toggle.
 *   /user/book/confirm  – trip summary + fare estimate + wallet + pay CTA.
 *
 * They've been consolidated into this single page so the user only
 * sees one "review your trip" surface. For outstation that means the
 * food-and-stay toggle lives here (and re-runs the estimate live), and
 * the toll/parking acknowledgement is gated behind the pay CTA via a
 * confirmation dialog instead of an always-on inline banner.
 *
 *   1. Recompute the fare live via `useFareEstimate` whenever the
 *      relevant draft fields change (incl. the food/stay toggle).
 *   2. Show the wallet balance + the deficit (if any).
 *   3. Pay CTA:
 *        – Outstation: first surface the toll/parking ack popup.
 *          Customer must accept before we run step 4.
 *        – Hourly:     proceeds straight to step 4.
 *   4. POST /auth/bookings creates the booking and atomically debits
 *      the wallet.
 *   5. If the wallet is short, we open the TopupSheet pre-filled with
 *      the exact shortfall (rounded up), and on success we auto-retry
 *      the booking-create call.
 *
 * Header + footer are sticky so the running total + back button are
 * always visible while the user scrolls through the trip recap.
 */
const ConfirmAndPayPage = () => {
  const navigate = useNavigate();
  const draft = useBookingDraftStore();
  const setFareEstimate = useBookingDraftStore((s) => s.setFareEstimate);
  const setCouponCode = useBookingDraftStore((s) => s.setCouponCode);
  const couponCode = useBookingDraftStore((s) => s.couponCode);
  const setOutstation = useBookingDraftStore((s) => s.setOutstation);
  const createBooking = useUserActiveBookingStore((s) => s.createBooking);

  const wallet = useUserWalletStore((s) => s.wallet);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);

  const setCarId = useBookingDraftStore((s) => s.setCarId);

  const [selectedCar, setSelectedCar] = useState(null);
  const [allCars, setAllCars] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [shortfall, setShortfall] = useState(0);
  const [carEditOpen, setCarEditOpen] = useState(false);
  const [pickupEditOpen, setPickupEditOpen] = useState(false);
  // Outstation has its own in-place edit dialog (a `DateTimePickerField`
  // popup) because dumping the customer onto the hourly type page —
  // which is where the hourly Edit confirm flow leads — would lose the
  // outstation context entirely. Hourly stays on the existing
  // navigate-back-to-type flow.
  const [outstationPickupEditOpen, setOutstationPickupEditOpen] = useState(false);
  const [conflictError, setConflictError] = useState(null); // { title, message, type: 'car'|'time' }
  const [tollAckOpen, setTollAckOpen] = useState(false);
  // Sticky until the user removes the code — otherwise a failed coupon
  // would blank the fare (and re-including it on every retry loops).
  const [couponInvalidMessage, setCouponInvalidMessage] = useState(null);

  // Guard: bounce back to the start of the flow if state is incomplete.
  useEffect(() => {
    if (!draft.serviceType || !draft.pickup || !draft.carId) {
      navigate('/user/book/service', { replace: true });
    }
  }, [draft.serviceType, draft.pickup, draft.carId, navigate]);

  useEffect(() => {
    fetchWallet().catch(() => { });
  }, [fetchWallet]);

  // Fetch car list once — used both for the summary and the edit sheet.
  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/cars')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data?.data) ? res.data.data : [];
        setAllCars(list);
        setSelectedCar(list.find((c) => c._id === draft.carId) || null);
      })
      .catch(() => {
        if (!cancelled) setSelectedCar(null);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selectedCar in sync when the draft carId changes (e.g. after edit).
  useEffect(() => {
    if (!allCars.length) return;
    setSelectedCar(allCars.find((c) => c._id === draft.carId) || null);
  }, [draft.carId, allCars]);

  // Live fare estimate — fully reuses the booking-flow hook so the wire
  // format stays in lockstep with the slab page.
  const estimatePayload = useMemo(() => {
    if (!draft.serviceType || !draft.pickup) return null;
    const base = { serviceType: draft.serviceType };
    if (draft.serviceType === SERVICE_TYPES.HOURLY) {
      base.slabId = draft.hourly.isCustomDuration ? null : draft.hourly.slabId;
      base.bookedHours = draft.hourly.durationHours;
      base.scheduledAt = draft.hourly.scheduledStartAt;
      if (draft.hourly.foodProvided != null) base.foodProvided = !!draft.hourly.foodProvided;
      if (draft.hourly.stayProvided != null) base.stayProvided = !!draft.hourly.stayProvided;
    } else {
      base.days = draft.outstation.days;
      base.scheduledAt =
        draft.outstation.pickupAt || draft.outstation.startDate;
      base.foodProvided = draft.outstation.needsFood;
      base.stayProvided = draft.outstation.needsStay;
    }
    if (couponCode && !couponInvalidMessage) base.couponCode = couponCode;
    return base;
  }, [draft, couponCode, couponInvalidMessage]);

  const { estimate, loading: estimating, error: estimateError } = useFareEstimate(
    estimatePayload,
    { onResult: (data) => setFareEstimate(data) },
  );

  // Capture coupon failures without blocking the (coupon-free) re-estimate.
  useEffect(() => {
    if (!couponCode) {
      setCouponInvalidMessage(null);
      return;
    }
    if (estimateError) setCouponInvalidMessage(estimateError);
  }, [couponCode, estimateError]);

  // Sticky coupon error lives on the chip; fare card keeps a clean estimate.
  const couponError = couponInvalidMessage;
  const fareError = couponCode && couponInvalidMessage ? null : estimateError;

  // `total` is the *full wallet requirement*: fare charged immediately
  // + the waiting reserve we hold against `wallet.heldRupees`. Even
  // though the buffer isn't debited, the user must have it in the
  // wallet for the booking to start.
  const fareTotal = Number(estimate?.fareBreakdown?.totalPayable || 0);
  const bufferRupees = Number(estimate?.waitingBuffer?.bufferRupees || 0);
  const total = Math.round((fareTotal + bufferRupees) * 100) / 100;
  // We compare against *available* balance (balance − heldRupees from
  // other active bookings) so a user with funds locked in another
  // booking's buffer can't accidentally over-book.
  const balance = Number(wallet.balance || 0);
  const heldElsewhere = Number(wallet.heldRupees || 0);
  const available = Math.max(0, Math.round((balance - heldElsewhere) * 100) / 100);
  const canPay = !couponError && available >= total && total > 0;

  // Pull the service pricing for the active service type so we can
  // surface the admin-configured outstation lead time on the in-place
  // pickup edit dialog. The list is cached so this is essentially a
  // selector — no extra request when the customer arrives from the
  // duration page (already populated upstream).
  const { data: pricingList } = useCachedQuery(
    useUserServicePricingsStore,
    buildCacheKey('user-services-active'),
  );
  const servicePricing = useMemo(() => {
    const list = Array.isArray(pricingList) ? pricingList : [];
    return list.find((s) => s.serviceType === draft.serviceType) || null;
  }, [pricingList, draft.serviceType]);
  const dispatchConfig = useMemo(
    () => mergeScheduledDispatchConfig(servicePricing?.scheduledDispatch),
    [servicePricing?.scheduledDispatch],
  );
  const isOutstation = draft.serviceType === SERVICE_TYPES.OUTSTATION;
  const minLeadHours = readDispatchNumber(
    dispatchConfig.MIN_SCHEDULED_LEAD_HOURS,
    SCHEDULED_BOOKING.MIN_SCHEDULED_LEAD_HOURS,
  );
  const minLeadDays = readDispatchNumber(
    dispatchConfig.MIN_OUTSTATION_LEAD_DAYS,
    SCHEDULED_BOOKING.MIN_OUTSTATION_LEAD_DAYS,
  );
  // Lazy-snapshot the wall clock so the derived `minPickupDate` memo
  // stays pure (Date.now is impure under react-hooks/purity). Fine to
  // be stable for the lifetime of the page — the backend re-validates
  // against the live clock when the user hits Pay.
  const [nowAnchorMs] = useState(() => Date.now());
  const minPickupDate = useMemo(() => {
    if (isOutstation) {
      return (
        addCalendarDays(new Date(nowAnchorMs), minLeadDays)
        || startOfLocalDay(new Date(nowAnchorMs))
      );
    }
    return new Date(nowAnchorMs + minLeadHours * 60 * 60 * 1000);
  }, [nowAnchorMs, minLeadHours, minLeadDays, isOutstation]);

  // Mandatory food acknowledgement gate (hourly only). The slab page
  // is meant to capture this, but a direct landing on /confirm — or a
  // back-nav after toggling slabs — could leave the flag stale, so we
  // double-check at pay-time. Block the CTA until the customer has
  // confirmed they'll feed the driver.
  const foodRequired = !!estimate?.fareBreakdown?.foodRequired;
  const isHourly = draft.serviceType === SERVICE_TYPES.HOURLY;
  const foodAcknowledged = !!draft.hourly?.foodAcknowledged;
  const foodGateUnmet = isHourly && foodRequired && !foodAcknowledged;
  const setHourly = useBookingDraftStore((s) => s.setHourly);

  // Outstation food + stay arrangement toggles — each flag is now
  // independent (was a single combined toggle before). The fare
  // engine waives the food allowance when `needsFood === true` and
  // the stay allowance when `needsStay === true`, so the customer
  // can opt into one without committing to both. For legacy pricing
  // docs that still use the deprecated combined `allowancePerNight`
  // the engine only waives the line when BOTH flags are true — the
  // card surfaces that constraint in copy when it applies.
  const foodProvided = isOutstation && draft.outstation?.needsFood === true;
  const stayProvided = isOutstation && draft.outstation?.needsStay === true;
  const handleFoodToggle = useCallback(
    (next) => {
      setOutstation({ needsFood: next });
    },
    [setOutstation],
  );
  const handleStayToggle = useCallback(
    (next) => {
      setOutstation({ needsStay: next });
    },
    [setOutstation],
  );

  // Edit pickup time. Hourly bookings re-enter the type/duration flow
  // (the existing confirm dialog) because changing the slab affects
  // the fare significantly. Outstation has a much simpler shape
  // (pickup + return only), so we open an in-place dialog that lets
  // the customer adjust the times without losing destination/car.
  const handleEditPickup = useCallback(() => {
    if (isOutstation) {
      setOutstationPickupEditOpen(true);
    } else {
      setPickupEditOpen(true);
    }
  }, [isOutstation]);

  // Save handler for the outstation in-place edit dialog. Mirrors the
  // patch the duration page applies on continue — both the new pair
  // (`pickupAt`/`expectedReturnAt`) and the legacy `startDate`/`endDate`
  // are written so the buildCreatePayload reads consistently. We also
  // refresh `days` / `nights` so the trip summary chip updates without
  // waiting on the next estimate round-trip.
  const handleOutstationPickupSave = useCallback(
    ({ pickupAt, expectedReturnAt }) => {
      const { days, nights } = computeOutstationDuration(
        pickupAt,
        expectedReturnAt,
      );
      setOutstation({
        pickupAt,
        expectedReturnAt,
        startDate: pickupAt,
        endDate: expectedReturnAt,
        days,
        nights,
      });
      setOutstationPickupEditOpen(false);
    },
    [setOutstation],
  );

  // Allowance preview for the FoodStayCard subtitle. We pass the
  // split food/day + stay/night line items so each toggle can show
  // exactly "₹X × N (days|nights) = ₹Total" — the saving the user
  // gets by flipping just that one allowance. Legacy pricing docs
  // (combined per-night) fall back to the single deprecated line.
  const tripDays = Number(estimate?.fareBreakdown?.days) || 0;
  const tripNights = Number(estimate?.fareBreakdown?.nights) || 0;
  const foodAllowancePerDay =
    Number(estimate?.fareBreakdown?.foodAllowancePerDay) || 0;
  const stayAllowancePerNight =
    Number(estimate?.fareBreakdown?.stayAllowancePerNight) || 0;
  const legacyAllowancePerNight =
    Number(estimate?.fareBreakdown?.allowancePerNight) || 0;

  // Actual booking creation. Split out from `handlePay` so the
  // toll/parking acknowledgement dialog can call it after the customer
  // accepts.
  const submitBooking = useCallback(async () => {
    if (submitting || !total) return;

    const freshWallet = useUserWalletStore.getState().wallet || {};
    const freshBalance = Number(freshWallet.balance || 0);
    const freshHeld = Number(freshWallet.heldRupees || 0);
    const freshAvailable = Math.max(0, freshBalance - freshHeld);
    if (freshAvailable < total) {
      setShortfall(Math.max(0, Math.round((total - freshAvailable) * 100) / 100));
      setTopupOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const payload = useBookingDraftStore.getState().buildCreatePayload();
      const { booking } = await createBooking(payload);
      if (booking) {
        // Optimistically pull a fresh wallet snapshot — the debit
        // already happened server-side; this keeps the bottom-nav badge
        // and the wallet page in sync without a manual refresh.
        fetchWallet().catch(() => { });
        // Scheduled hourly + outstation → success / "we'll find a driver"
        // screen. Instant hourly stays on the live searching spinner.
        const isDeferredAssign =
          booking.serviceType === SERVICE_TYPES.OUTSTATION
          || booking.bookingType === BOOKING_TYPE.OUTSTATION
          || booking.bookingType === BOOKING_TYPE.SCHEDULED
          || booking.status === BOOKING_STATUS.PENDING_ASSIGNMENT
          || booking.status === BOOKING_STATUS.IN_EMERGENCY_POOL;
        if (isDeferredAssign) {
          navigate('/user/book/scheduled');
        } else {
          navigate('/user/book/searching');
        }
      }
    } catch (err) {
      // The wallet service throws ApiError(402) with `{ shortBy, ... }`
      // when the balance moved between fetch and create (rare but real).
      // We intercept and re-open the TopupSheet pre-filled.
      const data = err?.response?.data?.data || {};
      if (err?.response?.status === 402 && Number(data.shortBy) > 0) {
        setShortfall(Number(data.shortBy));
        setTopupOpen(true);
        return;
      }
      // Per-car overlap: show a modal so the user has clear actions.
      if (
        err?.response?.status === 409 &&
        (data.code === 'CAR_TIME_CONFLICT' || data.code === 'CAR_HAS_ACTIVE_BOOKING')
      ) {
        setConflictError({
          title: 'Car already booked',
          message:
            err?.response?.data?.message ||
            'This car is already booked for an overlapping time. Pick a different car or change the pickup time.',
          type: 'car',
        });
        return;
      }
      // Scheduled rides require enough lead time — show in a modal.
      if (err?.response?.status === 422) {
        setConflictError({
          title: 'Pickup time too soon',
          message:
            err?.response?.data?.message ||
            'We need more lead time for scheduled rides. Please pick a later pickup time.',
          type: 'time',
        });
        return;
      }
      toast.error(err?.response?.data?.message || err?.message || 'Could not place booking');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, total, createBooking, fetchWallet, navigate]);

  // Pay CTA entry point. Hourly is straight-through; outstation must
  // first acknowledge the toll & parking disclosure (since those are
  // paid directly to the driver and aren't part of this fare).
  const handlePay = useCallback(() => {
    if (submitting || !total) return;
    if (foodGateUnmet) {
      toast.error('Please confirm you\u2019ll arrange the driver\u2019s meal');
      return;
    }
    if (isOutstation) {
      setTollAckOpen(true);
      return;
    }
    submitBooking();
  }, [submitting, total, foodGateUnmet, isOutstation, submitBooking]);

  // Outstation toll/parking ack flow → user accepted, run the create.
  const handleTollAcknowledged = useCallback(() => {
    setTollAckOpen(false);
    submitBooking();
  }, [submitBooking]);

  // Auto-retry the booking creation after a successful top-up so the user
  // doesn't have to click "Pay" again.
  const handleTopupSuccess = useCallback(async () => {
    setTopupOpen(false);
    // Give Zustand a tick to apply the wallet patch before checking
    // again. We bypass `handlePay` (which would re-open the toll
    // dialog) and call submitBooking directly — the user already
    // acknowledged the disclosure that triggered the top-up.
    setTimeout(() => {
      submitBooking();
    }, 50);
  }, [submitBooking]);

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      {/* Sticky header keeps Back + page title in view while the user
          scrolls through trip + fare + wallet sections. */}
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-text">Review &amp; pay</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3">
        <TripSummary
          draft={draft}
          car={selectedCar}
          onEditCar={() => setCarEditOpen(true)}
          onEditPickup={handleEditPickup}
        />

        {isOutstation && (
          <FoodStayCard
            foodProvided={foodProvided}
            stayProvided={stayProvided}
            foodAllowancePerDay={foodAllowancePerDay}
            stayAllowancePerNight={stayAllowancePerNight}
            legacyAllowancePerNight={legacyAllowancePerNight}
            days={tripDays}
            nights={tripNights}
            onFoodChange={handleFoodToggle}
            onStayChange={handleStayToggle}
          />
        )}

        <Card>
          <div className="space-y-3">
            <CouponCodeInput
              code={couponCode}
              appliedCode={
                !couponError && estimate?.coupon?.code
                  ? estimate.coupon.code
                  : null
              }
              onApply={(code) => {
                setCouponInvalidMessage(null);
                setCouponCode(code);
              }}
              onRemove={() => {
                setCouponInvalidMessage(null);
                setCouponCode(null);
              }}
              applying={estimating && !!couponCode && !couponError}
              error={couponError}
            />
            <div className="border-t border-border-light pt-3">
              <FareCard
                estimate={estimate}
                estimating={estimating}
                error={fareError}
                dense
                bare
              />
            </div>
          </div>
        </Card>

        <FareNotices estimate={estimate} />

        {isHourly && foodRequired && (
          <FoodAcknowledgement
            thresholdHours={Number(
              estimate?.extrasConfig?.foodAllowance?.thresholdHours || 0,
            )}
            checked={foodAcknowledged}
            onChange={(v) => setHourly({ foodAcknowledged: v })}
          />
        )}

        <WalletBalanceCard
          balance={balance}
          available={available}
          heldElsewhere={heldElsewhere}
          fareTotal={fareTotal}
          bufferRupees={bufferRupees}
          total={total}
          shortBy={Math.max(0, total - available)}
          loading={estimating}
          onAddMoney={() => {
            setShortfall(Math.max(0, total - available));
            setTopupOpen(true);
          }}
        />

        {isOutstation ? (
          <OutstationCancellationPolicySummary
            policy={estimate?.cancellationPolicy?.outstation}
            dailyRate={Number(estimate?.fareBreakdown?.dailyRate) || 0}
          />
        ) : isHourly ? (
          <HourlyCancellationPolicySummary
            policy={estimate?.cancellationPolicy?.hourly}
          />
        ) : null}
      </div>

      {/* Sticky footer — pay CTA (with the running total) is always
          reachable without scrolling. */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-border-light px-4 py-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.15)]">
        <Button
          fullWidth
          icon={WalletIcon}
          loading={submitting}
          disabled={
            !!couponError
            || !estimate
            || estimating
            || total <= 0
            || foodGateUnmet
          }
          onClick={handlePay}
        >
          {couponError
            ? 'Remove coupon to continue'
            : !total
              ? 'Calculating fare\u2026'
              : foodGateUnmet
                ? 'Confirm driver\u2019s meal to continue'
                : canPay
                  ? `Pay \u20B9${total}`
                  : `Add \u20B9${Math.max(0, total - available).toFixed(0)} & pay`}
        </Button>
      </div>

      <TopupSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        suggestedAmount={shortfall}
        title="Top up to confirm booking"
        subtitle={
          shortfall > 0
            ? `You need ₹${Math.round(shortfall)} more to pay this booking.`
            : null
        }
        onSuccess={handleTopupSuccess}
      />

      {/* Edit car bottom-sheet — same list + "Add car" CTA as instant ride */}
      <EditCarSheet
        open={carEditOpen}
        cars={allCars}
        selectedCarId={draft.carId}
        onClose={() => setCarEditOpen(false)}
        onSelect={(carId) => {
          setCarId(carId);
          setCarEditOpen(false);
        }}
        onCarAdded={({ car }) => {
          if (car?._id) {
            setAllCars((prev) => {
              const exists = prev.some((c) => c._id === car._id);
              return exists ? prev : [car, ...prev];
            });
            setCarId(car._id);
            setSelectedCar(car);
          }
          setCarEditOpen(false);
        }}
      />

      {/* Pickup time / hours change confirmation — hourly only. */}
      <PickupTimeConfirmDialog
        open={pickupEditOpen}
        onClose={() => setPickupEditOpen(false)}
        onConfirm={() => {
          setPickupEditOpen(false);
          navigate('/user/book/hourly/type');
        }}
      />

      {/* Outstation in-place pickup time edit. Lets the customer
          adjust the pickup/return without bouncing back through the
          full flow — the scheduled-ride confirm dialog above would
          land them on the hourly type page, which doesn't make
          sense for outstation. */}
      <OutstationPickupEditDialog
        open={outstationPickupEditOpen}
        initialPickupAt={
          draft.outstation?.pickupAt || draft.outstation?.startDate || null
        }
        initialReturnAt={
          draft.outstation?.expectedReturnAt
            || draft.outstation?.endDate
            || null
        }
        minPickupDate={minPickupDate}
        minLeadDays={minLeadDays}
        onClose={() => setOutstationPickupEditOpen(false)}
        onSave={handleOutstationPickupSave}
      />

      {/* Conflict / validation error modal */}
      <ConflictErrorDialog
        error={conflictError}
        onClose={() => setConflictError(null)}
        onChangeCar={() => {
          setConflictError(null);
          setCarEditOpen(true);
        }}
        onChangePickup={() => {
          setConflictError(null);
          if (isOutstation) {
            setOutstationPickupEditOpen(true);
          } else {
            setPickupEditOpen(true);
          }
        }}
      />

      {/* Outstation: toll & parking are paid by the customer directly
          to the driver during the trip — surfaced as an explicit
          acknowledgement before we kick off the booking creation. */}
      <TollParkingAckDialog
        open={tollAckOpen}
        submitting={submitting}
        onAccept={handleTollAcknowledged}
        onCancel={() => setTollAckOpen(false)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

/**
 * Rich wallet balance card with a live "balance vs fare" progress bar
 * so the customer can see at a glance whether they're funded for this
 * booking. Switches between two visual states:
 *
 *   funded     gradient slate card · big checkmark · "Ready to pay"
 *   short      cream/amber card    · clear shortfall callout · CTA
 */
function WalletBalanceCard({
  balance,
  available,
  heldElsewhere,
  fareTotal,
  bufferRupees,
  total,
  shortBy,
  loading,
  onAddMoney,
}) {
  const enough = total > 0 && available >= total;
  const fmt = (n) =>
    `\u20B9${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  if (enough) {
    return (
      <div className="rounded-2xl bg-slate-900 text-white px-4 py-3.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Wallet ready · {fmt(available)} available
          </p>
          <p className="text-[11px] text-white/60 mt-0.5">
            Paying {fmt(fareTotal)}
            {bufferRupees > 0 ? ` · ${fmt(bufferRupees)} held for waiting` : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <WalletIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">
            Need {fmt(shortBy)} more
          </p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {fmt(available)} available
            {heldElsewhere > 0 ? ` · ${fmt(heldElsewhere)} locked` : ''}
            {loading ? ' · updating…' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddMoney}
          className="inline-flex items-center gap-1 px-3 h-9 rounded-xl bg-primary text-white text-xs font-semibold shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add {fmt(Math.round(shortBy))}
        </button>
      </div>
    </div>
  );
}

/**
 * Informational chips rendered between the fare and wallet cards.
 *
 * Food acknowledgement for hourly bookings is rendered as a separate
 * mandatory checkbox (see {@link FoodAcknowledgement}) — it can't be a
 * passive notice because the customer has to opt in. The chip here is
 * only used for outstation, where the food allowance is billed and the
 * customer just needs a heads-up that a charge is included.
 *
 *   - "Driver food allowance included" (outstation only)
 *   - "Night charge included" when the ride hours overlap the configured
 *     night window OR cross the night-charge duration threshold.
 */
function FareNotices({ estimate }) {
  const bd = estimate?.fareBreakdown || {};
  const serviceType = estimate?.serviceType;
  const isOutstationFood =
    serviceType === SERVICE_TYPES.OUTSTATION && Number(bd.foodAllowance) > 0;
  const nightTriggered = !!bd.nightChargeTriggered && Number(bd.nightCharge) > 0;
  if (!isOutstationFood && !nightTriggered) return null;

  return (
    <div className="space-y-2">
      {isOutstationFood && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Food allowance ₹{bd.foodAllowance} included — toggle meals above to remove it.
        </p>
      )}
      {nightTriggered && (
        <p className="text-[12px] text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
          Night charge ₹{bd.nightCharge} applied for overnight hours.
        </p>
      )}
    </div>
  );
}

/**
 * Mandatory acknowledgement for hourly bookings that cross the food
 * threshold. Mirrors the slab-page checkbox so the customer can also
 * tick it here if they jumped straight in. Blocks the Pay CTA until
 * checked — see `foodGateUnmet` in the parent.
 */
function FoodAcknowledgement({ thresholdHours, checked, onChange }) {
  return (
    <label
      className={`rounded-2xl border p-3 flex items-start gap-3 cursor-pointer transition ${checked
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-300 bg-amber-50'
        }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${checked
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
          }`}
      >
        <Utensils className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-bold ${checked ? 'text-emerald-900' : 'text-amber-900'
              }`}
          >
            I&apos;ll arrange the driver&apos;s meal
          </p>
          {!checked && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
              Required
            </span>
          )}
        </div>
        <p
          className={`text-[12px] leading-snug mt-0.5 ${checked ? 'text-emerald-800' : 'text-amber-800'
            }`}
        >
          Bookings of {thresholdHours || 'this length'} hours or more cross
          meal time. We don&apos;t add a food charge to your fare &mdash;
          please confirm you&apos;ll feed the driver during the trip.
        </p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(!!e.target.checked)}
        className="mt-1 w-4 h-4 accent-emerald-600 shrink-0"
        aria-label="Confirm you will arrange the driver's meal"
      />
    </label>
  );
}

function TripSummary({ draft, car, onEditCar, onEditPickup }) {
  const isHourly = draft.serviceType === SERVICE_TYPES.HOURLY;
  const schedule = isHourly
    ? draft.hourly?.scheduledStartAt
    : draft.outstation?.pickupAt || draft.outstation?.startDate;
  const expectedReturn =
    draft.outstation?.expectedReturnAt || draft.outstation?.endDate;
  const dropAddress = draft.dropoff?.address || draft.outstation?.destinationAddress;

  return (
    <Card>
      <div className="space-y-4">
        {/* Pickup address */}
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <CircleDot className="w-4 h-4 text-success" />
            {!isHourly && dropAddress && (
              <>
                <div className="w-0.5 h-8 bg-gray-200" />
                <MapPin className="w-4 h-4 text-danger" />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div>
              <p className="text-xs text-text-muted">Pickup</p>
              <p className="text-sm font-medium text-text break-words">
                {draft.pickup?.address}
              </p>
            </div>
            {!isHourly && dropAddress && (
              <div className="mt-3">
                <p className="text-xs text-text-muted">Destination</p>
                <p className="text-sm font-medium text-text break-words">{dropAddress}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Round trip — we drop you back at the pickup.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Car row — with edit button */}
        {car && (
          <>
            <div className="h-px bg-border-light" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                {car.image ? (
                  <img src={car.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Car className="w-5 h-5 text-text-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">Your car</p>
                <p className="text-sm font-semibold text-text truncate">
                  {getCarBrandName(car)} · {getCarModelName(car)}
                </p>
                <p className="text-[11px] font-mono text-text-secondary">
                  {car.vehicleNumber}
                </p>
              </div>
              {onEditCar && (
                <button
                  type="button"
                  onClick={onEditCar}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-xl border border-border bg-gray-50 hover:bg-primary/5 hover:border-primary/30 text-text-muted hover:text-primary text-[11px] font-semibold transition"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          </>
        )}

        <div className="h-px bg-border-light" />

        {/* Schedule / duration grid — with edit button for hourly */}
        <div className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-2 gap-3">
            <FactRow
              icon={Calendar}
              label={isHourly ? 'Pickup time' : 'Pickup'}
              value={formatPickupDateTime(schedule)}
            />
            {!isHourly && (
              <FactRow
                icon={Calendar}
                label="Expected return"
                value={formatPickupDateTime(expectedReturn)}
              />
            )}
            <FactRow
              icon={Clock}
              label={isHourly ? 'Duration' : 'Days \u00b7 nights'}
              value={
                isHourly
                  ? `${draft.hourly?.durationHours || 0} h`
                  : `${draft.outstation?.days || 1} day${(draft.outstation?.days || 1) === 1 ? '' : 's'} \u00b7 ${draft.outstation?.nights || 0} night${(draft.outstation?.nights || 0) === 1 ? '' : 's'}`
              }
            />
            <FactRow icon={Car} label="Service" value={SERVICE_TYPE_LABELS[draft.serviceType]} />
            {!isHourly && (
              <FactRow
                icon={HandCoins}
                label="Driver food & stay"
                value={
                  draft.outstation?.needsFood === true
                    && draft.outstation?.needsStay === true
                    ? 'Arranged by customer (no allowance)'
                    : 'Allowance billed per night'
                }
              />
            )}
          </div>
          {onEditPickup && (
            <button
              type="button"
              onClick={onEditPickup}
              className="flex-shrink-0 mt-0.5 inline-flex items-center gap-1.5 px-3 h-8 rounded-xl border border-border bg-gray-50 hover:bg-primary/5 hover:border-primary/30 text-text-muted hover:text-primary text-[11px] font-semibold transition"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Edit Car Sheet                                                       */
/* ------------------------------------------------------------------ */

function EditCarSheet({ open, cars, selectedCarId, onClose, onSelect, onCarAdded }) {
  const [addOpen, setAddOpen] = useState(false);
  if (!open) return null;

  const atLimit = cars.length >= MAX_USER_CARS;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center">
        <div
          className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl animate-fade-in-up max-h-[80dvh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border-light">
            <div>
              <p className="text-base font-bold text-text">Select a car</p>
              <p className="text-xs text-text-muted mt-0.5">Choose which car the driver will manage</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Car list + Add car CTA (mirrors instant-ride CarPickerSheet) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cars.length === 0 && (
              <p className="text-sm text-text-muted text-center py-8">No cars found.</p>
            )}
            {cars.map((c) => {
              const isActive = c._id === selectedCarId;
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => onSelect(c._id)}
                  className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                    {c.image ? (
                      <img src={c.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Car className="w-5 h-5 text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text truncate">
                      {getCarBrandName(c)} · {getCarModelName(c)}
                    </p>
                    <p className="text-[11px] font-mono text-text-secondary">{c.vehicleNumber}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                      isActive ? 'border-primary bg-primary' : 'border-gray-300'
                    }`}
                  >
                    {isActive && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={atLimit}
              aria-disabled={atLimit}
              className={`w-full flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-left transition ${
                atLimit
                  ? 'border-border bg-gray-50 cursor-not-allowed opacity-70'
                  : 'border-border hover:bg-gray-50 active:scale-[0.99]'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  atLimit ? 'bg-gray-200 text-text-muted' : 'bg-primary/10 text-primary'
                }`}
              >
                {atLimit ? <Lock className="w-4 h-4" /> : <Plus className="w-5 h-5" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-text">
                  {atLimit ? `You've reached the ${MAX_USER_CARS}-car limit` : 'Add a new car'}
                </span>
                <span className="block text-[11px] text-text-muted">
                  {atLimit
                    ? 'Remove a car from "My cars" to register a new vehicle.'
                    : 'Register another vehicle without leaving this booking.'}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <AddCarModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCarAdded={(payload) => {
          setAddOpen(false);
          onCarAdded?.(payload);
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pickup Time Confirm Dialog                                           */
/* ------------------------------------------------------------------ */

function PickupTimeConfirmDialog({ open, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-text">Change pickup time or hours?</p>
            <p className="text-sm text-text-secondary mt-1 leading-snug">
              You'll be taken back to select a new booking type, pickup time, and duration. Your
              current pickup location and car will be kept.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-text-muted shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 mt-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white font-semibold py-3 text-sm hover:bg-primary-dark transition"
          >
            <CalendarClock className="w-4 h-4" />
            Yes, change it
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full inline-flex items-center justify-center rounded-2xl border border-border bg-white text-text font-semibold py-3 text-sm hover:bg-gray-50 transition"
          >
            Keep current time
          </button>
        </div>
      </div>
    </div>
  );
}

function FactRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] text-text-muted">{label}</p>
        <p className="text-xs font-medium text-text truncate">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Outstation pickup edit dialog                                        */
/* ------------------------------------------------------------------ */

/**
 * In-place editor for the outstation pickup + expected-return times.
 * Uses the shared `DateTimePickerField` so the popup matches the look
 * of the original picker on the duration/variant pages, and enforces
 * the same admin-configured lead-time floor (`minPickupDate`) so the
 * backend's 422 check is never hit from this flow.
 *
 * Local state is reset every time the dialog opens (`open` key)
 * because the customer might cancel and reopen — we don't want stale
 * half-edits to leak across opens. Save is disabled until both fields
 * are populated and `return > pickup`.
 */
function OutstationPickupEditDialog({
  open,
  initialPickupAt,
  initialReturnAt,
  minPickupDate,
  minLeadDays,
  onClose,
  onSave,
}) {
  if (!open) return null;
  return (
    <OutstationPickupEditDialogBody
      initialPickupAt={initialPickupAt}
      initialReturnAt={initialReturnAt}
      minPickupDate={minPickupDate}
      minLeadDays={minLeadDays}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function OutstationPickupEditDialogBody({
  initialPickupAt,
  initialReturnAt,
  minPickupDate,
  minLeadDays,
  onClose,
  onSave,
}) {
  // Seed once per mount via lazy initialisers — the wrapper unmounts
  // this body on close so re-opening starts fresh from the latest
  // draft values. Keeps `useEffect` + setState off the hot path.
  const [pickupAt, setPickupAt] = useState(() =>
    sanitisePickup(initialPickupAt, minPickupDate),
  );
  const [expectedReturnAt, setExpectedReturnAt] = useState(() => {
    const safePickup = sanitisePickup(initialPickupAt, minPickupDate);
    return sanitiseReturn(initialReturnAt, safePickup);
  });

  // Derive the return floor from the picked pickup so the return
  // picker never lets the customer choose a same-or-earlier moment.
  // Add a 30-min buffer so the floor matches what the backend treats
  // as a "real" outstation booking (anything shorter rounds to the
  // same calendar day → 1 day, 0 night).
  const minReturnDate = useMemo(() => {
    if (!pickupAt) return minPickupDate;
    const base = new Date(pickupAt);
    if (Number.isNaN(base.getTime())) return minPickupDate;
    return new Date(base.getTime() + 30 * 60 * 1000);
  }, [pickupAt, minPickupDate]);

  // Trip preview to give the customer a sense of what the change does
  // before they commit. Mirrors the formula used downstream on save.
  const previewDuration = useMemo(
    () => computeOutstationDuration(pickupAt, expectedReturnAt),
    [pickupAt, expectedReturnAt],
  );

  const handlePickupChange = (iso) => {
    setPickupAt(iso);
    // If the existing return is now earlier than (or equal to) the new
    // pickup, clear it so the customer has to re-pick — keeps us out
    // of an invalid state on save.
    if (iso && expectedReturnAt) {
      const newPickupMs = new Date(iso).getTime();
      const currentReturnMs = new Date(expectedReturnAt).getTime();
      if (
        Number.isFinite(newPickupMs)
        && Number.isFinite(currentReturnMs)
        && currentReturnMs <= newPickupMs
      ) {
        setExpectedReturnAt(null);
      }
    }
  };

  const canSave = !!(pickupAt && expectedReturnAt)
    && new Date(expectedReturnAt).getTime() > new Date(pickupAt).getTime();

  // Lead-time banner: surfaces the EXACT earliest pickup the admin's
  // `MIN_SCHEDULED_LEAD_HOURS` allows, so the customer doesn't have to
  // mentally translate "2 hours from now" into a clock time. Hidden
  // when lead time is zero (no useful floor to show).
  const earliestPickupLabel = useMemo(() => {
    if (!minPickupDate || !(minPickupDate instanceof Date)) return null;
    if (Number.isNaN(minPickupDate.getTime())) return null;
    return formatPickupDateTime(minPickupDate);
  }, [minPickupDate]);

  return (
    // Mobile: full-width bottom sheet anchored to the bottom of the
    // viewport. Desktop (≥ sm): centered floating card with a wider
    // safety margin. The `flex` + `items-end sm:items-center` pair
    // does the heavy lifting; we drop the outer padding entirely on
    // mobile so the sheet stretches edge-to-edge.
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl animate-fade-in-up max-h-[92dvh] sm:max-h-[90dvh] flex flex-col">
        {/* Drag-handle: a thin pill that hints "swipe-down to dismiss"
            on mobile. Hidden on desktop where the floating card
            already reads as a modal. */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header — stays pinned to the top of the sheet so the title
            is always visible while the body scrolls on short
            viewports. */}
        <div className="flex items-start gap-3 px-5 sm:px-6 pt-2 sm:pt-6 pb-4 border-b border-border-light shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-text">
              Change pickup &amp; return
            </p>
            <p className="text-xs sm:text-sm text-text-secondary mt-1 leading-snug">
              Pick a new pickup time and the day you&rsquo;d like to be
              dropped back. Your pickup location and car stay the same.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-text-muted shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body so day chips, time slots, and the new-trip
            preview never push the action buttons off-screen on short
            phones. */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3">
          {/* Lead-time floor banner — shows the EXACT earliest pickup
              moment so the customer doesn't have to compute
              "now + N hours" themselves. The picker below independently
              enforces the same floor by disabling any day/slot earlier
              than this moment. */}
          {minLeadDays > 0 && earliestPickupLabel && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <p className="text-[12px] leading-snug text-amber-900">
                <strong className="font-semibold">
                  Earliest pickup: {earliestPickupLabel}.
                </strong>{' '}
                We need at least {minLeadDays} day{minLeadDays === 1 ? '' : 's'}{' '}
                between booking and pickup so a driver can be assigned.
              </p>
            </div>
          )}

          <DateTimePickerField
            label="Pickup date & time"
            icon={CalendarClock}
            value={pickupAt}
            onChange={handlePickupChange}
            minDate={minPickupDate}
            placeholder="Tap to choose pickup"
            sheetTitle="Pickup date & time"
          />
          <DateTimePickerField
            label="Expected return"
            icon={CalendarClock}
            value={expectedReturnAt}
            onChange={setExpectedReturnAt}
            minDate={minReturnDate}
            disabled={!pickupAt}
            placeholder={
              pickupAt ? 'Tap to choose return' : 'Pick a pickup first'
            }
            helper={
              pickupAt
                ? 'Round trip \u2014 the driver brings you back here on this date.'
                : undefined
            }
            sheetTitle="Expected return"
          />

          {pickupAt && expectedReturnAt && (
            <div className="rounded-xl bg-bg px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-text-muted">New trip length</span>
              <span className="text-sm font-bold text-text">
                {previewDuration.days} day
                {previewDuration.days === 1 ? '' : 's'} {'\u00b7'}{' '}
                {previewDuration.nights} night
                {previewDuration.nights === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        {/* Sticky footer keeps the Save/Cancel buttons in reach on
            small phones regardless of body scroll position. */}
        <div className="px-5 sm:px-6 pt-3 pb-5 sm:pb-6 border-t border-border-light shrink-0 space-y-2 bg-white">
          <Button
            fullWidth
            disabled={!canSave}
            onClick={() => onSave({ pickupAt, expectedReturnAt })}
          >
            Save new time
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="w-full inline-flex items-center justify-center rounded-2xl border border-border bg-white text-text font-semibold py-3 text-sm hover:bg-gray-50 transition"
          >
            Keep current time
          </button>
        </div>
      </div>
    </div>
  );
}

function sanitisePickup(raw, minDate) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (minDate && d.getTime() < minDate.getTime()) return null;
  return d.toISOString();
}

function sanitiseReturn(raw, pickupIso) {
  if (!raw || !pickupIso) return null;
  const r = new Date(raw);
  const p = new Date(pickupIso);
  if (Number.isNaN(r.getTime()) || Number.isNaN(p.getTime())) return null;
  if (r.getTime() <= p.getTime()) return null;
  return r.toISOString();
}

/**
 * Mirror of the `formatLeadHours` helper used on the variant / duration
 * pages — whole hours stay plain ("2 hours"); fractional ones drop to
 * minutes ("90 minutes") so the customer doesn't see "1.5 hours" which
 * reads awkwardly in this tight dialog.
 */
function formatLeadHours(hours) {
  const safe = Math.max(0, Number(hours) || 0);
  if (safe === 0) return 'a moment';
  if (Number.isInteger(safe)) {
    return `${safe} hour${safe === 1 ? '' : 's'}`;
  }
  const totalMinutes = Math.round(safe * 60);
  if (totalMinutes < 60) return `${totalMinutes} minutes`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h} hours` : `${h}h ${m}m`;
}

/* ------------------------------------------------------------------ */
/* Conflict Error Dialog                                                */
/* ------------------------------------------------------------------ */

/**
 * Shown when the server rejects the booking due to a car time-conflict
 * (409) or insufficient lead time (422). Surfaces a clear title,
 * the server's exact message, and two context-aware action buttons so
 * the user can fix the issue without hunting around the UI.
 *
 * `type === 'car'`  → primary CTA opens the car-picker sheet.
 * `type === 'time'` → primary CTA opens the pickup-time confirm dialog.
 */
function ConflictErrorDialog({ error, onClose, onChangeCar, onChangePickup }) {
  if (!error) return null;
  const isCar = error.type === 'car';
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up">
        {/* Icon + title row */}
        <div className="flex items-start gap-3 mb-1">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${isCar ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`w-5 h-5 ${isCar ? 'text-red-600' : 'text-amber-700'}`} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-base font-bold text-text">{error.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-text-muted shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-text-secondary leading-snug mb-5 pl-14">
          {error.message}
        </p>

        {/* Actions */}
        <div className="space-y-2">
          {isCar ? (
            <>
              <button
                type="button"
                onClick={onChangeCar}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white font-semibold py-3 text-sm hover:bg-primary-dark transition"
              >
                <Car className="w-4 h-4" />
                Change car
              </button>
              <button
                type="button"
                onClick={onChangePickup}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-white text-text font-semibold py-3 text-sm hover:bg-gray-50 transition"
              >
                <CalendarClock className="w-4 h-4" />
                Change pickup time instead
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onChangePickup}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white font-semibold py-3 text-sm hover:bg-primary-dark transition"
              >
                <CalendarClock className="w-4 h-4" />
                Change pickup time
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex items-center justify-center rounded-2xl border border-border bg-white text-text font-semibold py-3 text-sm hover:bg-gray-50 transition"
              >
                Stay on this page
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FoodStayCard — outstation food + stay arrangement toggle             */
/* ------------------------------------------------------------------ */

/**
 * Two independent toggles — one for the driver's food (waived per
 * day) and one for the driver's stay (waived per night). Each row
 * shows the exact ₹X × N saving the customer gets by flipping it,
 * and the running summary line at the bottom totals what the
 * platform is currently adding to the fare.
 *
 * Legacy pricing docs that still use the combined `allowancePerNight`
 * waive the line only when BOTH flags are on — we still render two
 * toggles in that case but tell the customer they need both before
 * the allowance drops off.
 */
function FoodStayCard({
  foodProvided,
  stayProvided,
  foodAllowancePerDay = 0,
  stayAllowancePerNight = 0,
  legacyAllowancePerNight = 0,
  days = 0,
  nights = 0,
  onFoodChange,
  onStayChange,
}) {
  const hasSplit = foodAllowancePerDay > 0 || stayAllowancePerNight > 0;
  const useLegacy =
    !hasSplit && legacyAllowancePerNight > 0 && nights > 0;

  // Per-row charged amounts. In split mode each toggle independently
  // waives its own line; in legacy mode both toggles must be on or
  // the full combined allowance still applies.
  const foodChargedAmount = hasSplit
    ? (foodProvided ? 0 : foodAllowancePerDay * days)
    : 0;
  const stayChargedAmount = hasSplit
    ? (stayProvided ? 0 : stayAllowancePerNight * nights)
    : 0;
  const legacyChargedAmount = useLegacy
    ? ((foodProvided && stayProvided) ? 0 : legacyAllowancePerNight * nights)
    : 0;
  const totalAllowanceCharged =
    foodChargedAmount + stayChargedAmount + legacyChargedAmount;

  // Summary copy at the bottom — shows the net allowance left on the
  // fare so the customer always knows how their choices affect the
  // total.
  let summary;
  if (foodProvided && stayProvided) {
    summary =
      'No driver allowance charged \u2014 you take care of meals and stay directly.';
  } else if (totalAllowanceCharged <= 0) {
    summary = 'No driver allowance applies on this trip.';
  } else {
    summary = `Driver allowance currently added: \u20B9${totalAllowanceCharged}. Toggle either row on to remove that part of the charge.`;
  }

  return (
    <Card>
      <div className="space-y-3">
        {/* ── Food row ─────────────────────────────────────────── */}
        <ToggleRow
          icon={Utensils}
          label="I will arrange the driver's food"
          description={describeFoodRow({
            foodProvided,
            hasSplit,
            useLegacy,
            foodAllowancePerDay,
            days,
          })}
          checked={foodProvided}
          onChange={onFoodChange}
          ariaLabel="I will arrange the driver's food"
        />

        {/* ── Stay row ─────────────────────────────────────────── */}
        <ToggleRow
          icon={Moon}
          label="I will arrange the driver's stay"
          description={describeStayRow({
            stayProvided,
            hasSplit,
            useLegacy,
            stayAllowancePerNight,
            legacyAllowancePerNight,
            nights,
          })}
          checked={stayProvided}
          onChange={onStayChange}
          ariaLabel="I will arrange the driver's stay"
        />
      </div>

      <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border-light">
        {summary}
        {useLegacy && !(foodProvided && stayProvided) && (
          <>
            {' '}
            <strong className="text-amber-700">
              {'This trip uses a combined per-night allowance \u2014 both toggles must be on for it to be waived.'}
            </strong>
          </>
        )}
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* FoodStayCard internals                                              */
/* ------------------------------------------------------------------ */

function ToggleRow({ icon: Icon, label, description, checked, onChange, ariaLabel }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-bg flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-gray-300'} relative`}
        aria-pressed={checked}
        aria-label={ariaLabel}
      >
        <span
          className={`absolute top-0.5 ${checked ? 'left-[18px]' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`}
        />
      </button>
    </div>
  );
}

function describeFoodRow({
  foodProvided,
  hasSplit,
  useLegacy,
  foodAllowancePerDay,
  days,
}) {
  if (foodProvided) {
    return 'No food allowance charged \u2014 you\u2019ll feed the driver directly.';
  }
  if (hasSplit && foodAllowancePerDay > 0 && days > 0) {
    const total = foodAllowancePerDay * days;
    return `We add \u20B9${foodAllowancePerDay} \u00d7 ${days} day${days === 1 ? '' : 's'} = \u20B9${total} as the driver\u2019s food allowance.`;
  }
  if (useLegacy) {
    return 'Food is bundled into this trip\u2019s combined per-night allowance.';
  }
  return 'No separate food allowance is configured for this trip.';
}

function describeStayRow({
  stayProvided,
  hasSplit,
  useLegacy,
  stayAllowancePerNight,
  legacyAllowancePerNight,
  nights,
}) {
  if (nights === 0) {
    return 'Same-day trip \u2014 no overnight stay needed.';
  }
  if (stayProvided) {
    return 'No stay allowance charged \u2014 you\u2019ll host the driver overnight.';
  }
  if (hasSplit && stayAllowancePerNight > 0) {
    const total = stayAllowancePerNight * nights;
    return `We add \u20B9${stayAllowancePerNight} \u00d7 ${nights} night${nights === 1 ? '' : 's'} = \u20B9${total} as the driver\u2019s stay allowance.`;
  }
  if (useLegacy) {
    const total = legacyAllowancePerNight * nights;
    return `We add \u20B9${legacyAllowancePerNight} \u00d7 ${nights} night${nights === 1 ? '' : 's'} = \u20B9${total} as the driver\u2019s combined food + stay allowance.`;
  }
  return 'No stay allowance is configured for this trip.';
}

/* ------------------------------------------------------------------ */
/* TollParkingAckDialog — outstation toll & parking acknowledgement     */
/* ------------------------------------------------------------------ */

/**
 * Outstation-only confirmation surfaced when the customer taps the
 * Pay CTA. Toll, parking and other route-specific incidentals are
 * paid by the customer directly to the driver as per actuals — they
 * are not part of this booking fare. Customer must explicitly
 * acknowledge before we create the booking.
 */
function TollParkingAckDialog({ open, submitting, onAccept, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-text">
              Toll &amp; parking are paid by you
            </p>
            <p className="text-sm text-text-secondary mt-1 leading-snug">
              Any tolls, parking, state-entry charges or other
              route-specific costs are <strong>not</strong> included in
              this fare. You&rsquo;ll pay them directly to the driver
              along the route as per actuals.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-text-muted shrink-0"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 mt-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white font-semibold py-3 text-sm hover:bg-primary-dark transition disabled:opacity-60"
          >
            <ShieldCheck className="w-4 h-4" />
            I understand &mdash; continue to pay
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full inline-flex items-center justify-center rounded-2xl border border-border bg-white text-text font-semibold py-3 text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* OutstationCancellationPolicySummary                                  */
/* ------------------------------------------------------------------ */

/**
 * Compact, customer-facing summary of the outstation cancellation
 * policy. Renders on the review/confirm page so the customer knows
 * what they're committing to BEFORE they pay. Driven entirely off the
 * `cancellationPolicy.outstation` snapshot the estimate hands back —
 * no extra round-trip needed.
 */
function OutstationCancellationPolicySummary({ policy, dailyRate }) {
  const cfg = policy || {};
  const freeHours = Number(cfg.freeCancellationHoursBeforePickup ?? 24);
  const arrivedFeeMinDays = Math.max(0, Number(cfg.arrivedFeeMinDays ?? 1));
  const arrivedFloor = arrivedFeeMinDays * (Number(dailyRate) || 0);

  const describeFee = (type, amount, zeroLabel) => {
    const value = Number(amount) || 0;
    if (value <= 0) return zeroLabel;
    return type === 'percentage'
      ? `${value}% of the fare`
      : `\u20B9${value}`;
  };
  const beforeFee = describeFee(
    cfg.beforeWindowFeeType,
    cfg.beforeWindowFeeAmount,
    'no fee',
  );
  const preFee = describeFee(
    cfg.preArrivalFeeType,
    cfg.preArrivalFeeAmount,
    'no fee',
  );
  const arrivedFee = describeFee(
    cfg.arrivedFeeType,
    cfg.arrivedFeeAmount,
    'no fee',
  );

  return (
    <details className="rounded-2xl border border-border-light bg-white px-4 py-3 group">
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <ShieldCheck className="w-4 h-4 text-text-muted shrink-0" />
        <span className="text-sm font-semibold text-text flex-1">Cancellation policy</span>
        <span className="text-[11px] text-text-muted group-open:hidden">View</span>
      </summary>
      <ul className="mt-3 space-y-2 text-[12px] text-text-secondary">
        <li>
          <strong className="text-text">More than {freeHours}h before pickup</strong>
          {' '}— {beforeFee === 'no fee'
            ? 'full refund.'
            : `${beforeFee} deducted.`}
        </li>
        <li>
          <strong className="text-text">Within {freeHours}h, before arrival</strong>
          {' '}— {preFee === 'no fee' ? 'no fee.' : `${preFee} deducted.`}
        </li>
        <li>
          <strong className="text-text">After driver arrives</strong>
          {' '}— {arrivedFee}
          {arrivedFloor > 0
            ? ` or ₹${Math.round(arrivedFloor)} min, whichever is higher.`
            : '.'}
        </li>
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* HourlyCancellationPolicySummary                                       */
/* ------------------------------------------------------------------ */

/**
 * Customer-facing summary of the hourly cancellation policy. Hourly
 * uses a STATUS-driven model (not time-driven like outstation) — the
 * fee depends on how far the booking has progressed:
 *
 *   searching                          no fee, full wallet refund
 *   driver assigned → en route         flat ₹ `flatFeeAfterAssignment`
 *   arrived / started                  `arrivedFeeType` decides:
 *                                        'flat'       → ₹ `arrivedFeeAmount`
 *                                        'percentage' → % of paid fare
 *
 * Driven entirely off `cancellationPolicy.hourly` from the estimate so
 * admin changes show up without redeploying the FE.
 */
function HourlyCancellationPolicySummary({ policy }) {
  const cfg = policy || {};
  const flatFee = Math.max(0, Number(cfg.flatFeeAfterAssignment) || 0);
  const arrivedAmount = Math.max(0, Number(cfg.arrivedFeeAmount) || 0);
  const isPct = cfg.arrivedFeeType === 'percentage';
  const arrivedLabel = arrivedAmount > 0
    ? isPct
      ? `${arrivedAmount}% of the paid fare`
      : `\u20B9${arrivedAmount}`
    : 'no fee';

  return (
    <details className="rounded-2xl border border-border-light bg-white px-4 py-3 group">
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <ShieldCheck className="w-4 h-4 text-text-muted shrink-0" />
        <span className="text-sm font-semibold text-text flex-1">Cancellation policy</span>
        <span className="text-[11px] text-text-muted group-open:hidden">View</span>
      </summary>
      <ul className="mt-3 space-y-2 text-[12px] text-text-secondary">
        <li>
          <strong className="text-text">Before a driver is assigned</strong>
          {' '}&mdash; full refund.
        </li>
        <li>
          <strong className="text-text">Driver assigned, not yet arrived</strong>
          {' '}&mdash;{' '}
          {flatFee > 0 ? (
            <>₹{flatFee} fee, rest refunded.</>
          ) : (
            'no fee.'
          )}
        </li>
        <li>
          <strong className="text-text">After driver arrives</strong>
          {' '}&mdash; {arrivedLabel}
          {arrivedAmount > 0 ? ' deducted.' : '.'}
        </li>
      </ul>
    </details>
  );
}

export default ConfirmAndPayPage;

