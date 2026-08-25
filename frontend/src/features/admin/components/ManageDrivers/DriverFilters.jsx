import { Filter, RefreshCw, Search } from 'lucide-react';
import Select from '../../../../components/Select';
import AssigneeFilterSelect from '../ManageTasks/AssigneeFilterSelect';

const DriverFilters = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  assigneeFilter,
  onAssigneeChange,
  onRefresh,
  refreshing = false,
}) => {
  return (
    <div className="lg:sticky lg:top-0 lg:z-20 bg-slate-50 lg:bg-slate-50/90 lg:backdrop-blur-md pt-2 sm:pt-3 pb-2 lg:pt-4">
      <div className="flex items-start justify-between gap-3 mb-2.5 sm:mb-3 lg:mb-0 lg:items-center">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">
            Manage Drivers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
            Review, approve and manage driver applications
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="lg:hidden h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end lg:gap-3 w-full min-w-0">
        <div className="relative w-full lg:w-72 xl:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, phone or ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 sm:h-11 lg:h-12 pl-9 sm:pl-10 pr-3 rounded-xl lg:rounded-2xl border border-slate-200 bg-white shadow-sm text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 w-full lg:w-auto lg:flex lg:items-center min-w-0">
          <div className="min-w-0 lg:w-44 xl:w-52">
            <Select
              value={statusFilter}
              onChange={(val) => onStatusChange(val)}
              placeholder="All Statuses"
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'under_review', label: 'Under Review' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'suspended', label: 'Suspended' },
              ]}
              icon={Filter}
            />
          </div>

          {onAssigneeChange && (
            <div className="min-w-0 lg:w-44 xl:w-52">
              <AssigneeFilterSelect
                value={assigneeFilter}
                onChange={onAssigneeChange}
              />
            </div>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh"
              className="hidden lg:inline-flex h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 items-center justify-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverFilters;
