import { useEffect, useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import Card from '../../../../components/Card';
import { formatExtensionHours } from '../../../../utils/formatters';

/**
 * Banner the driver sees while the customer is mid-way through the
 * extension handshake. Renders the OTP code prominently so it can be
 * read aloud, and updates as the customer verifies + pays.
 *
 *   stage 'otp'       → big code, "Read this out to the customer"
 *   stage 'verified'  → "Customer entered code, waiting for payment…"
 *   stage 'paid'      → "Extended by Xh — keep going!"
 */
export default function ExtensionOtpBanner({ banner, onDismiss, footer = null }) {
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
      {footer}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full h-9 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
        >
          Dismiss
        </button>
      )}
    </Card>
  );
}
