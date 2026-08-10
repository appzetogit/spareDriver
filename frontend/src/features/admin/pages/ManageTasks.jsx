import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckSquare, History, RefreshCw, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import Select from '../../../components/Select';
import Button from '../../../components/Button';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import {
  assignAdminTasks,
  syncAdminReviewTasks,
  useAdminTaskAssigneesStore,
  useAdminTaskSummaryStore,
  useAdminTasksListStore,
} from '../../../store/admin/useAdminTasksStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import {
  hasOperationalAccess,
  canViewTaskActivityLog,
  canManageTaskAssignment,
} from '../../../constants/staffRoles';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import TaskAssigneeBadge from '../components/ManageTasks/TaskAssigneeBadge';
import {
  getTaskResourceLink,
  isOpenTask,
} from '../components/ManageTasks/taskUtils';
import {
  TASK_SCOPE_OPTIONS,
  TASK_TYPE,
  TASK_TYPE_LABELS,
} from '../../../constants/adminTask';

const ManageTasks = () => {
  const navigate = useNavigate();
  const { admin } = useAdminAuthStore();
  const isOpsStaff = hasOperationalAccess(admin?.role);

  const [scope, setScope] = useState('all');
  const [taskType, setTaskType] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const limit = 20;

  const queryParams = useMemo(
    () => ({
      ...(isOpsStaff ? { scope } : {}),
      taskType: taskType || undefined,
      assigneeId: isOpsStaff && assigneeFilter ? assigneeFilter : undefined,
      page,
      limit,
    }),
    [scope, taskType, assigneeFilter, page, limit, isOpsStaff],
  );

  const cacheKey = buildCacheKey('admin-tasks', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminTasksListStore,
    cacheKey,
    queryParams,
  );

  const { data: summary } = useCachedQuery(
    useAdminTaskSummaryStore,
    'admin-task-summary',
    {},
  );

  const { data: assigneesData } = useCachedQuery(
    useAdminTaskAssigneesStore,
    'admin-task-assignees',
    {},
    { enabled: isOpsStaff },
  );
  const assignees = Array.isArray(assigneesData) ? assigneesData : [];

  const tasks = data?.tasks ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkAssign = async () => {
    if (!selected.length) {
      toast.error('Select at least one task');
      return;
    }
    if (!bulkAssignee) {
      toast.error('Select a team member');
      return;
    }
    setBulkLoading(true);
    try {
      await assignAdminTasks({ taskIds: selected, assigneeId: bulkAssignee });
      toast.success('Tasks assigned');
      setSelected([]);
      refetch();
      useAdminTaskSummaryStore.getState().invalidate('admin-task-summary');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk assign failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAdminReviewTasks();
      toast.success(
        `Synced — ${result?.tasksCreated ?? 0} new task(s) from pending reviews`,
      );
      refetch();
      useAdminTaskSummaryStore.getState().invalidate('admin-task-summary');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const columns = useMemo(
    () => [
      ...(isOpsStaff
        ? [
            {
              key: '_select',
              label: '',
              width: '30px',
              render: (_v, row) =>
                isOpenTask(row) ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(row._id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(row._id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300"
                  />
                ) : null,
            },
          ]
        : []),
      {
        key: 'title',
        label: 'Task',
        unclamp: true,
        render: (val, row) => {
          const resourceDetail =
            row.taskType === TASK_TYPE.DRIVER_REVIEW
              ? [row.resource?.name, row.resource?.phone].filter(Boolean).join(' · ')
              : [row.resource?.orderNumber, row.resource?.kitSnapshot?.name || row.resource?.kitId?.name].filter(Boolean).join(' · ');

          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{val}</p>
                <span className="sm:hidden text-[9px] font-bold uppercase text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
                  {row.status}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 truncate">
                {TASK_TYPE_LABELS[row.taskType] || row.taskType}
                {resourceDetail ? ` · ${resourceDetail}` : ''}
              </p>
              {row.createdAt && (
                <p className="sm:hidden text-[9px] text-slate-400 mt-0.5">
                  Created: {new Date(row.createdAt).toLocaleDateString('en-GB')}
                </p>
              )}
            </div>
          );
        },
      },
      {
        key: 'resource',
        label: 'Record',
        className: 'hidden sm:table-cell',
        render: (_v, row) => {
          if (row.taskType === TASK_TYPE.DRIVER_REVIEW) {
            return (
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {row.resource?.name || '—'}
                </p>
                <p className="text-xs text-slate-500">{row.resource?.phone}</p>
              </div>
            );
          }
          return (
            <div>
              <p className="text-sm font-mono text-slate-700">
                {row.resource?.orderNumber || '—'}
              </p>
              <p className="text-xs text-slate-500">
                {row.resource?.kitSnapshot?.name || row.resource?.kitId?.name}
              </p>
            </div>
          );
        },
      },
      {
        key: 'assignedTo',
        label: 'Assignee',
        unclamp: true,
        render: (_v, row) => <TaskAssigneeBadge task={row} />,
      },
      {
        key: 'status',
        label: 'Status',
        className: 'hidden sm:table-cell',
        render: (val) => (
          <span className="text-[10px] sm:text-xs font-semibold uppercase text-slate-600">{val}</span>
        ),
      },
      {
        key: 'createdAt',
        label: 'Created',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {val ? new Date(val).toLocaleDateString('en-GB') : '—'}
          </span>
        ),
      },
    ],
    [isOpsStaff, selected],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-4 sm:space-y-6 animate-fade-in-up pb-8">
      <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md pb-2">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
              Team tasks
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {isOpsStaff
                ? 'Assign reviews and track team workload'
                : 'Tasks assigned to you — open a record to complete your review'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={loading}
              className="flex-1 sm:flex-initial h-8 sm:h-11 px-3 sm:px-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {isOpsStaff && (
              <>
                {canViewTaskActivityLog(admin?.role) && (
                  <Link
                    to="/admin/tasks/activity"
                    className="flex-1 sm:flex-initial h-8 sm:h-11 px-3 sm:px-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    Activity
                  </Link>
                )}
                {canManageTaskAssignment(admin?.role) && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={syncing}
                    onClick={handleSync}
                    className="h-8 sm:h-11 px-2.5 sm:px-4 text-xs sm:text-sm font-semibold shrink-0"
                  >
                    <span>Sync<span className="hidden sm:inline"> reviews</span></span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {isOpsStaff ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3 sm:mt-5">
            <StatCard label="Unassigned" value={summary?.unassigned ?? 0} />
            <StatCard label="My tasks" value={summary?.mine ?? 0} />
            <StatCard label="All open" value={summary?.allOpen ?? 0} />
          </div>
        ) : (
          <div className="mt-3 sm:mt-5 max-w-xs">
            <StatCard label="My assigned tasks" value={summary?.mine ?? 0} />
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-3 mt-3 sm:mt-4">
          {isOpsStaff && (
            <div className="flex-1 min-w-0">
              <Select
                value={scope}
                onChange={(v) => {
                  setScope(v);
                  setPage(1);
                }}
                options={TASK_SCOPE_OPTIONS}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Select
              value={taskType}
              onChange={(v) => {
                setTaskType(v);
                setPage(1);
              }}
              placeholder="All types"
              options={[
                { value: '', label: 'All types' },
                { value: TASK_TYPE.DRIVER_REVIEW, label: TASK_TYPE_LABELS[TASK_TYPE.DRIVER_REVIEW] },
                {
                  value: TASK_TYPE.KIT_ORDER_REVIEW,
                  label: TASK_TYPE_LABELS[TASK_TYPE.KIT_ORDER_REVIEW],
                },
              ]}
            />
          </div>
          {isOpsStaff && (
            <div className="flex-1 min-w-0">
              <Select
                value={assigneeFilter}
                onChange={(v) => {
                  setAssigneeFilter(v);
                  setPage(1);
                }}
                placeholder="All assignees"
                options={[
                  { value: '', label: 'All assignees' },
                  { value: 'unassigned', label: 'Unassigned only' },
                  ...assignees.map((u) => ({
                    value: u._id,
                    label: u.name || u.email,
                  })),
                ]}
              />
            </div>
          )}
        </div>

        {isOpsStaff && selected.length > 0 && (
          <div className="mt-3 flex flex-row items-center gap-2 p-2.5 sm:p-4 rounded-xl bg-white border border-slate-200">
            <span className="text-xs sm:text-sm font-medium text-slate-700 shrink-0">
              {selected.length} selected
            </span>
            <div className="flex-1 min-w-0">
              <Select
                value={bulkAssignee}
                onChange={setBulkAssignee}
                placeholder="Select member"
                options={[
                  { value: '', label: 'Select member' },
                  ...assignees.map((u) => ({
                    value: u._id,
                    label: u.name || u.email,
                  })),
                ]}
              />
            </div>
            <Button
              variant="admin"
              size="sm"
              icon={UserPlus}
              loading={bulkLoading}
              onClick={handleBulkAssign}
              className="shrink-0"
            >
              Assign
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        minWidth="w-full min-w-0"
        columns={columns}
        data={tasks}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => {
          const link = getTaskResourceLink(row);
          if (link) navigate(link);
        }}
        entityLabel="tasks"
        emptyMessage="No open tasks — reviews will appear when drivers submit or kit orders are paid"
      />

      <p className="text-xs text-slate-500 text-center">
        Tip: open a{' '}
        <Link to="/admin/drivers" className="underline">
          driver
        </Link>{' '}
        or{' '}
        <Link to="/admin/kit-orders" className="underline">
          kit order
        </Link>{' '}
        to complete your assigned review.
      </p>
    </div>
  );
};

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-4 shadow-sm min-w-0">
      <p className="text-[9px] sm:text-xs font-semibold uppercase tracking-tight sm:tracking-wider text-slate-400 truncate">{label}</p>
      <p className="text-base sm:text-2xl font-bold text-slate-900 mt-0.5 sm:mt-1">{value}</p>
    </div>
  );
}

export default ManageTasks;
