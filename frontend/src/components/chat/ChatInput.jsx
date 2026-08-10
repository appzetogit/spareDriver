import { Send, Loader2 } from 'lucide-react';
import { CHAT_MESSAGE_MAX_LENGTH } from '../../constants/chat';

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  sending = false,
  placeholder = 'Type a message…',
  compact = false,
}) {
  const trimmed = (value || '').trim();
  const canSend = trimmed.length > 0 && !disabled && !sending;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend?.();
    }
  };

  return (
    <div
      className={`border-t border-border-light bg-white shrink-0 ${
        compact ? 'px-2.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]' : 'px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
      }`}
    >
      {disabled ? (
        <p className="text-xs text-center text-text-muted py-2">
          {compact ? 'View only' : 'Chat is read-only for this trip'}
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            placeholder={placeholder}
            className="flex-1 resize-none rounded-2xl border border-border bg-gray-50 px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary max-h-28"
          />
          <button
            type="button"
            onClick={() => canSend && onSend?.()}
            disabled={!canSend}
            className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-slate-800 active:scale-95 transition"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
