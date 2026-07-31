import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { useFirebaseDriverLocations } from '../../../../hooks/useFirebaseDriverLocations';
import { useFareEstimate } from '../hooks/useFareEstimate';
import { useRideTimer } from '../hooks/useRideTimer';
import { S2C_EVENTS, C2S_EVENTS } from '../../../../constants/socketEvents';
import {
  BOOKING_STATUS,
  BOOKING_PAYMENT_STATUS,
  isBookingContactRevealed,
} from '../../../../constants/bookingStatus';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { haversineMeters, formatDistance } from '../../../../utils/geo';
import { maskPersonName } from '../../../../utils/formatters';
import useBookingDraftStore from '../../../../store/user/useBookingDraftStore';
import PaymentChoiceSheet from '../components/PaymentChoiceSheet';
import RideStartOtpCard from '../components/RideStartOtpCard';
import ExtendRideModal from '../components/ExtendRideModal';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import {
  previewUserCancellation,
  buildUserCancelConfirmMessage,
} from '../utils/cancellationPreview';
import SosEmergencyButton from '../../tracking/components/SosEmergencyButton';

/** How long the full-size map is shown before it auto-shrinks to the
 * floating preview card. Tuned for "long enough to glance at the driver,
 * short enough to surface promos quickly". */
const MAP_AUTO_COLLAPSE_MS = 7000;

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
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchById = useUserActiveBookingStore((s) => s.fetchById);
  const refreshCurrentOrActive = useUserActiveBookingStore(
    (s) => s.refreshCurrentOrActive,
  );
  const applyUpdate = useUserActiveBookingStore((s) => s.applyUpdate);
  const cancelBooking = useUserActiveBookingStore((s) => s.cancelBooking);
  const initiateExtension = useUserActiveBookingStore((s) => s.initiateExtension);
  const verifyExtensionOtp = useUserActiveBookingStore((s) => s.verifyExtensionOtp);
  const payExtension = useUserActiveBookingStore((s) => s.payExtension);
  const cancelExtension = useUserActiveBookingStore((s) => s.cancelExtension);
  const draftReset = useBookingDraftStore((s) => s.reset);
  const fetchWallet = useUserWalletStore((s) => s.fetchWallet);
  const wallet = useUserWalletStore((s) => s.wallet);
  const { emit, isConnected } = useSocket();

  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  // Whether the user has already dismissed the extension prompt for the
  // current "you're past the booked time" window. Reset every time a new
  // extension lands (so the next overflow can prompt again).
  const [extensionPromptOpen, setExtensionPromptOpen] = useState(false);
  const [extensionPromptDismissedAt, setExtensionPromptDismissedAt] = useState(null);

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

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    applyUpdate(payload);
    // Contact details are only returned after the driver arrives — refetch
    // so phone/call CTAs appear without a manual refresh.
    if (payload?.status && isBookingContactRevealed(payload.status)) {
      const current = useUserActiveBookingStore.getState().booking;
      const hasPhone =
        current?.driverId &&
        typeof current.driverId === 'object' &&
        (current.driverId.phone_no || current.driverId.phone);
      if (!hasPhone) {
        refreshCurrentOrActive?.().catch(() => {});
      }
    }
  });

  // Driver hit Dismiss on the OTP banner. We need to:
  //   1. Tell the customer in plain English (toast).
  //   2. Stamp `extensionRejection` so the open ExtendRideModal can
  //      show an inline "Driver couldn't accept this — try again"
  //      state, with the same `extensionId` that was just declined.
  //   3. Let `applyUpdate` (via the BOOKING_UPDATED echo the server
  //      also emits) refresh the booking so the pending row is no
  //      longer pending and the sticky banner falls away.
  const [extensionRejection, setExtensionRejection] = useState(null);
  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_RESOLVED, (payload) => {
    if (payload?.stage !== 'dismissed_by_driver') return;
    if (booking?._id && String(booking._id) !== String(payload.bookingId)) return;
    setExtensionRejection({
      extensionId: payload.extensionId,
      additionalHours: payload.additionalHours,
      fareDelta: payload.fareDelta,
      at: Date.now(),
    });
    toast.error(
      'Driver dismissed this extension. You can try again.',
      { duration: 5000 },
    );
    // Force-refresh the booking — the BOOKING_UPDATED echo handles
    // it too, but pulling explicitly avoids a flicker where the
    // sticky banner briefly shows a now-declined row.
    refreshCurrentOrActive?.().catch(() => {});
    // Reopen the modal so the customer immediately sees the
    // dismissed state + Retry CTA. If they don't want to retry,
    // closing the modal is one tap. This is friendlier than leaving
    // them with just a toast.
    setExtensionPromptDismissedAt(null);
    setExtensionPromptOpen(true);
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

  // No-show prompt: backend pings us when the driver has been at the
  // pickup past the free-wait window and the user hasn't shown up. The
  // modal renders a server-anchored deadline countdown. Cadence is:
  //   prompt 1 → user says yes → prompt 2 → … → prompt N+1 (final) →
  //   grace → auto-complete. `isFinal: true` switches the copy to a
  //   terminal warning since a "yes" no longer resets the cycle.
  const [noShowPrompt, setNoShowPrompt] = useState(null);
  useSocketEvent(S2C_EVENTS.BOOKING_NOSHOW_PROMPT, (payload) => {
    if (!payload?.bookingId) return;
    if (booking?._id && String(booking._id) !== String(payload.bookingId)) {
      return;
    }
    setNoShowPrompt({
      promptDeadlineAt: payload.promptDeadlineAt,
      graceMinutes: payload.graceMinutes,
      promptIndex: payload.promptIndex,
      maxPrompts: payload.maxPrompts,
      isFinal: !!payload.isFinal,
    });
  });
  // Re-attach the prompt on page reload — backend already stamped the
  // booking with `noShow.promptDeadlineAt` so we can rehydrate the
  // modal without waiting for a fresh socket event.
  useEffect(() => {
    const deadline = booking?.noShow?.promptDeadlineAt;
    const response = booking?.noShow?.customerResponse;
    if (!deadline || response) {
      // Customer already answered → hide.
      if (response && noShowPrompt) setNoShowPrompt(null);
      return;
    }
    const remaining = new Date(deadline).getTime() - Date.now();
    if (remaining <= 0) {
      // Deadline already passed; backend will auto-complete momentarily.
      setNoShowPrompt(null);
      return;
    }
    if (!noShowPrompt) {
      const firedFor = Number(booking?.noShow?.firedFor || 0);
      setNoShowPrompt({
        promptDeadlineAt: deadline,
        graceMinutes: null,
        promptIndex: firedFor || null,
        maxPrompts: null,
        // Without the live payload we can't tell isFinal for sure;
        // the modal copy degrades gracefully (no terminal warning).
        isFinal: false,
      });
    }
  }, [booking?.noShow?.promptDeadlineAt, booking?.noShow?.customerResponse, booking?.noShow?.firedFor]);

  const respondToNoShow = useUserActiveBookingStore((s) => s.respondToNoShow);
  const handleNoShowAnswer = async (answer) => {
    try {
      await respondToNoShow(answer);
      setNoShowPrompt(null);
      if (answer === 'on_my_way') {
        toast.success('Thanks — we let your driver know.');
      } else {
        toast('Trip closed out. Driver has been paid for waiting.', {
          icon: '\u26A0\uFE0F',
        });
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not send response',
      );
    }
  };

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
      // Cancellation refund (wallet) settles on the backend the moment
      // the booking flips — pull a fresh wallet snapshot so the home /
      // wallet pages render the new balance without a manual refresh.
      fetchWallet().catch(() => { });
      draftReset();
      navigate('/user/home', { replace: true });
    }
    if (bookingStatus === BOOKING_STATUS.COMPLETED) {
      // Route to the post-trip rating + invoice flow rather than home
      // so the customer is prompted to rate the driver. The trip
      // summary page lives at `/user/tracking/completed` and links to
      // `/user/tracking/rate`. We keep the active booking around so
      // those screens can hydrate from the store.
      draftReset();
      navigate('/user/tracking/completed', { replace: true });
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
  }, [bookingStatus, cancellationReason, refundSummary, navigate, draftReset, fetchWallet]);

  const driver = booking?.driverId;
  const driverId = typeof driver === 'object' ? driver?._id : driver;

  // Live driver location via Firebase (Phase 3 pipeline).
  const { map: firebaseMap, disabled: firebaseDisabled } = useFirebaseDriverLocations();
  const liveDriver = driverId ? firebaseMap[String(driverId)] : null;

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

  // Pull the extra-hour rate from the live pricing service so the extension
  // modal can quote a realistic number before the user commits.
  const fareEstimatePayload = useMemo(() => {
    if (!booking || booking.serviceType !== SERVICE_TYPES.HOURLY) return null;
    return {
      serviceType: booking.serviceType,
      bookedHours: booking.hourly?.durationHours,
      slabId: booking.hourly?.slabId || undefined,
      scheduledAt: booking.hourly?.scheduledStartAt,
    };
  }, [booking]);
  const { estimate: liveEstimate } = useFareEstimate(fareEstimatePayload);
  const extraHourRate = useMemo(() => {
    const bd = liveEstimate?.fareBreakdown || booking?.fareSnapshot?.breakdown || {};
    // Pricing engine exposes the rate as part of the hourly breakdown only
    // when an extra hour was charged. Fall back to the configured rate when
    // present, otherwise approximate as base-fare / bookedHours.
    if (bd.extraHourCharge && bd.extraHours) {
      return Math.round(bd.extraHourCharge / bd.extraHours);
    }
    if (bd.packagePrice && booking?.hourly?.durationHours) {
      return Math.round(bd.packagePrice / booking.hourly.durationHours);
    }
    return 0;
  }, [liveEstimate, booking]);

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

  // Open the extension prompt as soon as we cross the lead-time threshold
  // — but never more than once per dismissal window. The user can also tap
  // the persistent "Extend ride" pill from the trip card.
  useEffect(() => {
    if (!rideTimer.shouldPromptExtension) return;
    if (extensionPromptOpen) return;
    if (extensionPromptDismissedAt && Date.now() - extensionPromptDismissedAt < 60_000) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical timer trigger
    setExtensionPromptOpen(true);
  }, [rideTimer.shouldPromptExtension, extensionPromptOpen, extensionPromptDismissedAt]);

  // Pick the most recent extension still in a handshake state. This is
  // what powers both the modal's resume-on-open and the sticky banner
  // that nudges the customer back to finish payment when they close
  // the modal mid-flow.
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

  // Auto-reopen the modal the instant a pending_payment lands and the
  // sheet isn't already up — covers the "user closed it but the OTP is
  // already burned" case so the next render brings them straight to Pay.
  useEffect(() => {
    if (!pendingExtension) return;
    if (extensionPromptOpen) return;
    if (pendingExtension.status !== 'pending_payment') return;
    // Respect the recent-dismissal cooldown so a stubborn user isn't
    // re-prompted constantly. The sticky banner below stays visible the
    // whole time so they can come back when they're ready.
    if (extensionPromptDismissedAt && Date.now() - extensionPromptDismissedAt < 30_000) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot resume
    setExtensionPromptOpen(true);
  }, [pendingExtension, extensionPromptOpen, extensionPromptDismissedAt]);

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
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [mapLocked, setMapLocked] = useState(false);

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
  const total = baseTotal + extensionsTotal;
  const amountPaid = booking.payment?.amountPaidRupees || 0;
  const payNowAmount = Math.max(0, total - amountPaid);

  const view = STATUS_VIEW[booking.status] || STATUS_VIEW[BOOKING_STATUS.DRIVER_ASSIGNED];
  const isTripStarted = booking.status === BOOKING_STATUS.STARTED;
  const rawDriverName = driver?.name || 'Driver';
  const displayDriverName = isTripStarted
    ? rawDriverName
    : maskPersonName(rawDriverName) || 'Driver';
  // Map is shown for every post-acceptance phase, including STARTED.
  // The destination/route during STARTED is determined below by
  // `mapAnchor` (driver→dropoff if we have a dropoff, otherwise the
  // pickup so the camera still has a stable anchor for hourly rides).
  const mapAnchor = isTripStarted ? dropoffPoint || pickupPoint : pickupPoint;
  const showMap = !!mapAnchor;

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
          style={{ pointerEvents: mapLocked ? 'none' : 'auto' }}
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
            followDriver={isTripStarted}
            bookingStatus={booking.status}
          />
        </div>
      ) : (
        /* Fallback gradient when coordinates are missing. */
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
            setExtensionPromptDismissedAt(null);
            setExtensionPromptOpen(true);
          }}
          onChangeHours={async () => {
            try {
              await cancelExtension({ extensionId: pendingExtension._id });
              setExtensionPromptDismissedAt(null);
              setExtensionPromptOpen(true);
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
                  {'\u20B9'}{total}
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
                      (driver?.phone_no || driver?.phone)) && (
                      <div className="px-5 py-3 border-t border-gray-100">
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
                      </div>
                    )}
                    {driver && !isBookingContactRevealed(booking) && (
                      <div className="px-5 py-3 border-t border-gray-100">
                        <p className="text-xs text-center text-gray-500">
                          Driver contact unlocks after they arrive at pickup
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Trip details card */}
                <TripDetailsCard booking={booking} />

                {/* In-ride duration tracker (hourly) */}
                {rideTimer.isStarted && rideTimer.scheduledEndAt && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-primary-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-muted">
                          {rideTimer.remainingSeconds >= 0 ? 'Time remaining' : 'Over booked duration'}
                        </p>
                        <p className={`text-base font-bold ${rideTimer.remainingSeconds < 0 ? 'text-danger' : 'text-text'}`}>
                          {formatRideClock(Math.abs(rideTimer.remainingSeconds))}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setExtensionPromptOpen(true)}>
                        Extend ride
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Outstation extension entry — visible only while the
                    trip is STARTED. Outstation runs for days, so we
                    surface a persistent "Extend trip" card rather than
                    auto-prompting near a timer threshold. The same
                    ExtendRideModal flow handles the OTP handshake. */}
                {isOutstationBooking
                  && booking.status === BOOKING_STATUS.STARTED
                  && outstationPerDayRate > 0 && (
                  <Card>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-primary-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-muted">
                          Need more time on the road?
                        </p>
                        <p className="text-sm font-semibold text-text">
                          ~₹{outstationPerDayRate}/day for extra days
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setExtensionPromptOpen(true)}>
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

                {/* Ads sit below SOS so emergency CTA stays above promos */}
                <AdsCarousel />

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

      <ExtendRideModal
        open={extensionPromptOpen}
        onClose={() => {
          setExtensionPromptOpen(false);
          setExtensionPromptDismissedAt(Date.now());
          // Refresh wallet on close so the next time the user re-opens
          // the modal (or browses to their wallet) they see the up-to-
          // date held / available amounts.
          fetchWallet().catch(() => {});
        }}
        onInitiate={(amount) => initiateExtension(amount)}
        onVerifyOtp={(args) => verifyExtensionOtp(args)}
        onPay={async (args) => {
          const result = await payExtension(args);
          // Wallet just took a debit — sync the global wallet snapshot
          // so the home / wallet pages don't show stale numbers.
          fetchWallet().catch(() => {});
          return result;
        }}
        onCancelExtension={async (args) => {
          await cancelExtension(args);
          // The cancel updates the booking server-side and the patch
          // arrives via socket; pulling wallet too is defensive.
          fetchWallet().catch(() => {});
        }}
        pendingExtension={pendingExtension}
        extensionRejection={extensionRejection}
        onClearRejection={() => setExtensionRejection(null)}
        onWalletRefresh={() => fetchWallet().catch(() => {})}
        extraHourRate={extraHourRate}
        walletBalance={
          wallet?.availableRupees != null
            ? Number(wallet.availableRupees)
            : Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.heldRupees || 0))
        }
        remainingMinutes={
          rideTimer.remainingSeconds != null
            ? Math.ceil(rideTimer.remainingSeconds / 60)
            : 0
        }
        minHours={1}
        maxHours={8}
        unit={isOutstationBooking ? 'days' : 'hours'}
        perDayRate={outstationPerDayRate}
        minDays={1}
        maxDays={14}
      />

      <NoShowPromptModal
        open={Boolean(noShowPrompt)}
        deadline={noShowPrompt?.promptDeadlineAt}
        promptIndex={noShowPrompt?.promptIndex}
        maxPrompts={noShowPrompt?.maxPrompts}
        isFinal={noShowPrompt?.isFinal}
        onYes={() => handleNoShowAnswer('on_my_way')}
        onNo={() => handleNoShowAnswer('not_coming')}
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
  // `total` here already includes accepted extensions; `payNowAmount`
  // already subtracts whatever the user has paid so far. Together they
  // give the user a single honest number on every status.
  if (isPaid && payNowAmount <= 0) return `Paid · ₹${total}`;
  if (isPaid && payNowAmount > 0) return `Extra due · ₹${payNowAmount}`;
  if (isAwaitingPayment) return `Awaiting payment · ₹${payNowAmount}`;
  return `Total · ₹${total}`;
}

/**
 * `MM:SS` formatter used by the in-ride duration card. Anything past one
 * hour switches to `Hh MMm` so the digits don't get unwieldy.
 */
function formatRideClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * "Are you coming?" modal. Fires when the driver has been at the
 * pickup past the no-show prompt minutes. Shows a live countdown to
 * the auto-complete deadline so the customer understands the
 * urgency, and forces an explicit Yes / No answer (no overlay-click
 * dismiss — silence is what triggers auto-complete).
 */
function NoShowPromptModal({
  open,
  deadline,
  promptIndex,
  maxPrompts,
  isFinal,
  onYes,
  onNo,
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  const remainingMs = deadline
    ? Math.max(0, new Date(deadline).getTime() - now)
    : null;
  const remainingSec = remainingMs != null ? Math.floor(remainingMs / 1000) : null;
  const m = remainingSec != null ? Math.floor(remainingSec / 60) : null;
  const s = remainingSec != null ? remainingSec % 60 : null;
  const countdown =
    remainingSec != null
      ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : '—';

  // The final prompt is terminal — saying yes no longer resets the
  // cycle, so we swap to a warning theme and reword the copy.
  //
  // Clamp the displayed index so a misbehaving (or pre-fix) backend
  // never shows a nonsensical "Reminder 5 of 3". Any prompt beyond the
  // final one is rendered as the final.
  const showProgress = Number.isFinite(promptIndex) && Number.isFinite(maxPrompts);
  const totalPrompts = showProgress ? Number(maxPrompts) + 1 : null;
  const displayIndex = showProgress
    ? Math.min(Number(promptIndex), totalPrompts)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isFinal ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <Clock className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-text">
              {isFinal ? 'Last reminder — are you coming?' : 'Are you on your way?'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {showProgress
                ? `Reminder ${displayIndex} of ${totalPrompts}`
                : 'Your driver has been waiting at the pickup.'}
            </p>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-snug">
          {isFinal
            ? `If you don't respond in time, the trip will be auto-closed as a no-show. The driver gets paid in full and the waiting time is deducted from your refundable buffer.`
            : `Tap "Yes" to keep your ride. If you don't respond, we'll check in again. After ${(maxPrompts != null ? maxPrompts : 'a few')} reminders the ride is auto-closed.`}
        </p>
        {remainingSec != null && (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 flex items-center justify-between ${
              isFinal
                ? 'bg-red-50 border border-red-200'
                : 'bg-amber-50 border border-amber-200'
            }`}
          >
            <span
              className={`text-xs font-medium ${
                isFinal ? 'text-red-800' : 'text-amber-800'
              }`}
            >
              {isFinal ? 'Auto-close in' : 'Next reminder in'}
            </span>
            <span
              className={`text-xl font-bold tabular-nums ${
                isFinal ? 'text-red-700' : 'text-amber-700'
              }`}
            >
              {countdown}
            </span>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" onClick={onYes} className="w-full">
            Yes, I&rsquo;m on my way
          </Button>
          <Button variant="ghost" onClick={onNo} className="w-full">
            No, I&rsquo;m not coming
          </Button>
        </div>
      </div>
    </div>
  );
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
    : `+${additionalHours}h`;
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
            aria-label="Change hours"
            title="Change hours"
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
