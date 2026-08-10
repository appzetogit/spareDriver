import { MessageSquare } from 'lucide-react';

/**
 * Compact Chat CTA with optional unread badge.
 * Use next to Call on trip screens.
 */
export default function TripChatButton({
  onClick,
  unreadCount = 0,
  disabled = false,
  className = '',
  label = 'Chat',
  variant = 'default',
}) {
  const count = Number(unreadCount) || 0;
  const base =
    variant === 'emerald'
      ? 'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 active:scale-95 transition disabled:opacity-50'
      : variant === 'driver'
        ? 'mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white font-semibold py-3 text-sm shadow-sm hover:bg-slate-800 active:scale-[0.98] transition disabled:opacity-50'
        : 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-text hover:bg-gray-50 active:scale-95 transition disabled:opacity-50';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${className} relative`}
      aria-label={count > 0 ? `${label}, ${count} unread` : label}
    >
      <MessageSquare className="w-4 h-4" />
      <span>{label}</span>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
