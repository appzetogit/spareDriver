import { ArrowLeft, WifiOff } from 'lucide-react';
import Avatar from '../Avatar';

export default function ChatHeader({
  title,
  subtitle,
  avatarSrc,
  onBack,
  isConnected = true,
  compact = false,
}) {
  return (
    <div
      className={`flex items-center gap-2.5 border-b border-border-light bg-white shrink-0 ${
        compact ? 'px-3 py-2.5' : 'px-3 py-3'
      }`}
    >
      <button
        type="button"
        onClick={onBack}
        className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-text"
        aria-label="Close chat"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <Avatar src={avatarSrc || null} name={title || 'Chat'} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text truncate">{title || 'Chat'}</p>
        {!isConnected ? (
          <p className="text-[11px] text-amber-600 font-medium inline-flex items-center gap-1">
            <WifiOff className="w-3 h-3" />
            Connecting…
          </p>
        ) : (
          <p className="text-[11px] text-text-muted truncate">
            {subtitle || 'Trip chat'}
          </p>
        )}
      </div>
    </div>
  );
}
