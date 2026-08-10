import { CHAT_ROLE_LABEL, CHAT_SENDER_ROLE } from '../../constants/chat';

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function readState(message, selfRole) {
  if (!message || message.senderRole !== selfRole) return null;
  if (message.pending) return 'Sending';
  if (message.failed) return 'Failed';
  const others = (message.readBy || []).filter(
    (r) => r.readerRole !== selfRole,
  );
  if (others.length > 0) return 'Read';
  return 'Sent';
}

export default function MessageBubble({
  message,
  selfRole,
  showSenderLabel = false,
}) {
  const mine = message.senderRole === selfRole;
  const status = readState(message, selfRole);
  const roleLabel =
    CHAT_ROLE_LABEL[message.senderRole] ||
    (message.senderRole === CHAT_SENDER_ROLE.ADMIN ? 'Support' : 'User');

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} px-1`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2 ${
          mine
            ? 'bg-slate-900 text-white rounded-br-md'
            : 'bg-white text-text border border-border-light rounded-bl-md shadow-sm'
        } ${message.pending ? 'opacity-70' : ''} ${message.failed ? 'ring-1 ring-danger/40' : ''}`}
      >
        {showSenderLabel && !mine && (
          <p
            className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
              message.senderRole === CHAT_SENDER_ROLE.ADMIN
                ? 'text-sky-600'
                : message.senderRole === CHAT_SENDER_ROLE.DRIVER
                  ? 'text-amber-700'
                  : 'text-emerald-700'
            }`}
          >
            {message.senderName || roleLabel}
          </p>
        )}
        <p className="text-sm leading-snug whitespace-pre-wrap break-words">
          {message.message}
        </p>
        <div
          className={`mt-1 flex items-center gap-1.5 ${
            mine ? 'justify-end text-white/70' : 'justify-start text-text-muted'
          }`}
        >
          <span className="text-[10px]">{formatTime(message.createdAt)}</span>
          {status && <span className="text-[10px]">· {status}</span>}
        </div>
      </div>
    </div>
  );
}
