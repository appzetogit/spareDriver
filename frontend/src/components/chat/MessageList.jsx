import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { CHAT_ROLE_LABEL } from '../../constants/chat';

export default function MessageList({
  messages,
  selfRole,
  loading,
  loadingOlder,
  hasMore,
  onLoadOlder,
  typingPeer,
  showSenderLabels = false,
}) {
  const scrollerRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [showNewBtn, setShowNewBtn] = useState(false);
  const prevLenRef = useRef(0);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
    if (stickToBottomRef.current) setShowNewBtn(false);

    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      onLoadOlder?.();
    }
  };

  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (!grew) return;
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowNewBtn(false);
    } else {
      setShowNewBtn(true);
    }
  }, [messages]);

  useEffect(() => {
    if (typingPeer && stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [typingPeer]);

  const scrollToNewest = () => {
    stickToBottomRef.current = true;
    setShowNewBtn(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading messages…
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-3 py-3 space-y-2 bg-[#f4f4f5]"
      >
        {loadingOlder && (
          <div className="flex justify-center py-2 text-xs text-text-muted gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading earlier…
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <p className="text-center text-[11px] text-text-muted py-1">
            Beginning of conversation
          </p>
        )}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <p className="text-sm font-semibold text-text">Start a conversation</p>
            <p className="text-xs text-text-muted mt-1">
              Messages stay with this trip only.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id || m.clientMessageId}
            message={m}
            selfRole={selfRole}
            showSenderLabel={showSenderLabels}
          />
        ))}
        {typingPeer && (
          <p className="text-xs text-text-muted px-2 italic">
            {CHAT_ROLE_LABEL[typingPeer.senderRole] || 'Someone'} is typing…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {showNewBtn && (
        <button
          type="button"
          onClick={scrollToNewest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 shadow-lg"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          New messages
        </button>
      )}
    </div>
  );
}
