import { Search, UserPlus } from 'lucide-react';
import Button from '../../../../components/Button';

const TeamFilters = ({ search, onSearchChange, onAddMember }) => {
  return (
    <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-2">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-5">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Team Management</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">Onboard and manage administrative staff roles</p>
        </div>

        <div className="flex flex-row sm:flex-row gap-2 sm:gap-3 w-full lg:w-auto">
          {/* SEARCH */}
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-10 sm:h-12 pl-9 sm:pl-11 pr-3 sm:pr-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white shadow-sm text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>

          <Button
            onClick={onAddMember}
            className="flex items-center gap-1.5 h-10 sm:h-12 px-3 sm:px-6 shadow-lg shadow-primary/20 whitespace-nowrap rounded-xl sm:rounded-2xl shrink-0"
          >
            <UserPlus className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            <span className="hidden sm:inline">Add Member</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TeamFilters;
