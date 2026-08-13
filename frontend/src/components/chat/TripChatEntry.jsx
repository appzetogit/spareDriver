import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TripChatButton from './TripChatButton';
import TripChatPanel from './TripChatPanel';
import { useTripChat } from '../../hooks/useTripChat';
import { isChatVisibleForBooking } from '../../constants/chat';

function isTripChatOpenPayload(data, bookingId) {
  const kind = data?.kind || data?.type || '';
  if (kind !== 'trip_chat_message') return false;
  const nid = data?.bookingId ? String(data.bookingId) : '';
  if (nid && bookingId && nid !== String(bookingId)) return false;
  return true;
}

/**
 * Drop-in Chat button + panel for trip screens.
 * Renders nothing when chat is not available for the booking.
 * `?chat=1` (and FCM notification clicks) auto-open the inbox.
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
  const [searchParams, setSearchParams] = useSearchParams();
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

  useEffect(() => {
    if (!id || searchParams.get('chat') !== '1') return;
    const urlBookingId = searchParams.get('bookingId');
    if (urlBookingId && String(urlBookingId) !== String(id)) return;
    const channel = searchParams.get('channel');
    if (channel) chat.selectChannel(channel);
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('chat');
    next.delete('channel');
    setSearchParams(next, { replace: true });
  }, [searchParams, id]);

  useEffect(() => {
    if (!id || typeof navigator === 'undefined') return undefined;
    const onSwMessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== 'SD_NOTIFICATION_OPEN') return;
      const data = msg.payload || {};
      if (!isTripChatOpenPayload(data, id)) return;
      if (data.channel) chat.selectChannel(data.channel);
      setOpen(true);
    };
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
    };
  }, [id, chat.selectChannel]);

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
