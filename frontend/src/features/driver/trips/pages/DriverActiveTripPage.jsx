import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CalendarClock,
  Car as CarIcon,
  CheckCircle2,
  Clock,
  Flag,
  Fuel,
  Loader2,
  MapPin,
  PlayCircle,
  Route,
  Settings2,
  XCircle,
  Zap,
  CreditCard,
  Wallet as WalletIcon,
  Phone,
  Mail,
  Navigation,
  ShieldCheck,
} from 'lucide-react';
import {
  BOOKING_STATUS,
  BOOKING_TYPE,
  PAYMENT_POLICY,
  SCHEDULED_BOOKING,
  isBookingContactRevealed,
} from '../../../../constants/bookingStatus';
import Card from '../../../../components/Card';
import Badge from '../../../../components/Badge';
import Button from '../../../../components/Button';
import Avatar from '../../../../components/Avatar';
import TripTrackingMap from '../../../../components/maps/TripTrackingMap';
import StartRideOtpSheet from '../components/StartRideOtpSheet';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import { useSocket, useSocketEvent } from '../../../../hooks/useSocket';
import { useDriverLocationStatus } from '../../../../hooks/useDriverLocation';
import useDriverActiveTripStore, {
  invalidateDriverDashboardCaches,
} from '../../../../store/driver/useDriverActiveTripStore';
import useDriverIncomingOfferStore from '../../../../store/driver/useDriverIncomingOfferStore';
import { S2C_EVENTS, C2S_EVENTS } from '../../../../constants/socketEvents';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';
import { isOutstationOvertimePastGrace } from '../../../user/booking/hooks/useRideTimer';
import { formatDistance, haversineMeters } from '../../../../utils/geo';
import { formatExtensionHours, maskPersonName } from '../../../../utils/formatters';
import { formatLocationLabel } from '../../../../utils/locationLabel';
import { previewDriverCancellation } from '../../../user/booking/utils/cancellationPreview';
import SosEmergencyButton from '../../../user/tracking/components/SosEmergencyButton';
import TripChatEntry from '../../../../components/chat/TripChatEntry';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';
import { isChatVisibleForBooking } from '../../../../constants/chat';
import { openExternalUrl } from '../../../../utils/openExternalUrl';

/**
 * Driver-side counterpart of `DriverAssignedPage` — one screen that adapts
 * to every post-accept booking status (`driver_assigned` →
 * `awaiting_payment` → `en_route` → `arrived` → `started` → `completed`).
 *
 * The page hydrates once via REST (so deep links and refreshes work) and
 * then patches itself from the `BOOKING_UPDATED` socket event. The next-
 * step CTA is derived from `booking.status` so adding a new transition
 * only requires a new entry in `NEXT_ACTION_BY_STATUS`.
 */

/**
 * Maximum distance (metres) between the driver and the pickup at which
 * the "I have arrived" CTA is enabled. Mirrors `ARRIVAL_PROXIMITY_METERS`
 * on the backend (kept in sync by hand).
 */
const ARRIVAL_PROXIMITY_METERS = 100;

/**
 * Per-status header + CTA. Drivers never see anything payment-related;
 * `AWAITING_PAYMENT` collapses to a neutral "customer is getting ready"
 * line so the driver can't deduce whether the customer is paying upfront
 * or after the ride.
 */
const NEXT_ACTION_BY_STATUS = {
  [BOOKING_STATUS.DRIVER_ASSIGNED]: {
    title: 'Driver assigned',
    subtitle: 'Start when you\u2019re ready to head to the pickup.',
    cta: { label: 'Start to pickup', icon: Route, action: 'markEnRoute' },
    canCancel: true,
  },
  [BOOKING_STATUS.AWAITING_PAYMENT]: {
    title: 'Waiting on customer payment',
    subtitle:
      'The customer is completing payment. You\u2019ll be able to head out as soon as it lands.',
    cta: null,
    canCancel: true,
  },
  [BOOKING_STATUS.EN_ROUTE]: {
    title: 'Heading to pickup',
    subtitle: 'Mark arrival once you\u2019ve reached the pickup location.',
    cta: { label: "I've arrived", icon: Flag, action: 'markArrived' },
    canCancel: true,
  },
  [BOOKING_STATUS.ARRIVED]: {
    title: 'At pickup',
    subtitle: 'Ask the customer for their 4-digit ride code, then start the trip.',
    cta: { label: 'Enter start OTP', icon: PlayCircle, action: 'startTrip' },
    canCancel: true,
  },
  [BOOKING_STATUS.STARTED]: {
    title: 'Trip in progress',
    subtitle: 'Drive safe. Mark complete when the booked duration is over.',
    cta: { label: 'Complete trip', icon: CheckCircle2, action: 'completeTrip' },
    // Instant rides: cancel is hidden once STARTED (see config memo).
    // Scheduled / outstation keep mid-trip cancel gated by pickup time.
    canCancel: true,
  },
};

const ACTIVE_STATUSES_ON_PAGE = Object.keys(NEXT_ACTION_BY_STATUS);

/** Statuses on which it makes sense to show the live tracking map. */
const STATUSES_WITH_MAP = [
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
];

const DriverActiveTripPage = () => {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { emit, isConnected } = useSocket();
  const driverAuth = useDriverAuthStore((s) => s.driver);

  const booking = useDriverActiveTripStore((s) => s.booking);
  const loading = useDriverActiveTripStore((s) => s.loading);
  const busy = useDriverActiveTripStore((s) => s.busy);
  const error = useDriverActiveTripStore((s) => s.error);
  const fetchById = useDriverActiveTripStore((s) => s.fetchById);
  const fetchActive = useDriverActiveTripStore((s) => s.fetchActive);
  const applyUpdate = useDriverActiveTripStore((s) => s.applyUpdate);
  const clear = useDriverActiveTripStore((s) => s.clear);
  const dismissExtension = useDriverActiveTripStore((s) => s.dismissExtension);

  // When the trip completes/cancels, also clear the incoming-offer store's
  // `activeBooking` mirror so the rest of the driver app sees a clean slate.
  const clearOfferStoreActive = useDriverIncomingOfferStore(
    (s) => s.clearActiveBooking,
  );

  // Hydrate: prefer the route id (so refreshes and deep links work) and
  // fall back to "the driver's currently active booking" if the route id
  // is missing or stale.
  useEffect(() => {
    if (routeId) {
      fetchById(routeId).catch(() => {
        // Maybe the id is wrong or the trip is already over — try /active.
        fetchActive().catch(() => { });
      });
    } else {
      fetchActive().catch(() => { });
    }
  }, [routeId, fetchById, fetchActive]);

  // Live patches.
  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    applyUpdate(payload);
    const current = useDriverActiveTripStore.getState().booking;
    const nextStatus = payload?.status || current?.status;
    if (
      nextStatus
      && isBookingContactRevealed({ ...current, status: nextStatus })
    ) {
      const hasPhone =
        current?.userId
        && typeof current.userId === 'object'
        && (current.userId.phone_no || current.userId.phone);
      if (!hasPhone && current?._id) {
        fetchById(current._id).catch(() => {});
      }
    }
  });

  // Extension OTP banner — the customer hit "extend" in their app. We
  // show them the 4-digit code so they can read it back to the customer
  // (mirrors the ride-start OTP flow). Local state because this is
  // ephemeral, transient UI that fades when the customer pays.
  const [extensionOtpBanner, setExtensionOtpBanner] = useState(null);
  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_OTP, (payload) => {
    if (!payload?.otp) return;
    setExtensionOtpBanner({
      bookingId: payload.bookingId,
      extensionId: payload.extensionId,
      otp: String(payload.otp),
      additionalHours: payload.additionalHours,
      additionalDays: Number(payload.additionalDays) || 0,
      serviceType: payload.serviceType || null,
      driverEarning: Number(payload.driverEarning) || 0,
      expiresAt: payload.expiresAt
        ? new Date(payload.expiresAt).getTime()
        : Date.now() + 5 * 60 * 1000,
      stage: 'otp', // 'otp' → 'verified' → 'paid'
    });
  });

  // Lifecycle updates for an in-flight extension:
  //   - 'otp_verified' → customer typed the code; flip banner to amber
  //     "waiting for payment".
  //   - 'cancelled'    → customer abandoned the extension (closed the
  //     modal + chose "Change hours" or the OTP window expired). We
  //     drop the banner immediately so the driver isn't stuck reading
  //     a stale code that no longer works.
  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_RESOLVED, (payload) => {
    if (!payload) return;
    if (payload.stage === 'otp_verified') {
      setExtensionOtpBanner((b) =>
        b && String(b.extensionId) === String(payload.extensionId)
          ? { ...b, stage: 'verified' }
          : b,
      );
      return;
    }
    if (payload.stage === 'cancelled' || payload.stage === 'dismissed_by_driver') {
      // 'cancelled'           → customer abandoned via "Change hours".
      // 'dismissed_by_driver' → this driver (possibly on another
      //                          device) hit Dismiss; echo clears
      //                          the banner everywhere.
      setExtensionOtpBanner((b) =>
        b && String(b.extensionId) === String(payload.extensionId) ? null : b,
      );
    }
  });

  // Customer paid → mark banner as paid then drop it after a beat.
  useSocketEvent(S2C_EVENTS.BOOKING_EXTENSION_PAID, (payload) => {
    setExtensionOtpBanner((b) => {
      if (!b || String(b.extensionId) !== String(payload?.extension?._id || '')) return b;
      return { ...b, stage: 'paid' };
    });
    // Re-fetch booking so the driver UI gets the longer trip clock.
    if (payload?.bookingId) {
      fetchById(payload.bookingId).catch(() => { });
    }
    setTimeout(() => setExtensionOtpBanner(null), 2500);
  });

  // Auto-dismiss expired banners so a stale OTP doesn't linger.
  useEffect(() => {
    if (!extensionOtpBanner?.expiresAt) return undefined;
    const ms = extensionOtpBanner.expiresAt - Date.now();
    if (ms <= 0) {
      setExtensionOtpBanner(null);
      return undefined;
    }
    const t = setTimeout(() => setExtensionOtpBanner(null), ms);
    return () => clearTimeout(t);
  }, [extensionOtpBanner?.expiresAt]);

  // Join the booking room — same pattern as the user side. The driver
  // receives the same room broadcasts as the user, which is useful for
  // Phase 5 (ETA, location, chat).
  useEffect(() => {
    const id = booking?._id;
    if (!id || !isConnected) return undefined;
    emit(C2S_EVENTS.BOOKING_JOIN, { bookingId: id });
    return () => emit(C2S_EVENTS.BOOKING_LEAVE, { bookingId: id });
  }, [booking?._id, isConnected, emit]);

  // When the booking reaches a terminal state, leave the page so the
  // driver lands back on the dashboard for their next offer.
  const status = booking?.status;
  const cancellationReason = booking?.cancellation?.reason;
  useEffect(() => {
    if (!status) return;
    if (status === BOOKING_STATUS.COMPLETED) {
      toast.success('Trip completed');
      clearOfferStoreActive();
      invalidateDriverDashboardCaches();
      const id = booking?._id;
      navigate(
        id ? `/driver/trip/rate?bookingId=${id}` : '/driver/home',
        { replace: true },
      );
    } else if (
      status === BOOKING_STATUS.CANCELLED ||
      status === BOOKING_STATUS.NO_DRIVERS_FOUND ||
      status === BOOKING_STATUS.SEARCHING
    ) {
      // Pick the right toast for why this booking ended. The reason
      // string is stamped onto `booking.cancellation` by the backend.
      if (cancellationReason === 'payment_timeout') {
        toast.error(
          'Booking cancelled — customer did not complete payment in time.',
          { duration: 6000 },
        );
      } else if (
        cancellationReason === 'cancelled_by_user' ||
        cancellationReason === 'cancelled_before_payment'
      ) {
        toast('Customer cancelled the ride.', { icon: 'ℹ️', duration: 5000 });
      } else if (cancellationReason === 'cancelled_by_user_after_start') {
        toast('Customer cancelled mid-ride. Cancellation fee applied.', {
          icon: 'ℹ️',
          duration: 6000,
        });
      }
      invalidateDriverDashboardCaches();
      clear();
      clearOfferStoreActive();
      navigate('/driver/home', { replace: true });
    }
  }, [status, cancellationReason, booking?._id, clear, clearOfferStoreActive, navigate]);

  // OTP-entry sheet: opened from the Start CTA when the booking is at
  // ARRIVED. We keep it page-local rather than baking it into the store
  // because it's purely a UI concern.
  const [otpOpen, setOtpOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);

  useEffect(() => {
    if (searchParams.get('chat') === '1') setSheetExpanded(true);
  }, [searchParams]);

  // Live GPS from `DriverLocationBridge` (watchPosition → shared status).
  // Do NOT use one-shot `useGeolocation` here — that froze the polyline
  // after the first fix while the customer map (Firebase) kept updating.
  const { coords: driverCoords } = useDriverLocationStatus();
  const driverPoint = useMemo(
    () => (driverCoords ? { lat: driverCoords.lat, lng: driverCoords.lng } : null),
    [driverCoords],
  );
  // Pickup coordinates from the booking — derived above the early returns
  // so the `useMemo` ordering stays stable on every render. The page's
  // first render has `booking == null`, but the hook still has to fire.
  const pickupCoords = useMemo(() => {
    const c = booking?.pickup?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.pickup]);

  const dropoffCoords = useMemo(() => {
    const c = booking?.dropoff?.location?.coordinates;
    if (!Array.isArray(c) || c.length !== 2) return null;
    return { lat: c[1], lng: c[0] };
  }, [booking?.dropoff]);

  const mapsNav = useMemo(() => {
    // Pickup nav only — hide once the trip OTP is entered (STARTED).
    const headingToPickup =
      status === BOOKING_STATUS.EN_ROUTE
      || status === BOOKING_STATUS.ARRIVED;
    const url = headingToPickup
      ? buildGoogleMapsNavUrl({
          dest: pickupCoords,
          destQuery: booking?.pickup?.address,
          origin: driverPoint,
        })
      : null;
    return { url, label: 'Navigate to pickup', show: headingToPickup };
  }, [
    status,
    pickupCoords,
    driverPoint,
    booking?.pickup?.address,
  ]);

  // Tick a heartbeat once a second so the cancel preview's grace-window
  // recompute (in `previewDriverCancellation`) reflects the live wall
  // clock. Without this the preview is frozen at mount time and the
  // dialog would happily say "no penalty" 30 seconds after the grace
  // window actually expired.
  // The same heartbeat doubles as the source-of-truth re-render trigger
  // for the scheduled "Start to pickup" countdown below.
  const [heartbeat, setHeartbeat] = useState(0);
  useEffect(() => {
    if (!booking) return undefined;
    const id = setInterval(() => setHeartbeat((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [booking?._id]);

  // Resolve the next-action descriptor every render so it tracks the
  // current status without us juggling an effect.
  // Instant: hide cancel once the trip has started.
  // Scheduled/outstation: hide cancel once pickup time has passed.
  const config = useMemo(() => {
    if (!status) return null;
    const base = NEXT_ACTION_BY_STATUS[status];
    if (!base) return null;
    if (!base.canCancel) return base;

    const isInstant =
      !booking?.bookingType || booking.bookingType === BOOKING_TYPE.INSTANT;
    if (isInstant && status === BOOKING_STATUS.STARTED) {
      return { ...base, canCancel: false };
    }

    const isScheduledLike =
      booking?.bookingType === BOOKING_TYPE.SCHEDULED ||
      booking?.bookingType === BOOKING_TYPE.OUTSTATION;
    if (!isScheduledLike) return base;
    const startRaw =
      booking?.hourly?.scheduledStartAt ||
      booking?.outstation?.pickupAt ||
      booking?.outstation?.startDate;
    const startMs = startRaw ? new Date(startRaw).getTime() : NaN;
    if (Number.isFinite(startMs) && Date.now() >= startMs) {
      return { ...base, canCancel: false };
    }
    return base;
  }, [
    status,
    booking?.bookingType,
    booking?.hourly?.scheduledStartAt,
    booking?.outstation?.pickupAt,
    booking?.outstation?.startDate,
    heartbeat,
  ]);

  // Distance from the driver's live position to the pickup. Used to
  // gate the "I've arrived" CTA — both as a UX hint and to feed the
  // server's proximity guard with fresh coords on every request.
  const distanceToPickup = useMemo(() => {
    if (!driverPoint || !pickupCoords) return null;
    return haversineMeters(driverPoint, pickupCoords);
  }, [driverPoint, pickupCoords]);

  const isEnRoute = status === BOOKING_STATUS.EN_ROUTE;
  const arrivalReady =
    isEnRoute &&
    distanceToPickup != null &&
    distanceToPickup <= ARRIVAL_PROXIMITY_METERS;

  // Time gate on every pre-trip CTA (Start to pickup, I have arrived,
  // Start ride). Mirrors backend `assertWithinScheduledLead` /
  // `assertScheduledStartReached`.
  //
  // Lead minutes come from the booking payload (`enRouteLeadMinutes`
  // = live ServicePricing.scheduledDispatch.RIDE_BUFFER_MINUTES) so the
  // FE disable matches the server and we never show a clickable CTA
  // that just 409s.
  // Hourly → scheduledStartAt; outstation → pickupAt (startDate fallback).
  const scheduledStartMs = (() => {
    const src =
      booking?.hourly?.scheduledStartAt ||
      booking?.outstation?.pickupAt ||
      booking?.outstation?.startDate;
    if (!src) return NaN;
    const ms = new Date(src).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  })();
  const enRouteUnlockMinutes = Number.isFinite(Number(booking?.enRouteLeadMinutes))
    ? Number(booking.enRouteLeadMinutes)
    : SCHEDULED_BOOKING.RIDE_BUFFER_MINUTES;
  const minutesUntilPickup = Number.isFinite(scheduledStartMs)
    ? Math.ceil((scheduledStartMs - Date.now()) / 60_000)
    : null;
  // Instant: no time gate on "Start to pickup" — the +15m scheduledStartAt
  // seed is only a dispatch buffer. Scheduled/outstation keep the
  // RIDE_BUFFER unlock window.
  const isScheduledLikeTrip =
    booking?.bookingType === BOOKING_TYPE.SCHEDULED ||
    booking?.bookingType === BOOKING_TYPE.OUTSTATION;
  const enRouteTooEarly =
    status === BOOKING_STATUS.DRIVER_ASSIGNED &&
    isScheduledLikeTrip &&
    Number.isFinite(scheduledStartMs) &&
    minutesUntilPickup != null &&
    minutesUntilPickup > enRouteUnlockMinutes;
  const minutesUntilEnRouteUnlock =
    enRouteTooEarly && minutesUntilPickup != null
      ? Math.max(1, minutesUntilPickup - enRouteUnlockMinutes)
      : null;
  const arrivedTooEarly =
    status === BOOKING_STATUS.EN_ROUTE &&
    isScheduledLikeTrip &&
    Number.isFinite(scheduledStartMs) &&
    minutesUntilPickup != null &&
    minutesUntilPickup > 0;
  const startTooEarly =
    status === BOOKING_STATUS.ARRIVED &&
    isScheduledLikeTrip &&
    Number.isFinite(scheduledStartMs) &&
    minutesUntilPickup != null &&
    minutesUntilPickup > 0;

  // Complete unlocks only after the booked window ends:
  //   hourly     → startedAt + hours (+ paid extensions)
  //   outstation → expectedReturnAt (+ paid extension days)
  // Returns remaining minutes (hourly) or a days-aware label via
  // `completeTooEarlyLabel` for the banner / CTA.
  const completeTooEarlyMinutes = useMemo(() => {
    if (status !== BOOKING_STATUS.STARTED) return null;

    const isOutstation =
      booking?.serviceType === SERVICE_TYPES.OUTSTATION ||
      booking?.bookingType === 'outstation';

    if (isOutstation) {
      const endSrc =
        booking?.outstation?.expectedReturnAt || booking?.outstation?.endDate;
      const endMs = endSrc ? new Date(endSrc).getTime() : NaN;
      if (!Number.isFinite(endMs)) return null;
      const remainingMs = endMs - Date.now();
      if (remainingMs <= 0) return null;
      return Math.max(1, Math.ceil(remainingMs / 60_000));
    }

    const startedAtMs = booking?.timeline?.startedAt
      ? new Date(booking.timeline.startedAt).getTime()
      : NaN;
    const base = Number(booking?.hourly?.durationHours) || 0;
    if (!Number.isFinite(startedAtMs) || base <= 0) return null;
    const extra = (booking?.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.additionalHours) || 0 : 0),
      0,
    );
    const pad = Number(booking?.hourly?.windowPadHours) || 0;
    const remainingMs =
      startedAtMs + (base + extra + pad) * 3_600_000 - Date.now();
    if (remainingMs <= 0) return null;
    return Math.max(1, Math.ceil(remainingMs / 60_000));
  }, [
    status,
    booking?.serviceType,
    booking?.bookingType,
    booking?.outstation?.expectedReturnAt,
    booking?.outstation?.endDate,
    booking?.timeline?.startedAt,
    booking?.hourly?.durationHours,
    booking?.hourly?.windowPadHours,
    booking?.extensions,
    heartbeat,
  ]);

  const overtimePaymentRequired =
    status === BOOKING_STATUS.STARTED
    && Boolean(booking?.overtime?.required)
    && booking?.overtime?.paymentStatus !== 'paid'
    && Number(booking?.overtime?.amountRupees) > 0
    && isOutstationOvertimePastGrace(booking);

  const isOutstationTrip =
    booking?.serviceType === SERVICE_TYPES.OUTSTATION ||
    booking?.bookingType === 'outstation';

  const completeTooEarlyLabel = useMemo(() => {
    if (completeTooEarlyMinutes == null) return null;
    if (!isOutstationTrip) {
      return `about ${completeTooEarlyMinutes} min`;
    }
    const days = Math.floor(completeTooEarlyMinutes / (24 * 60));
    const hours = Math.floor((completeTooEarlyMinutes % (24 * 60)) / 60);
    if (days >= 1) {
      return hours > 0 ? `${days}d ${hours}h` : `${days} day${days === 1 ? '' : 's'}`;
    }
    if (hours >= 1) return `${hours}h`;
    return `about ${completeTooEarlyMinutes} min`;
  }, [completeTooEarlyMinutes, isOutstationTrip]);

  const handleAdvance = useCallback(async () => {
    if (!config?.cta) return;
    const action = config.cta.action;
    if (action === 'markEnRoute' && enRouteTooEarly) {
      toast.error(
        `Pickup is still ${minutesUntilPickup} min away — you can head out within ${enRouteUnlockMinutes} min of the scheduled time.`,
      );
      return;
    }
    if (action === 'markArrived' && arrivedTooEarly) {
      toast.error(
        `Pickup is still ${minutesUntilPickup} min away — you can mark arrival at the scheduled time.`,
      );
      return;
    }
    if (action === 'startTrip' && startTooEarly) {
      toast.error(
        `Pickup is still ${minutesUntilPickup} min away — you can start the ride at the scheduled time.`,
      );
      return;
    }
    if (action === 'completeTrip' && overtimePaymentRequired) {
      toast.error(
        'Please tell the user to make payment of the overdue time. You cannot complete the ride until they pay.',
      );
      return;
    }
    if (action === 'completeTrip' && completeTooEarlyMinutes != null) {
      toast.error(
        `Booked time remaining — you can complete in ${completeTooEarlyLabel}.`,
      );
      return;
    }
    // ARRIVED → opens the OTP entry sheet instead of calling startTrip
    // directly. The sheet itself drives the POST once the driver enters
    // the code the customer reads out.
    if (action === 'startTrip') {
      setOtpOpen(true);
      return;
    }
    if (action === 'markArrived') {
      if (!driverPoint) {
        toast.error('We need your location to confirm arrival. Enable GPS and try again.');
        return;
      }
      if (distanceToPickup == null || distanceToPickup > ARRIVAL_PROXIMITY_METERS) {
        toast.error(
          `You're too far from the pickup (${formatDistance(distanceToPickup || 0)}). Move within ${ARRIVAL_PROXIMITY_METERS} m to mark arrival.`,
        );
        return;
      }
      try {
        await useDriverActiveTripStore.getState().markArrived(driverPoint);
      } catch (err) {
        toast.error(err?.response?.data?.message || err?.message || 'Could not mark arrival');
      }
      return;
    }
    try {
      await useDriverActiveTripStore.getState()[action]();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Something went wrong');
    }
  }, [
    config,
    driverPoint,
    distanceToPickup,
    enRouteTooEarly,
    arrivedTooEarly,
    startTooEarly,
    minutesUntilPickup,
    enRouteUnlockMinutes,
    overtimePaymentRequired,
    completeTooEarlyMinutes,
    completeTooEarlyLabel,
  ]);

  const handleStartWithOtp = useCallback(
    (otp) => useDriverActiveTripStore.getState().startTrip(otp),
    [],
  );

  const handleCancel = useCallback(() => {
    if (!config?.canCancel) return;
    setCancelOpen(true);
  }, [config]);

  // Live cancellation preview — recomputes every render (cheap pure
  // function) so the wall-clock heartbeat above drives the copy.
  const cancelPreview = previewDriverCancellation(booking);

  const handleCancelConfirm = useCallback(async () => {
    setCancelling(true);
    const penalty = Number(cancelPreview.driverPenalty) || 0;
    const chancesBefore = Number(cancelPreview.chance?.chancesLeft) || 0;
    try {
      await useDriverActiveTripStore.getState().cancelTrip('cancelled_by_driver');
      if (penalty > 0) {
        toast(`\u20B9${penalty} deducted from your wallet.`, { icon: '\u26A0\uFE0F' });
      } else {
        const left = Math.max(0, chancesBefore - 1);
        toast.success(
          left > 0
            ? `Trip cancelled \u00B7 ${left} free cancel${left === 1 ? '' : 's'} left today`
            : 'Trip cancelled \u00B7 no free cancels left today',
        );
      }
      setCancelOpen(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not cancel');
    } finally {
      setCancelling(false);
    }
  }, [cancelPreview]);

  if (loading && !booking) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg min-h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg min-h-dvh px-6 text-center gap-3">
        <XCircle className="w-10 h-10 text-text-muted" />
        <h2 className="text-base font-bold text-text">No active trip</h2>
        <p className="text-sm text-text-muted max-w-xs">
          {error || 'You don\u2019t have a booking in progress right now. New offers will appear here.'}
        </p>
        <Button variant="secondary" onClick={() => navigate('/driver/home')}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  // Trip already completed/cancelled but the navigation effect hasn't
  // fired yet — render nothing to avoid a flash.
  if (!ACTIVE_STATUSES_ON_PAGE.includes(booking.status)) {
    return null;
  }

  const customer = typeof booking.userId === 'object' ? booking.userId : null;
  const contactRevealed = isBookingContactRevealed(booking);
  const rawCustomerName = customer?.name || null;
  const customerName = contactRevealed
    ? rawCustomerName
    : maskPersonName(rawCustomerName) || 'Customer';
  // Server populates the user's primary contact field as `phone_no`.
  // Older builds returned `phone`; we honour both so the call CTA keeps
  // working on bookings created before the rename. Contact is withheld
  // until the driver marks arrived at pickup.
  const customerPhone = contactRevealed
    ? customer?.phone_no || customer?.phone || null
    : null;
  const customerPhoto = customer?.profilePicture || null;
  const customerEmail = contactRevealed ? customer?.email || null : null;
  const customerSince = customer?.createdAt
    ? new Date(customer.createdAt).toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
    })
    : null;
  const customerCallHref = customerPhone
    ? `tel:+91${String(customerPhone).replace(/\D/g, '')}`
    : null;

  // The driver-safe fareSnapshot only carries `driverEarning` — the
  // customer's gross fare and the platform commission are stripped on
  // the backend. This is intentional: the driver sees what they make,
  // not what the customer pays.
  const driverEarning = booking.fareSnapshot?.driverEarning || 0;
  // The only thing that "blocks" the driver's En-Route CTA today is the
  // AWAITING_PAYMENT status. Treating it as a neutral "customer is getting
  // ready" hint keeps the payment-mode private (per spec).
  const paymentBlocker = booking.status === BOOKING_STATUS.AWAITING_PAYMENT;

  const titleLine =
    booking.serviceType === SERVICE_TYPES.OUTSTATION
      ? `${booking.outstation?.days || 1}-day Round trip`
      : `${booking.hourly?.durationHours || ''}h ${SERVICE_TYPE_LABELS.hourly || 'Hourly'}`;

  // Booking-type chip. Instant / Scheduled / Outstation are distinct —
  // outstation must NOT fall through as "Scheduled".
  const isOutstationBooking =
    booking.bookingType === BOOKING_TYPE.OUTSTATION ||
    booking.serviceType === SERVICE_TYPES.OUTSTATION;
  const isScheduledHourly = booking.bookingType === BOOKING_TYPE.SCHEDULED;
  const typeBadge = isOutstationBooking
    ? { label: 'Outstation', variant: 'success', Icon: Route }
    : isScheduledHourly
      ? { label: 'Scheduled', variant: 'info', Icon: CalendarClock }
      : { label: 'Instant', variant: 'primary', Icon: Zap };
  const scheduledStartAt =
    booking.hourly?.scheduledStartAt ||
    booking.outstation?.pickupAt ||
    booking.outstation?.startDate ||
    null;
  const scheduledStartLabel = scheduledStartAt
    ? new Date(scheduledStartAt).toLocaleString([], {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
    : null;
  const showPickupSchedule =
    Boolean(scheduledStartLabel) && (isScheduledHourly || isOutstationBooking);
  const isMapPhase = STATUSES_WITH_MAP.includes(booking.status);

  // Vehicle (populated by getBookingByIdService / getActiveBookingForDriverService
  // when the request is driver-side).
  const car = typeof booking.carId === 'object' && booking.carId ? booking.carId : null;
  const carBrand = car?.brandId?.name || null;
  const carModel = car?.modelId?.name || null;
  const carType = car?.carTypeId?.name || null;
  const carFuel = car?.fuelTypeId?.name || null;
  const carTransmission = car?.transmission || null;
  const carPlate = car?.vehicleNumber || null;
  const carImage = car?.image || null;
  const carHeadline = [carBrand, carModel].filter(Boolean).join(' ') || carType || 'Vehicle';

  const locationRevealed = booking.locationRevealed !== false;
  const pickupAddressLabel = formatLocationLabel(booking.pickup?.address);
  const showMap =
    STATUSES_WITH_MAP.includes(booking.status)
    && pickupCoords
    && locationRevealed;

  const TypeBadgeIcon = typeBadge.Icon;

  const ctaDisabled =
    paymentBlocker ||
    busy === 'cancel' ||
    (config.cta?.action === 'markArrived' && !arrivalReady) ||
    (config.cta?.action === 'markEnRoute' && enRouteTooEarly) ||
    (config.cta?.action === 'markArrived' && arrivedTooEarly) ||
    (config.cta?.action === 'startTrip' && startTooEarly) ||
    (config.cta?.action === 'completeTrip' && completeTooEarlyMinutes != null) ||
    (config.cta?.action === 'completeTrip' && overtimePaymentRequired);

  const ctaLabel = !config.cta
    ? null
    : config.cta.action === 'markEnRoute' && enRouteTooEarly
      ? `Unlocks in ${formatScheduledLead(minutesUntilEnRouteUnlock)}`
      : config.cta.action === 'markArrived' && arrivedTooEarly
        ? `Unlocks in ${formatScheduledLead(minutesUntilPickup)}`
        : config.cta.action === 'startTrip' && startTooEarly
          ? `Unlocks in ${formatScheduledLead(minutesUntilPickup)}`
              : config.cta.action === 'completeTrip' && overtimePaymentRequired
            ? 'Ask customer to pay overdue'
            : config.cta.action === 'completeTrip' && completeTooEarlyMinutes != null
            ? `Complete in ${completeTooEarlyLabel}`
            : config.cta.label;

  const tripDetails = (
    <>
        {/* Status banner */}
        <Card>
          <p className="text-sm text-text-secondary leading-snug">{config.subtitle}</p>
        </Card>

        {showMap && !driverPoint && (
          <Card className="bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">Waiting for your GPS</p>
                <p className="text-xs text-amber-800 mt-1 leading-snug">
                  Enable location so we can show your pin and the route to pickup.
                </p>
              </div>
            </div>
          </Card>
        )}

        <CustomerHeroCard
          photo={customerPhoto}
          name={customerName}
          avatarName={rawCustomerName}
          phone={customerPhone}
          email={customerEmail}
          since={customerSince}
          callHref={customerCallHref}
          contactLocked={!contactRevealed}
          contactUnlockHint="Customer contact unlocks when you arrive at pickup — chat is available now"
          chatSlot={
            isChatVisibleForBooking(booking) ? (
              <TripChatEntry
                booking={booking}
                audience="driver"
                selfId={driverAuth?._id || driverAuth?.id}
                peerName={customerName || 'Customer'}
                peerAvatar={customerPhoto}
                subtitle="Trip chat"
                buttonVariant="driver"
                buttonClassName="!mt-0"
              />
            ) : null
          }
        />

        {car && (
          <VehicleCard
            image={carImage}
            headline={carHeadline}
            carType={carType}
            plate={carPlate}
            fuel={carFuel}
            transmission={carTransmission}
          />
        )}

        {booking.status === BOOKING_STATUS.ARRIVED && (
          booking.serviceType === SERVICE_TYPES.OUTSTATION ? (
            <Card className="border-l-4 border-l-sky-500 bg-sky-50/40">
              <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
                Waiting for customer OTP
              </p>
              <p className="text-sm text-text mt-1">
                Ask the customer for the start OTP. If they do not arrive,
                contact support — there is no automatic trip close for
                round trips.
              </p>
            </Card>
          ) : (
            <WaitingTimerCard
              arrivedAt={booking.timeline?.arrivedAt}
              freeMinutes={booking.waiting?.freeMinutes}
              perMinuteRupees={booking.waiting?.perMinuteRupees}
              maxBillableMinutes={booking.waiting?.maxBillableMinutes}
              bufferRupees={booking.waiting?.bufferRupees}
            />
          )
        )}

        {extensionOtpBanner && (
          <ExtensionOtpBanner
            banner={extensionOtpBanner}
            onDismiss={async () => {
              const stage = extensionOtpBanner.stage;
              if (
                (stage === 'otp' || stage === 'verified') &&
                extensionOtpBanner.extensionId
              ) {
                try {
                  await dismissExtension(extensionOtpBanner.extensionId);
                  toast.success('Extension dismissed');
                } catch (err) {
                  toast.error(
                    err?.response?.data?.message ||
                    err?.message ||
                    'Could not dismiss extension',
                  );
                  return;
                }
              }
              setExtensionOtpBanner(null);
            }}
          />
        )}

        <Card>
          <h3 className="text-xs font-semibold text-text-muted mb-3 uppercase tracking-wide">
            Trip
          </h3>
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted">Pickup</p>
              <p className="text-sm font-medium text-text break-words">
                {pickupAddressLabel || 'Pickup location pending'}
              </p>
            </div>
          </div>
          {booking.outstation?.destinationAddress && (
            <div className="flex items-start gap-3 mt-3">
              <MapPin className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-text-muted">Destination</p>
                <p className="text-sm font-medium text-text break-words">
                  {booking.outstation.destinationAddress}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <WalletIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-text-muted">Your earning</p>
                <p className="text-base font-bold text-text">
                  {'\u20B9'}{driverEarning}
                </p>
              </div>
            </div>
            {booking.hourly?.durationHours && (
              <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary/15 text-primary-dark">
                {booking.hourly.durationHours}h
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted mt-2 leading-snug">
            Net amount after platform commission. Credited to your wallet
            once the trip is completed.
          </p>
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

        {(() => {
          const accepted = (booking.extensions || []).filter(
            (ext) => ext?.status === 'accepted',
          );
          if (!accepted.length) return null;
          return (
            <Card>
              <p className="text-[11px] text-text-muted uppercase tracking-wide font-semibold">
                Extensions
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">
                Your earnings from the customer&rsquo;s ride extensions.
              </p>
              <div className="mt-2 space-y-1">
                {accepted.map((ext) => {
                  const days = Number(ext.additionalDays) || 0;
                  const amountLabel = days > 0
                    ? `+${days}d`
                    : `+${formatExtensionHours(ext.additionalHours)}`;
                  return (
                    <p key={String(ext._id || ext.requestedAt)} className="text-xs text-text-secondary">
                      {amountLabel} · &#8377;{ext.driverEarning ?? 0}
                      <span className="text-text-muted">
                        {' '}
                        ·{' '}
                        {new Date(ext.paidAt || ext.respondedAt || ext.requestedAt).toLocaleTimeString()}
                      </span>
                    </p>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {driverPoint && pickupCoords && booking.status !== BOOKING_STATUS.STARTED && (
          <p className="text-[11px] text-text-muted text-center">
            About {formatDistance(distanceToPickup ?? 0)} to the pickup
          </p>
        )}

        {isEnRoute && (
          <div
            className={`rounded-2xl border p-3 flex items-start gap-3 ${arrivalReady
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
              }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${arrivalReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
            >
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${arrivalReady ? 'text-emerald-900' : 'text-amber-900'}`}>
                {arrivalReady
                  ? 'You are at the pickup'
                  : driverPoint
                    ? 'Get closer to mark arrival'
                    : 'Waiting for your location'}
              </p>
              <p className={`text-[12px] leading-snug mt-0.5 ${arrivalReady ? 'text-emerald-800' : 'text-amber-800'}`}>
                {arrivalReady
                  ? `Tap "I have arrived" to start the trip with the customer.`
                  : driverPoint
                    ? `You need to be within ${ARRIVAL_PROXIMITY_METERS} m of the pickup before you can mark arrival.`
                    : 'Enable GPS so we can confirm you have reached the pickup.'}
              </p>
            </div>
          </div>
        )}

        {enRouteTooEarly && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-indigo-900">
                Start to pickup unlocks in{' '}
                {formatScheduledLead(minutesUntilEnRouteUnlock)}
                {Number.isFinite(scheduledStartMs) && (
                  <span className="block text-[11px] font-normal text-indigo-700/90 mt-0.5">
                    Pickup{' '}
                    {new Date(scheduledStartMs).toLocaleString([], {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {' · '}available from{' '}
                    {enRouteUnlockMinutes} min before
                  </span>
                )}
              </p>
              <p className="text-[12px] leading-snug mt-1 text-indigo-800">
                The button stays disabled until then. You remain available
                for other rides in the meantime.
              </p>
            </div>
          </div>
        )}

        {(arrivedTooEarly || startTooEarly) && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-indigo-900">
                Trip starts {formatScheduledLead(minutesUntilPickup)}
                {Number.isFinite(scheduledStartMs) && (
                  <span className="block text-[11px] font-normal text-indigo-700/90 mt-0.5">
                    {new Date(scheduledStartMs).toLocaleString([], {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </p>
              <p className="text-[12px] leading-snug mt-1 text-indigo-800">
                {arrivedTooEarly
                  ? '"I\'ve arrived" unlocks at the scheduled pickup time.'
                  : 'Starting the ride unlocks at the scheduled pickup time.'}
              </p>
            </div>
          </div>
        )}

        {overtimePaymentRequired && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900">
                Overdue amount
                {Number(booking?.overtime?.amountRupees) > 0
                  ? ` ₹${Number(booking.overtime.amountRupees).toFixed(2)}`
                  : ''}
              </p>
              <p className="text-[12px] leading-snug mt-1 text-amber-800">
                Please tell the user to make payment of the overdue time
                {booking?.overtime?.billableMinutes
                  ? ` (${booking.overtime.billableMinutes} min)`
                  : ''}
                {Number(booking?.overtime?.amountRupees) > 0
                  ? ` — ₹${Number(booking.overtime.amountRupees).toFixed(2)}`
                  : ''}
                . You cannot complete the ride until they pay.
              </p>
            </div>
          </div>
        )}

        {completeTooEarlyMinutes != null && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900">
                {isOutstationTrip ? 'Booked return still ahead' : 'Booked time still running'}
              </p>
              <p className="text-[12px] leading-snug mt-1 text-amber-800">
                Complete unlocks in{' '}
                <span className="font-semibold">{completeTooEarlyLabel}</span>.
              </p>
            </div>
          </div>
        )}
    </>
  );

  const actionBar = (
    <div className="bg-white border-t border-border-light px-4 py-3 space-y-2">
      {mapsNav.show && mapsNav.url && booking.locationRevealed !== false && (
        <Button
          fullWidth
          variant="secondary"
          icon={Navigation}
          onClick={() => {
            const opened = openExternalUrl(mapsNav.url);
            if (!opened) toast.error('Could not open Google Maps');
          }}
        >
          {mapsNav.label}
        </Button>
      )}
      {config.cta && (
        <Button
          fullWidth
          variant="driver"
          disabled={ctaDisabled}
          loading={busy === config.cta.action}
          icon={config.cta.icon}
          onClick={handleAdvance}
        >
          {ctaLabel}
        </Button>
      )}
      {config.canCancel && (
        <button
          type="button"
          disabled={!!busy && busy !== 'cancel'}
          onClick={handleCancel}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-red-600 font-semibold py-3 text-sm disabled:opacity-60 hover:bg-red-100 transition"
        >
          <XCircle className="w-4 h-4" />
          Cancel trip
        </button>
      )}
    </div>
  );

  if (isMapPhase) {
    return (
      <div className="flex-1 flex flex-col relative bg-gray-950 min-h-dvh overflow-hidden">
        {showMap ? (
          <div className="absolute inset-0">
            <TripTrackingMap
              driver={driverPoint}
              pickup={pickupCoords}
              dropoff={dropoffCoords}
              emphasis="pickup"
              height="100%"
              className="!rounded-none"
              showRoute={booking.status !== BOOKING_STATUS.ARRIVED}
              followDriver={Boolean(driverPoint)}
              bookingStatus={booking.status}
              audience="driver"
              controlClassName="!bottom-[38dvh] sm:!bottom-[36dvh]"
            />
          </div>
        ) : !locationRevealed ? (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-100 via-white to-slate-50">
            <div className="h-full flex flex-col items-center justify-center px-6 pb-[42dvh] text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <MapPin className="w-7 h-7" />
              </div>
              <p className="text-base font-bold text-slate-900">Map unlocks on trip day</p>
              <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                {pickupAddressLabel
                  ? `Pickup address: ${pickupAddressLabel}`
                  : 'The live map and pin unlock at midnight on the pickup day.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900" />
        )}

        <div className="relative z-20 flex items-center gap-3 px-4 pt-12 pb-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => navigate('/driver/trips?tab=ongoing')}
            className="w-10 h-10 rounded-2xl bg-white/90 backdrop-blur shadow-lg flex items-center justify-center active:scale-90 transition"
            aria-label="Back to my trips"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/90 backdrop-blur shadow-lg min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-gray-900 truncate">{config.title}</span>
          </div>
          <Badge
            variant={typeBadge.variant}
            className="!text-[10px] gap-1 shrink-0 bg-white/90 backdrop-blur shadow-lg !py-1.5"
          >
            <TypeBadgeIcon className="w-3 h-3" />
            {typeBadge.label}
          </Badge>
        </div>

        <div className="relative z-20 mt-auto pointer-events-auto">
          <div className="bg-white rounded-t-[28px] shadow-[0_-8px_32px_rgba(0,0,0,0.18)]">
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
              className="w-full px-5 pt-3 pb-3 flex flex-col items-stretch gap-2 focus:outline-none cursor-pointer"
            >
              <div className="mx-auto w-10 h-1 rounded-full bg-gray-200" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-text truncate">{titleLine}</p>
                  {showPickupSchedule && (
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Pickup {scheduledStartLabel}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-text-muted font-mono">
                    {booking.bookingNumber}
                  </span>
                  <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center transition-transform duration-300 ${sheetExpanded ? 'rotate-180' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-500">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
              {driverPoint && pickupCoords && booking.status !== BOOKING_STATUS.ARRIVED && (
                <p className="text-xs text-text-muted">
                  {formatDistance(distanceToPickup ?? 0)} to pickup
                </p>
              )}
            </div>

            {sheetExpanded ? (
              <div
                className="overflow-y-auto overscroll-contain px-4 pb-3 space-y-4"
                style={{ maxHeight: '48dvh' }}
              >
                {tripDetails}
              </div>
            ) : (
              <div className="hidden">{tripDetails}</div>
            )}

            {actionBar}
          </div>
        </div>

        <CustomerPaymentOverlay
          open={paymentBlocker}
          paymentDeadlineAt={booking.timeline?.paymentDeadlineAt}
          driverAssignedAt={booking.timeline?.driverAssignedAt}
        />

        <StartRideOtpSheet
          open={otpOpen}
          onClose={() => setOtpOpen(false)}
          onSubmit={handleStartWithOtp}
          busy={busy === 'start'}
        />

        <ConfirmDialog
          open={cancelOpen}
          onClose={() => !cancelling && setCancelOpen(false)}
          onConfirm={handleCancelConfirm}
          title={cancelPreview.tripStarted ? 'Cancel this active trip?' : 'Cancel this trip?'}
          description={buildCancelDialogCopy(cancelPreview, booking)}
          confirmLabel="Cancel trip"
          cancelLabel="Keep trip"
          variant="danger"
          loading={cancelling}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-border-light px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          type="button"
          onClick={() => navigate('/driver/trips?tab=ongoing')}
          className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center active:scale-90 transition"
          aria-label="Back to my trips"
        >
          <ArrowLeft className="w-5 h-5 text-text" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
            {config.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            <p className="text-sm font-bold text-text truncate">{titleLine}</p>
            <Badge
              variant={typeBadge.variant}
              className="!text-[10px] gap-1 shrink-0"
            >
              <TypeBadgeIcon className="w-3 h-3" />
              {typeBadge.label}
            </Badge>
          </div>
          {showPickupSchedule && (
            <p className="text-[11px] text-text-muted mt-0.5">
              Pickup {scheduledStartLabel}
            </p>
          )}
        </div>
        <span className="ml-auto text-[11px] text-text-muted font-mono shrink-0 self-start">
          {booking.bookingNumber}
        </span>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {tripDetails}
      </div>

      <CustomerPaymentOverlay
        open={paymentBlocker}
        paymentDeadlineAt={booking.timeline?.paymentDeadlineAt}
        driverAssignedAt={booking.timeline?.driverAssignedAt}
      />

      <StartRideOtpSheet
        open={otpOpen}
        onClose={() => setOtpOpen(false)}
        onSubmit={handleStartWithOtp}
        busy={busy === 'start'}
      />

      <div className="sticky bottom-0 z-10">
        {actionBar}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => !cancelling && setCancelOpen(false)}
        onConfirm={handleCancelConfirm}
        title={cancelPreview.tripStarted ? 'Cancel this active trip?' : 'Cancel this trip?'}
        description={buildCancelDialogCopy(cancelPreview, booking)}
        confirmLabel="Cancel trip"
        cancelLabel="Keep trip"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

/**
 * Pick the right description for the cancel confirm dialog. Three
 * cases the driver needs to disambiguate before tapping Cancel:
 *
 *   1. Free cancel available — within the grace window AND chances left.
 *   2. Penalty applies — past the grace window OR chances exhausted.
 *   3. Mid-trip cancel — penalty applies regardless (customer in car).
 *
 * Copy is intentionally explicit about chances remaining so drivers
 * can budget their daily allowance.
 */
function buildCancelDialogCopy(preview, booking) {
  const penalty = Number(preview?.driverPenalty) || 0;
  const fullPenalty = Number(preview?.fullPenalty) || 0;
  const chance = preview?.chance || null;
  const chancesLeft = Math.max(0, Number(chance?.chancesLeft) || 0);
  const dailyLimit = Math.max(0, Number(chance?.dailyLimit) || 0);
  const grace = Math.max(0, Number(chance?.graceMinutes) || 0);
  const remainingMinutes = Number(chance?.remainingMinutes) || 0;
  const status = booking?.status;

  // ── Mid-trip cancel ──────────────────────────────────────────────
  if (preview?.tripStarted) {
    if (penalty > 0) {
      return `The trip is in progress with the customer. Cancelling now will deduct \u20B9${penalty} from your wallet as a mid-trip penalty. The customer will be refunded.`;
    }
    return 'The trip is in progress with the customer. Cancelling now may affect your rating.';
  }

  // ── Grace-window waiver (pre-trip) ───────────────────────────────
  if (preview?.penaltyWaived) {
    const remainingAfter = Math.max(0, chancesLeft - 1);
    const countdown = formatGraceRemaining(remainingMinutes);
    const window = `${countdown} left in the ${grace}-min grace window`;

    // Context line based on current status
    let context = '';
    if (status === BOOKING_STATUS.ARRIVED) {
      context = 'You are at the pickup location. ';
    } else if (status === BOOKING_STATUS.EN_ROUTE) {
      context = 'You are on the way to pickup. ';
    } else if (status === BOOKING_STATUS.AWAITING_PAYMENT) {
      context = 'The customer is still making payment. ';
    }

    return remainingAfter > 0
      ? `${context}No penalty \u2014 ${window}. ${remainingAfter} of ${dailyLimit} free cancel${remainingAfter === 1 ? '' : 's'} will remain today.`
      : `${context}No penalty \u2014 ${window}. This is your last free cancellation today; after this, each cancel will cost \u20B9${fullPenalty}.`;
  }

  // ── Penalty applies (pre-trip) ───────────────────────────────────
  if (penalty > 0) {
    let statusLine = '';
    if (status === BOOKING_STATUS.ARRIVED) {
      statusLine = 'You have arrived at the pickup. ';
    } else if (status === BOOKING_STATUS.EN_ROUTE) {
      statusLine = 'You are heading to the pickup. ';
    } else if (status === BOOKING_STATUS.AWAITING_PAYMENT) {
      statusLine = 'The customer is completing payment. ';
    } else if (status === BOOKING_STATUS.DRIVER_ASSIGNED) {
      statusLine = 'You have been assigned to this trip. ';
    }

    if (chancesLeft <= 0 && dailyLimit > 0) {
      return `${statusLine}Your ${dailyLimit} free daily cancel${dailyLimit === 1 ? '' : 's'} ${dailyLimit === 1 ? 'has' : 'have'} been used. \u20B9${penalty} will be deducted from your wallet.`;
    }
    if (grace > 0) {
      return `${statusLine}The ${grace}-minute grace window has passed. \u20B9${penalty} will be deducted from your wallet.`;
    }
    return `${statusLine}\u20B9${penalty} will be deducted from your wallet as a cancellation penalty.`;
  }

  // ── No penalty, no grace info (fallback) ─────────────────────────
  if (status === BOOKING_STATUS.AWAITING_PAYMENT) {
    return 'The customer hasn\u2019t paid yet. You can cancel without a penalty, but repeated cancellations may affect your rating.';
  }
  return 'No penalty will be charged, but repeated cancellations may affect your rating.';
}

/**
 * Render a `remainingMinutes` float (e.g. 1.42) as a human countdown
 * the driver can read at a glance: "1m 25s" or "12s". Negative or
 * non-numeric → "0s".
 */
function formatGraceRemaining(minutes) {
  const total = Math.max(0, Math.floor((Number(minutes) || 0) * 60));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Live waiting-timer tile shown on the driver's Active Trip screen
 * once the booking hits ARRIVED. Ticks the wait every second and
 * flips colour as the wait crosses three thresholds:
 *
 *   green  →  inside `freeMinutes`     (no charge accruing)
 *   amber  →  past free, inside cap    (charge accruing, buffer covering)
 *   red    →  at/past `maxBillableMinutes` (charge capped, buffer fully used)
 *
 * The "Buffer remaining" line lets the driver see how much head-room
 * is left on the customer's pre-collected buffer — pure transparency
 * for the driver, not a UI affordance for any action.
 *
 * Props:
 *   arrivedAt           ISO timestamp the driver hit "I've arrived".
 *   freeMinutes         Admin-configured free wait window (minutes).
 *   perMinuteRupees     Admin-configured per-minute charge.
 *   maxBillableMinutes  Hard cap on billable wait. After this point the
 *                       customer's bill stops climbing (the buffer is
 *                       sized to cover exactly this many minutes).
 *   bufferRupees        Total buffer collected upfront, for display.
 */
/**
 * Banner the driver sees while the customer is mid-way through the
 * extension handshake. Renders the OTP code prominently so it can be
 * read aloud, and updates as the customer verifies + pays.
 *
 *   stage 'otp'       → big code, "Read this out to the customer"
 *   stage 'verified'  → "Customer entered code, waiting for payment…"
 *   stage 'paid'      → "Extended by Xh — keep going!"
 */
function ExtensionOtpBanner({ banner, onDismiss }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expiresInSec = Math.max(
    0,
    Math.ceil((banner.expiresAt - now) / 1000),
  );
  const mm = Math.floor(expiresInSec / 60)
    .toString()
    .padStart(1, '0');
  const ss = (expiresInSec % 60).toString().padStart(2, '0');

  const days = Number(banner.additionalDays) || 0;
  const amountLabel = days > 0
    ? `+${days}d`
    : `+${formatExtensionHours(banner.additionalHours)}`;

  if (banner.stage === 'paid') {
    return (
      <Card className="bg-emerald-50 border border-emerald-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-900">
              Extension paid &middot; {amountLabel}
            </p>
            <p className="text-[12px] text-emerald-800">
              You&rsquo;ll earn ₹{banner.driverEarning ?? 0} extra. Trip just got{' '}
              {amountLabel.replace('+', '')} longer.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (banner.stage === 'verified') {
    return (
      <Card className="bg-amber-50 border border-amber-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">
              Waiting for customer payment…
            </p>
            <p className="text-[12px] text-amber-800">
              Code accepted. You&rsquo;ll earn ₹{banner.driverEarning ?? 0}{' '}
              extra for {amountLabel}.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border border-indigo-700/30">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-white/70">
            Customer wants to extend
          </p>
          <p className="text-sm font-bold mt-0.5">
            {amountLabel} &middot; you&rsquo;ll earn ₹
            {banner.driverEarning ?? 0}
          </p>
        </div>
        <span className="text-[11px] font-medium text-white/80 bg-white/15 rounded-full px-2 py-0.5">
          {mm}:{ss}
        </span>
      </div>
      <div className="bg-white/10 rounded-2xl p-3 text-center">
        <p className="text-[10px] uppercase tracking-wide text-white/70">
          Read this code to the customer
        </p>
        <p className="text-3xl font-extrabold tracking-[0.4em] mt-1 select-all">
          {banner.otp}
        </p>
      </div>
      <p className="text-[11px] text-white/80 mt-2 leading-snug">
        They&rsquo;ll type this in their app. Once verified, they pay from their wallet and your trip clock extends automatically.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 w-full h-9 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
      >
        Dismiss
      </button>
    </Card>
  );
}

function WaitingTimerCard({
  arrivedAt,
  freeMinutes,
  perMinuteRupees,
  maxBillableMinutes,
  bufferRupees,
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!arrivedAt) return null;

  const free = Math.max(0, Number(freeMinutes) || 0);
  const perMin = Math.max(0, Number(perMinuteRupees) || 0);
  const maxBillable = Math.max(0, Number(maxBillableMinutes) || 0);
  const buffer = Math.max(0, Number(bufferRupees) || 0);
  const waitedMs = Math.max(0, now - new Date(arrivedAt).getTime());
  const waitedSec = Math.floor(waitedMs / 1000);
  const waitedMin = waitedMs / 60_000;
  let billableMin = Math.max(0, Math.ceil(waitedMin - free));
  if (maxBillable > 0) billableMin = Math.min(billableMin, maxBillable);
  const chargedRupees = Math.round(billableMin * perMin * 100) / 100;
  const inFreeWindow = waitedMin <= free;
  const atCap = maxBillable > 0 && billableMin >= maxBillable;
  const bufferLeft = Math.max(0, Math.round((buffer - chargedRupees) * 100) / 100);

  const m = Math.floor(waitedSec / 60);
  const s = waitedSec % 60;
  const display = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const remainingFreeSec = Math.max(0, Math.floor(free * 60 - waitedSec));
  const remM = Math.floor(remainingFreeSec / 60);
  const remS = remainingFreeSec % 60;
  const remainingFree = `${remM}m ${String(remS).padStart(2, '0')}s`;

  let tone;
  let headlineTone;
  if (inFreeWindow) {
    tone = 'border-l-emerald-500 bg-emerald-50/40';
    headlineTone = 'text-emerald-700';
  } else if (atCap) {
    tone = 'border-l-red-500 bg-red-50/60';
    headlineTone = 'text-red-700';
  } else {
    tone = 'border-l-amber-500 bg-amber-50/60';
    headlineTone = 'text-amber-700';
  }

  return (
    <Card className={`border-l-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
            Waiting at pickup
          </p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${headlineTone}`}>
            {display}
          </p>
          {free > 0 && (
            <p className="text-[11px] text-text-muted mt-0.5">
              {inFreeWindow
                ? `Free wait \u00B7 ${remainingFree} until charges start`
                : atCap
                  ? `Past cap of ${maxBillable} min \u00B7 no further charge`
                  : `Past free wait of ${free} min`}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">
            Charge so far
          </p>
          <p
            className={`text-base font-bold mt-1 ${chargedRupees > 0 ? headlineTone : 'text-text-muted'
              }`}
          >
            {'\u20B9'}
            {chargedRupees}
          </p>
          {perMin > 0 && (
            <p className="text-[10px] text-text-muted mt-0.5">
              {'\u20B9'}
              {perMin}/min after free
            </p>
          )}
        </div>
      </div>
      {/* Pre-collected buffer hint — purely informational, lets the
          driver see they're protected up to the cap. */}
      {buffer > 0 && (
        <div className="mt-3 pt-3 border-t border-border-light flex items-center justify-between">
          <span className="text-[11px] text-text-muted">
            Reserved for waiting
          </span>
          <span
            className={`text-[11px] font-semibold ${bufferLeft === 0 ? 'text-red-600' : 'text-text'
              }`}
          >
            {'\u20B9'}
            {bufferLeft} left of {'\u20B9'}
            {buffer}
          </span>
        </div>
      )}
    </Card>
  );
}

/**
 * Hero card for the customer on the driver-side active trip page.
 * Designed to put every piece of contact info the driver might need
 * one tap away — large photo, name, primary CTA = Call, with phone +
 * email + customer-since pinned beneath as secondary chips. The
 * accent gradient + verified chip mirror the visual hierarchy we use
 * on the user-side driver card so both audiences feel parallel.
 */
function CustomerHeroCard({
  photo,
  name,
  avatarName,
  phone,
  email,
  since,
  callHref,
  contactLocked = false,
  contactUnlockHint = 'Customer contact unlocks when you arrive at pickup — chat is available now',
  chatSlot = null,
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-5 pt-5 pb-4 flex items-start gap-4">
        <Avatar
          src={photo}
          name={avatarName || name || 'Customer'}
          size="xl"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[11px] uppercase tracking-wider text-primary-dark font-bold">
              Customer
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              <ShieldCheck className="w-2.5 h-2.5" />
              Verified
            </span>
          </div>
          <h3 className="text-lg font-extrabold text-text truncate">
            {name || 'Customer'}
          </h3>
          {since && (
            <p className="text-[11px] text-text-muted mt-0.5">
              Member since {since}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 pt-3 pb-4 border-t border-border-light bg-white space-y-2">
        {contactLocked && (
          <p className="text-xs text-text-muted text-center py-1">
            {contactUnlockHint}
          </p>
        )}
        {phone && (
          <ContactRow
            icon={Phone}
            label="Phone"
            value={phone}
            iconClass="text-emerald-600 bg-emerald-50"
          />
        )}
        {email && (
          <ContactRow
            icon={Mail}
            label="Email"
            value={email}
            iconClass="text-sky-600 bg-sky-50"
            mono={false}
          />
        )}

        {(callHref || chatSlot) && (
          <div className={`mt-3 grid gap-2 ${callHref && chatSlot ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {callHref && (
              <a
                href={callHref}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-white font-semibold py-3 text-sm shadow-sm hover:bg-emerald-600 active:scale-[0.98] transition"
                aria-label="Call customer"
              >
                <Phone className="w-4 h-4" />
                Call
              </a>
            )}
            {chatSlot}
          </div>
        )}
      </div>
    </Card>
  );
}

function ContactRow({ icon: Icon, label, value, iconClass = '', mono = true }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconClass || 'text-text-muted bg-gray-100'
          }`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          {label}
        </p>
        <p
          className={`text-sm font-semibold text-text truncate ${mono ? 'font-mono tracking-tight' : ''
            }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Vehicle tile shown on the driver's active trip — the customer's
 * registered car the driver will be driving. Mirrors the layout of
 * `PersonContactCard` (image / headline / chips) so the trip detail
 * page reads as a sequence of "who + what" cards.
 *
 * Props:
 *   image          car photo URL (falls back to a styled icon tile)
 *   headline       "Honda · City" style brand+model line
 *   carType        e.g. "Sedan"
 *   plate          vehicle number (rendered in mono so the driver can
 *                  read it from a distance)
 *   fuel           "Petrol" | "Diesel" | "EV" | ...
 *   transmission   "manual" | "automatic"
 */
function VehicleCard({
  image,
  headline,
  carType,
  plate,
  fuel,
  transmission,
}) {
  const chips = [];
  if (carType) chips.push({ icon: CarIcon, label: carType });
  if (fuel) chips.push({ icon: Fuel, label: fuel });
  if (transmission) {
    chips.push({
      icon: Settings2,
      label: transmission.charAt(0).toUpperCase() + transmission.slice(1),
    });
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        {image ? (
          <img
            src={image}
            alt={headline}
            className="w-20 h-20 rounded-xl object-cover bg-gray-100 shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <CarIcon className="w-7 h-7" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-text-muted">Vehicle</p>
          <p className="text-sm font-bold text-text truncate">{headline}</p>
          {plate && (
            <p className="text-[12px] font-mono font-semibold tracking-wider text-text mt-0.5">
              {plate}
            </p>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {chips.map(({ icon: ChipIcon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 text-[11px] text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full"
                >
                  <ChipIcon className="w-3 h-3" />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Full-screen overlay that locks the driver while the customer settles
 * the fare. The 1-minute countdown is informational only — the actual
 * timer lives server-side. When it fires the booking transitions to
 * CANCELLED (and the page-level effect above redirects the driver home).
 */
function CustomerPaymentOverlay({ open, paymentDeadlineAt, driverAssignedAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Prefer the explicit deadline (refreshed on every customer retry).
  // Fall back to the legacy assignedAt-based math so pre-migration
  // bookings still show a sane countdown.
  const remainingSec = useMemo(() => {
    const deadlineMs = paymentDeadlineAt
      ? new Date(paymentDeadlineAt).getTime()
      : driverAssignedAt
        ? new Date(driverAssignedAt).getTime() +
        PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS * 1000
        : null;
    if (!deadlineMs) return PAYMENT_POLICY.PAYMENT_DEADLINE_SECONDS;
    return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
  }, [paymentDeadlineAt, driverAssignedAt, now]);

  if (!open) return null;

  const minutes = Math.floor(remainingSec / 60);
  const seconds = String(remainingSec % 60).padStart(2, '0');
  const countdown = `${minutes}:${seconds}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center">
        <div className="relative mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <CreditCard className="w-7 h-7 text-amber-700" />
          <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border-2 border-amber-100 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
          </span>
        </div>
        <h3 className="text-base font-bold text-text">User is making payment</h3>
        <p className="mt-1.5 text-sm text-text-muted leading-snug">
          Please hold &mdash; the customer is completing payment. You&rsquo;ll
          be able to head out as soon as it lands.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Auto-cancels in {countdown}
        </div>
        <p className="mt-4 text-[11px] text-text-muted leading-snug">
          If the customer doesn&rsquo;t pay in time the booking is cancelled
          automatically and you&rsquo;ll be released to take new offers.
        </p>
      </div>
    </div>
  );
}

/**
 * Friendly "X away" label for the scheduled-pickup countdown.
 * Falls back to "less than a minute" when the lead is sub-minute, which
 * lines up with the moment the en-route gate flips open.
 */
function formatScheduledLead(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs < 24) return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? `${days}d ${remHrs}h` : `${days}d`;
}

function buildGoogleMapsNavUrl({ dest, destQuery, origin }) {
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  if (dest && Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) {
    params.set('destination', `${dest.lat},${dest.lng}`);
  } else {
    const q = String(destQuery || '').trim();
    if (!q) return null;
    params.set('destination', q);
  }
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export default DriverActiveTripPage;
