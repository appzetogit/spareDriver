import { Filter, RefreshCw, Search, X } from 'lucide-react';
import Select from '../../../../components/Select';

const BookingFilters = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  bookingTypeFilter,
  onBookingTypeChange,
  serviceTypeFilter,
  onServiceTypeChange,
  paymentStatusFilter,
  onPaymentStatusChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  onClear,
  onRefresh,
  refreshing = false,
}) => {
  const hasFilters =
    !!search ||
    !!statusFilter ||
    !!bookingTypeFilter ||
    !!serviceTypeFilter ||
    !!paymentStatusFilter ||
    !!fromDate ||
    !!toDate;

  return (
    <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-2 space-y-2.5 sm:space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Manage Bookings</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
              Browse every booking on the platform. Click any row to see full details.
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="sm:hidden h-8 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>

        <div className="flex flex-row items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-80 min-w-0">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by booking ID..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-9 sm:h-12 pl-8 sm:pl-11 pr-3 sm:pr-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white shadow-sm text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="hidden sm:inline-flex h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 items-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Select
          value={statusFilter}
          onChange={(val) => onStatusChange(val)}
          placeholder="All statuses"
          options={[
            { value: '', label: 'All statuses' },
            { value: 'pending_assignment', label: 'Pending assignment' },
            { value: 'searching', label: 'Searching' },
            { value: 'driver_assigned', label: 'Driver Assigned' },
            { value: 'awaiting_payment', label: 'Awaiting Payment' },
            { value: 'en_route', label: 'En route' },
            { value: 'arrived', label: 'Arrived' },
            { value: 'started', label: 'Started' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'no_drivers_found', label: 'No drivers found' },
            { value: 'in_emergency_pool', label: 'Emergency pool' },
          ]}
          icon={Filter}
        />
        <Select
          value={bookingTypeFilter}
          onChange={(val) => onBookingTypeChange(val)}
          placeholder="All booking types"
          options={[
            { value: '', label: 'All booking types' },
            { value: 'instant', label: 'Instant' },
            { value: 'scheduled', label: 'Scheduled' },
          ]}
        />
        <Select
          value={serviceTypeFilter}
          onChange={(val) => onServiceTypeChange(val)}
          placeholder="All services"
          options={[
            { value: '', label: 'All services' },
            { value: 'hourly', label: 'Hourly' },
            { value: 'outstation', label: 'Round trip' },
          ]}
        />
        <Select
          value={paymentStatusFilter}
          onChange={(val) => onPaymentStatusChange(val)}
          placeholder="All payments"
          options={[
            { value: '', label: 'All payments' },
            { value: 'not_due_yet', label: 'Not due yet' },
            { value: 'pending', label: 'Pending' },
            { value: 'paid', label: 'Paid' },
            { value: 'refunded', label: 'Refunded' },
            { value: 'partial_refund', label: 'Partial refund' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            From
          </span>
          <input
            type="date"
            value={fromDate || ''}
            onChange={(e) => onFromDateChange(e.target.value)}
            className="h-12 px-3 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            To
          </span>
          <input
            type="date"
            value={toDate || ''}
            onChange={(e) => onToDateChange(e.target.value)}
            className="h-12 px-3 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-primary"
          />
        </label>
      </div>

      {hasFilters && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

export default BookingFilters;
