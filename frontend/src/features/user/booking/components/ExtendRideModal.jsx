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
import {
  formatExtensionHours,
  HOURLY_EXTENSION_PRESETS_MINUTES,
} from '../../../../utils/formatters';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Extend-your-ride modal — 3-step handshake with mid-flow recovery.
 *
 *   Step 1 (`hours`)   — pick duration:
 *                          unit="hours"      → 15 min / 30 min / 1h chips
 *                          unit="days"       → whole-day stepper
 *                          unit="outstation" → Hours | Days toggle, then
 *                                              the matching picker
 *                        Continue calls `onInitiate(amount, { unit })`.
 *
 *   Step 2 (`otp`)     — customer asks the driver for the code.
 *   Step 3 (`pay`)     — wallet pay for fareDelta.
 *   Step 4 (`done`)    — confirmation.
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
  minHours = 0.25,
  maxHours = 8,
  unit = 'hours',
  perDayRate = 0,
  minDays = 1,
  maxDays = 14,
}) => {
  const allowUnitSwitch = unit === 'outstation';
  // Outstation defaults to days (legacy); hourly bookings stay on hours.
  const [activeUnit, setActiveUnit] = useState(
    unit === 'days' || unit === 'outstation' ? 'days' : 'hours',
  );
  const isDays = allowUnitSwitch ? activeUnit === 'days' : unit === 'days';
  const min = isDays ? minDays : minHours;
  const max = isDays ? maxDays : maxHours;
  const unitLabel = isDays ? 'day' : null;
  const unitLabelLong = isDays ? 'days' : 'time';
  const unitRate = isDays ? perDayRate : extraHourRate;
  const [step, setStep] = useState('hours');
  const [hours, setHours] = useState(min);
  const [busy, setBusy] = useState(false);
  const [extension, setExtension] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState(null);
  const [topupOpen, setTopupOpen] = useState(false);

  const hourlyPresets = useMemo(() => {
    const maxMin = Math.round(Number(maxHours) * 60) || 480;
    return HOURLY_EXTENSION_PRESETS_MINUTES
      .filter((m) => m <= maxMin)
      .map((minutes) => ({
        minutes,
        hours: round2(minutes / 60),
        label: formatExtensionHours(minutes / 60),
      }));
  }, [maxHours]);

  const defaultHourlyAmount = hourlyPresets[0]?.hours ?? 0.25;

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
      const pendingDays = Number(pendingExtension.additionalDays) || 0;
      const resumeAsDays = pendingDays > 0;
      if (allowUnitSwitch) {
        setActiveUnit(resumeAsDays ? 'days' : 'hours');
      }
      const fromExtension = resumeAsDays
        ? pendingDays
        : pendingExtension.additionalHours;
      setHours(
        Number(fromExtension) ||
          (resumeAsDays ? minDays : defaultHourlyAmount),
      );
      setStep(stage === 'pending_payment' ? 'pay' : 'otp');
    } else {
      setExtension(null);
      const startAsDays = unit === 'days' || unit === 'outstation';
      if (allowUnitSwitch) setActiveUnit(startAsDays ? 'days' : 'hours');
      setHours(startAsDays ? minDays : defaultHourlyAmount);
      setStep('hours');
    }
  }, [
    open,
    pendingExtension,
    extensionRejection,
    allowUnitSwitch,
    unit,
    minDays,
    defaultHourlyAmount,
  ]);

  useEffect(() => {
    if (!open) return;
    if (!extensionRejection) return;
    if (step === 'done') return;
    if (
      extension?._id &&
      String(extension._id) !== String(extensionRejection.extensionId)
    ) {
      onClearRejection?.();
      return;
    }
    setBusy(false);
    setOtp('');
    setOtpError(null);
    setExtension({
      _id: extensionRejection.extensionId,
      additionalHours: extensionRejection.additionalHours,
      additionalDays: extensionRejection.additionalDays,
      fareDelta: extensionRejection.fareDelta,
      status: 'declined',
      dismissedByDriver: true,
    });
    setStep('dismissed');
  }, [open, extensionRejection, extension?._id, step, onClearRejection]);

  const previewCost = useMemo(
    () => round2(Math.max(0, hours) * unitRate),
    [hours, unitRate],
  );

  const lockedFareDelta = round2(extension?.fareDelta || 0);
  const walletShortBy = round2(
    Math.max(0, lockedFareDelta - Number(walletBalance || 0)),
  );
  const canPay = walletShortBy <= 0 && lockedFareDelta > 0;

  const formatAmount = useCallback(
    (value, forceDays = isDays) => {
      if (forceDays) return `${Number(value) || 0}d`;
      return formatExtensionHours(value);
    },
    [isDays],
  );

  const handleSelectUnit = useCallback(
    (next) => {
      if (!allowUnitSwitch || busy || next === activeUnit) return;
      setActiveUnit(next);
      setHours(next === 'days' ? minDays : defaultHourlyAmount);
    },
    [allowUnitSwitch, busy, activeUnit, minDays, defaultHourlyAmount],
  );

  const handleInitiate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await onInitiate(hours, { unit: isDays ? 'days' : 'hours' });
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
  }, [busy, hours, onInitiate, isDays]);

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
      const extDays = Number(extension.additionalDays) || 0;
      const extAmount = extDays > 0
        ? extDays
        : extension.additionalHours || 0;
      toast.success(
        `Ride extended by ${formatAmount(extAmount, extDays > 0)}`,
      );
      setStep('done');
      setTimeout(() => onClose?.(), 1200);
    } catch (err) {
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
  }, [busy, extension, onClose, onPay, formatAmount]);

  const handleChangeHours = useCallback(async () => {
    if (busy) return;
    if (!extension?._id || !onCancelExtension) {
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
        err?.response?.data?.message || err?.message || 'Could not change duration',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, extension?._id, onCancelExtension]);

  const handleTopupSuccess = useCallback(async () => {
    setTopupOpen(false);
    if (onWalletRefresh) {
      try {
        await onWalletRefresh();
      } catch {
        // Non-fatal
      }
    }
  }, [onWalletRefresh]);

  if (!open) return null;

  const showChangeHours =
    onCancelExtension &&
    extension?._id &&
    (step === 'otp' || step === 'pay');

  const continueLabel = isDays
    ? `Continue · +${hours}d`
    : `Continue · +${formatExtensionHours(hours)}`;

  const lockedDays = Number(extension?.additionalDays) || 0;
  const topupDuration = formatAmount(
    lockedDays > 0
      ? lockedDays
      : extension?.additionalHours || hours,
    lockedDays > 0 || (isDays && !extension),
  );

  const displayIsDays = (value) => {
    // Prefer the locked extension row when mid-handshake.
    if (extension) return Number(extension.additionalDays) > 0;
    return isDays;
  };

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
                ? allowUnitSwitch
                  ? 'Add hours or full days to your outstation trip. Driver confirms via OTP and you pay from wallet.'
                  : isDays
                    ? 'Add extra days to your outstation trip. Driver confirms via OTP and you pay from wallet.'
                    : remainingMinutes <= 0
                      ? 'Your booked time is over. Add more time to keep the driver.'
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
            steps={[
              allowUnitSwitch ? 'Duration' : isDays ? 'Days' : 'Time',
              'Driver OTP',
              'Pay',
            ]}
            current={step === 'hours' ? 0 : step === 'otp' ? 1 : 2}
          />
        )}

        <div className="mt-4">
          {step === 'hours' && (
            <>
              {allowUnitSwitch && (
                <div className="mb-3 grid grid-cols-2 gap-2 p-1 rounded-2xl bg-bg border border-border-light">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSelectUnit('hours')}
                    className={`rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      !isDays
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-text-muted hover:text-text'
                    }`}
                  >
                    By hours
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSelectUnit('days')}
                    className={`rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isDays
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-text-muted hover:text-text'
                    }`}
                  >
                    By days
                  </button>
                </div>
              )}
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
                presets={hourlyPresets}
              />
            </>
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
              formatAmount={(v) => formatAmount(v, displayIsDays())}
              isDays={displayIsDays()}
            />
          )}

          {step === 'pay' && (
            <PayStep
              extension={extension}
              walletBalance={walletBalance}
              walletShortBy={walletShortBy}
              canPay={canPay}
              busy={busy}
              formatAmount={(v) => formatAmount(v, displayIsDays())}
              isDays={displayIsDays()}
            />
          )}

          {step === 'dismissed' && (
            <DismissedStep
              extension={extension || extensionRejection}
              formatAmount={(v) =>
                formatAmount(
                  v,
                  Number(
                    (extension || extensionRejection)?.additionalDays,
                  ) > 0,
                )
              }
              isDays={
                Number((extension || extensionRejection)?.additionalDays) > 0
              }
            />
          )}

          {step === 'done' && (
            <DoneStep
              extension={extension}
              formatAmount={(v) => formatAmount(v, displayIsDays())}
              isDays={displayIsDays()}
            />
          )}
        </div>

        {step === 'hours' && (
          <>
            <Button
              fullWidth
              loading={busy}
              onClick={handleInitiate}
              className="mt-5"
            >
              {continueLabel}
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
                Change duration
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
                onClearRejection?.();
                setExtension(null);
                setOtp('');
                setOtpError(null);
                setHours(isDays ? minDays : defaultHourlyAmount);
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
                Change duration
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

      <TopupSheet
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        suggestedAmount={walletShortBy}
        title="Add money to pay for extension"
        subtitle={`You need ₹${walletShortBy} more to extend by ${topupDuration}`}
        onSuccess={handleTopupSuccess}
      />
    </div>
  );
};

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
  presets = [],
}) {
  if (!isDays) {
    return (
      <>
        <div className="bg-bg rounded-2xl p-4">
          <p className="text-[11px] text-text-muted uppercase tracking-wide">
            Add time
          </p>
          <p className="text-3xl font-bold text-text mt-1">
            {formatExtensionHours(hours)}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {presets.map((preset) => {
              const selected = Math.abs(hours - preset.hours) < 0.001;
              return (
                <button
                  key={preset.minutes}
                  type="button"
                  disabled={busy}
                  onClick={() => setHours(preset.hours)}
                  className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    selected
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white border border-border text-text hover:border-primary/40'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-text-muted">Approx extra fare</span>
          <span className="text-base font-bold text-text">₹{previewCost}</span>
        </div>
        <p className="text-[11px] text-text-muted mt-1 leading-snug">
          ~₹{extraHourRate}/hr (final amount shown after your driver shares the code).
        </p>
      </>
    );
  }

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
        ~₹{extraHourRate}/day (final amount shown after your driver shares the code).
      </p>
    </>
  );
}

function OtpStep({ otp, setOtp, otpError, extension, busy, formatAmount, isDays = false }) {
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
          <strong className="text-text">{formatAmount(extAmount)}</strong>{' '}
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
  formatAmount,
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
          <strong className="text-text">+{formatAmount(additionalAmount)}</strong>
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

function DismissedStep({ extension, formatAmount, isDays = false }) {
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
          Your request for <strong>+{formatAmount(additionalAmount)}</strong>
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

function DoneStep({ extension, formatAmount, isDays = false }) {
  const amount = isDays
    ? extension?.additionalDays || 0
    : extension?.additionalHours || 0;
  const label = formatAmount(amount);
  return (
    <div className="bg-bg rounded-2xl p-5 flex flex-col items-center text-center">
      <CheckCircle2 className="w-12 h-12 text-emerald-500" />
      <p className="text-base font-bold text-text mt-2">
        Extended by {label}
      </p>
      <p className="text-[12px] text-text-muted mt-1">
        Your driver has been notified and the trip just got{' '}
        {label} longer.
      </p>
    </div>
  );
}

export default ExtendRideModal;
