import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C2S_EVENTS, S2C_EVENTS } from '../constants/socketEvents';
import {
  CHAT_HISTORY_DEFAULT_LIMIT,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_SENDER_ROLE,
  channelTabsForAudience,
  inferMessageChannel,
  isChatVisibleForBooking,
} from '../constants/chat';
import { useSocket } from './useSocket';
import {
  fetchChatMessages,
  fetchChatUnread,
  markChatReadHttp,
  sendChatMessageHttp,
} from '../utils/chatApi';

function newClientMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function messageKey(msg) {
  if (!msg) return '';
  if (msg.id) return String(msg.id);
  if (msg.clientMessageId) return `client:${msg.clientMessageId}`;
  return `tmp:${msg.createdAt}:${msg.message}`;
}

function mergeMessages(existing, incoming) {
  const map = new Map();
  for (const m of existing) map.set(messageKey(m), m);
  for (const m of incoming) {
    const key = messageKey(m);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, m);
      continue;
    }
    if (prev.pending && !m.pending) {
      map.set(key, m);
      continue;
    }
    if (prev.clientMessageId && m.id && !prev.id) {
      map.delete(key);
      map.set(messageKey(m), { ...prev, ...m, pending: false, failed: false });
      continue;
    }
    map.set(key, { ...prev, ...m });
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function roleForAudience(audience) {
  if (audience === 'driver') return CHAT_SENDER_ROLE.DRIVER;
  if (audience === 'admin') return CHAT_SENDER_ROLE.ADMIN;
  return CHAT_SENDER_ROLE.USER;
}

export function useTripChat({
  bookingId,
  audience = 'user',
  booking = null,
  selfId = null,
  open = false,
  peerName = '',
}) {
  const { socket, isConnected, emit } = useSocket();
  const tabs = useMemo(() => channelTabsForAudience(audience), [audience]);
  const [activeChannel, setActiveChannel] = useState(() => channelTabsForAudience(audience)[0]?.channel);
  const [messages, setMessages] = useState([]);
  const [unreadByChannel, setUnreadByChannel] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [canWrite, setCanWrite] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [typingPeer, setTypingPeer] = useState(null);
  const [draft, setDraft] = useState('');

  const openRef = useRef(open);
  const bookingIdRef = useRef(bookingId);
  const activeChannelRef = useRef(activeChannel);
  const typingTimerRef = useRef(null);
  const typingStopRef = useRef(null);
  const joinedRef = useRef(false);
  const selfRole = roleForAudience(audience);

  const activeTab = tabs.find((t) => t.channel === activeChannel) || tabs[0];
  const recipientRole = activeTab?.recipientRole || null;

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    bookingIdRef.current = bookingId;
  }, [bookingId]);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  const chatAvailable = Boolean(
    bookingId && (booking ? isChatVisibleForBooking(booking) : true),
  );

  const unreadCount = useMemo(
    () => Object.values(unreadByChannel).reduce((s, n) => s + (Number(n) || 0), 0),
    [unreadByChannel],
  );

  const refreshUnread = useCallback(async () => {
    if (!bookingId || !chatAvailable) {
      setUnreadByChannel({});
      return;
    }
    try {
      const results = await Promise.all(
        tabs.map(async (tab) => {
          const data = await fetchChatUnread(audience, bookingId, tab.channel);
          return [tab.channel, Number(data?.unreadCount) || 0];
        }),
      );
      setUnreadByChannel(Object.fromEntries(results));
    } catch {
      // ignore
    }
  }, [audience, bookingId, chatAvailable, tabs]);

  const markRead = useCallback(
    async (channel = activeChannelRef.current) => {
      if (!bookingId || !channel) return;
      try {
        const data = await markChatReadHttp(audience, bookingId, { channel });
        setUnreadByChannel((prev) => ({
          ...prev,
          [channel]: Number(data?.unreadCount) || 0,
        }));
        emit(C2S_EVENTS.CHAT_MESSAGE_READ, { bookingId, channel });
      } catch {
        // ignore
      }
    },
    [audience, bookingId, emit],
  );

  const loadHistory = useCallback(
    async (channel = activeChannelRef.current) => {
      if (!bookingId || !chatAvailable || !channel) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchChatMessages(audience, bookingId, {
          limit: CHAT_HISTORY_DEFAULT_LIMIT,
          channel,
        });
        setMessages(data.messages || []);
        setHasMore(Boolean(data.hasMore));
        setCanWrite(audience === 'admin' ? false : data.canWrite !== false);
        setUnreadByChannel((prev) => ({
          ...prev,
          [channel]: Number(data.unreadCount) || 0,
        }));
        if (openRef.current) {
          await markRead(channel);
        }
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load chat');
      } finally {
        setLoading(false);
      }
    },
    [audience, bookingId, chatAvailable, markRead],
  );

  const loadOlder = useCallback(async () => {
    const channel = activeChannelRef.current;
    if (!bookingId || loadingOlder || !hasMore || messages.length === 0 || !channel) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const data = await fetchChatMessages(audience, bookingId, {
        limit: CHAT_HISTORY_DEFAULT_LIMIT,
        before: oldest?.createdAt,
        channel,
      });
      setMessages((prev) => mergeMessages(data.messages || [], prev));
      setHasMore(Boolean(data.hasMore));
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  }, [audience, bookingId, hasMore, loadingOlder, messages]);

  const selectChannel = useCallback(
    (channel) => {
      setActiveChannel(channel);
      setTypingPeer(null);
      setDraft('');
      emit(C2S_EVENTS.CHAT_TYPING_STOP, { bookingId, channel: activeChannelRef.current });
      loadHistory(channel);
    },
    [bookingId, emit, loadHistory],
  );

  useEffect(() => {
    if (!socket || !bookingId || !chatAvailable) return undefined;

    let cancelled = false;

    if (open) {
      emit(C2S_EVENTS.CHAT_JOIN, { bookingId }, (ack) => {
        if (cancelled) return;
        if (ack?.ok === false) {
          setError(ack.message || 'Unable to join chat');
          return;
        }
        joinedRef.current = true;
        if (typeof ack?.canWrite === 'boolean' && audience !== 'admin') {
          setCanWrite(ack.canWrite);
        }
      });
      const t = setTimeout(() => {
        if (!cancelled) loadHistory(activeChannelRef.current);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(t);
        if (joinedRef.current) {
          emit(C2S_EVENTS.CHAT_LEAVE, { bookingId });
          joinedRef.current = false;
        }
        emit(C2S_EVENTS.CHAT_TYPING_STOP, { bookingId, channel: activeChannelRef.current });
      };
    }

    return () => {
      cancelled = true;
      if (joinedRef.current) {
        emit(C2S_EVENTS.CHAT_LEAVE, { bookingId });
        joinedRef.current = false;
      }
    };
  }, [socket, bookingId, open, chatAvailable, emit, audience, loadHistory]);

  useEffect(() => {
    if (!isConnected || !open || !bookingId || !chatAvailable) return undefined;
    emit(C2S_EVENTS.CHAT_JOIN, { bookingId });
    const t = setTimeout(() => loadHistory(activeChannelRef.current), 0);
    return () => clearTimeout(t);
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatAvailable || !bookingId || open) return undefined;
    const t0 = setTimeout(() => refreshUnread(), 0);
    const t = setInterval(refreshUnread, 30_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [chatAvailable, bookingId, open, refreshUnread]);

  useEffect(() => {
    if (!socket || !bookingId || !chatAvailable) return undefined;

    const onCreated = (payload) => {
      if (String(payload?.bookingId) !== String(bookingIdRef.current)) return;
      const msg = payload?.message;
      if (!msg) return;
      const msgChannel = inferMessageChannel(msg);

      setUnreadByChannel((prev) => {
        const isSelf = msg.senderRole === selfRole;
        if (isSelf || openRef.current) return prev;
        return {
          ...prev,
          [msgChannel]: (Number(prev[msgChannel]) || 0) + 1,
        };
      });

      if (msgChannel !== activeChannelRef.current) return;

      setMessages((prev) => {
        if (msg.clientMessageId) {
          const withoutPending = prev.filter(
            (m) =>
              !(
                m.pending &&
                m.clientMessageId &&
                m.clientMessageId === msg.clientMessageId
              ),
          );
          return mergeMessages(withoutPending, [msg]);
        }
        return mergeMessages(prev, [msg]);
      });

      const isSelf = msg.senderRole === selfRole;
      if (openRef.current && !isSelf) {
        markRead(msgChannel);
      }
    };

    const onRead = (payload) => {
      if (String(payload?.bookingId) !== String(bookingIdRef.current)) return;
      if (!payload?.readerId) return;
      if (payload.channel && payload.channel !== activeChannelRef.current) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.senderRole === payload.readerRole) return m;
          const already = (m.readBy || []).some(
            (r) => String(r.readerId) === String(payload.readerId),
          );
          if (already) return m;
          return {
            ...m,
            readBy: [
              ...(m.readBy || []),
              {
                readerId: payload.readerId,
                readerRole: payload.readerRole,
                readAt: payload.readAt,
              },
            ],
          };
        }),
      );
    };

    const onTyping = (payload) => {
      if (String(payload?.bookingId) !== String(bookingIdRef.current)) return;
      if (payload.senderRole === selfRole) return;
      if (payload.channel && payload.channel !== activeChannelRef.current) return;
      if (!payload.isTyping) {
        setTypingPeer(null);
        return;
      }
      setTypingPeer({
        senderId: payload.senderId,
        senderRole: payload.senderRole,
      });
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setTypingPeer(null), 3000);
    };

    socket.on(S2C_EVENTS.CHAT_MESSAGE_CREATED, onCreated);
    socket.on(S2C_EVENTS.CHAT_MESSAGE_READ, onRead);
    socket.on(S2C_EVENTS.CHAT_TYPING, onTyping);

    return () => {
      socket.off(S2C_EVENTS.CHAT_MESSAGE_CREATED, onCreated);
      socket.off(S2C_EVENTS.CHAT_MESSAGE_READ, onRead);
      socket.off(S2C_EVENTS.CHAT_TYPING, onTyping);
      clearTimeout(typingTimerRef.current);
    };
  }, [socket, bookingId, chatAvailable, selfRole, markRead]);

  const notifyTyping = useCallback(
    (text) => {
      const channel = activeChannelRef.current;
      if (!bookingId || !canWrite || !channel) return;
      if (!text?.trim()) {
        emit(C2S_EVENTS.CHAT_TYPING_STOP, { bookingId, channel });
        return;
      }
      emit(C2S_EVENTS.CHAT_TYPING_START, { bookingId, channel });
      clearTimeout(typingStopRef.current);
      typingStopRef.current = setTimeout(() => {
        emit(C2S_EVENTS.CHAT_TYPING_STOP, { bookingId, channel });
      }, 2000);
    },
    [bookingId, canWrite, emit],
  );

  const setDraftText = useCallback(
    (value) => {
      const next = String(value || '').slice(0, CHAT_MESSAGE_MAX_LENGTH);
      setDraft(next);
      notifyTyping(next);
    },
    [notifyTyping],
  );

  const sendMessage = useCallback(
    async (textOverride) => {
      const text = String(textOverride ?? draft).trim();
      const channel = activeChannelRef.current;
      if (!text || !bookingId || !canWrite || sending || !recipientRole) return false;

      const clientMessageId = newClientMessageId();
      const optimistic = {
        id: null,
        clientMessageId,
        bookingId,
        channel,
        senderId: selfId,
        senderRole: selfRole,
        recipientRole,
        senderName: 'You',
        message: text,
        messageType: 'text',
        readBy: [],
        createdAt: new Date().toISOString(),
        pending: true,
      };

      if (!textOverride) setDraft('');
      emit(C2S_EVENTS.CHAT_TYPING_STOP, { bookingId, channel });
      setMessages((prev) => mergeMessages(prev, [optimistic]));
      setSending(true);
      setError(null);

      const body = { message: text, clientMessageId, recipientRole };

      const finishOk = (result) => {
        const serverMsg = result?.message;
        if (serverMsg) {
          setMessages((prev) => {
            const without = prev.filter(
              (m) => !(m.pending && m.clientMessageId === clientMessageId),
            );
            return mergeMessages(without, [serverMsg]);
          });
        }
        return true;
      };

      const finishFail = (message) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...m, pending: false, failed: true }
              : m,
          ),
        );
        if (!textOverride) setDraft(text);
        setError(message || 'Failed to send');
        return false;
      };

      try {
        if (isConnected && socket) {
          const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timeout')), 12_000);
            emit(
              C2S_EVENTS.CHAT_MESSAGE_SEND,
              { bookingId, ...body },
              (ack) => {
                clearTimeout(timer);
                if (ack?.ok === false) {
                  reject(new Error(ack.message || 'Send failed'));
                  return;
                }
                resolve(ack);
              },
            );
          });
          setSending(false);
          return finishOk(result);
        }

        const result = await sendChatMessageHttp(audience, bookingId, body);
        setSending(false);
        return finishOk(result);
      } catch (err) {
        try {
          const result = await sendChatMessageHttp(audience, bookingId, body);
          setSending(false);
          return finishOk(result);
        } catch (httpErr) {
          setSending(false);
          return finishFail(
            httpErr?.response?.data?.message || err?.message || 'Failed to send',
          );
        }
      }
    },
    [
      audience,
      bookingId,
      canWrite,
      draft,
      emit,
      isConnected,
      recipientRole,
      selfId,
      selfRole,
      sending,
      socket,
    ],
  );

  return {
    chatAvailable,
    messages,
    unreadCount,
    unreadByChannel,
    loading,
    loadingOlder,
    hasMore,
    canWrite,
    error,
    sending,
    typingPeer,
    draft,
    setDraftText,
    sendMessage,
    loadOlder,
    refreshUnread,
    peerName,
    isConnected,
    selfRole,
    selfId,
    tabs,
    activeChannel,
    selectChannel,
    recipientRole,
  };
}

export default useTripChat;
