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
    <div className="lg:sticky lg:top-0 lg:z-20 bg-slate-50 lg:bg-slate-50/90 lg:backdrop-blur-md pt-3 pb-2 lg:pt-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Manage Drivers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
            Review, approve and manage driver applications
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3 w-full lg:w-auto">
          <div className="relative w-full lg:w-72 xl:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, phone or ID..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-10 sm:h-11 lg:h-12 pl-10 pr-3 rounded-xl lg:rounded-2xl border border-slate-200 bg-white shadow-sm text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto">
            <div className="flex-1 min-w-0 lg:w-52 xl:w-60">
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
              <div className="flex-1 min-w-0 lg:w-52 xl:w-56">
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
                className="h-10 sm:h-11 lg:h-12 px-2.5 sm:px-4 rounded-xl lg:rounded-2xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverFilters;
