import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { notificationNavigatePath, notificationTypeLabel, notificationTypeBadgeVariant } from '../../constants/notificationTypes';
import { useAfterPaint } from '../../hooks/useAfterPaint';
import { Skeleton } from '../skeleton/Skeleton';
import Badge from '../Badge';

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
  const remove = store((s) => s.remove);
  const removeMany = store((s) => s.removeMany);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      fetchNotifications({ page: 1 }).catch(() => null);
    }
  }, [open, fetchNotifications]);

  useEffect(() => {
    const valid = new Set(notifications.map((n) => String(n._id)));
    setSelectedIds((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [notifications]);

  if (!open) return null;

  const allSelected =
    notifications.length > 0 && selectedIds.size === notifications.length;
  const selectedCount = selectedIds.size;

  const toggleSelect = (id) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(notifications.map((n) => String(n._id))));
  };

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

  const handleRemove = async (e, id) => {
    e.stopPropagation();
    try {
      await remove(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(String(id));
        return next;
      });
    } catch {
      // ignore
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedCount || deleting) return;
    setDeleting(true);
    try {
      await removeMany([...selectedIds]);
      setSelectedIds(new Set());
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
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

        {notifications.length > 0 ? (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-50 bg-gray-50/60">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-medium text-primary hover:underline"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedCount || deleting}
              className="flex items-center gap-1 text-xs font-medium text-danger disabled:opacity-40 disabled:cursor-not-allowed hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting
                ? 'Deleting…'
                : selectedCount
                  ? `Delete (${selectedCount})`
                  : 'Delete'}
            </button>
          </div>
        ) : null}

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
              {notifications.map((item) => {
                const id = String(item._id);
                const checked = selectedIds.has(id);
                const typeKey = item.type || item.data?.kind || item.data?.type || '';
                const typeLabel = item.data?.typeLabel || notificationTypeLabel(typeKey);
                return (
                  <li key={item._id}>
                    <div
                      className={`flex items-start gap-1 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        !item.isRead ? 'bg-primary/5' : ''
                      } ${checked ? 'bg-primary/10' : ''}`}
                    >
                      <label className="shrink-0 mt-3 ml-3 flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(item._id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                          aria-label={`Select ${item.title || 'notification'}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleClick(item)}
                        className="flex-1 min-w-0 text-left px-3 py-3"
                      >
                        {typeLabel ? (
                          <Badge
                            variant={notificationTypeBadgeVariant(typeKey)}
                            className="mb-1 !text-[10px] !px-1.5 !py-0"
                          >
                            {typeLabel}
                          </Badge>
                        ) : null}
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
                      <button
                        type="button"
                        onClick={(e) => handleRemove(e, item._id)}
                        className="shrink-0 mt-2 mr-2 p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        aria-label="Remove notification"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
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
