import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  Play,
  Timer,
  Zap,
  AlertTriangle,
  Save,
  ChevronRight,
} from 'lucide-react';
import api from '../../../utils/api';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import Input from '../../../components/Input';
import { BOOKING_STATUS, BOOKING_STATUS_LIST } from '../../../constants/bookingStatus';

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDurationMs(ms) {
  if (ms == null) return '—';
  const totalSec = Math.round(Math.abs(ms) / 1000);
  const sign = ms < 0 ? '−' : '';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${sign}${h}h ${m}m`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

const PHASE_LABELS = {
  not_started: 'Not in ride',
  in_ride: 'In ride',
  extend_window: 'Extend window (prompt due)',
  in_grace: 'Grace period (past booked end)',
  past_grace: 'Past grace — overtime payment required',
};

const statusVariant = (status) => {
  if (status === BOOKING_STATUS.COMPLETED) return 'success';
  if (status === BOOKING_STATUS.CANCELLED) return 'danger';
  if (status === BOOKING_STATUS.STARTED) return 'primary';
  if (status === BOOKING_STATUS.SEARCHING) return 'warning';
  return 'default';
};

const DevBookingTestPage = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [timing, setTiming] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    status: '',
    paymentStatus: '',
    timeline: {},
    hourly: {},
    outstation: {},
  });

  const fetchList = useCallback(async (page = 1) => {
    setListLoading(true);
    try {
      const res = await api.get('/admin/dev/bookings', {
        params: {
          page,
          limit: 15,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          bookingType: bookingTypeFilter || undefined,
        },
      });
      const data = res.data?.data;
      setBookings(data?.bookings || []);
      setPagination(data?.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to load bookings');
    } finally {
      setListLoading(false);
    }
  }, [search, statusFilter, bookingTypeFilter]);

  const fetchDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    setMessage('');
    try {
      const res = await api.get(`/admin/dev/bookings/${id}`);
      const data = res.data?.data;
      const b = data?.booking;
      setDetail(b);
      setTiming(data?.timing || null);
      setForm({
        status: b?.status || '',
        paymentStatus: b?.paymentStatus || '',
        timeline: {
          driverAssignedAt: toDatetimeLocal(b?.timeline?.driverAssignedAt),
          paymentDeadlineAt: toDatetimeLocal(b?.timeline?.paymentDeadlineAt),
          paymentReceivedAt: toDatetimeLocal(b?.timeline?.paymentReceivedAt),
          enRouteAt: toDatetimeLocal(b?.timeline?.enRouteAt),
          arrivedAt: toDatetimeLocal(b?.timeline?.arrivedAt),
          startedAt: toDatetimeLocal(b?.timeline?.startedAt),
          completedAt: toDatetimeLocal(b?.timeline?.completedAt),
          cancelledAt: toDatetimeLocal(b?.timeline?.cancelledAt),
        },
        hourly: {
          scheduledStartAt: toDatetimeLocal(b?.hourly?.scheduledStartAt),
          durationHours: b?.hourly?.durationHours ?? '',
        },
        outstation: {
          pickupAt: toDatetimeLocal(b?.outstation?.pickupAt),
          expectedReturnAt: toDatetimeLocal(b?.outstation?.expectedReturnAt),
          startDate: toDatetimeLocal(b?.outstation?.startDate),
          endDate: toDatetimeLocal(b?.outstation?.endDate),
          days: b?.outstation?.days ?? '',
        },
      });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to load booking');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList(1);
  }, [fetchList]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const selectedBooking = useMemo(
    () => bookings.find((b) => String(b._id) === String(selectedId)) || detail,
    [bookings, selectedId, detail],
  );

  const runAction = async (action, payload = {}) => {
    if (!selectedId) return;
    setActionLoading(action);
    setMessage('');
    try {
      const res = await api.post(`/admin/dev/bookings/${selectedId}/actions`, {
        action,
        ...payload,
      });
      const data = res.data?.data;
      if (data?.booking) {
        setDetail(data.booking);
        setTiming(data.timing || null);
      } else if (data?.timing) {
        setTiming(data.timing);
      }
      await fetchList(pagination.page);
      if (selectedId) await fetchDetail(selectedId);
      setMessage(res.data?.message || `Action "${action}" done`);
    } catch (err) {
      setMessage(err.response?.data?.message || `Action "${action}" failed`);
    } finally {
      setActionLoading('');
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await api.patch(`/admin/dev/bookings/${selectedId}`, {
        status: form.status !== detail?.status ? form.status : undefined,
        paymentStatus:
          form.paymentStatus !== detail?.paymentStatus ? form.paymentStatus : undefined,
        timeline: form.timeline,
        hourly: form.hourly,
        outstation: form.outstation,
        rescheduleTimers: true,
      });
      const data = res.data?.data;
      setDetail(data?.booking);
      setTiming(data?.timing);
      await fetchList(pagination.page);
      setMessage('Booking updated');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateTimeline = (key, value) => {
    setForm((prev) => ({
      ...prev,
      timeline: { ...prev.timeline, [key]: value },
    }));
  };

  const updateHourly = (key, value) => {
    setForm((prev) => ({
      ...prev,
      hourly: { ...prev.hourly, [key]: value },
    }));
  };

  const updateOutstation = (key, value) => {
    setForm((prev) => ({
      ...prev,
      outstation: { ...prev.outstation, [key]: value },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Developer QA panel</strong> — manipulate live bookings for end-to-end testing
        (instant, scheduled, outstation, extension, auto-complete). Changes emit real socket
        events to user/driver apps. Admins can verify results in Manage Bookings.
      </div>

      {message ? (
        <div className="rounded-xl border border-border bg-white px-4 py-2 text-sm text-text-secondary">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Booking picker */}
        <div className="xl:col-span-2 space-y-3">
          <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Booking # or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={Search}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fetchList(1)}
                loading={listLoading}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {BOOKING_STATUS_LIST.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-white"
                value={bookingTypeFilter}
                onChange={(e) => setBookingTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                <option value="instant">Instant</option>
                <option value="scheduled">Scheduled</option>
                <option value="outstation">Outstation</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold">
              Bookings ({pagination.total || 0})
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
              {bookings.map((b) => {
                const active = String(b._id) === String(selectedId);
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => setSelectedId(b._id)}
                    className={`w-full text-left px-4 py-3 hover:bg-bg transition-colors flex items-center gap-2 ${
                      active ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {b.bookingNumber || b._id}
                      </div>
                      <div className="text-xs text-text-secondary truncate">
                        {b.bookingType} · {b.serviceType}
                        {b.userId?.name ? ` · ${b.userId.name}` : ''}
                      </div>
                    </div>
                    <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
                  </button>
                );
              })}
              {!listLoading && bookings.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-secondary">
                  No bookings found
                </div>
              ) : null}
            </div>
            {pagination.pages > 1 ? (
              <div className="px-4 py-2 border-t border-border flex justify-between text-xs">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  className="text-primary disabled:opacity-40"
                  onClick={() => fetchList(pagination.page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {pagination.page} / {pagination.pages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.pages}
                  className="text-primary disabled:opacity-40"
                  onClick={() => fetchList(pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Detail + controls */}
        <div className="xl:col-span-3 space-y-4">
          {!selectedId ? (
            <div className="bg-white rounded-2xl border border-border p-8 text-center text-text-secondary">
              Select a booking to inspect and manipulate
            </div>
          ) : detailLoading && !detail ? (
            <div className="bg-white rounded-2xl border border-border p-8 text-center">
              Loading…
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">
                      {detail?.bookingNumber || selectedBooking?._id}
                    </h2>
                    <p className="text-sm text-text-secondary">
                      {detail?.bookingType} · {detail?.serviceType} · ₹
                      {detail?.fareSnapshot?.total ?? '—'}
                    </p>
                  </div>
                  <Badge variant={statusVariant(detail?.status)}>{detail?.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-text-secondary">Customer: </span>
                    {detail?.userId?.name || '—'} ({detail?.userId?.phone_no || '—'})
                  </div>
                  <div>
                    <span className="text-text-secondary">Driver: </span>
                    {detail?.driverId?.name || '—'} ({detail?.driverId?.phone_no || '—'})
                  </div>
                </div>
                {detail?.extensions?.length ? (
                  <div className="text-xs rounded-lg bg-bg p-2">
                    <strong>Extensions:</strong>{' '}
                    {detail.extensions.map((ext, i) => (
                      <span key={ext._id || i} className="mr-2">
                        +{ext.additionalHours}h ({ext.status})
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Extension & completion */}
              <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Timer className="w-4 h-4 text-primary" />
                  Extension & completion
                </h3>
                {timing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs rounded-xl bg-bg p-3">
                    <div>
                      Phase:{' '}
                      <strong>{PHASE_LABELS[timing.phase] || timing.phase}</strong>
                    </div>
                    <div>Booked end: {timing.endsAt || '—'}</div>
                    <div>Extend prompt: {timing.extensionPromptAt || '—'}</div>
                    <div>Overtime starts: {timing.overtimeAt || timing.autoCompleteAt || '—'}</div>
                    <div>Until end: {formatDurationMs(timing.msUntilEnd)}</div>
                    <div>Until prompt: {formatDurationMs(timing.msUntilPrompt)}</div>
                    <div>Until overtime: {formatDurationMs(timing.msUntilOvertime ?? timing.msUntilAutoComplete)}</div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'simulate_ending'}
                    onClick={() => runAction('simulate_ending', { minutesUntilEnd: 3 })}
                  >
                    End in 3 min
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'simulate_ending'}
                    onClick={() => runAction('simulate_ending', { minutesUntilEnd: 0 })}
                  >
                    At booked end (grace)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'extension_prompt'}
                    onClick={() => runAction('extension_prompt')}
                  >
                    Fire extend prompt
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'auto_complete'}
                    onClick={() => runAction('auto_complete')}
                  >
                    Force overtime required
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'reschedule_timers'}
                    onClick={() => runAction('reschedule_timers')}
                  >
                    Reschedule timers
                  </Button>
                </div>
              </div>

              {/* Dispatch / schedule shortcuts */}
              <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Dispatch & schedule
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'trigger_assign'}
                    onClick={() => runAction('trigger_assign')}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Trigger assign
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'trigger_dispatch'}
                    onClick={() => runAction('trigger_dispatch')}
                  >
                    Force dispatch wave
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={actionLoading === 'trigger_escalate'}
                    onClick={() => runAction('trigger_escalate')}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Emergency pool
                  </Button>
                </div>
              </div>

              {/* Editable fields */}
              <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
                <h3 className="font-semibold">Edit booking state</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs space-y-1">
                    <span className="text-text-secondary">Status</span>
                    <select
                      className="w-full text-sm border border-border rounded-lg px-2 py-2"
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    >
                      {BOOKING_STATUS_LIST.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="text-text-secondary">Payment status</span>
                    <select
                      className="w-full text-sm border border-border rounded-lg px-2 py-2"
                      value={form.paymentStatus}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, paymentStatus: e.target.value }))
                      }
                    >
                      <option value="not_due_yet">not_due_yet</option>
                      <option value="pending">pending</option>
                      <option value="paid">paid</option>
                      <option value="refunded">refunded</option>
                      <option value="partial_refund">partial_refund</option>
                      <option value="failed">failed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </label>
                </div>

                <div>
                  <p className="text-xs font-medium text-text-secondary mb-2">Timeline</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.keys(form.timeline).map((key) => (
                      <label key={key} className="text-xs space-y-1">
                        <span className="text-text-secondary">{key}</span>
                        <input
                          type="datetime-local"
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5"
                          value={form.timeline[key]}
                          onChange={(e) => updateTimeline(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {detail?.hourly ? (
                  <div>
                    <p className="text-xs font-medium text-text-secondary mb-2">
                      Hourly / scheduled
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="text-xs space-y-1">
                        <span className="text-text-secondary">scheduledStartAt</span>
                        <input
                          type="datetime-local"
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5"
                          value={form.hourly.scheduledStartAt}
                          onChange={(e) => updateHourly('scheduledStartAt', e.target.value)}
                        />
                      </label>
                      <label className="text-xs space-y-1">
                        <span className="text-text-secondary">durationHours</span>
                        <input
                          type="number"
                          min="0.25"
                          step="0.25"
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5"
                          value={form.hourly.durationHours}
                          onChange={(e) => updateHourly('durationHours', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                {detail?.outstation ? (
                  <div>
                    <p className="text-xs font-medium text-text-secondary mb-2">Outstation</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {['pickupAt', 'expectedReturnAt', 'startDate', 'endDate'].map((key) => (
                        <label key={key} className="text-xs space-y-1">
                          <span className="text-text-secondary">{key}</span>
                          <input
                            type="datetime-local"
                            className="w-full text-sm border border-border rounded-lg px-2 py-1.5"
                            value={form.outstation[key]}
                            onChange={(e) => updateOutstation(key, e.target.value)}
                          />
                        </label>
                      ))}
                      <label className="text-xs space-y-1">
                        <span className="text-text-secondary">days</span>
                        <input
                          type="number"
                          min="1"
                          className="w-full text-sm border border-border rounded-lg px-2 py-1.5"
                          value={form.outstation.days}
                          onChange={(e) => updateOutstation('days', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                <Button fullWidth loading={saving} onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Save changes
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevBookingTestPage;
