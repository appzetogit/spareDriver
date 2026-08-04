/**
 * Shows a countdown while resend is locked, then an enabled "Resend OTP" control.
 */
export default function OtpResendRow({
  canResend,
  remaining = 0,
  onResend,
  loading = false,
  className = '',
  align = 'center',
}) {
  const alignClass =
    align === 'end' ? 'justify-end' : align === 'between' ? 'justify-between' : 'justify-center';

  return (
    <div className={`flex items-center ${alignClass} text-sm ${className}`}>
      {canResend ? (
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className="font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:pointer-events-none transition-colors"
        >
          {loading ? 'Sending…' : 'Resend OTP'}
        </button>
      ) : (
        <p className="text-slate-400">
          Resend OTP in{' '}
          <span className="font-semibold text-slate-600 tabular-nums">{remaining}s</span>
        </p>
      )}
    </div>
  );
}
