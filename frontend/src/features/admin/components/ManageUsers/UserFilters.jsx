import { RefreshCw, Search } from 'lucide-react';

const UserFilters = ({ search, onSearchChange, onRefresh, refreshing = false }) => (
  <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-2">
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 sm:gap-5">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Manage Users</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">View customer accounts, vehicles, and onboarding</p>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 w-full lg:w-auto">
        <div className="relative flex-1 lg:w-80">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 sm:h-12 pl-9 sm:pl-11 pr-3 sm:pr-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white shadow-sm text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
          />
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-9 sm:h-12 px-3 sm:px-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 sm:gap-2 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>
    </div>
  </div>
);

export default UserFilters;
