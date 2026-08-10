import api from '../utils/api';
import { CHAT_HISTORY_DEFAULT_LIMIT } from '../constants/chat';

function chatBase(audience, bookingId) {
  if (audience === 'driver') return `/driver/bookings/${bookingId}/chat`;
  if (audience === 'admin') return `/admin/bookings/${bookingId}/chat`;
  return `/auth/bookings/${bookingId}/chat`;
}

export async function fetchBookingChat(audience, bookingId) {
  const { data } = await api.get(chatBase(audience, bookingId));
  return data.data;
}

export async function fetchChatMessages(
  audience,
  bookingId,
  { limit = CHAT_HISTORY_DEFAULT_LIMIT, before, channel } = {},
) {
  const { data } = await api.get(`${chatBase(audience, bookingId)}/messages`, {
    params: {
      limit,
      ...(before ? { before } : {}),
      ...(channel ? { channel } : {}),
    },
  });
  return data.data;
}

export async function sendChatMessageHttp(audience, bookingId, body) {
  const { data } = await api.post(`${chatBase(audience, bookingId)}/messages`, body);
  return data.data;
}

export async function markChatReadHttp(audience, bookingId, body = {}) {
  const { data } = await api.patch(`${chatBase(audience, bookingId)}/read`, body);
  return data.data;
}

export async function fetchChatUnread(audience, bookingId, channel) {
  const { data } = await api.get(`${chatBase(audience, bookingId)}/unread`, {
    params: channel ? { channel } : {},
  });
  return data.data;
}
