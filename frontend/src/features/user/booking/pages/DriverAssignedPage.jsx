import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  MapPin,
  CreditCard,
  Wallet,
  Loader2,
  X,
  Route,
  CheckCircle2,
  PlayCircle,
  Clock,
  Timer as TimerIcon,
  ArrowLeft,
  Calendar,
  Car,
  Pencil,
} from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import AdsCarousel from '../../../../components/AdsCarousel';
import Avatar from '../../../../components/Avatar';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import { useSocket, useSocketEvent } from '../../../../hooks/useSocket';
import { useTripDriverLocation } from '../../../../hooks/useTripDriverLocation';
import useAppResumeSync from '../../../../hooks/useAppResumeSync';
import { useRideTimer } from '../hooks/useRideTimer';
import { formatRideCountdown } from '../../../../utils/formatters';
import { S2C_EVENTS, C2S_EVENTS } from '../../../../constants/socketEvents';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  isBookingContactRevealed,
} from '../../../../constants/bookingStatus';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { haversineMeters, formatDistance } from '../../../../utils/geo';
import { maskPersonName, formatExtensionHours } from '../../../../utils/formatters';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import PaymentChoiceSheet from '../components/PaymentChoiceSheet';
import RideStartOtpCard from '../components/RideStartOtpCard';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import {
  previewUserCancellation,
  buildUserCancelConfirmMessage,
} from '../utils/cancellationPreview';
import SosEmergencyButton from '../../tracking/components/SosEmergencyButton';
import TripChatEntry from '../../../../components/chat/TripChatEntry';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import { isChatVisibleForBooking } from '../../../../constants/chat';

/** How long the full-size map is shown before it auto-shrinks to the
 * floating preview card. Tuned for "long enough to glance at the driver,
 * short enough to surface promos quickly". */
const MAP_AUTO_COLLAPSE_MS = 7000;

const roundMoney = (n) =>
  Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

/**
 * Maps every status the user can be on while their booking is live to the
 * header copy + icon they see at the top of the page. Adding a new status
 * is a one-line change — the rest of the screen (driver card, payment card,
 * cancel button) keys off `canCancel` here and `paymentBlocker` derived
 * below.
 */
const STATUS_VIEW = {
  [BOOKING_STATUS.DRIVER_ASSIGNED]: {
    icon: '\u2713',
    title: 'Driver assigned',
    subtitle: 'Your driver will start heading to you soon.',
  },
  [BOOKING_STATUS.AWAITING_PAYMENT]: {
    icon: 'timer',
    title: 'Confirm payment to start',
    subtitle:
      'Pay within 1 minute to confirm your ride. Your driver is held until payment lands.',
  },
  [BOOKING_STATUS.EN_ROUTE]: {
    icon: 'route',
    title: 'Driver on the way',
    subtitle: 'Your driver is heading to the pickup.',
  },
  [BOOKING_STATUS.ARRIVED]: {
    icon: 'flag',
    title: 'Driver has arrived',
    subtitle: 'Meet your driver at the pickup location to start the trip.',
  },
  [BOOKING_STATUS.STARTED]: {
    icon: 'play',
    title: 'Trip in progress',
    subtitle: 'Enjoy your ride. Cancellation is no longer available.',
  },
};

function StatusIcon({ icon }) {
  if (icon === 'route') return <Route className="w-5 h-5 text-emerald-700" />;
  if (icon === 'flag') return <CheckCircle2 className="w-5 h-5 text-amber-700" />;
  if (icon === 'play') return <PlayCircle className="w-5 h-5 text-sky-700" />;
  if (icon === 'timer') return <TimerIcon className="w-5 h-5 text-red-600" />;
  return <span className="text-xl">{icon}</span>;
}

const DriverAssignedPage = () => {
  const navigate = useNavigate();
  const { id: routeBookingId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchOvertimeQuote = useUserActiveBookingStore((s) => s.fetchOvertimeQuote);
  const fetchById = useUserActiveBookingStore((s) => s.fetchById);
  const refreshCurrentOrActive = useUserActiveBookingStore(
    (s) => s.refreshCurrentOrActive,
  );
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const cancelBooking = useUserActiveBookingStore((s) => s.cancelBooking);
  const cancelExtension = useUserActiveBookingStore((s) => s.cancelExtension);
  const extensionPromptOpen = useUserActiveBookingStore((s) => s.extensionPromptOpen);
  const openExtensionPrompt = useUserActiveBookingStore((s) => s.openExtensionPrompt);
  const draftReset = useBookingDraftStore((s) => s.reset);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const user = useUserAuthStore((s) => s.user);
  const { emit, isConnected } = useSocket();

  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const refetchOnResume = useCallback(() => {
    if (routeBookingId) return fetchById(routeBookingId);
    return refreshCurrentOrActive();
  }, [routeBookingId, fetchById, refreshCurrentOrActive]);
  useAppResumeSync(refetchOnResume);

  // Hydrate the active booking on mount. Two paths:
  //   1. URL carries `/:id` (preferred) → fetch *that* booking. This
  //      is what makes a hard refresh keep the same trip even when
  //      the user has several active bookings — the alternative
  //      (`/auth/bookings/active`) returns whichever the backend
  //      ranks highest, which is the wrong one in that scenario.
  //   2. Legacy `/user/book/assigned` with no id → fall back to the
  //      booking already in the store (refreshed by id), or `/active`
  //      when the store is empty. Older navigators still hit this
  //      path; new ones include the id so refresh survives.
  // Either way we re-pull the full record so `cancellationPreview`
  // and other server-only fields land (the store entry seeded by
  // `createBooking` or socket patches doesn't include them).
  const didHydrate = useRef(false);
  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    if (routeBookingId) {
      fetchById(routeBookingId).catch(() => { });
    } else {
      refreshCurrentOrActive().catch(() => { });
    }
  }, [routeBookingId, fetchById, refreshCurrentOrActive]);

  // Join the booking room so the driver, user, and any admin watching get the
  // same trip-room broadcasts (Phase 5 will lean on this for live ETA).
  useEffect(() => {
    if (!booking?._id || !isConnected) return undefined;
    emit(C2S_EVENTS.BOOKING_JOIN, { bookingId: booking._id });
    return () => emit(C2S_EVENTS.BOOKING_LEAVE, { bookingId: booking._id });
  }, [booking?._id, isConnected, emit]);

  useEffect(() => {
    if (booking?.status !== BOOKING_STATUS.STARTED) return undefined;
    if (!booking?.overtime?.required || booking?.overtime?.paymentStatus === 'paid') {
      return undefined;
    }
    fetchOvertimeQuote().catch(() => null);
    const id = setInterval(() => {
      fetchOvertimeQuote().catch(() => null);
    }, 30_000);
    return () => clearInterval(id);
  }, [
    booking?._id,
    booking?.status,
    booking?.overtime?.required,
    booking?.overtime?.paymentStatus,
    fetchOvertimeQuote,
  ]);

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    applyUpdate(payload);
    const current = useUserActiveBookingStore.getState().booking;
    const nextStatus = payload?.status || current?.status;
    if (nextStatus && isBookingContactRevealed({ ...current, status: nextStatus })) {
      const hasPhone =
        current?.driverId &&
        typeof current.driverId === 'object' &&
        (current.driverId.phone_no || current.driverId.phone);
      if (!hasPhone) {
        refreshCurrentOrActive?.().catch(() => {});
      }
    }
  });

  // Driver hit Dismiss on the OTP banner — global extend sheet
  // (`UserBookingAlertsBridge`) shows the retry state.
  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_RESOLVED, (payload) => {
    if (payload?.stage !== 'dismissed_by_driver') return;
    if (booking?._id && String(booking._id) !== String(payload.bookingId)) return;
    refreshCurrentOrActive?.().catch(() => {});
  });

  // Scheduled-ride countdown reminder. The same event is consumed on
  // SearchingDriverPage; here it covers the case where a driver was
  // already assigned (e.g. 15-minute reminder fires while the booking
  // sits in driver_assigned / en_route).
  useSocketEvent(S2C_EVENTS.BOOKING_REMINDER, (payload) => {
    const m = Number(payload?.minutesAhead);
    if (!m) return;
    toast(`Your ride starts in ${m} minutes`, {
      icon: '\u23F0',
      duration: 4000,
    });
  });

  // No-show "are you coming?" alert is global (`UserBookingAlertsBridge`).

  const bookingStatus = booking?.status;
  const cancellationReason = booking?.cancellation?.reason;
  const refundSummary = booking?.refund;
  useEffect(() => {
    if (!bookingStatus) return;
    if (bookingStatus === BOOKING_STATUS.CANCELLED) {
      // Auto-cancel from the payment timeout is a special case — we want
      // the user to understand why the booking went away. Other cancellation
      // sources (user/driver/admin) already have their own UX paths so we
      // stay quiet there.
      if (cancellationReason === 'payment_timeout') {
        toast.error(
          'Your booking was cancelled — payment was not completed in time.',
          { duration: 6000 },
        );
      } else if (
        cancellationReason === 'cancelled_by_driver' ||
        cancellationReason === 'cancelled_by_driver_after_start'
      ) {
        const refundAmt = Number(refundSummary?.amountRupees) || 0;
        if (refundAmt > 0) {
          toast.success(
            `Driver cancelled. Refund of ₹${refundAmt} is on its way.`,
            { duration: 6000 },
          );
        } else {
          toast('Driver cancelled the ride.', { icon: 'ℹ️', duration: 5000 });
        }
      }
      // customer_no_show toast is handled by UserBookingAlertsBridge
      // Cancellation refund (wallet) settles on the backend the moment
      // the booking flips — pull a fresh wallet snapshot so the home /
      // wallet pages render the new balance without a manual refresh.
      fetchWallet().catch(() => { });
      draftReset();
      navigate('/user/home', { replace: true });
    }
    if (bookingStatus === BOOKING_STATUS.COMPLETED) {
      // Route to the post-trip rating + invoice flow rather than home
      // so the customer is prompted to rate the driver. Same path for
      // instant, scheduled, and round-trip (outstation) bookings.
      draftReset();
      const id = booking?._id || routeBookingId;
      navigate(
        id
          ? `/user/tracking/completed?bookingId=${id}`
          : '/user/tracking/completed',
        { replace: true },
      );
    }
    if (
      bookingStatus === BOOKING_STATUS.SEARCHING &&
      cancellationReason === 'driver_cancelled_reassigning'
    ) {
      // Driver bailed and we're re-dispatching. Hand off to the searching
      // page so the user sees the same "finding driver" UX as a fresh
      // booking. The popup is surfaced there via the same cancellation
      // reason.
      navigate('/user/book/searching', { replace: true });
    }
    if (bookingStatus === BOOKING_STATUS.NO_DRIVERS_FOUND) {
      navigate('/user/book/no-drivers', { replace: true });
    }
  }, [bookingStatus, cancellationReason, refundSummary, navigate, draftReset, fetchWallet, booking?._id, routeBookingId]);

  const driver = booking?.driverId;
  const driverId = typeof driver === 'object' ? driver?._id : driver;

  // Live driver location, scoped to this booking. The backend only publishes
  // the node while the ride is EN_ROUTE / ARRIVED / STARTED, so the reveal gate
  // is enforced server-side now; this flag just avoids a pointless subscribe.
  const driverLocationRevealed = [
    BOOKING_STATUS.EN_ROUTE,
    BOOKING_STATUS.ARRIVED,
    BOOKING_STATUS.STARTED,
  ].includes(bookingStatus);

  const { driver: liveDriver, isStale: driverLocationStale } =
    useTripDriverLocation(routeBookingId || booking?._id, {
      enabled: driverLocationRevealed,
    });

  const pickupPoint = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  // Drop-off coords (when present) so the in-progress map can render
  // the route the driver is currently following. `booking.dropoff` is
  // a `placeSchema` POJO with `location.coordinates` in [lng, lat]
  // order — same shape as `pickup`.
  const dropoffPoint = useMemo(() => {
    const c = booking?.dropoff?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.dropoff]);

  const driverPoint = useMemo(() => {
    if (!liveDriver) return null;
    return {
      lat: liveDriver.lat,
      lng: liveDriver.lng,
      heading: typeof liveDriver.heading === 'number' ? liveDriver.heading : undefined,
    };
  }, [liveDriver]);

  const distanceMeters = useMemo(() => {
    if (!driverPoint || !pickupPoint) return null;
    return haversineMeters(driverPoint, pickupPoint);
  }, [driverPoint, pickupPoint]);

  /**
   * Driver vehicle expertise we want to surface as the "Drives:" line
   * on the driver card. Merges `vehicleExperience` (specific cars the
   * driver has logged) with `carTypeExperience` (broader categories)
   * and de-dupes, then caps to 3 entries to keep the line tight.
   */
  const driverExpertise = useMemo(() => {
    const ve = Array.isArray(driver?.vehicleExperience)
      ? driver.vehicleExperience
      : [];
    const cte = Array.isArray(driver?.carTypeExperience)
      ? driver.carTypeExperience
      : [];
    const fromVehicles = ve
      .map((v) => v?.modelName || v?.brandName || v?.categoryName)
      .filter(Boolean);
    const fromTypes = cte.map((c) => c?.name).filter(Boolean);
    return [...new Set([...fromVehicles, ...fromTypes])].slice(0, 3);
  }, [driver]);

  // Drivers in this app store their face photo on the `selfie` document
  // captured during onboarding, not in `profilePicture` (which is left
  // blank by the registration flow). We pick the selfie URL first and
  // fall back to `profilePicture` only when present, so the avatars
  // actually render a face instead of grey initials.
  const driverPhotoUrl = useMemo(() => {
    if (!driver) return null;
    const docs = Array.isArray(driver.documents) ? driver.documents : [];
    const selfie = docs.find((d) => d?.type === 'selfie' && d?.fileUrl);
    return selfie?.fileUrl || driver.profilePicture || null;
  }, [driver]);

  // Ride duration timer + extension prompt (only active once STARTED).
  const rideTimer = useRideTimer(booking);

  const isOutstationBooking = booking?.serviceType === SERVICE_TYPES.OUTSTATION;

  // Per-day rate the outstation extension modal quotes before the
  // customer commits. Derived from the booking's existing fare
  // snapshot so the preview matches what the original booking was
  // paying per day (dailyRate + food allowance per day + stay
  // allowance per night, when the customer didn't opt out). The
  // server is the canonical source — this is just a friendly preview.
  const outstationPerDayRate = useMemo(() => {
    if (!isOutstationBooking) return 0;
    const bd = booking?.fareSnapshot?.breakdown || {};
    const dailyRate = Number(bd.dailyRate) || 0;
    const foodPerDay =
      booking?.outstation?.needsFood === false
        ? 0
        : Number(bd.foodAllowancePerDay) || 0;
    const stayPerNight =
      booking?.outstation?.needsStay === false
        ? 0
        : Number(bd.stayAllowancePerNight) || 0;
    // We treat one extension day as one extra night for preview
    // parity with the backend math (which uses extraNights = days
    // when the original booking already crossed at least one night).
    const hasOvernight = Number(booking?.outstation?.nights) > 0;
    const stayShare = hasOvernight ? stayPerNight : 0;
    return Math.max(0, Math.round(dailyRate + foodPerDay + stayShare));
  }, [isOutstationBooking, booking?.fareSnapshot?.breakdown, booking?.outstation]);

  // Preview ₹/hr for outstation hour-slice extensions. Prefer an
  // explicit rate on the fare snapshot when present; otherwise
  // dailyRate / 24 (matches backend resolveOutstationHourlyRate).
  const outstationHourlyRate = useMemo(() => {
    if (!isOutstationBooking) return 0;
    const bd = booking?.fareSnapshot?.breakdown || {};
    const explicit =
      Number(bd.outstationExtraHourCharge) ||
      Number(bd.extraHourChargeRate) ||
      0;
    if (explicit > 0) return Math.round(explicit);
    const daily = Number(bd.dailyRate) || 0;
    return daily > 0 ? Math.max(1, Math.round(daily / 24)) : 0;
  }, [isOutstationBooking, booking?.fareSnapshot?.breakdown]);

  // Extend sheet + ring are global (`UserBookingAlertsBridge`).

  // Pick the most recent extension still in a handshake state. This is
  // what powers the sticky banner that nudges the customer back to
  // finish payment when they close the modal mid-flow.
  const pendingExtension = useMemo(() => {
    const list = booking?.extensions || [];
    // Scan back-to-front so the freshest intent wins (we only ever have
    // one open at a time anyway — initiate refuses to stack).
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i];
      if (e?.status === 'pending_otp' || e?.status === 'pending_payment') {
        return e;
      }
    }
    return null;
  }, [booking?.extensions]);

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelConfirmOpen(true);
  };

  const cancelPreview = useMemo(
    () => previewUserCancellation(booking),
    [booking],
  );

  const handleCancelConfirm = async () => {
    const tripStarted = !!cancelPreview.tripStarted;
    const fee = Number(cancelPreview.feeCharged) || 0;
    setCancelling(true);
    try {
      const result = await cancelBooking(
        tripStarted ? 'cancelled_by_user_after_start' : 'cancelled_by_user',
      );
      fetchWallet().catch(() => {});
      setCancelConfirmOpen(false);

      const status = result?.status;
      if (status === BOOKING_STATUS.NO_DRIVERS_FOUND) {
        navigate('/user/book/no-drivers', { replace: true });
        return;
      }
      if (fee > 0 && status === BOOKING_STATUS.CANCELLED) {
        toast(`Cancellation fee \u20B9${fee} applied.`, { icon: '\u26A0\uFE0F' });
      }
      draftReset();
      navigate('/user/home', { replace: true });
    } catch (err) {
      setCancelConfirmOpen(false);
      if (err?.alreadyTerminal || err?.code === 'BOOKING_ALREADY_TERMINAL') {
        fetchWallet().catch(() => {});
        draftReset();
        navigate('/user/home', { replace: true });
        return;
      }
      const status = useUserActiveBookingStore.getState().booking?.status;
      if (status === BOOKING_STATUS.CANCELLED) {
        fetchWallet().catch(() => {});
        draftReset();
        navigate('/user/home', { replace: true });
        return;
      }
      if (
        status === BOOKING_STATUS.SEARCHING &&
        useUserActiveBookingStore.getState().booking?.cancellation?.reason ===
          'driver_cancelled_reassigning'
      ) {
        navigate('/user/book/searching', { replace: true });
        return;
      }
      toast.error(err?.response?.data?.message || err?.message || 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  };

  // NOTE: these hooks must live ABOVE the `if (!booking)` early return.
  // Otherwise the first render (booking still loading) calls fewer hooks
  // than the second render (booking arrived), and React throws
  // "Rendered more hooks than during the previous render" — the bug that
  // produced the blank screen on hard refresh.
  const [cancellable, setCancellable] = useState(true);
  const [sheetExpanded, setSheetExpanded] = useState(
    () => searchParams.get('chat') === '1',
  );
  const [mapLocked, setMapLocked] = useState(false);

  useEffect(() => {
    if (searchParams.get('chat') === '1') setSheetExpanded(true);
  }, [searchParams]);

  const bookingStatusForCancel = booking?.status;
  const arrivedAtForCancel = booking?.timeline?.arrivedAt;
  const freeWaitForCancel = booking?.waiting?.freeMinutes;
  useEffect(() => {
    if (!bookingStatusForCancel) return undefined;
    if (bookingStatusForCancel === BOOKING_STATUS.STARTED) {
      setCancellable(false);
      return undefined;
    }
    if (bookingStatusForCancel === BOOKING_STATUS.ARRIVED && arrivedAtForCancel) {
      const freeWaitMinutes = freeWaitForCancel ?? 15;
      const arrivedAtMs = new Date(arrivedAtForCancel).getTime();

      const checkCancellable = () => {
        const elapsedMinutes = (Date.now() - arrivedAtMs) / 60000;
        setCancellable(elapsedMinutes <= freeWaitMinutes);
      };

      checkCancellable();
      const interval = setInterval(checkCancellable, 10000);
      return () => clearInterval(interval);
    }
    setCancellable(true);
    return undefined;
  }, [bookingStatusForCancel, arrivedAtForCancel, freeWaitForCancel]);

  if (!booking) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg min-h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  const isPaid = booking.paymentStatus === BOOKING_PAYMENT_STATUS.PAID;
  const isAwaitingPayment = booking.status === BOOKING_STATUS.AWAITING_PAYMENT;
  const baseTotal = booking.fareSnapshot?.total || 0;
  // Only count extensions the customer has actually paid for.
  // Pending OTP / pending payment rows are intent, not commitment —
  // showing them in the headline total before the customer agreed +
  // paid was confusing ("why did the price just jump when I haven't
  // paid?").
  const extensionsTotal = (booking.extensions || []).reduce(
    (sum, ext) =>
      sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
    0,
  );
  const total = roundMoney(baseTotal + extensionsTotal);
  const amountPaid = Number(booking.payment?.amountPaidRupees || 0);
  const payNowAmount = roundMoney(Math.max(0, total - amountPaid));

  const view = STATUS_VIEW[booking.status] || STATUS_VIEW[BOOKING_STATUS.DRIVER_ASSIGNED];
  const isTripStarted = booking.status === BOOKING_STATUS.STARTED;
  const overtime = booking.overtime || {};
  const overdueOpen =
    isTripStarted
    && Boolean(overtime.required)
    && overtime.paymentStatus !== 'paid'
    && (!isOutstationBooking || rideTimer.isPastOutstationGrace);
  const overdueAmount = overdueOpen
    ? roundMoney(overtime.amountRupees || overtime.totalPayable || 0)
    : 0;
  const overdueMinutes = Number(overtime.billableMinutes) || 0;
  const overdueRate = roundMoney(overtime.ratePerHour || 0);
  const overdueDue = overdueOpen;
  const rawDriverName = driver?.name || 'Driver';
  const displayDriverName = isTripStarted
    ? rawDriverName
    : maskPersonName(rawDriverName) || 'Driver';
  // Map only after "Start to pickup" (EN_ROUTE+). Assigned / awaiting
  // payment shows the status sheet without a live tracking map.
  const mapAnchor = isTripStarted ? dropoffPoint || pickupPoint : pickupPoint;
  const showMap = driverLocationRevealed && !!mapAnchor;

  /* ─── Status pill color helper ─── */
  const statusPillColor = {
    [BOOKING_STATUS.DRIVER_ASSIGNED]: 'bg-emerald-500',
    [BOOKING_STATUS.AWAITING_PAYMENT]: 'bg-red-500',
    [BOOKING_STATUS.EN_ROUTE]: 'bg-blue-500',
    [BOOKING_STATUS.ARRIVED]: 'bg-amber-500',
    [BOOKING_STATUS.STARTED]: 'bg-sky-500',
    [BOOKING_STATUS.PENDING_ASSIGNMENT]: 'bg-indigo-500',
  }[booking.status] || 'bg-emerald-500';

  return (
    <div className="flex-1 flex flex-col relative bg-gray-950 min-h-dvh overflow-hidden">

      {/* ═══════════════════════════════════════════
          LAYER 1 — Full-screen live map (background)
          ═══════════════════════════════════════════ */}
      {showMap ? (
        <div
          className="absolute inset-0"
        >
          <TripTrackingMap
            driver={driverPoint}
            // Once the trip is STARTED the customer cares about the
            // route to the destination, not back to the pickup they
            // already left. Swap the pickup pin for the dropoff (when
            // we have one) and let the camera trail the driver.
            pickup={isTripStarted ? dropoffPoint || pickupPoint : pickupPoint}
            emphasis="driver"
            height="100%"
            // Show the polyline at every phase that has a destination
            // to draw to — pickup (pre-arrival) and dropoff (in
            // progress). It's the ARRIVED phase that intentionally
            // hides it (the driver is on top of the pin).
            showRoute={booking.status !== BOOKING_STATUS.ARRIVED}
            // Follow for the whole live-map phase so the customer can
            // pan / two-finger-rotate and tap Recenter (north-up).
            followDriver={Boolean(driverPoint)}
            bookingStatus={booking.status}
            // Sit above the collapsed bottom sheet.
            controlClassName="!bottom-[28dvh] sm:!bottom-[26dvh]"
            // Lock only the canvas — Recenter stays tappable.
            mapInteractive={!mapLocked}
            isStale={driverLocationStale}
          />
        </div>
      ) : !driverLocationRevealed ? (
        /* Pre-pickup: message + ads where the live map will appear. */
        <div className="absolute inset-0 bg-gradient-to-b from-slate-100 via-white to-slate-50 pointer-events-auto">
          <div className="h-full flex flex-col items-stretch px-4 pt-24 pb-[42dvh] overflow-y-auto">
            <div className="flex flex-col items-center text-center gap-3 mt-4 mb-5">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary-dark flex items-center justify-center">
                <MapPin className="w-7 h-7" />
              </div>
              <p className="text-base font-bold text-slate-900 max-w-xs leading-snug">
                Map will show after the driver starts to pickup
              </p>
              <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                Live tracking unlocks once your driver taps Start to pickup.
              </p>
            </div>
            <div className="w-full max-w-md mx-auto">
              <AdsCarousel />
            </div>
          </div>
        </div>
      ) : (
        /* Fallback when coords are missing after pickup has started. */
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900" />
      )}

      {/* ═══════════════════════════════════════════
          LAYER 2 — Floating top bar (always visible)
          ═══════════════════════════════════════════ */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-12 pb-3 pointer-events-auto">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate('/user/activity')}
          aria-label="Back to trips"
          className="w-10 h-10 rounded-2xl bg-white/90 backdrop-blur shadow-lg flex items-center justify-center active:scale-90 transition"
        >
          <ArrowLeft className="w-5 h-5 text-gray-800" />
        </button>

        {/* Status chip */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg backdrop-blur-sm ${statusPillColor}`}>
          <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
          <span className="text-white text-xs font-bold tracking-wide">{view.title}</span>
        </div>

        {/* Lock map button (only when map is visible) */}
        {showMap && (
          <button
            type="button"
            onClick={() => setMapLocked((v) => !v)}
            aria-label={mapLocked ? 'Unlock map' : 'Lock map'}
            className={`w-10 h-10 rounded-2xl shadow-lg flex items-center justify-center active:scale-90 transition backdrop-blur ${
              mapLocked ? 'bg-primary text-white' : 'bg-white/90 text-gray-600'
            }`}
          >
            {mapLocked ? (
              /* Locked icon */
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3A5.25 5.25 0 0 0 12 1.5Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
              </svg>
            ) : (
              /* Unlocked icon */
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M18 1.5c2.9 0 5.25 2.35 5.25 5.25v3.75a.75.75 0 0 1-1.5 0V6.75a3.75 3.75 0 1 0-7.5 0v3h.75a3 3 0 0 1 3 3v6.75a3 3 0 0 1-3 3H3.75a3 3 0 0 1-3-3v-6.75a3 3 0 0 1 3-3H15v-3C15 3.85 16.35 1.5 18 1.5Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          LAYER 3 — Driver ETA / distance pill
          (floats mid-screen when map is visible)
          ═══════════════════════════════════════════ */}
      {showMap && liveDriver && distanceMeters != null && booking.status !== BOOKING_STATUS.ARRIVED && (
        <div className="relative z-10 flex justify-center pointer-events-none" style={{ marginTop: 'auto' }}>
          {/* This is absolutely positioned in the middle third of the screen */}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          LAYER 3.5 — Pending extension nudge
          Surfaces when there's an extension still mid-handshake
          (driver has the OTP / customer hasn't paid) but the modal
          is closed. Tap = reopen the modal at the right step.
          ═══════════════════════════════════════════ */}
      {pendingExtension && !extensionPromptOpen && (
        <PendingExtensionBanner
          extension={pendingExtension}
          onResume={() => {
            openExtensionPrompt();
          }}
          onChangeHours={async () => {
            try {
              await cancelExtension({ extensionId: pendingExtension._id });
              openExtensionPrompt();
            } catch (err) {
              toast.error(
                err?.response?.data?.message ||
                  err?.message ||
                  'Could not cancel extension',
              );
            }
          }}
        />
      )}

      {/* ═══════════════════════════════════════════
          LAYER 4 — Bottom Sheet (details panel)
          ═══════════════════════════════════════════ */}
      <div className="relative z-20 mt-auto pointer-events-auto">

        {/* ── The sheet itself ──
             Split into two zones:
               1. Header (handle + trip meta) — never scrolls, always pinned
               2. Body  — scrollable, capped at 72dvh when expanded          */}
        <div className="bg-white rounded-t-[28px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)]">

          {/* Zone 1: sticky header — tap to toggle.
              Driver details live only in the expanded body (single place).
              Collapsed peek shows trip meta + status so the map stays
              the focus. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={sheetExpanded ? 'Collapse details' : 'Expand details'}
            onClick={() => setSheetExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSheetExpanded((v) => !v);
              }
            }}
            className="w-full px-5 pt-3 pb-4 flex flex-col items-stretch gap-2 focus:outline-none cursor-pointer"
          >
            {/* Drag handle pill */}
            <div className="mx-auto w-10 h-1 rounded-full bg-gray-200" />

            {/* Top meta row: trip-type chip + fare + chevron */}
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide bg-primary/10 text-primary-dark px-2.5 py-1 rounded-full shrink-0">
                <Car className="w-3 h-3" />
                {SERVICE_TYPE_LABELS[booking.serviceType] || booking.serviceType || 'Trip'}
                {booking.hourly?.durationHours
                  ? ` · ${booking.hourly.durationHours}h`
                  : booking.outstation?.days
                    ? ` · ${booking.outstation.days}d`
                    : ''}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-gray-900 tabular-nums">
                  {'\u20B9'}{total.toFixed(2)}
                </span>
                <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center transition-transform duration-300 shrink-0 ${sheetExpanded ? 'rotate-180' : ''}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Compact status line — no second driver card */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 truncate min-w-0">
                {liveDriver && distanceMeters != null && booking.status !== BOOKING_STATUS.ARRIVED
                  ? `${formatDistance(distanceMeters)} away · ${view.subtitle}`
                  : view.subtitle}
              </p>
              {cancellable && (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-60 transition"
                >
                  <X className="w-3.5 h-3.5" />
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          </div>

          {/* Zone 2: scrollable body — only rendered (and takes up space) when expanded */}
          {sheetExpanded && (
            <div
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: '60dvh' }}
            >
              <div className="px-4 pb-4 space-y-4">

                {/* Booking number & status badge */}
                <div className="bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Booking ID</p>
                    <p className="text-sm font-bold text-gray-800 font-mono">{booking.bookingNumber}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[11px] font-bold text-white ${statusPillColor}`}>
                    {view.title}
                  </div>
                </div>

                {/* OTP card — moved inside the expanded sheet */}
                {booking.status === BOOKING_STATUS.ARRIVED && booking.rideStartOtp?.code && (
                  <RideStartOtpCard code={booking.rideStartOtp.code} />
                )}

                {/* Driver profile — single place for name / rating / call */}
                {booking.status !== BOOKING_STATUS.PENDING_ASSIGNMENT && driver && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-br from-primary/10 to-primary/5 px-5 pt-5 pb-4 flex items-center gap-4">
                      <Avatar
                        src={driverPhotoUrl}
                        name={rawDriverName}
                        size="xl"
                        online={!!liveDriver}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-primary-dark font-semibold uppercase tracking-wider mb-0.5">Your Driver</p>
                        <h3 className="text-lg font-extrabold text-gray-900 truncate">{displayDriverName}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {driver?.rating ? (
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400">
                                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
                              </svg>
                              {Number(driver.rating).toFixed(1)}
                            </span>
                          ) : null}
                          {driver?.experienceYears ? (
                            <span className="text-xs text-gray-500">
                              {Math.round(driver.experienceYears)}+ yrs exp
                            </span>
                          ) : null}
                          {liveDriver ? (
                            <span className="text-xs text-emerald-600 font-medium">
                              · {formatDistance(distanceMeters)} away
                            </span>
                          ) : null}
                        </div>
                        {driverExpertise.length > 0 && (
                          <p className="text-[11px] text-gray-400 mt-1 truncate">
                            Drives: {driverExpertise.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    {(isBookingContactRevealed(booking) &&
                      (driver?.phone_no || driver?.phone)) ||
                    isChatVisibleForBooking(booking) ? (
                      <div
                        className={`px-5 py-3 border-t border-gray-100 grid gap-2 ${
                          isBookingContactRevealed(booking) &&
                          (driver?.phone_no || driver?.phone) &&
                          isChatVisibleForBooking(booking)
                            ? 'grid-cols-2'
                            : 'grid-cols-1'
                        }`}
                      >
                        {isBookingContactRevealed(booking) &&
                          (driver?.phone_no || driver?.phone) && (
                          <a
                            href={`tel:+91${String(driver.phone_no || driver.phone).replace(/\D/g, '')}`}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 font-semibold text-sm hover:bg-emerald-100 active:scale-95 transition"
                            aria-label="Call driver"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
                            </svg>
                            Call driver
                          </a>
                        )}
                        {isChatVisibleForBooking(booking) && (
                          <TripChatEntry
                            booking={booking}
                            audience="user"
                            selfId={user?._id}
                            peerName={displayDriverName || 'Driver'}
                            peerAvatar={driver?.profilePicture || driver?.avatar || null}
                            subtitle="Trip chat"
                            buttonVariant="emerald"
                          />
                        )}
                      </div>
                    ) : null}
                    {driver && !isBookingContactRevealed(booking) && !isChatVisibleForBooking(booking) && (
                      <div className="px-5 py-3 border-t border-gray-100">
                        <p className="text-xs text-center text-gray-500">
                          Driver contact unlocks when they arrive at pickup
                        </p>
                      </div>
                    )}
                    {driver && !isBookingContactRevealed(booking) && isChatVisibleForBooking(booking) && (
                      <div className="px-5 pb-3">
                        <p className="text-[11px] text-center text-gray-500">
                          Phone unlocks when the driver arrives at pickup — chat is available now
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Trip details card */}
                <TripDetailsCard booking={booking} />

                {overdueDue && (
                  <Card className="border border-amber-200 bg-amber-50">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                          Overdue amount
                        </p>
                        <p className="text-2xl font-extrabold text-amber-950 tabular-nums">
                          ₹{overdueAmount.toFixed(2)}
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5">
                          {overdueRate > 0
                            ? `Charged at ₹${overdueRate.toFixed(2)}/hr`
                            : 'Overdue extra-hour rate'}
                          {overdueMinutes > 0 ? ` · ${overdueMinutes} min past grace` : ''}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button
                            size="sm"
                            disabled={!(overdueAmount > 0)}
                            onClick={() => {
                              const next = new URLSearchParams(searchParams);
                              next.set('overtime', '1');
                              setSearchParams(next);
                            }}
                          >
                            Pay overdue
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openExtensionPrompt()}
                          >
                            Extend trip
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* In-ride duration tracker (hourly only). Outstation
                    uses the calendar-day card below so we never show
                    both "Extend ride" and "Extend trip". */}
                {!isOutstationBooking
                  && rideTimer.isStarted
                  && rideTimer.scheduledEndAt && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-primary-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-muted">
                          {rideTimer.remainingSeconds >= 0 ? 'Time remaining' : 'Over booked duration'}
                        </p>
                        <p className={`text-base font-bold tabular-nums ${rideTimer.remainingSeconds < 0 ? 'text-danger' : 'text-text'}`}>
                          {formatRideCountdown(Math.abs(rideTimer.remainingSeconds))}
                        </p>
                        {overdueDue && overdueAmount > 0 && (
                          <p className="text-xs font-semibold text-amber-800 mt-0.5">
                            Overdue amount ₹{overdueAmount.toFixed(2)}
                            {overdueRate > 0 ? ` · ₹${overdueRate.toFixed(2)}/hr` : ''}
                          </p>
                        )}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openExtensionPrompt()}>
                        Extend ride
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Outstation: return countdown + Extend trip CTA.
                    Modal offers Hours | Days; same OTP handshake. */}
                {isOutstationBooking
                  && booking.status === BOOKING_STATUS.STARTED && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-primary-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {rideTimer.scheduledEndAt && rideTimer.remainingSeconds != null ? (
                          <>
                            <p className="text-xs text-text-muted">
                              {rideTimer.remainingSeconds >= 0
                                ? 'Time until return'
                                : 'Past booked return'}
                            </p>
                            <p
                              className={`text-base font-bold tabular-nums ${
                                rideTimer.remainingSeconds < 0
                                  ? 'text-danger'
                                  : 'text-text'
                              }`}
                            >
                              {formatRideCountdown(Math.abs(rideTimer.remainingSeconds))}
                            </p>
                            {overdueDue && overdueAmount > 0 && (
                              <p className="text-xs font-semibold text-amber-800 mt-0.5">
                                Overdue amount ₹{overdueAmount.toFixed(2)}
                                {overdueRate > 0 ? ` · ₹${overdueRate.toFixed(2)}/hr` : ''}
                              </p>
                            )}
                            <p className="text-xs text-text-muted mt-0.5">
                              Extend by hours
                              {outstationHourlyRate > 0
                                ? ` (~₹${outstationHourlyRate}/hr)`
                                : ''}
                              {' '}or days
                              {outstationPerDayRate > 0
                                ? ` (~₹${outstationPerDayRate}/day)`
                                : ''}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-text-muted">
                              Need more time on the road?
                            </p>
                            <p className="text-sm font-semibold text-text">
                              Extend by hours or full days
                            </p>
                          </>
                        )}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openExtensionPrompt()}>
                        Extend trip
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Payment card */}
                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {isPaid ? (
                        <CreditCard className="w-5 h-5 text-success shrink-0" />
                      ) : (
                        <Wallet className="w-5 h-5 text-amber-700 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-text-muted">Payment</p>
                        <p className="text-sm font-semibold text-text truncate">
                          {paymentSummary({ isPaid, isAwaitingPayment, total, payNowAmount })}
                        </p>
                        {overdueDue && overdueAmount > 0 && (
                          <p className="text-sm font-bold text-amber-800 tabular-nums mt-0.5">
                            Overdue amount · ₹{overdueAmount.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {isAwaitingPayment && !isPaid && (
                    <p className="mt-2 text-[11px] text-amber-700">
                      Complete the payment in the popup — your driver is waiting.
                    </p>
                  )}
                </Card>

                {booking?._id ? (
                  <div className="flex justify-center">
                    <SosEmergencyButton
                      tripId={booking._id}
                      bookingStatus={booking.status}
                      className="w-full h-12 text-sm"
                    />
                  </div>
                ) : null}

                {/* Ads in the sheet only once the map is live — before
                    pickup they already sit in the map placeholder. */}
                {showMap ? <AdsCarousel /> : null}

                {/* Safe-area bottom padding */}
                <div className="h-2" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Modals / overlays (logic unchanged) ─── */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => !cancelling && setCancelConfirmOpen(false)}
        onConfirm={handleCancelConfirm}
        title={cancelPreview.tripStarted ? 'Cancel this trip?' : 'Cancel this booking?'}
        description={buildUserCancelConfirmMessage(cancelPreview)}
        confirmLabel="Yes, cancel"
        cancelLabel="Keep booking"
        variant="danger"
        loading={cancelling}
      />

      <PaymentChoiceSheet
        open={isAwaitingPayment && !isPaid}
        onClose={() => { /* sheet only closes via successful payment / status change */ }}
        booking={booking}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

/**
 * Rich trip-detail card shown right under the driver/contact strip.
 * Surfaces the bits the user usually scrolls back up to double-check:
 * service type, duration (hours / days), scheduled pickup time, the
 * car they registered, and the pickup / destination addresses.
 */
function TripDetailsCard({ booking }) {
  const serviceLabel =
    SERVICE_TYPE_LABELS[booking.serviceType] || booking.serviceType || 'Trip';

  const durationLabel = (() => {
    if (booking.hourly?.durationHours) {
      const h = booking.hourly.durationHours;
      return `${h} hour${h > 1 ? 's' : ''}`;
    }
    if (booking.outstation?.days) {
      const d = booking.outstation.days;
      return `${d} day${d > 1 ? 's' : ''}`;
    }
    return null;
  })();

  const scheduledAt =
    booking.hourly?.scheduledStartAt ||
    booking.outstation?.startDate ||
    booking.timeline?.scheduledFor ||
    null;
  const scheduledLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : null;

  const car = booking.carId || booking.car;
  const carLabel = (() => {
    if (!car) return null;
    const parts = [car.brandName || car.brand, car.modelName || car.model]
      .filter(Boolean)
      .join(' ');
    const plate = car.registrationNumber || car.numberPlate;
    if (parts && plate) return `${parts} · ${plate}`;
    return parts || plate || null;
  })();

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Trip details</h3>
        <span className="text-[11px] font-semibold uppercase tracking-wide bg-primary/10 text-primary-dark px-2 py-0.5 rounded-full">
          {serviceLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {durationLabel && (
          <DetailTile
            icon={<Clock className="w-4 h-4 text-primary-dark" />}
            label="Duration"
            value={durationLabel}
          />
        )}
        {scheduledLabel && (
          <DetailTile
            icon={<Calendar className="w-4 h-4 text-primary-dark" />}
            label="Scheduled"
            value={scheduledLabel}
          />
        )}
        {carLabel && (
          <DetailTile
            icon={<Car className="w-4 h-4 text-primary-dark" />}
            label="Your car"
            value={carLabel}
            full={!durationLabel || !scheduledLabel}
          />
        )}
      </div>

      <div className="border-t border-border-light pt-3 space-y-3">
        <div className="flex items-start gap-3">
          <MapPin className="w-4 h-4 text-success mt-1 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-text-muted">Pickup</p>
            <p className="text-sm font-medium text-text break-words">
              {booking.pickup?.address}
            </p>
          </div>
        </div>
        {booking.outstation?.destinationAddress && (
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-danger mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-text-muted">Destination</p>
              <p className="text-sm font-medium text-text break-words">
                {booking.outstation.destinationAddress}
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function DetailTile({ icon, label, value, full }) {
  return (
    <div
      className={`rounded-xl bg-gray-50 border border-border-light px-3 py-2 ${full ? 'col-span-2' : ''
        }`}
    >
      <div className="flex items-center gap-2 mb-0.5">
        {icon}
        <p className="text-[11px] text-text-muted">{label}</p>
      </div>
      <p className="text-sm font-semibold text-text break-words">{value}</p>
    </div>
  );
}

function paymentSummary({ isPaid, isAwaitingPayment, total, payNowAmount }) {
  const t = roundMoney(total);
  const due = roundMoney(payNowAmount);
  if (isPaid && due <= 0) return `Paid · ₹${t.toFixed(2)}`;
  if (isPaid && due > 0) return `Extra due · ₹${due.toFixed(2)}`;
  if (isAwaitingPayment) return `Awaiting payment · ₹${due.toFixed(2)}`;
  return `Total · ₹${t.toFixed(2)}`;
}

/**
 * Persistent CTA chip that nudges the customer back to finish an
 * extension they dismissed mid-handshake. Hides itself the moment the
 * modal opens so the user only sees one entry point at a time.
 *
 *   pending_otp     → "Driver shared a code · Continue"
 *   pending_payment → "Extension ready · Pay ₹X"
 *
 * Primary tap → reopen the modal at the right step.
 * Secondary tap → cancel server-side and reopen at the hours picker
 * so the customer can pick a different duration.
 */
function PendingExtensionBanner({ extension, onResume, onChangeHours }) {
  const isPay = extension?.status === 'pending_payment';
  // Outstation extensions store `additionalDays`; hourly stores
  // `additionalHours`. Pick whichever is populated so the banner copy
  // is correct on both flows.
  const additionalDays = Number(extension?.additionalDays) || 0;
  const additionalHours = Number(extension?.additionalHours) || 0;
  const amountLabel = additionalDays > 0
    ? `+${additionalDays}d`
    : `+${formatExtensionHours(additionalHours)}`;
  return (
    <div className="relative z-20 px-3 pb-2 pointer-events-auto">
      <div
        className={`rounded-2xl shadow-xl border px-3 py-2.5 flex items-center gap-3 ${
          isPay
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isPay ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[12px] font-bold ${
              isPay ? 'text-emerald-900' : 'text-amber-900'
            }`}
          >
            {isPay
              ? `Extension ready · Pay \u20B9${extension.fareDelta}`
              : 'Driver shared a code · Enter to continue'}
          </p>
          <p
            className={`text-[10px] leading-tight ${
              isPay ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {isPay
              ? `OTP verified for ${amountLabel}. Tap to pay or change.`
              : `${amountLabel} queued. Ask your driver for the code.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onResume}
          className={`text-[11px] font-bold px-3 h-8 rounded-xl shrink-0 ${
            isPay
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {isPay ? 'Pay' : 'Open'}
        </button>
        {onChangeHours && (
          <button
            type="button"
            onClick={onChangeHours}
            aria-label="Change duration"
            title="Change duration"
            className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center bg-white border ${
              isPay
                ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default DriverAssignedPage;
