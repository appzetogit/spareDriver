import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, ChevronLeft, ChevronRight, History, Search, Send } from 'lucide-react';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import ConfirmDialog from '../../../components/ConfirmDialog';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import {
  fetchBulkPushAudienceStats,
  sendBulkPromotionalPush,
  useAdminBulkPushHistoryStore,
  useAdminBulkPushRecipientsStore,
} from '../../../store/admin/useAdminBulkPushStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const AUDIENCE_OPTIONS = [
  { value: 'user', label: 'Users' },
  { value: 'driver', label: 'Drivers' },
];

const MODE_OPTIONS = [
  { value: 'all', label: 'All with push' },
  { value: 'selected', label: 'Selected only' },
];

const ManageBulkPush = () => {
  const [audience, setAudience] = useState('user');
  const [mode, setMode] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [stats, setStats] = useState({ total: 0, withPush: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const limit = 10;
  const historyLimit = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSelected([]);
    setPage(1);
    setSearch('');
    setDebouncedSearch('');
    setLastResult(null);
  }, [audience]);

  useEffect(() => {
    if (mode === 'all') {
      setSelected([]);
    } else {
      setPage(1);
    }
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetchBulkPushAudienceStats(audience)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
      })
      .catch(() => {
        if (cancelled) return;
        setStats({ total: 0, withPush: 0 });
      })
      .finally(() => {
        if (cancelled) return;
        setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const recipientParams = useMemo(
    () => ({
      audience,
      page,
      limit,
      search: debouncedSearch,
    }),
    [audience, page, limit, debouncedSearch],
  );

  const recipientsKey = buildCacheKey('admin-bulk-push-recipients', recipientParams);
  const historyKey = buildCacheKey('admin-bulk-push-history', {
    page: historyPage,
    limit: historyLimit,
  });

  const recipientsQuery = useCachedQuery(
    useAdminBulkPushRecipientsStore,
    recipientsKey,
    recipientParams,
    { enabled: mode === 'selected' },
  );
  const historyQuery = useCachedQuery(
    useAdminBulkPushHistoryStore,
    historyKey,
    { page: historyPage, limit: historyLimit },
  );

  const listLoading = recipientsQuery.loading;
  const listError = recipientsQuery.error;
  const rows = recipientsQuery.data?.recipients ?? [];
  const pagination = recipientsQuery.data?.pagination ?? {
    total: 0,
    pages: 1,
    page: 1,
    limit,
  };

  const historyRows = historyQuery.data?.campaigns ?? [];
  const historyPagination = historyQuery.data?.pagination ?? { total: 0, pages: 1 };

  useEffect(() => {
    if (mode !== 'selected') return;
    if (!pagination.pages) return;
    if (page > pagination.pages) {
      setPage(pagination.pages);
    }
  }, [mode, page, pagination.pages]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const togglePage = useCallback(() => {
    const ids = rows.map((r) => r._id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((prev) => {
      if (allSelected) return prev.filter((id) => !ids.includes(id));
      return [...new Set([...prev, ...ids])];
    });
  }, [rows, selected]);

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
  }, []);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (mode === 'all' ? stats.withPush > 0 : selected.length > 0);

  const recipientSummary =
    mode === 'all'
      ? `${stats.withPush} ${audience === 'user' ? 'users' : 'drivers'} with push enabled`
      : `${selected.length} selected ${audience === 'user' ? 'user(s)' : 'driver(s)'}`;

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await sendBulkPromotionalPush({
        audience,
        title: title.trim(),
        body: body.trim(),
        mode,
        recipientIds: mode === 'selected' ? selected : [],
      });
      setLastResult(result);
      setConfirmOpen(false);
      toast.success(`Sent to ${result.sent} of ${result.total}`);
      if (mode === 'selected') setSelected([]);
      setTitle('');
      setBody('');
      setHistoryPage(1);
      useAdminBulkPushHistoryStore.getState().invalidate('admin-bulk-push-history');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send push notifications');
    } finally {
      setSending(false);
    }
  };

  const pageSelected =
    rows.length > 0 && rows.every((r) => selected.includes(r._id));

  const historyColumns = useMemo(
    () => [
      {
        key: 'createdAt',
        label: 'Sent at',
        width: '18%',
        render: (val) => (
          <span className="text-sm text-slate-700 whitespace-nowrap">
            {formatDateTime(val)}
          </span>
        ),
      },
      {
        key: 'title',
        label: 'Message',
        width: '34%',
        render: (val, row) => (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{val}</p>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{row.body}</p>
          </div>
        ),
      },
      {
        key: 'audience',
        label: 'Audience',
        width: '12%',
        render: (val, row) => (
          <div>
            <p className="text-sm font-medium text-slate-800 capitalize">{val}</p>
            <p className="text-xs text-slate-500 capitalize">{row.mode}</p>
          </div>
        ),
      },
      {
        key: 'sent',
        label: 'Results',
        width: '18%',
        className: 'hidden sm:table-cell',
        render: (_v, row) => (
          <div className="text-xs text-slate-600 space-y-0.5">
            <p>
              <span className="font-semibold text-emerald-600">{row.sent}</span> sent
            </p>
            <p>
              <span className="font-semibold text-slate-500">{row.skipped}</span> skipped
              {' · '}
              <span className="font-semibold text-rose-500">{row.failed}</span> failed
            </p>
            <p className="text-slate-400">of {row.total}</p>
          </div>
        ),
      },
      {
        key: 'sentBy',
        label: 'Sent by',
        width: '18%',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-sm text-slate-600">
            {val?.name || val?.email || '—'}
          </span>
        ),
      },
    ],
    [],
  );

  const totalPages = Math.max(pagination.pages || 1, 1);
  const startItem =
    pagination.total === 0 ? 0 : Math.min((page - 1) * limit + 1, pagination.total);
  const endItem = Math.min(page * limit, pagination.total);

  return (
    <div className="space-y-6 max-w-full min-w-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BellRing className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 shrink-0" />
          Bulk Push Notifications
        </h1>
        <p className="text-sm text-slate-500">
          Send a promotional push to all or selected users and drivers.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 min-w-0">
        <div className="xl:col-span-2 space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-800 mb-2">Audience</p>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAudience(opt.value)}
                    className={`h-10 rounded-xl text-sm font-semibold border transition-colors ${
                      audience === opt.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-800 mb-2">Recipients</p>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={`h-10 px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors ${
                      mode === opt.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {statsLoading
                  ? 'Loading audience stats…'
                  : mode === 'all'
                    ? `${stats.withPush} of ${stats.total} ${audience === 'user' ? 'users' : 'approved drivers'} have push enabled.`
                    : `${selected.length} selected. Recipients without a push token will be skipped.`}
              </p>
            </div>

            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekend offer"
              maxLength={100}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the promotional message…"
                maxLength={500}
                rows={5}
                className="w-full bg-white border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 resize-y min-h-[120px]"
              />
              <p className="text-xs text-slate-400 text-right">{body.length}/500</p>
            </div>

            <Button
              variant="admin"
              size="md"
              fullWidth
              icon={Send}
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
            >
              Send push notification
            </Button>
          </div>

          {lastResult && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm text-emerald-900">
              Last send: {lastResult.sent} sent, {lastResult.skipped} skipped,{' '}
              {lastResult.failed} failed (of {lastResult.total}).
            </div>
          )}
        </div>

        <div className="xl:col-span-3 min-w-0">
          {mode === 'selected' ? (
            <div className="space-y-4 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder={`Search ${audience === 'user' ? 'users' : 'drivers'}…`}
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <p className="text-sm text-slate-500 shrink-0">
                  {selected.length} selected
                  {selected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelected([])}
                      className="ml-2 text-slate-800 font-semibold hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </p>
              </div>

              {listError ? (
                <div className="bg-white rounded-2xl border border-rose-200 p-6 text-sm text-rose-600">
                  {listError}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden min-w-0">
                  {/* Mobile card list */}
                  <div className="md:hidden divide-y divide-slate-100">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={pageSelected}
                          onChange={togglePage}
                          className="rounded border-slate-300"
                        />
                        Select page
                      </label>
                      <span className="text-xs text-slate-500">
                        {startItem}-{endItem} of {pagination.total}
                      </span>
                    </div>

                    {listLoading && rows.length === 0 ? (
                      <div className="p-6 text-sm text-slate-400 text-center">Loading…</div>
                    ) : rows.length === 0 ? (
                      <div className="p-8 text-sm text-slate-400 text-center">
                        No {audience === 'user' ? 'users' : 'drivers'} found
                      </div>
                    ) : (
                      rows.map((row) => {
                        const phone =
                          audience === 'user' ? row.phone_no || '—' : row.phone || '—';
                        const subtitle =
                          audience === 'user' ? row.email || phone : phone;
                        return (
                          <label
                            key={row._id}
                            className="flex items-start gap-3 px-4 py-3 active:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(row._id)}
                              onChange={() => toggleSelect(row._id)}
                              className="mt-1 rounded border-slate-300 shrink-0"
                            />
                            <Avatar
                              name={row.name}
                              size="sm"
                              src={row.profilePicture}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {row.name || '—'}
                              </p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {subtitle}
                              </p>
                              <p className="text-xs mt-1">
                                {row.hasPush ? (
                                  <span className="font-semibold text-emerald-600">
                                    Push enabled
                                  </span>
                                ) : (
                                  <span className="font-semibold text-slate-400">
                                    No token
                                  </span>
                                )}
                              </p>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="w-12 px-4 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={pageSelected}
                              onChange={togglePage}
                              className="rounded border-slate-300"
                              aria-label="Select page"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            {audience === 'user' ? 'User' : 'Driver'}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                            Phone
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Push
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {listLoading && rows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                              Loading…
                            </td>
                          </tr>
                        ) : rows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                              No {audience === 'user' ? 'users' : 'drivers'} found
                            </td>
                          </tr>
                        ) : (
                          rows.map((row) => (
                            <tr
                              key={row._id}
                              className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/80"
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(row._id)}
                                  onChange={() => toggleSelect(row._id)}
                                  className="rounded border-slate-300"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar
                                    name={row.name}
                                    size="sm"
                                    src={row.profilePicture}
                                  />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm text-slate-800 truncate">
                                      {row.name || '—'}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                      {audience === 'user'
                                        ? row.email || '—'
                                        : row.phone || '—'}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600 hidden lg:table-cell">
                                {audience === 'user'
                                  ? row.phone_no || '—'
                                  : row.phone || '—'}
                              </td>
                              <td className="px-4 py-3">
                                {row.hasPush ? (
                                  <span className="text-xs font-semibold text-emerald-600">
                                    Enabled
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-400">
                                    No token
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {pagination.total > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4 border-t border-slate-100">
                      <p className="text-sm text-slate-500">
                        Showing{' '}
                        <span className="font-medium text-slate-700">{startItem}</span>
                        {' - '}
                        <span className="font-medium text-slate-700">{endItem}</span>
                        {' of '}
                        <span className="font-medium text-slate-700">
                          {pagination.total}
                        </span>
                        {listLoading ? (
                          <span className="ml-2 text-slate-400">Loading…</span>
                        ) : null}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePageChange(Math.max(1, page - 1))}
                          disabled={page === 1 || listLoading}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-40"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span className="hidden sm:inline">Prev</span>
                        </button>
                        <span className="text-sm text-slate-600 px-2">
                          {page}/{totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                          disabled={page >= totalPages || listLoading}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 disabled:opacity-40"
                        >
                          <span className="hidden sm:inline">Next</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 h-full min-h-[220px] flex flex-col justify-center">
              <p className="text-lg font-semibold text-slate-900">Send to everyone</p>
              <p className="text-sm text-slate-500 mt-2 max-w-md">
                This will deliver the message to every{' '}
                {audience === 'user' ? 'active user' : 'approved driver'} who has
                registered a push notification token.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 max-w-sm">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {statsLoading ? '—' : stats.total}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-xs text-slate-500">With push</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {statsLoading ? '—' : stats.withPush}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="space-y-4 min-w-0">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-700" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Send history</h2>
            <p className="text-sm text-slate-500">
              Past promotional pushes from the admin panel.
            </p>
          </div>
        </div>

        {/* Mobile history cards */}
        <div className="md:hidden space-y-3">
          {historyQuery.loading && historyRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400">
              Loading history…
            </div>
          ) : historyRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">
              No push messages sent yet
            </div>
          ) : (
            historyRows.map((row) => (
              <div
                key={row._id}
                className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {row.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {row.body}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                    {row.audience}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span>
                    <span className="font-semibold text-emerald-600">{row.sent}</span> sent
                  </span>
                  <span>
                    <span className="font-semibold text-slate-500">{row.skipped}</span> skipped
                  </span>
                  <span>
                    <span className="font-semibold text-rose-500">{row.failed}</span> failed
                  </span>
                  <span className="text-slate-400">of {row.total}</span>
                </div>
                <p className="text-xs text-slate-400">
                  By {row.sentBy?.name || row.sentBy?.email || '—'} · {row.mode}
                </p>
              </div>
            ))
          )}

          {historyPagination.total > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setHistoryPage(Math.max(1, historyPage - 1))}
                disabled={historyPage === 1}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="text-sm text-slate-600">
                {historyPage}/{Math.max(historyPagination.pages, 1)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setHistoryPage(
                    Math.min(Math.max(historyPagination.pages, 1), historyPage + 1),
                  )
                }
                disabled={historyPage >= historyPagination.pages}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm disabled:opacity-40"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Desktop history table */}
        <div className="hidden md:block min-w-0">
          <ServerPaginatedTable
            columns={historyColumns}
            data={historyRows}
            loading={historyQuery.loading}
            page={historyPage}
            limit={historyLimit}
            pagination={historyPagination}
            onPageChange={setHistoryPage}
            entityLabel="messages"
            emptyMessage="No push messages sent yet"
          />
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !sending && setConfirmOpen(false)}
        onConfirm={handleSend}
        title="Send promotional push?"
        description={`This will send “${title.trim()}” to ${recipientSummary}.`}
        confirmLabel="Send now"
        variant="warning"
        loading={sending}
      />
    </div>
  );
};

export default ManageBulkPush;
