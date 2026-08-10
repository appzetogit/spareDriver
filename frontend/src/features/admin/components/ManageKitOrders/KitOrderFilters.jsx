import { RefreshCw, Search, Filter } from 'lucide-react';
import Select from '../../../../components/Select';
import AssigneeFilterSelect from '../ManageTasks/AssigneeFilterSelect';

const KitOrderFilters = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  assigneeFilter,
  onAssigneeChange,
  onRefresh,
  refreshing,
}) => (
  <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-2">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Kit orders</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">Purchase requests, payments, and dispatch</p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="sm:hidden h-8 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      <div className="flex flex-row items-center gap-1.5 sm:gap-3 w-full lg:w-auto">
        <div className="relative flex-1 sm:w-72 min-w-0">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search driver..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 sm:h-12 pl-8 sm:pl-11 pr-3 sm:pr-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
        </div>
        <div className="flex-1 sm:w-56 min-w-0">
          <Select
            value={statusFilter}
            onChange={onStatusChange}
            placeholder="All"
            options={[
              { value: '', label: 'All orders' },
              { value: 'pending_approval', label: 'Awaiting approval' },
            ]}
            icon={Filter}
          />
        </div>
        {onAssigneeChange && (
          <div className="flex-1 sm:w-56 min-w-0">
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
            className="hidden sm:inline-flex h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-semibold items-center gap-2 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>
    </div>
  </div>
);

export default KitOrderFilters;
