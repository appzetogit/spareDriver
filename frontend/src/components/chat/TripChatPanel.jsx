import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatChannelTabs from './ChatChannelTabs';
import QuickReplies from './QuickReplies';
import { quickRepliesFor } from '../../constants/chat';

/**
 * Compact floating trip chat panel (not full-screen).
 */
export default function TripChatPanel({
  isOpen,
  onClose,
  chat,
  peerName = 'Chat',
  peerAvatar = null,
  subtitle = 'Trip chat',
  showSenderLabels = false,
  audience = 'user',
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen || !chat) return null;

  const quickReplies =
    chat.recipientRole && chat.selfRole
      ? quickRepliesFor(chat.selfRole, chat.recipientRole)
      : [];

  const panel = (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/25 pointer-events-auto"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="absolute inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:left-auto w-auto max-w-[360px] h-[min(420px,72dvh)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto border border-border-light animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Trip chat"
      >
        <ChatHeader
          title={peerName}
          subtitle={subtitle}
          avatarSrc={peerAvatar}
          onBack={onClose}
          isConnected={chat.isConnected}
          compact
        />

        <ChatChannelTabs
          tabs={chat.tabs}
          activeChannel={chat.activeChannel}
          onSelect={chat.selectChannel}
          unreadByChannel={chat.unreadByChannel}
        />

        {chat.error && (
          <div className="px-3 py-1.5 bg-red-50 text-danger text-xs border-b border-red-100 shrink-0">
            {chat.error}
          </div>
        )}

        <MessageList
          messages={chat.messages}
          selfRole={chat.selfRole}
          loading={chat.loading}
          loadingOlder={chat.loadingOlder}
          hasMore={chat.hasMore}
          onLoadOlder={chat.loadOlder}
          typingPeer={chat.typingPeer}
          showSenderLabels={showSenderLabels || audience === 'admin'}
        />

        <QuickReplies
          items={quickReplies}
          disabled={!chat.canWrite || audience === 'admin'}
          onPick={(text) => chat.sendMessage(text)}
        />

        <ChatInput
          value={chat.draft}
          onChange={chat.setDraftText}
          onSend={() => chat.sendMessage()}
          disabled={!chat.canWrite || audience === 'admin'}
          sending={chat.sending}
          compact
        />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
