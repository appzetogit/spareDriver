import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, History, RefreshCw } from 'lucide-react';
import Select from '../../../components/Select';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminTaskActivityStore } from '../../../store/admin/useAdminTasksStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import { getTaskResourceLink } from '../components/ManageTasks/taskUtils';
import {
  TASK_CATEGORY,
  TASK_CATEGORY_LABELS,
  TASK_TYPE,
  TASK_TYPE_LABELS,
} from '../../../constants/adminTask';

const TaskActivityLogPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [taskType, setTaskType] = useState('');
  const [category, setCategory] = useState('');
  const limit = 50;

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      taskType: taskType || undefined,
      category: category || undefined,
    }),
    [page, limit, taskType, category],
  );

  const cacheKey = buildCacheKey('admin-task-activity', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminTaskActivityStore,
    cacheKey,
    queryParams,
  );

  const entries = data?.entries ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const columns = useMemo(
    () => [
      {
        key: 'title',
        label: 'Task',
        unclamp: true,
        render: (val, row) => (
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-slate-800 truncate">{val}</p>
            <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
              {TASK_TYPE_LABELS[row.taskType] || row.taskType}
              <span className="sm:hidden"> · {row.action}</span>
            </p>
          </div>
        ),
      },
      {
        key: 'action',
        label: 'Action',
        className: 'hidden sm:table-cell',
        render: (val) => (
          <span className="text-xs font-semibold uppercase text-slate-700">{val}</span>
        ),
      },
      {
        key: 'byName',
        label: 'By',
        unclamp: true,
        render: (val) => <span className="text-xs sm:text-sm text-slate-600">{val || 'System'}</span>,
      },
      {
        key: 'note',
        label: 'Note',
        className: 'hidden sm:table-cell',
        render: (val) => (
          <span className="text-xs sm:text-sm text-slate-600 line-clamp-2">{val || '—'}</span>
        ),
      },
      {
        key: 'at',
        label: 'When',
        unclamp: true,
        align: 'right',
        render: (val) => (
          <span className="text-[10px] sm:text-xs text-slate-600">
            {val ? new Date(val).toLocaleDateString('en-GB') : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 space-y-4 sm:space-y-6 animate-fade-in-up pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/admin/tasks"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 mb-1 sm:mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Back to tasks
          </Link>
          <h1 className="text-lg sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 sm:w-8 sm:h-8 text-primary shrink-0" />
            Task activity log
          </h1>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={loading}
          className="h-8 sm:h-11 px-3 sm:px-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
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
        <div className="flex-1 min-w-0">
          <Select
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            placeholder="All categories"
            options={[
              { value: '', label: 'All categories' },
              ...Object.values(TASK_CATEGORY).map((c) => ({
                value: c,
                label: TASK_CATEGORY_LABELS[c],
              })),
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        minWidth="w-full min-w-0"
        columns={columns}
        data={entries}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        onRowClick={(row) => {
          const link = getTaskResourceLink(row);
          if (link) navigate(link);
        }}
        entityLabel="entries"
        emptyMessage="No activity recorded yet"
      />
    </div>
  );
};

export default TaskActivityLogPage;
