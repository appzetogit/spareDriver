import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, MessageSquare, UserPlus, UserRoundCog } from 'lucide-react';
import Badge from '../../../components/Badge';
import api from '../../../utils/api';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminBookingsStore } from '../../../store/admin/useAdminBookingsStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { useSocketEvent } from '../../../hooks/useSocket';
import { S2C_EVENTS } from '../../../constants/socketEvents';
import { BOOKING_STATUS } from '../../../constants/bookingStatus';
import { isChatVisibleForBooking } from '../../../constants/chat';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import AssignBookingDriverDrawer from '../components/ManageBookings/AssignBookingDriverDrawer';
import BookingFilters from '../components/ManageBookings/BookingFilters';
import BookingStats from '../components/ManageBookings/BookingStats';
import RowActionsMenu from '../components/RowActionsMenu';
import TripChatEntry from '../../../components/chat/TripChatEntry';
import {
  canAdminAssignBooking,
  getAssignActionLabel,
} from '../utils/bookingAssignment';

const OPERATIONS_ROLES = new Set(['admin', 'sub_admin']);

const LIVE_REFRESH_STATUSES = new Set([
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.NO_DRIVERS_FOUND,
  BOOKING_STATUS.DRIVER_ASSIGNED,
  BOOKING_STATUS.IN_EMERGENCY_POOL,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.COMPLETED,
]);

const ManageBookings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const admin = useAdminAuthStore((s) => s.admin);
  const canAssign = OPERATIONS_ROLES.has(admin?.role);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [assignBooking, setAssignBooking] = useState(null);
  const [chatBooking, setChatBooking] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get('search') || '';
    setSearch(fromUrl);
    setDebouncedSearch(fromUrl);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('chat') !== '1') return;
    const bookingId = searchParams.get('bookingId');
    if (!bookingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/admin/bookings/${bookingId}`);
        const booking = res?.data?.data?.booking;
        if (cancelled || !booking) return;
        setChatBooking(booking);
        setChatOpen(true);
        const next = new URLSearchParams(searchParams);
        next.delete('chat');
        next.delete('channel');
        next.delete('bookingId');
        setSearchParams(next, { replace: true });
      } catch {
        // keep the deep-link so a refresh can retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      search: debouncedSearch,
      status: statusFilter,
      bookingType: bookingTypeFilter,
      serviceType: serviceTypeFilter,
      paymentStatus: paymentStatusFilter,
      from: fromDate,
      to: toDate,
    }),
    [
      page,
      limit,
      debouncedSearch,
      statusFilter,
      bookingTypeFilter,
      serviceTypeFilter,
      paymentStatusFilter,
      fromDate,
      toDate,
    ],
  );

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setBookingTypeFilter('');
    setServiceTypeFilter('');
    setPaymentStatusFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const cacheKey = buildCacheKey('admin-bookings', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminBookingsStore,
    cacheKey,
    queryParams,
  );

  useSocketEvent(S2C_EVENTS.BOOKING_UPDATED, (payload) => {
    if (LIVE_REFRESH_STATUSES.has(payload?.status)) {
      refetch();
    }
  });

  useSocketEvent(S2C_EVENTS.ADMIN_ALERT, (payload) => {
    if (
      payload?.kind === 'no_drivers_found'
      || payload?.kind === 'emergency_pool_entered'
    ) {
      refetch();
    }
  });

  const bookings = data?.bookings ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const columns = useMemo(
    () => [
      {
        key: 'id',
        label: 'Booking',
        unclamp: true,
        render: (val, row) => {
          const variants = {
            completed: 'success',
            started: 'primary',
            driver_assigned: 'primary',
            arrived: 'primary',
            en_route: 'primary',
            searching: 'warning',
            pending_assignment: 'info',
            awaiting_payment: 'warning',
            in_emergency_pool: 'danger',
            no_drivers_found: 'danger',
            cancelled: 'danger',
          };
          const customerName = row.userId ? row.userId.name : 'Unknown';
          const driverName = row.driverId ? row.driverId.name : 'Unassigned';

          return (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-1.5 flex-wrap min-w-0">
                <span className="font-mono font-medium text-xs bg-gray-100 px-2 py-0.5 rounded text-slate-900">
                  {row.bookingNumber || row._id.slice(-6)}
                </span>
                <span className="sm:hidden">
                  <Badge variant={variants[row.status] || 'default'} className="capitalize text-[9px] px-1.5 py-0.5">
                    {row.status?.replace(/_/g, ' ')}
                  </Badge>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    row.bookingType === 'scheduled'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {row.bookingType || 'instant'}
                </span>
                <span className="text-[9px] text-slate-400 capitalize">
                  {row.serviceType}
                </span>
              </div>
              <div className="sm:hidden text-xs text-slate-800 mt-1 font-medium flex items-center justify-between gap-2">
                <span className="truncate">Cust: {customerName}</span>
                <span className="font-bold text-emerald-600 shrink-0">₹{row.fareSnapshot?.total || 0}</span>
              </div>
              <div className="sm:hidden text-[10px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate">Driver: {driverName}</span>
                <span className="text-slate-400 shrink-0">
                  {new Date(row.createdAt).toLocaleDateString('en-GB')}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        key: 'user',
        label: 'Customer',
        className: 'hidden sm:table-cell',
        render: (val, row) => (
          <div className="min-w-0">
            <p className="font-semibold text-sm text-slate-900 truncate">
              {row.userId ? row.userId.name : 'Unknown'}
            </p>
            {row.userId?.phone_no && (
              <p className="text-[11px] text-slate-500 truncate">
                {row.userId.phone_no}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'driver',
        label: 'Driver',
        className: 'hidden sm:table-cell',
        render: (val, row) =>
          row.driverId ? (
            <div className="min-w-0">
              <p className="text-sm text-slate-800 truncate">
                {row.driverId.name}
              </p>
              {row.driverId.phone_no && (
                <p className="text-[11px] text-slate-500 truncate">
                  {row.driverId.phone_no}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">Unassigned</span>
          ),
      },
      {
        key: 'pickup',
        label: 'Pickup',
        className: 'hidden md:table-cell',
        render: (val, row) => (
          <p
            className="text-xs text-slate-600 line-clamp-2"
            title={row.pickup?.address}
          >
            {row.pickup?.address || '—'}
          </p>
        ),
      },
      {
        key: 'fare',
        label: 'Fare',
        className: 'hidden sm:table-cell',
        render: (val, row) => (
          <span className="font-medium text-emerald-600">
            ₹{row.fareSnapshot?.total || 0}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        className: 'hidden sm:table-cell',
        render: (val, row) => {
          const variants = {
            completed: 'success',
            started: 'primary',
            driver_assigned: 'primary',
            arrived: 'primary',
            en_route: 'primary',
            searching: 'warning',
            pending_assignment: 'info',
            awaiting_payment: 'warning',
            in_emergency_pool: 'danger',
            no_drivers_found: 'danger',
            cancelled: 'danger',
          };
          return (
            <Badge variant={variants[row.status] || 'default'} className="capitalize">
              {row.status?.replace(/_/g, ' ')}
            </Badge>
          );
        },
      },
      {
        key: 'createdAt',
        label: 'Date',
        className: 'hidden md:table-cell',
        render: (val, row) => (
          <div>
            <p className="text-xs text-slate-700">
              {new Date(row.createdAt).toLocaleDateString('en-GB')}
            </p>
            <p className="text-[10px] text-slate-400">
              {new Date(row.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ),
      },
      {
        key: 'actions',
        label: 'Action',
        sortable: false,
        unclamp: true,
        width: '40px',
        render: (_, row) => {
          const items = [
            {
              label: 'View',
              icon: Eye,
              onClick: () => setSelectedBooking(row),
            },
          ];
          if (canAssign && canAdminAssignBooking(row)) {
            const reassign = Boolean(row.driverId);
            items.push({
              label: getAssignActionLabel(row),
              icon: reassign ? UserRoundCog : UserPlus,
              onClick: () => setAssignBooking(row),
            });
          }
          if (isChatVisibleForBooking(row)) {
            items.push({
              label: 'View chat',
              icon: MessageSquare,
              onClick: () => {
                setChatBooking(row);
                setChatOpen(true);
              },
            });
          }
          return <RowActionsMenu items={items} />;
        },
      },
    ],
    [canAssign],
  );

  const stats = data?.stats ?? {
    total: 0,
    searching: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    noDriversFound: 0,
  };

  const detailVehicle =
    selectedBooking?.carId && typeof selectedBooking.carId === 'object'
      ? selectedBooking.carId
      : null;

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up">
      <BookingFilters
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusChange={(val) => {
          setStatusFilter(val);
          setPage(1);
        }}
        bookingTypeFilter={bookingTypeFilter}
        onBookingTypeChange={(val) => {
          setBookingTypeFilter(val);
          setPage(1);
        }}
        serviceTypeFilter={serviceTypeFilter}
        onServiceTypeChange={(val) => {
          setServiceTypeFilter(val);
          setPage(1);
        }}
        paymentStatusFilter={paymentStatusFilter}
        onPaymentStatusChange={(val) => {
          setPaymentStatusFilter(val);
          setPage(1);
        }}
        fromDate={fromDate}
        onFromDateChange={(val) => {
          setFromDate(val);
          setPage(1);
        }}
        toDate={toDate}
        onToDateChange={(val) => {
          setToDate(val);
          setPage(1);
        }}
        onClear={clearFilters}
        onRefresh={refetch}
        refreshing={loading}
      />

      <BookingStats {...stats} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        minWidth="w-full min-w-0"
        columns={columns}
        data={bookings}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => setSelectedBooking(row)}
        entityLabel="bookings"
        emptyMessage="No bookings found"
      />

      <BookingDetailsModal
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
        vehicle={detailVehicle}
        canEditStatus={canAssign}
        onStatusUpdated={(updated) => {
          setSelectedBooking((prev) => (prev ? { ...prev, ...updated } : prev));
          refetch();
        }}
      />

      {assignBooking && (
        <AssignBookingDriverDrawer
          booking={assignBooking}
          onClose={() => setAssignBooking(null)}
          onAssigned={() => {
            setAssignBooking(null);
            refetch();
          }}
        />
      )}

      {chatBooking && (
        <TripChatEntry
          booking={chatBooking}
          audience="admin"
          selfId={admin?._id}
          peerName="Trip chat"
          subtitle="Customer ↔ Driver (view only)"
          controlledOpen={chatOpen}
          onOpenChange={(open) => {
            setChatOpen(open);
            if (!open) setChatBooking(null);
          }}
          hideButton
          showSenderLabels
        />
      )}
    </div>
  );
};

export default ManageBookings;
