import { useState, useMemo, useEffect } from 'react';
import { User as UserIcon } from 'lucide-react';
import Badge from '../../../components/Badge';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminBookingsStore } from '../../../store/admin/useAdminBookingsStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import BookingDetailsModal from '../components/ManageBookings/BookingDetailsModal';
import AssignBookingDriverDrawer from '../components/ManageBookings/AssignBookingDriverDrawer';
import BookingFilters from '../components/ManageBookings/BookingFilters';
import BookingStats from '../components/ManageBookings/BookingStats';
import { canAdminAssignBooking } from '../utils/bookingAssignment';

const OPERATIONS_ROLES = new Set(['admin', 'sub_admin']);

const ManageBookings = () => {
  const admin = useAdminAuthStore((s) => s.admin);
  const canAssign = OPERATIONS_ROLES.has(admin?.role);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [assignBooking, setAssignBooking] = useState(null);

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

  const bookings = data?.bookings ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const columns = useMemo(
    () => [
      {
        key: 'id',
        label: 'Booking',
        width: '15%',
        render: (val, row) => (
          <div className="min-w-0">
            <span className="font-mono font-medium text-xs bg-gray-100 px-2 py-1 rounded">
              {row.bookingNumber || row._id.slice(-6)}
            </span>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  row.bookingType === 'scheduled'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {row.bookingType || 'instant'}
              </span>
              <span className="text-[10px] text-slate-400 capitalize">
                {row.serviceType}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: 'user',
        label: 'Customer',
        width: '18%',
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
        width: '17%',
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
        width: '20%',
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
        width: '10%',
        render: (val, row) => (
          <span className="font-medium text-emerald-600">
            ₹{row.fareSnapshot?.total || 0}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        width: '10%',
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
        width: '10%',
        render: (val, row) => (
          <div>
            <p className="text-xs text-slate-700">
              {new Date(row.createdAt).toLocaleDateString()}
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
      ...(canAssign
        ? [
            {
              key: 'actions',
              label: 'Action',
              sortable: false,
              unclamp: true,
              width: '9%',
              render: (_, row) =>
                canAdminAssignBooking(row) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignBooking(row);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-dark text-xs font-bold hover:bg-primary-dark transition-all duration-150 shadow-sm hover:shadow"
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    Assign
                  </button>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                ),
            },
          ]
        : []),
    ],
    [canAssign],
  );

  const stats = data?.stats ?? {
    total: 0,
    searching: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };

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
    </div>
  );
};

export default ManageBookings;
