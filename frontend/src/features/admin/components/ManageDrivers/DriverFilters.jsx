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
    <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pt-4 pb-2">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manage Drivers</h1>
          <p className="text-xs text-slate-500 mt-0.5">Review, approve and manage driver applications</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* SEARCH */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-2xl border border-slate-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>

          {/* FILTER */}
          <div className="w-full sm:w-60">
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
            <div className="w-full sm:w-56">
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
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-2 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverFilters;
