import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Clock,
  Minus,
  Plus,
  X,
  ShieldCheck,
  Wallet as WalletIcon,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import Button from '../../../../components/Button';
import TopupSheet from '../../wallet/components/TopupSheet';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Extend-your-ride modal — 3-step handshake with mid-flow recovery.
 *
 *   Step 1 (`hours`)   — customer picks how many more hours.
 *                        Pressing Continue calls `onInitiate(hours)` and
 *                        the server pushes a 4-digit OTP to the driver.
 *
 *   Step 2 (`otp`)     — customer asks the driver for the code, types
 *                        it here. `onVerifyOtp({ extensionId, otp })`
 *                        is called when they hit Verify.
 *
 *   Step 3 (`pay`)     — customer reviews the fareDelta and pays from
 *                        wallet. If wallet is short, an inline TopupSheet
 *                        lets them add money without leaving the flow.
 *                        A "Change hours" button cancels the verified
 *                        intent and goes back to step 1.
 *
 *   Step 4 (`done`)    — celebratory confirmation, auto-dismisses.
 *
 * Recovery: when `pendingExtension` is supplied, we mount directly into
 * the right step so the customer who closed the modal after verifying
 * the OTP doesn't lose their progress.
 *
 * Props:
 *   open                Sheet visibility.
 *   onClose             Close handler — the parent decides whether to
 *                       leave the pending extension alive (default) or
 *                       cancel it.
 *   onInitiate          async (hours) → { extension, ... }
 *   onVerifyOtp         async ({ extensionId, otp }) → { extension, ... }
 *   onPay               async ({ extensionId }) → { extension, ... }
 *   onCancelExtension   async ({ extensionId }) → server-side mark
 *                       as declined so a fresh initiate can succeed.
 *                       Called from the "Change hours" button.
 *   pendingExtension    Existing extension subdoc from the booking, used
 *                       to resume the flow mid-handshake. Has shape:
 *                         { _id, status, additionalHours, fareDelta,
 *                           otp: { expiresAt, ... } }
 *                       `status` of 'pending_otp' lands on step 'otp',
 *                       'pending_payment' lands on step 'pay'.
 *   extraHourRate       Rupees/hr to preview the delta before initiate.
 *   walletBalance       Spendable balance.
 *   onWalletRefresh     Optional async; called after a successful
 *                       inline top-up so the parent can sync the wallet
 *                       store before the user retries Pay.
 *   remainingMinutes    Original-booking time left.
 *   minHours / maxHours
 */
const ExtendRideModal = ({
  open,
  onClose,
  onInitiate,
  onVerifyOtp,
  onPay,
  onCancelExtension,
  pendingExtension = null,
  extensionRejection = null,
  onClearRejection,
  extraHourRate = 0,
  walletBalance = 0,
  onWalletRefresh,
  remainingMinutes = 0,
  minHours = 1,
  maxHours = 8,
  // Outstation extensions count whole days instead of hours. Caller
  // passes `unit="days"` + a `perDayRate` (the live preview shown
  // before the customer commits). Defaults preserve the hourly UX so
  // existing callers don't need to know about the prop.
  unit = 'hours',
  perDayRate = 0,
  minDays = 1,
  maxDays = 14,
}) => {
  const isDays = unit === 'days';
  const min = isDays ? minDays : minHours;
  const max = isDays ? maxDays : maxHours;
  const unitLabel = isDays ? 'day' : 'h';
  const unitLabelLong = isDays ? 'days' : 'hours';
  const unitRate = isDays ? perDayRate : extraHourRate;
  // 'hours' | 'otp' | 'pay' | 'dismissed' | 'done'
  // The 'hours' step name is retained even for days-based outstation
  // extensions — it's purely the "pick amount" step label internally.
  const [step, setStep] = useState('hours');
  const [hours, setHours] = useState(min);
  const [busy, setBusy] = useState(false);
  // Locked-in details from the server response after initiate.
  const [extension, setExtension] = useState(null);
  // Local OTP input.
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState(null);
  // Inline top-up flow state.
  const [topupOpen, setTopupOpen] = useState(false);

  // On (re-)open: if the parent passed an existing extension still in
  // a handshake state, resume from the matching step. Otherwise start
  // fresh on the hours picker.
  //
  // Special case: a `dismissed_by_driver` event mutates the booking
  // (the row flips to declined) and flushes `pendingExtension` to
  // null in the same render. If we let this effect reset to 'hours'
  // here, the modal would flicker before the rejection effect below
  // promoted it to 'dismissed'. So when a rejection is in-flight we
  // hand control over to that effect.
  useEffect(() => {
    if (!open) return;
    if (extensionRejection) return;
    setBusy(false);
    setOtp('');
    setOtpError(null);
    setTopupOpen(false);

    const stage = pendingExtension?.status;
    if (stage === 'pending_payment' || stage === 'pending_otp') {
      setExtension(pendingExtension);
      const fromExtension = isDays
        ? pendingExtension.additionalDays
        : pendingExtension.additionalHours;
      setHours(Number(fromExtension) || min);
      setStep(stage === 'pending_payment' ? 'pay' : 'otp');
    } else {
      setExtension(null);
      setHours(min);
      setStep('hours');
    }
  }, [open, pendingExtension, min, extensionRejection, isDays]);

  // When a `dismissed_by_driver` event arrives, the parent passes the
  // rejection meta down. Switch the modal into the dismissed state
  // (with a Retry CTA) — but ONLY for the still-mid-handshake steps.
  // A `done`/`hours` user shouldn't be yanked off their context.
  useEffect(() => {
    if (!open) return;
    if (!extensionRejection) return;
    if (step === 'done') return;
    if (
      extension?._id &&
      String(extension._id) !== String(extensionRejection.extensionId)
    ) {
      // The rejection is for a DIFFERENT extension than the one this
      // modal session was working on (rare: stale event from a prior
      // session). Ignore it but still acknowledge to clear the queue.
      onClearRejection?.();
      return;
    }
    setBusy(false);
    setOtp('');
    setOtpError(null);
    setExtension({
      _id: extensionRejection.extensionId,
      additionalHours: extensionRejection.additionalHours,
      fareDelta: extensionRejection.fareDelta,
      status: 'declined',
      dismissedByDriver: true,
    });
    setStep('dismissed');
  }, [open, extensionRejection, extension?._id, step, onClearRejection]);

  // Preview cost during step 1. After initiate we use the server's
  // fareDelta (canonical — includes service charge + GST).
  const previewCost = useMemo(
    () => round2(Math.max(0, hours) * unitRate),
    [hours, unitRate],
  );

  const lockedFareDelta = round2(extension?.fareDelta || 0);
  // Round after subtract — raw float math yields noise like
  // ₹201.85000000000008 when fareDelta − walletBalance isn't exact in binary.
  const walletShortBy = round2(
    Math.max(0, lockedFareDelta - Number(walletBalance || 0)),
  );
  const canPay = walletShortBy <= 0 && lockedFareDelta > 0;

  // Helpers --------------------------------------------------------

  const handleInitiate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await onInitiate(hours);
      const ext = data?.extension;
      if (!ext?._id) {
        throw new Error('Server did not return an extension id');
      }
      setExtension(ext);
      setStep('otp');
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not start extension',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, hours, onInitiate]);

  const handleVerify = useCallback(async () => {
    if (busy || !extension?._id) return;
    if (!/^\d{4}$/.test(otp)) {
      setOtpError('Enter the 4-digit code from your driver');
      return;
    }
    setBusy(true);
    setOtpError(null);
    try {
      const data = await onVerifyOtp({ extensionId: extension._id, otp });
      if (data?.extension) setExtension(data.extension);
      setStep('pay');
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || 'Could not verify code';
      const attemptsLeft = err?.response?.data?.data?.attemptsLeft;
      const expired = !!err?.response?.data?.data?.expired;
      setOtpError(
        expired
          ? 'This code expired. Please start the extension again.'
          : attemptsLeft != null
            ? `${msg} (${attemptsLeft} attempts left)`
            : msg,
      );
      if (expired) {
        // Force back to step 1 so the customer can re-initiate cleanly.
        setStep('hours');
        setExtension(null);
        setOtp('');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, extension?._id, onVerifyOtp, otp]);

  const handlePay = useCallback(async () => {
    if (busy || !extension?._id) return;
    setBusy(true);
    try {
      await onPay({ extensionId: extension._id });
      const extAmount = isDays
        ? extension.additionalDays || 0
        : extension.additionalHours || 0;
      toast.success(`Ride extended by ${extAmount}${unitLabel}`);
      setStep('done');
      // Auto-close shortly after the success screen.
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
      // The server may say "Insufficient wallet" if the balance shifted
      // between fetch and pay — open the inline top-up sheet with the
      // exact shortfall so the user doesn't have to find the wallet.
      const data = err?.response?.data?.data || {};
      if (err?.response?.status === 402 && Number(data.shortBy) > 0) {
        setTopupOpen(true);
        setBusy(false);
        return;
      }
      toast.error(
        err?.response?.data?.message || err?.message || 'Payment failed',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, extension, onClose, onPay]);

  /**
   * "Change hours" — abandon the current verified-but-unpaid extension
   * (or pending OTP) on the server, then jump back to the hours
   * picker. We block this if a payment is in flight.
   */
  const handleChangeHours = useCallback(async () => {
    if (busy) return;
    if (!extension?._id || !onCancelExtension) {
      // No server-side state to clean up — just reset locally.
      setExtension(null);
      setOtp('');
      setOtpError(null);
      setStep('hours');
      return;
    }
    setBusy(true);
    try {
      await onCancelExtension({ extensionId: extension._id });
      setExtension(null);
      setOtp('');
      setOtpError(null);
      setStep('hours');
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Could not change hours',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, extension?._id, onCancelExtension]);

  const handleTopupSuccess = useCallback(async () => {
    setTopupOpen(false);
    // Pull the fresh wallet so the canPay flag flips green before the
    // next click — without this the user would see "Add ₹X" briefly
    // even after the top-up.
    if (onWalletRefresh) {
      try {
        await onWalletRefresh();
      } catch {
        // Non-fatal: even if the refresh fails, the next Pay click
        // will hit the server, which has the up-to-date balance.
      }
    }
  }, [onWalletRefresh]);

  if (!open) return null;

  const showChangeHours =
    onCancelExtension &&
    extension?._id &&
    (step === 'otp' || step === 'pay');

  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/45"
        onClick={busy ? undefined : onClose}
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-6 animate-slide-up">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center mb-2">
              <Clock className="w-5 h-5 text-primary-dark" />
            </div>
            <h2 className="text-lg font-bold text-text">
              {step === 'done'
                ? 'Ride extended'
                : step === 'dismissed'
                  ? 'Driver dismissed extension'
                  : 'Extend your ride'}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {step === 'hours'
                ? isDays
                  ? 'Add extra days to your outstation trip. Driver confirms via OTP and you pay from wallet.'
                  : remainingMinutes <= 0
                    ? 'Your booked time is over. Add more hours to keep the driver.'
                    : `About ${Math.max(1, remainingMinutes)} min left on your original booking.`
                : step === 'otp'
                  ? 'Ask your driver to read the 4-digit code on their screen.'
                  : step === 'pay'
                    ? 'Confirm the extension and pay from your wallet.'
                    : step === 'dismissed'
                      ? 'Your driver couldn’t accept this. You can try again or keep your current ride.'
                      : 'You can keep going — see you at the end!'}
            </p>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-gray-100 -mt-1 -mr-1"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          )}
        </div>

        {step !== 'done' && step !== 'dismissed' && (
          <StepIndicator
            steps={['Hours', 'Driver OTP', 'Pay']}
            current={step === 'hours' ? 0 : step === 'otp' ? 1 : 2}
          />
        )}

        <div className="mt-4">
          {step === 'hours' && (
            <HoursStep
              hours={hours}
              setHours={setHours}
              minHours={min}
              maxHours={max}
              busy={busy}
              previewCost={previewCost}
              extraHourRate={unitRate}
              unitLabel={unitLabel}
              unitLabelLong={unitLabelLong}
              isDays={isDays}
            />
          )}

          {step === 'otp' && (
            <OtpStep
              otp={otp}
              setOtp={(v) => {
                setOtp(v);
                if (otpError) setOtpError(null);
              }}
              otpError={otpError}
              extension={extension}
              busy={busy}
              unitLabel={unitLabel}
              isDays={isDays}
            />
          )}

          {step === 'pay' && (
            <PayStep
              extension={extension}
              walletBalance={walletBalance}
              walletShortBy={walletShortBy}
              canPay={canPay}
              busy={busy}
              unitLabel={unitLabel}
              isDays={isDays}
            />
          )}

          {step === 'dismissed' && (
            <DismissedStep
              extension={extension || extensionRejection}
              unitLabel={unitLabel}
              isDays={isDays}
            />
          )}

          {step === 'done' && (
            <DoneStep extension={extension} unitLabel={unitLabel} isDays={isDays} />
          )}
        </div>

        {/* Step actions ------------------------------------------ */}
        {step === 'hours' && (
          <>
            <Button
              fullWidth
              loading={busy}
              onClick={handleInitiate}
              className="mt-5"
            >
              Continue · +{hours}
              {unitLabel}
            </Button>
            <Button
              fullWidth
              variant="ghost"
              disabled={busy}
              onClick={onClose}
              className="mt-2"
            >
              Not now
            </Button>
          </>
        )}

        {step === 'otp' && (
          <>
            <Button
              fullWidth
              loading={busy}
              onClick={handleVerify}
              disabled={busy || !/^\d{4}$/.test(otp)}
              className="mt-5"
            >
              Verify code
            </Button>
            {showChangeHours ? (
              <Button
                fullWidth
                variant="ghost"
                icon={Pencil}
                disabled={busy}
                onClick={handleChangeHours}
                className="mt-2"
              >
                Change hours
              </Button>
            ) : (
              <Button
                fullWidth
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setExtension(null);
                  setOtp('');
                  setOtpError(null);
                  setStep('hours');
                }}
                className="mt-2"
              >
                Back
              </Button>
            )}
          </>
        )}

        {step === 'dismissed' && (
          <>
            <Button
              fullWidth
              onClick={() => {
                // Retry = clear the rejection so this effect doesn't
                // immediately bounce us back, then reset to step 1.
                onClearRejection?.();
                setExtension(null);
                setOtp('');
                setOtpError(null);
                setHours(min);
                setStep('hours');
              }}
              className="mt-5"
            >
              Try again
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => {
                onClearRejection?.();
                onClose?.();
              }}
              className="mt-2"
            >
              Keep my ride
            </Button>
          </>
        )}

        {step === 'pay' && (
          <>
            {canPay ? (
              <Button
                fullWidth
                loading={busy}
                onClick={handlePay}
                disabled={busy}
                className="mt-5"
              >
                Pay ₹{lockedFareDelta} from wallet
              </Button>
            ) : (
              <Button
                fullWidth
                icon={Plus}
                disabled={busy}
                onClick={() => setTopupOpen(true)}
                className="mt-5"
              >
                Add ₹{walletShortBy} to wallet
              </Button>
            )}
            {showChangeHours && (
              <Button
                fullWidth
                variant="ghost"
                icon={Pencil}
                disabled={busy}
                onClick={handleChangeHours}
                className="mt-2"
              >
                Change hours
              </Button>
            )}
            <Button
              fullWidth
              variant="ghost"
              disabled={busy}
              onClick={onClose}
              className="mt-2"
            >
              {canPay ? 'Cancel' : 'Pay later'}
            </Button>
          </>
        )}
      </div>

      {/* Inline top-up — wallet flow without leaving the extension UX.
          Pre-fills the exact shortfall and refreshes the parent wallet
          on success so the Pay button immediately enables. */}
      <TopupSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        suggestedAmount={walletShortBy}
        title="Add money to pay for extension"
        subtitle={`You need ₹${walletShortBy} more to extend by ${
          isDays
            ? extension?.additionalDays || hours
            : extension?.additionalHours || hours
        }${unitLabel}`}
        onSuccess={handleTopupSuccess}
      />
    </div>
  );
};

/* ----------------------------- atoms ----------------------------- */

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, idx) => {
        const active = idx === current;
        const done = idx < current;
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide flex-1 justify-center ${
                done
                  ? 'bg-emerald-100 text-emerald-700'
                  : active
                    ? 'bg-primary/15 text-primary-dark'
                    : 'bg-gray-100 text-text-muted'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-primary text-white'
                      : 'bg-white text-text-muted'
                }`}
              >
                {done ? '\u2713' : idx + 1}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HoursStep({
  hours,
  setHours,
  minHours,
  maxHours,
  busy,
  previewCost,
  extraHourRate,
  unitLabel = 'h',
  unitLabelLong = 'hours',
  isDays = false,
}) {
  return (
    <>
      <div className="bg-bg rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-text-muted uppercase tracking-wide">
            Add {unitLabelLong}
          </p>
          <p className="text-3xl font-bold text-text mt-1">
            {hours}
            <span className="text-base font-medium text-text-muted">{' '}{unitLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-10 h-10 rounded-full border border-border bg-white text-text disabled:opacity-50 flex items-center justify-center"
            disabled={busy || hours <= minHours}
            onClick={() => setHours((h) => Math.max(minHours, h - 1))}
            aria-label="Decrease"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="w-10 h-10 rounded-full bg-primary text-white disabled:opacity-50 flex items-center justify-center"
            disabled={busy || hours >= maxHours}
            onClick={() => setHours((h) => Math.min(maxHours, h + 1))}
            aria-label="Increase"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-text-muted">Approx extra fare</span>
        <span className="text-base font-bold text-text">₹{previewCost}</span>
      </div>
      <p className="text-[11px] text-text-muted mt-1 leading-snug">
        ~₹{extraHourRate}/{isDays ? 'day' : 'hr'} (final amount shown after your driver shares the code).
      </p>
    </>
  );
}

function OtpStep({ otp, setOtp, otpError, extension, busy, unitLabel = 'h', isDays = false }) {
  const extAmount = isDays
    ? extension?.additionalDays || 0
    : extension?.additionalHours || 0;
  const digits = (otp || '').split('').concat(['', '', '', '']).slice(0, 4);
  return (
    <>
      <div className="bg-bg rounded-2xl p-4 text-center">
        <p className="text-[11px] text-text-muted uppercase tracking-wide mb-2">
          Code from your driver
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
          disabled={busy}
          aria-label="4-digit OTP"
          className="absolute opacity-0 pointer-events-none"
        />
        <div className="flex items-center justify-center gap-2">
          {digits.map((d, i) => (
            <div
              key={i}
              className={`w-12 h-14 rounded-2xl border-2 flex items-center justify-center text-xl font-bold text-text ${
                otp.length === i
                  ? 'border-primary bg-white'
                  : d
                    ? 'border-text/30 bg-white'
                    : 'border-border bg-white'
              }`}
              onClick={() => {
                const el = document.querySelector('input[autocomplete="one-time-code"]');
                el?.focus();
              }}
            >
              {d || ''}
            </div>
          ))}
        </div>
        {otpError && (
          <p className="text-[12px] text-red-600 mt-3">{otpError}</p>
        )}
      </div>
      {extension?.fareDelta != null && (
        <div className="mt-3 rounded-2xl border border-border-light px-3 py-2 text-[12px] text-text-muted">
          You&rsquo;re about to extend by{' '}
          <strong className="text-text">{extAmount}{unitLabel}</strong>{' '}
          for{' '}
          <strong className="text-text">₹{extension.fareDelta}</strong>.
        </div>
      )}
      <p className="text-[11px] text-text-muted mt-3 leading-snug">
        Tap the boxes and type the 4-digit code your driver reads aloud. Their app shows the code on their screen.
      </p>
    </>
  );
}

function PayStep({
  extension,
  walletBalance,
  walletShortBy,
  canPay,
  busy,
  unitLabel = 'h',
  isDays = false,
}) {
  const additionalAmount = isDays
    ? extension?.additionalDays || 0
    : extension?.additionalHours || 0;
  const fareDelta = Number(extension?.fareDelta || 0);
  return (
    <>
      <div className="bg-bg rounded-2xl p-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Add to your ride</span>
          <strong className="text-text">+{additionalAmount}{unitLabel}</strong>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Extra fare</span>
          <strong className="text-text">₹{fareDelta}</strong>
        </div>
        <div className="h-px bg-border-light my-1" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted inline-flex items-center gap-1.5">
            <WalletIcon className="w-3.5 h-3.5" /> Wallet (available)
          </span>
          <span
            className={`font-semibold ${canPay ? 'text-text' : 'text-amber-700'}`}
          >
            ₹{walletBalance}
          </span>
        </div>
        {!canPay && (
          <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800 space-y-1">
            <p>
              You need <strong>₹{walletShortBy}</strong> more in your wallet.
            </p>
            <p className="text-[11px] text-amber-700/90">
              The driver&rsquo;s code is already verified — tap{' '}
              <strong>Add ₹{walletShortBy}</strong> below to top up right
              here and pay without losing your spot.
            </p>
          </div>
        )}
        {canPay && !busy && (
          <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1 mt-1">
            <ShieldCheck className="w-3 h-3" />
            Driver already confirmed the code — paying extends your ride immediately.
          </p>
        )}
      </div>
    </>
  );
}

function DismissedStep({ extension, unitLabel = 'h', isDays = false }) {
  const additionalAmount = isDays
    ? Number(extension?.additionalDays || 0)
    : Number(extension?.additionalHours || 0);
  const fareDelta = Number(extension?.fareDelta || 0);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center">
        <X className="w-6 h-6" />
      </div>
      <p className="text-base font-bold text-amber-900 mt-2">
        Driver couldn’t accept the extension
      </p>
      {additionalAmount > 0 && (
        <p className="text-[12px] text-amber-800 mt-1">
          Your request for <strong>+{additionalAmount}{unitLabel}</strong>
          {fareDelta > 0 ? <> at <strong>₹{fareDelta}</strong></> : null}{' '}
          was dismissed by your driver.
        </p>
      )}
      <p className="text-[12px] text-amber-800/90 mt-2 leading-snug">
        Nothing was charged. You can try a different duration or keep
        your current ride — the booked time stays exactly as it was.
      </p>
    </div>
  );
}

function DoneStep({ extension, unitLabel = 'h', isDays = false }) {
  const amount = isDays
    ? extension?.additionalDays || 0
    : extension?.additionalHours || 0;
  return (
    <div className="bg-bg rounded-2xl p-5 flex flex-col items-center text-center">
      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
      <p className="text-base font-bold text-text mt-2">
        Extended by {amount}{unitLabel}
      </p>
      <p className="text-[12px] text-text-muted mt-1">
        Your driver has been notified and the trip just got{' '}
        {amount}{unitLabel} longer.
      </p>
    </div>
  );
}

export default ExtendRideModal;
