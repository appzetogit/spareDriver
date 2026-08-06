import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X } from 'lucide-react';
import { notificationNavigatePath } from '../../constants/notificationTypes';
import { useAfterPaint } from '../../hooks/useAfterPaint';
import { Skeleton } from '../skeleton/Skeleton';

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function NotificationCenterPanel({
  open,
  onClose,
  store,
  audience = 'user',
  title = 'Notifications',
}) {
  const navigate = useNavigate();
  const notifications = store((s) => s.notifications);
  const unreadCount = store((s) => s.unreadCount);
  const loading = store((s) => s.loading);
  const fetchNotifications = store((s) => s.fetchNotifications);
  const markRead = store((s) => s.markRead);
  const markAllRead = store((s) => s.markAllRead);

  useEffect(() => {
    if (open) fetchNotifications({ page: 1 }).catch(() => null);
  }, [open, fetchNotifications]);

  if (!open) return null;

  const handleClick = async (item) => {
    if (!item.isRead) {
      try {
        await markRead(item._id);
      } catch {
        // ignore
      }
    }
    const path = notificationNavigatePath(
      item.type || item.data?.kind,
      item.data || {},
      audience,
    );
    onClose();
    if (path) navigate(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-semibold text-text">{title}</h2>
            {unreadCount > 0 ? (
              <p className="text-xs text-text-muted">{unreadCount} unread</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markAllRead().catch(() => null)}
                className="flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-text-secondary transition-colors"
              aria-label="Close notifications"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="px-4 py-3 space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="space-y-2 py-1">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-center text-sm text-text-muted py-10">No notifications yet</p>
          ) : (
            <ul>
              {notifications.map((item) => (
                <li key={item._id}>
                  <button
                    type="button"
                    onClick={() => handleClick(item)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      !item.isRead ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm text-text">{item.title}</p>
                      {!item.isRead ? (
                        <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                      ) : null}
                    </div>
                    {item.body ? (
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{item.body}</p>
                    ) : null}
                    <p className="text-[10px] text-text-muted mt-1">{formatWhen(item.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Hook for pages that already have a header bell button. */
export function useNotificationPanel(store, { audience = 'user', title = 'Notifications' } = {}) {
  const [open, setOpen] = useState(false);
  const unreadCount = store((s) => s.unreadCount);
  const fetchUnread = store((s) => s.fetchUnread);
  const unreadReady = useAfterPaint({ delayMs: 250 });

  useEffect(() => {
    if (!unreadReady) return;
    fetchUnread().catch(() => null);
  }, [unreadReady, fetchUnread]);

  const panel = (
    <NotificationCenterPanel
      open={open}
      onClose={() => setOpen(false)}
      store={store}
      audience={audience}
      title={title}
    />
  );

  return { open, setOpen, unreadCount, panel };
}

export function NotificationBell({ store, audience = 'user', panelTitle, className }) {
  const { setOpen, unreadCount, panel } = useNotificationPanel(store, {
    audience,
    title: panelTitle,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || 'relative p-2.5 rounded-xl hover:bg-gray-100 text-text-secondary transition-colors'}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-danger rounded-full ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      {panel}
    </>
  );
}
