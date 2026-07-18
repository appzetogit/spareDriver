import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  PlayCircle,
  Hourglass,
  CalendarClock,
} from 'lucide-react';
import api from '../../../utils/api';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import Select from '../../../components/Select';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { formatPickupDateTime } from '../../../utils/datetime';

/**
 * Admin Queue module — BullMQ scheduled-booking worker jobs.
 * Shows reminders + escalate-batch only (no legacy assign/escalate/retry).
 */

const STATE_VARIANTS = {
  delayed: { variant: 'info', label: 'Delayed', icon: Hourglass },
  waiting: { variant: 'warning', label: 'Waiting', icon: Clock },
  active: { variant: 'primary', label: 'Running', icon: PlayCircle },
  failed: { variant: 'danger', label: 'Failed', icon: AlertTriangle },
  completed: { variant: 'success', label: 'Done', icon: CheckCircle2 },
};

const KIND_LABELS = {
  reminder: 'Reminder',
  'escalate-batch': 'Batch (45m)',
};

function StateBadge({ state }) {
  const cfg = STATE_VARIANTS[state] || STATE_VARIANTS.waiting;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="inline-flex items-center gap-1 capitalize">
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function CountdownTo({ iso }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const diff = target - now;
  const past = diff < 0;
  const totalSec = Math.max(0, Math.floor(Math.abs(diff) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const stamp = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <span className={past ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
      {past ? `${stamp} overdue` : `in ${stamp}`}
    </span>
  );
}

const ManageScheduledQueue = () => {
  const [snapshot, setSnapshot] = useState({
    enabled: true,
    counts: {},
    jobs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [stateFilter, setStateFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateFilter) params.set('state', stateFilter);
      if (kindFilter) params.set('name', kindFilter);
      params.set('limit', '200');
      const res = await api.get(`/admin/queues/scheduled-booking?${params}`);
      setSnapshot(res?.data?.data || { enabled: false, counts: {}, jobs: [] });
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load queue jobs');
    } finally {
      setLoading(false);
    }
  }, [stateFilter, kindFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, () => fetchJobs());

  const jobs = snapshot.jobs || [];
  const pagedJobs = useMemo(
    () => jobs.slice((page - 1) * limit, page * limit),
    [jobs, page, limit],
  );
  const pagination = {
    total: jobs.length,
    pages: Math.max(1, Math.ceil(jobs.length / limit)),
  };

  const nextScheduled = useMemo(() => {
    return jobs
      .filter((j) => j.state === 'delayed' && j.nextRunAt)
      .sort(
        (a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime(),
      )[0];
  }, [jobs]);

  const openBooking = async (bookingId) => {
    if (!bookingId) return;
    try {
      const res = await api.get(`/admin/bookings/${bookingId}`);
      setSelectedBooking(res?.data?.data?.booking || null);
    } catch (err) {
      console.warn('[scheduledQueue] failed to load booking', err?.message);
    }
  };

  const counts = snapshot.counts || {};
  const totalQueued =
    (counts.delayed || 0) + (counts.waiting || 0) + (counts.active || 0);

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Job',
        width: '20%',
        render: (_, row) => (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {KIND_LABELS[row.name] || row.name}
              {row.name === 'reminder' && row.minutesAhead != null && (
                <span className="text-xs text-slate-500 ml-1">
                  · -{row.minutesAhead}m
                </span>
              )}
            </p>
            <p className="text-[11px] text-slate-400 font-mono truncate">{row.id}</p>
          </div>
        ),
      },
      {
        key: 'booking',
        label: 'Booking',
        width: '22%',
        render: (_, row) =>
          row.booking ? (
            <button
              type="button"
              className="text-left"
              onClick={(e) => {
                e.stopPropagation();
                openBooking(row.bookingId);
              }}
            >
              <p className="text-sm font-semibold text-primary hover:underline">
                {row.booking.bookingNumber || row.bookingId?.slice(-6)}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {row.booking.customerName || 'Customer'}
              </p>
            </button>
          ) : row.bookingId ? (
            <span className="text-xs text-slate-400 font-mono">
              {String(row.bookingId).slice(-8)}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'scheduledStartAt',
        label: 'Pickup',
        width: '18%',
        render: (_, row) => {
          const at = row.booking?.scheduledStartAt || row.scheduledStartAt;
          return (
            <p className="text-xs font-medium text-slate-800">
              {formatPickupDateTime(at ? new Date(at) : null)}
            </p>
          );
        },
      },
      {
        key: 'nextRunAt',
        label: 'Next run',
        width: '20%',
        render: (_, row) => {
          if (row.state === 'completed' && row.finishedOn) {
            return (
              <p className="text-xs text-slate-700">
                {new Date(row.finishedOn).toLocaleString()}
              </p>
            );
          }
          if (row.state === 'failed' && row.failedReason) {
            return (
              <p className="text-xs text-rose-600 truncate" title={row.failedReason}>
                {row.failedReason}
              </p>
            );
          }
          if (row.nextRunAt) {
            return (
              <div>
                <p className="text-xs text-slate-700">
                  {new Date(row.nextRunAt).toLocaleString()}
                </p>
                <p className="text-[11px]">
                  <CountdownTo iso={row.nextRunAt} />
                </p>
              </div>
            );
          }
          return <span className="text-xs text-slate-400">—</span>;
        },
      },
      {
        key: 'state',
        label: 'Status',
        width: '12%',
        render: (_, row) => <StateBadge state={row.state} />,
      },
      {
        key: 'createdAt',
        label: 'Queued',
        width: '8%',
        render: (_, row) =>
          row.createdAt ? (
            <span className="text-xs text-slate-500">
              {new Date(row.createdAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up p-4 lg:p-6">
      <div className="bg-gradient-to-br from-slate-700 to-slate-900 text-white rounded-3xl p-5 shadow-sm flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold">Scheduled Queue</h1>
            <p className="text-[12px] text-white/80 mt-0.5 leading-snug">
              BullMQ worker jobs for reminders and the 45‑min batch. Legacy
              assign / escalate leftovers are hidden.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-white/70">Queued</p>
          <p className="text-3xl font-bold leading-tight">{totalQueued}</p>
        </div>
      </div>

      {!snapshot.enabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">Queue not connected</p>
            <p className="text-[12px] text-amber-800 mt-0.5">
              Set REDIS_URL and restart the backend so workers can run.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: 'Delayed', value: counts.delayed || 0, icon: Hourglass, color: 'bg-indigo-100', iconColor: 'text-indigo-600' },
          { label: 'Waiting', value: counts.waiting || 0, icon: Clock, color: 'bg-amber-100', iconColor: 'text-amber-600' },
          { label: 'Running', value: counts.active || 0, icon: PlayCircle, color: 'bg-sky-100', iconColor: 'text-sky-600' },
          { label: 'Failed', value: counts.failed || 0, icon: AlertTriangle, color: 'bg-rose-100', iconColor: 'text-rose-600' },
          { label: 'Completed', value: counts.completed || 0, icon: CheckCircle2, color: 'bg-emerald-100', iconColor: 'text-emerald-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  {stat.label}
                </p>
                <h2 className={`text-3xl font-bold mt-2 ${stat.iconColor}`}>{stat.value}</h2>
              </div>
              <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {nextScheduled && (
        <Card>
          <div className="flex items-start gap-3 p-1">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Next job</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {KIND_LABELS[nextScheduled.name] || nextScheduled.name}
                {nextScheduled.booking
                  ? ` · #${nextScheduled.booking.bookingNumber}`
                  : ''}
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Fires at {new Date(nextScheduled.nextRunAt).toLocaleString()} ·{' '}
                <CountdownTo iso={nextScheduled.nextRunAt} />
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="md:w-52">
            <Select
              value={stateFilter}
              onChange={(val) => {
                setStateFilter(val);
                setPage(1);
              }}
              placeholder="All states"
              options={[
                { value: '', label: 'All states' },
                { value: 'delayed', label: 'Delayed' },
                { value: 'waiting', label: 'Waiting' },
                { value: 'active', label: 'Running' },
                { value: 'failed', label: 'Failed' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>
          <div className="md:w-52">
            <Select
              value={kindFilter}
              onChange={(val) => {
                setKindFilter(val);
                setPage(1);
              }}
              placeholder="Job kind"
              options={[
                { value: '', label: 'All kinds' },
                { value: 'reminder', label: 'Reminder' },
                { value: 'escalate-batch', label: 'Batch (45m)' },
              ]}
            />
          </div>
          <div className="md:ml-auto">
            <Button variant="outline" icon={RefreshCw} onClick={fetchJobs}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !jobs.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <ServerPaginatedTable
          columns={columns}
          data={pagedJobs}
          loading={loading}
          page={page}
          limit={limit}
          pagination={pagination}
          onPageChange={setPage}
          entityLabel="queue jobs"
          emptyMessage="No queue jobs match your filters."
          onRowClick={(row) => openBooking(row.bookingId)}
        />
      )}

      <BookingDetailsModal
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
      />
    </div>
  );
};

export default ManageScheduledQueue;
