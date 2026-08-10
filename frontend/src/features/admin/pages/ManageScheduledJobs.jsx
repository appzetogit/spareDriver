import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Timer,
  Loader2,
  Search,
  Eye,
  UserPlus,
  UserRoundCog,
} from 'lucide-react';
import api from '../../../utils/api';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import Select from '../../../components/Select';
import Input from '../../../components/Input';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import AssignBookingDriverDrawer from '../components/ManageBookings/AssignBookingDriverDrawer';
import RowActionsMenu from '../components/RowActionsMenu';
import {
  canAdminAssignBooking,
  canAssignScheduledBooking,
  getAssignActionLabel,
} from '../utils/bookingAssignment';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { formatPickupDateTime } from '../../../utils/datetime';

/**
 * Admin / sub_admin / team_member scheduled rides list (Mongo) with filters.
 * Manual Assign is zone-scoped for team_members on the API.
 */
const ManageScheduledJobs = () => {
  const [scheduledBookings, setScheduledBookings] = useState({
    bookings: [],
    total: 0,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookingPage, setBookingPage] = useState(1);
  const [limit] = useState(15);
  const [statusFilter, setStatusFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [assignBooking, setAssignBooking] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (driverFilter) params.set('driverAssigned', driverFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page', String(bookingPage));
      params.set('limit', String(limit));
      const res = await api.get(`/admin/bookings/scheduled-jobs?${params}`);
      setScheduledBookings(
        res?.data?.data?.scheduledBookings || { bookings: [], total: 0, pages: 1 },
      );
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load scheduled rides');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, driverFilter, dateFrom, dateTo, debouncedSearch, bookingPage, limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, () => fetchJobs());

  const rows = scheduledBookings.bookings || [];
  const bookingsPagination = {
    total: scheduledBookings.total || 0,
    pages: scheduledBookings.pages || 1,
  };

  const openBooking = async (bookingId) => {
    if (!bookingId) return;
    try {
      const res = await api.get(`/admin/bookings/${bookingId}`);
      setSelectedBooking(res?.data?.data?.booking || null);
    } catch (err) {
      console.warn('[scheduledJobs] failed to load booking', err?.message);
    }
  };

  const clearFilters = () => {
    setStatusFilter('');
    setDriverFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setBookingPage(1);
  };

  const bookingColumns = useMemo(
    () => [
      {
        key: 'booking',
        label: 'Booking',
        unclamp: true,
        render: (_, row) => {
          const driverName = row.driverId ? row.driverId.name || 'Assigned' : row.status === 'searching' ? 'Open inbox' : 'Unassigned';
          const offersCount = (row.dispatch?.pendingOfferIds || []).length;

          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
                <button type="button" className="text-left" onClick={() => openBooking(row._id)}>
                  <p className="text-xs sm:text-sm font-semibold text-primary hover:underline font-mono">
                    {row.bookingNumber || String(row._id).slice(-6)}
                  </p>
                </button>
                <span className="sm:hidden">
                  <Badge variant="info" className="capitalize text-[9px] px-1.5 py-0.5">
                    {String(row.status || '').replace(/_/g, ' ')}
                  </Badge>
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 mt-0.5 truncate">
                {row.userId?.name || 'Customer'}
                {row.scheduled?.tier && (
                  <span className="uppercase text-[10px] text-slate-400">
                    · {row.scheduled.tier}
                  </span>
                )}
              </p>
              <div className="sm:hidden text-[10px] text-slate-500 mt-0.5">
                Pickup: {formatPickupDateTime(row.hourly?.scheduledStartAt ? new Date(row.hourly.scheduledStartAt) : null)}
              </div>
              <div className="sm:hidden text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
                <span className={row.driverId ? 'text-slate-700' : 'text-amber-600 font-medium'}>
                  Driver: {driverName}
                </span>
                <span className="text-slate-400 shrink-0">Offers: {offersCount}</span>
              </div>
            </div>
          );
        },
      },
      {
        key: 'pickup',
        label: 'Pickup',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <div>
            <p className="text-xs font-medium text-slate-800">
              {formatPickupDateTime(
                row.hourly?.scheduledStartAt
                  ? new Date(row.hourly.scheduledStartAt)
                  : null,
              )}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {row.pickup?.address || '—'}
            </p>
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        className: 'hidden sm:table-cell',
        render: (_, row) => (
          <Badge variant="info" className="capitalize">
            {String(row.status || '').replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        key: 'driver',
        label: 'Driver',
        className: 'hidden sm:table-cell',
        render: (_, row) =>
          row.driverId ? (
            <span className="text-xs text-slate-700">
              {row.driverId.name || 'Assigned'}
            </span>
          ) : (
            <span className="text-xs text-amber-600">
              {row.status === 'searching' ? 'Open inbox' : 'Unassigned'}
            </span>
          ),
      },
      {
        key: 'escalateAt',
        label: 'Pool cutoff',
        className: 'hidden md:table-cell',
        render: (_, row) =>
          row.scheduled?.escalateAt ? (
            <span className="text-xs text-slate-500">
              {new Date(row.scheduled.escalateAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'inbox',
        label: 'Inbox',
        className: 'hidden md:table-cell',
        render: (_, row) => (
          <span className="text-xs text-slate-600">
            {(row.dispatch?.pendingOfferIds || []).length}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Action',
        width: '40px',
        sortable: false,
        unclamp: true,
        render: (_, row) => {
          const contextual = { ...row, _assignmentContext: 'scheduled' };
          const items = [
            {
              label: 'View',
              icon: Eye,
              onClick: () => setSelectedBooking(row),
            },
          ];
          if (
            canAssignScheduledBooking(row) ||
            canAdminAssignBooking(contextual)
          ) {
            const reassign = Boolean(row.driverId);
            items.push({
              label: getAssignActionLabel(row),
              icon: reassign ? UserRoundCog : UserPlus,
              onClick: () => setAssignBooking(contextual),
            });
          }
          return <RowActionsMenu items={items} />;
        },
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up p-3 sm:p-4 lg:p-6">
      <div className="bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Timer className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">Scheduled Bookings</h1>
            <p className="hidden sm:block text-[12px] text-white/80 mt-0.5 leading-snug">
              Customer scheduled rides — searching, assigned, completed, or
              in the emergency pool. Assign a driver manually when needed.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] sm:text-[11px] uppercase tracking-wide text-white/70">
            Scheduled rides
          </p>
          <p className="text-2xl sm:text-3xl font-bold leading-tight">
            {bookingsPagination.total}
          </p>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="xl:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <Input
              placeholder="Search booking #, customer, phone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setBookingPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setBookingPage(1);
            }}
            placeholder="Status"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'searching', label: 'Open inbox (searching)' },
              { value: 'pending_assignment', label: 'Pending assignment' },
              { value: 'driver_assigned', label: 'Driver assigned' },
              { value: 'awaiting_payment', label: 'Awaiting payment' },
              { value: 'en_route', label: 'En route' },
              { value: 'arrived', label: 'Arrived' },
              { value: 'started', label: 'Started' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'in_emergency_pool', label: 'Emergency pool' },
              { value: 'no_drivers_found', label: 'No drivers found' },
            ]}
          />
          <Select
            value={driverFilter}
            onChange={(val) => {
              setDriverFilter(val);
              setBookingPage(1);
            }}
            placeholder="Driver"
            options={[
              { value: '', label: 'Any driver' },
              { value: 'yes', label: 'Assigned' },
              { value: 'no', label: 'Unassigned' },
            ]}
          />
          <div className="flex gap-2">
            <Button variant="outline" icon={RefreshCw} onClick={fetchJobs} className="flex-1">
              Refresh
            </Button>
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Input
            type="date"
            label="Pickup from"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setBookingPage(1);
            }}
          />
          <Input
            type="date"
            label="Pickup to"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setBookingPage(1);
            }}
          />
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !rows.length ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <ServerPaginatedTable
          minWidth="w-full min-w-0"
          columns={bookingColumns}
          data={rows}
          loading={loading}
          page={bookingPage}
          limit={limit}
          pagination={bookingsPagination}
          onPageChange={setBookingPage}
          entityLabel="scheduled rides"
          emptyMessage="No scheduled rides match your filters."
          onRowClick={(row) => openBooking(row._id)}
        />
      )}

      <BookingDetailsModal
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
        vehicle={
          selectedBooking?.carId && typeof selectedBooking.carId === 'object'
            ? selectedBooking.carId
            : null
        }
      />

      {assignBooking && (
        <AssignBookingDriverDrawer
          booking={assignBooking}
          onClose={() => setAssignBooking(null)}
          onAssigned={() => {
            setAssignBooking(null);
            fetchJobs();
          }}
        />
      )}
    </div>
  );
};

export default ManageScheduledJobs;
