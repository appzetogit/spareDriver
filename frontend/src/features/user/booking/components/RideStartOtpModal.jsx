import { ShieldCheck } from 'lucide-react';
import Button from '../../../../components/Button';

/**
 * "Your driver is here — here is the code" alert.
 *
 * The OTP already reaches every page: the booking socket payload carries it
 * for the customer audience and `UserBookingAlertsBridge` merges it into the
 * active-booking store from anywhere in the app. What was missing was
 * somewhere to *see* it — only the assigned, tracking and trip-details pages
 * rendered the code, so a customer sitting on Home or Wallet when the driver
 * marked arrival had the OTP in memory and no way to read it.
 *
 * Rendered globally from the alerts bridge, and suppressed on the pages that
 * already show the code inline so it never doubles up.
 */
export default function RideStartOtpModal({ open, code, driverName, onClose }) {
  if (!open || !code) return null;

  const digits = String(code).split('');

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 leading-tight">
              {driverName ? `${driverName} has arrived` : 'Your driver has arrived'}
            </p>
            <p className="text-sm text-gray-600 leading-snug">
              Read this code out to start the trip.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-center py-2">
          {digits.map((digit, idx) => (
            <span
              key={`ride-otp-${idx}`}
              className="inline-flex items-center justify-center w-12 h-14 text-2xl font-bold text-amber-900 bg-amber-50 rounded-xl border border-amber-300 shadow-sm"
            >
              {digit}
            </span>
          ))}
        </div>

        <p className="text-xs text-gray-500 text-center mt-3">
          You can find this code again on your trip screen.
        </p>

        <Button className="w-full mt-5" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
