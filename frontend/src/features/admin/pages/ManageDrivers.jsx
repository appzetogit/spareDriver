import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminDriversStore } from '../../../store/admin/useAdminDriversStore';
import StatusBadge from '../components/StatusBadge';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import DriverStats from '../components/ManageDrivers/DriverStats';
import DriverFilters from '../components/ManageDrivers/DriverFilters';
import DriverSuspendActions from '../components/ManageDrivers/DriverSuspendActions';
import TaskAssigneeBadge from '../components/ManageTasks/TaskAssigneeBadge';
import { getCarTypeLabel } from '../components/ManageDrivers/driverProfileUtils';

const ManageDrivers = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');

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
      assigneeId: assigneeFilter || undefined,
    }),
    [page, limit, debouncedSearch, statusFilter, assigneeFilter],
  );

  const cacheKey = buildCacheKey('admin-drivers', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminDriversStore,
    cacheKey,
    queryParams,
  );

  const drivers = data?.drivers ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Driver',
        width: '28%',
        render: (val, row) => {
          const selfie = row.documents?.find((d) => d.type === 'selfie')?.fileUrl;
          return (
            <div className="flex items-center gap-4 py-1">
              <Avatar name={val} size="sm" src={selfie} className="ring-2 ring-white shadow-md" />
              <div>
                <p className="font-semibold text-sm text-slate-800">{val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{row.phone}</p>
              </div>
            </div>
          );
        },
      },
      {
        key: 'approvalStatus',
        label: 'Status',
        width: '12%',
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: 'reviewTask',
        label: 'Assigned to',
        width: '14%',
        className: 'hidden md:table-cell',
        render: (_val, row) => <TaskAssigneeBadge task={row.reviewTask} compact />,
      },
      {
        key: 'experienceYears',
        label: 'Experience',
        width: '12%',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-sm font-medium text-slate-700">
            {val != null && val !== '' ? `${val} yr${Number(val) === 1 ? '' : 's'}` : '—'}
          </span>
        ),
      },
      {
        key: 'isOnline',
        label: 'Activity',
        width: '12%',
        className: 'hidden lg:table-cell',
        render: (val, row) => <ActivityCell online={val} onTrip={row.isOnTrip} />,
      },
      {
        key: 'carTypeExperience',
        label: 'Vehicle types',
        width: '22%',
        className: 'hidden xl:table-cell',
        render: (types) => (
          <div className="flex flex-wrap gap-1.5">
            {types?.length ? (
              types.map((type) => {
                const label = getCarTypeLabel(type);
                if (!label) return null;
                return (
                  <span
                    key={type._id || label}
                    className="inline-flex items-center px-2 py-1 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700 capitalize"
                  >
                    {label}
                  </span>
                );
              })
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        ),
      },
      {
        key: 'createdAt',
        label: 'Joined',
        width: '10%',
        className: 'hidden lg:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {val ? new Date(val).toLocaleDateString() : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        width: '14%',
        render: (_val, row) => (
          <div className="flex items-center gap-1" data-row-action onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => navigate(`/admin/drivers/${row._id}/analytics`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary-dark text-xs font-semibold hover:bg-primary/15 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics
            </button>
            <DriverSuspendActions driver={row} onSuccess={refetch} compact />
          </div>
        ),
      },
    ],
    [refetch, navigate],
  );

  const stats = useMemo(
    () => ({
      total: pagination.total,
      pending: drivers.filter(
        (d) => d.approvalStatus === 'pending' || d.approvalStatus === 'under_review',
      ).length,
      approved: drivers.filter((d) => d.approvalStatus === 'approved').length,
      rejected: drivers.filter((d) => d.approvalStatus === 'rejected').length,
      suspended: drivers.filter((d) => d.approvalStatus === 'suspended').length,
    }),
    [drivers, pagination.total],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up">
      <DriverFilters
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
        assigneeFilter={assigneeFilter}
        onAssigneeChange={(val) => {
          setAssigneeFilter(val);
          setPage(1);
        }}
        onRefresh={refetch}
        refreshing={loading}
      />

      <DriverStats {...stats} />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        columns={columns}
        data={drivers}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/admin/drivers/${row._id}/profile`)}
        entityLabel="drivers"
        emptyMessage="No drivers found"
      />
    </div>
  );
};

function ActivityCell({ online, onTrip }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}
      />
      <span className="text-xs font-medium text-slate-600">
        {online ? (onTrip ? 'On Trip' : 'Online') : 'Offline'}
      </span>
    </div>
  );
}

export default ManageDrivers;
