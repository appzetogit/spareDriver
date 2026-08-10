import { useState } from 'react';
import TripChatButton from './TripChatButton';
import TripChatPanel from './TripChatPanel';
import { useTripChat } from '../../hooks/useTripChat';
import { isChatVisibleForBooking } from '../../constants/chat';

/**
 * Drop-in Chat button + panel for trip screens.
 * Renders nothing when chat is not available for the booking.
 */
export default function TripChatEntry({
  booking,
  bookingId,
  audience = 'user',
  selfId,
  peerName,
  peerAvatar,
  subtitle,
  buttonVariant = 'default',
  buttonClassName = '',
  buttonLabel = 'Chat',
  showSenderLabels = false,
  controlledOpen,
  onOpenChange,
  hideButton = false,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : internalOpen;
  const setOpen = (next) => {
    if (onOpenChange) onOpenChange(next);
    if (typeof controlledOpen !== 'boolean') setInternalOpen(next);
  };

  const id = bookingId || booking?._id || booking?.id;
  const visible = booking ? isChatVisibleForBooking(booking) : Boolean(id);

  const chat = useTripChat({
    bookingId: id,
    audience,
    booking,
    selfId,
    open,
    peerName,
  });

  if (!visible || !id) return null;

  return (
    <>
      {!hideButton && (
        <TripChatButton
          onClick={() => setOpen(true)}
          unreadCount={chat.unreadCount}
          variant={buttonVariant}
          className={buttonClassName}
          label={buttonLabel}
        />
      )}
      <TripChatPanel
        isOpen={open}
        onClose={() => setOpen(false)}
        chat={chat}
        peerName={peerName}
        peerAvatar={peerAvatar}
        subtitle={subtitle}
        showSenderLabels={showSenderLabels}
        audience={audience}
      />
    </>
  );
}
