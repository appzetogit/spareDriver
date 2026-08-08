import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, CalendarDays, Loader2, Menu, Search, User, X } from 'lucide-react';
import AdminUserMenu from './AdminUserMenu';
import { NotificationBell } from '../../../components/notifications/NotificationCenter';
import { useAdminNotificationStore } from '../../../store/useNotificationStore';
import { AdminNotificationBridge } from '../../../components/notifications/NotificationBridge';
import api from '../../../utils/api';

const MIN_QUERY = 2;

const AdminHeader = ({ onMenuToggle, title = 'Dashboard' }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ users: [], drivers: [], bookings: [] });
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY) {
      setResults({ users: [], drivers: [], bookings: [] });
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setOpen(true);

    api
      .get('/admin/search', { params: { q: debouncedQuery, limit: 5 } })
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        const payload = res.data?.data || {};
        setResults({
          users: payload.users || [],
          drivers: payload.drivers || [],
          bookings: payload.bookings || [],
        });
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setResults({ users: [], drivers: [], bookings: [] });
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });

    return () => {
      requestIdRef.current += 1;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const totalResults =
    results.users.length + results.drivers.length + results.bookings.length;
  const showPanel = open && debouncedQuery.length >= MIN_QUERY;

  const clearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
    setResults({ users: [], drivers: [], bookings: [] });
    setOpen(false);
    inputRef.current?.focus();
  };

  const goTo = (path) => {
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setResults({ users: [], drivers: [], bookings: [] });
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 lg:px-6">
      <AdminNotificationBridge />
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-xl hover:bg-gray-100 text-text-secondary transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div ref={containerRef} className="hidden md:block relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim().length >= MIN_QUERY) setOpen(true);
              }}
              onFocus={() => {
                if (debouncedQuery.length >= MIN_QUERY) setOpen(true);
              }}
              placeholder="Search users, drivers, bookings…"
              className="h-10 w-64 lg:w-72 bg-gray-50 rounded-xl pl-10 pr-9 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
              aria-label="Admin search"
              aria-expanded={showPanel}
              aria-controls="admin-global-search-results"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-text hover:bg-gray-100"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}

            {showPanel ? (
              <div
                id="admin-global-search-results"
                role="listbox"
                className="absolute right-0 mt-2 w-[22rem] max-h-[28rem] overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-100 z-50"
              >
                {loading ? (
                  <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching…
                  </div>
                ) : totalResults === 0 ? (
                  <div className="px-4 py-6 text-sm text-text-muted text-center">
                    No results for “{debouncedQuery}”
                  </div>
                ) : (
                  <>
                    {results.users.length > 0 ? (
                      <ResultSection title="Users">
                        {results.users.map((user) => (
                          <ResultRow
                            key={`user-${user._id}`}
                            icon={User}
                            primary={user.name || 'Unnamed user'}
                            secondary={[user.phone, user.email].filter(Boolean).join(' · ')}
                            onClick={() => goTo(`/admin/users/${user._id}/profile`)}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {results.drivers.length > 0 ? (
                      <ResultSection title="Drivers">
                        {results.drivers.map((driver) => (
                          <ResultRow
                            key={`driver-${driver._id}`}
                            icon={Car}
                            primary={driver.name || 'Unnamed driver'}
                            secondary={[driver.phone, driver.approvalStatus]
                              .filter(Boolean)
                              .join(' · ')}
                            onClick={() => goTo(`/admin/drivers/${driver._id}/profile`)}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {results.bookings.length > 0 ? (
                      <ResultSection title="Bookings">
                        {results.bookings.map((booking) => (
                          <ResultRow
                            key={`booking-${booking._id}`}
                            icon={CalendarDays}
                            primary={booking.bookingNumber || String(booking._id).slice(-8)}
                            secondary={[
                              booking.customerName,
                              booking.status,
                              booking.serviceType,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                            onClick={() =>
                              goTo(
                                `/admin/bookings?search=${encodeURIComponent(
                                  booking.bookingNumber || booking._id,
                                )}`,
                              )
                            }
                          />
                        ))}
                      </ResultSection>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <NotificationBell store={useAdminNotificationStore} audience="admin" panelTitle="Admin alerts" />

          <AdminUserMenu />
        </div>
      </div>
    </header>
  );
};

const ResultSection = ({ title, children }) => (
  <div className="py-1.5">
    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
      {title}
    </p>
    {children}
  </div>
);

const ResultRow = ({ icon: Icon, primary, secondary, onClick }) => (
  <button
    type="button"
    role="option"
    onClick={onClick}
    className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-slate-50 transition-colors"
  >
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-text-muted">
      <Icon className="w-3.5 h-3.5" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-text truncate">{primary}</span>
      {secondary ? (
        <span className="block text-xs text-text-muted truncate">{secondary}</span>
      ) : null}
    </span>
  </button>
);

export default AdminHeader;
