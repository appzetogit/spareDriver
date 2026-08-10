import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../../../components/Avatar';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminDriversStore } from '../../../store/admin/useAdminDriversStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageTaskAssignment } from '../../../constants/staffRoles';
import StatusBadge from '../components/StatusBadge';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import DriverStats from '../components/ManageDrivers/DriverStats';
import DriverFilters from '../components/ManageDrivers/DriverFilters';
import DriverSuspendActions from '../components/ManageDrivers/DriverSuspendActions';
import TaskAssigneeBadge from '../components/ManageTasks/TaskAssigneeBadge';
import BulkAssignBar, {
  runBulkAssignFromRows,
} from '../components/ManageTasks/BulkAssignBar';
import { isOpenTask } from '../components/ManageTasks/taskUtils';
import { getCarTypeLabel } from '../components/ManageDrivers/driverProfileUtils';

const ManageDrivers = () => {
  const navigate = useNavigate();
  const { admin } = useAdminAuthStore();
  const canAssign = canManageTaskAssignment(admin?.role);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selected, setSelected] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

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

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkAssign = async (assigneeId) => {
    setBulkLoading(true);
    try {
      const ok = await runBulkAssignFromRows({
        rows: drivers,
        selectedIds: selected,
        assigneeId,
        onSuccess: () => {
          setSelected([]);
          refetch();
        },
      });
      if (!ok) return;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk assign failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      ...(canAssign
        ? [
            {
              key: '_select',
              label: '',
              width: '52px',
              sortable: false,
              unclamp: true,
              compact: true,
              align: 'center',
              render: (_v, row) =>
                isOpenTask(row.reviewTask) ? (
                  <div
                    data-row-action
                    className="flex items-center justify-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(row._id)}
                      onChange={() => toggleSelect(row._id)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary accent-primary focus:ring-primary/30 cursor-pointer"
                      aria-label={`Select ${row.name || 'driver'}`}
                    />
                  </div>
                ) : (
                  <span className="inline-block w-4" aria-hidden />
                ),
            },
          ]
        : []),
      {
        key: 'name',
        label: 'Driver',
        width: '52%',
        unclamp: true,
        render: (val, row) => {
          const selfie = row.documents?.find((d) => d.type === 'selfie')?.fileUrl;
          return (
            <div className="flex items-center gap-1.5 sm:gap-3 py-1 min-w-0">
              <Avatar name={val} size="sm" src={selfie} className="ring-1 sm:ring-2 ring-white shadow-sm shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-xs sm:text-sm text-slate-800 truncate max-w-[120px] xs:max-w-[170px] sm:max-w-none">{val}</p>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate max-w-[120px] xs:max-w-[170px] sm:max-w-none">{row.phone}</p>
              </div>
            </div>
          );
        },
      },
      {
        key: 'approvalStatus',
        label: 'Status',
        width: '33%',
        unclamp: true,
        render: (val) => <StatusBadge status={val} />,
      },
      {
        key: 'reviewTask',
        label: 'Assigned to',
        className: 'hidden md:table-cell',
        render: (_val, row) => <TaskAssigneeBadge task={row.reviewTask} compact />,
      },
      {
        key: 'experienceYears',
        label: 'Experience',
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
        className: 'hidden lg:table-cell',
        render: (val, row) => <ActivityCell online={val} onTrip={row.isOnTrip} />,
      },
      {
        key: 'carTypeExperience',
        label: 'Vehicle types',
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
        className: 'hidden lg:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {val ? new Date(val).toLocaleDateString('en-GB') : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        label: <span className="hidden sm:inline">Actions</span>,
        compact: true,
        unclamp: true,
        align: 'right',
        sortable: false,
        render: (_val, row) => (
          <div
            className="flex items-center justify-end"
            data-row-action
            onClick={(e) => e.stopPropagation()}
          >
            <DriverSuspendActions
              driver={row}
              variant="menu"
              extraMenuItems={[
                {
                  label: 'Analytics',
                  icon: BarChart3,
                  onClick: () => navigate(`/admin/drivers/${row._id}/analytics`),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [navigate, canAssign, selected],
  );

  const stats = useMemo(
    () => ({
      total: pagination.total,
      pending: drivers.filter((d) => d.approvalStatus === 'under_review').length,
      approved: drivers.filter((d) => d.approvalStatus === 'approved').length,
      rejected: drivers.filter((d) => d.approvalStatus === 'rejected').length,
      suspended: drivers.filter((d) => d.approvalStatus === 'suspended').length,
    }),
    [drivers, pagination.total],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-3 sm:space-y-4 animate-fade-in-up">
      <DriverFilters
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
          setSelected([]);
        }}
        statusFilter={statusFilter}
        onStatusChange={(val) => {
          setStatusFilter(val);
          setPage(1);
          setSelected([]);
        }}
        assigneeFilter={assigneeFilter}
        onAssigneeChange={(val) => {
          setAssigneeFilter(val);
          setPage(1);
          setSelected([]);
        }}
        onRefresh={refetch}
        refreshing={loading}
      />

      <DriverStats {...stats} />

      {canAssign && (
        <BulkAssignBar
          selectedCount={selected.length}
          onAssign={handleBulkAssign}
          loading={bulkLoading}
        />
      )}

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
        onPageChange={(p) => {
          setPage(p);
          setSelected([]);
        }}
        onRowClick={(row) => navigate(`/admin/drivers/${row._id}/profile`)}
        entityLabel="drivers"
        emptyMessage="No drivers found"
        minWidth="min-w-full md:min-w-[800px] xl:min-w-[1050px]"
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
