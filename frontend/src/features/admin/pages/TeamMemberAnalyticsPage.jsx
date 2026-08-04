import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Package,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Wallet,
} from 'lucide-react';
import Avatar from '../../../components/Avatar';
import Badge from '../../../components/Badge';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminTeamMemberAnalyticsStore } from '../../../store/admin/useAdminTeamMemberAnalyticsStore';
import { STAFF_ROLE_LABELS } from '../../../constants/staffRoles';
import { TASK_TYPE_LABELS } from '../../../constants/adminTask';
import { SectionCard, InfoGrid } from '../components/DetailBlocks';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

function resolveDateParams(period, fromDate, toDate) {
  if (period === 'custom') {
    return { from: fromDate || undefined, to: toDate || undefined };
  }
  if (period === 'all') return {};
  const end = new Date();
  const start = new Date(end);
  const days =
    period === '7d' ? 6 : period === '90d' ? 89 : period === '365d' ? 364 : 29;
  start.setDate(start.getDate() - days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MetricCard({ label, value, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    rose: 'bg-rose-50 text-rose-800 border-rose-100',
    sky: 'bg-sky-50 text-sky-800 border-sky-100',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
        {Icon ? <Icon className="w-4 h-4 opacity-70" /> : null}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value ?? 0}</p>
    </div>
  );
}

const TeamMemberAnalyticsPage = () => {
  const { memberId } = useParams();
  const [period, setPeriod] = useState('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const dateParams = useMemo(
    () => resolveDateParams(period, fromDate, toDate),
    [period, fromDate, toDate],
  );

  const queryParams = useMemo(
    () => ({
      memberId,
      from: dateParams.from,
      to: dateParams.to,
    }),
    [memberId, dateParams],
  );

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminTeamMemberAnalyticsStore,
    buildCacheKey(`team-member-analytics:${memberId}`, queryParams),
    queryParams,
    { enabled: Boolean(memberId) },
  );

  const member = data?.member;
  const counts = data?.counts || {};
  const tasksByType = data?.tasksByType || {};
  const tasksByAction = data?.tasksByAction || {};
  const recent = data?.recentCompletedTasks || [];

  return (
    <div className="min-h-screen bg-slate-50 space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/admin/settings/team"
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-500" />
              <h1 className="text-xl font-semibold text-slate-900">Team member analytics</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Approvals and work completed by this staff member
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriod(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              period === opt.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap gap-3">
          <label className="text-sm text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="ml-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="ml-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading analytics…
        </div>
      ) : member ? (
        <>
          <SectionCard title="Member">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <Avatar name={member.name} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-slate-900">{member.name}</p>
                  <Badge variant={member.isActive ? 'success' : 'danger'}>
                    {member.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="info">
                    {STAFF_ROLE_LABELS[member.role] || member.role}
                  </Badge>
                </div>
                <InfoGrid
                  columns={3}
                  items={[
                    { label: 'Email', value: member.email },
                    { label: 'Phone', value: member.phone_no },
                    { label: 'Joined', value: formatDate(member.createdAt) },
                  ]}
                />
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Drivers approved"
              value={counts.driversApproved}
              icon={UserCheck}
              tone="emerald"
            />
            <MetricCard
              label="Drivers rejected"
              value={counts.driversRejected}
              icon={ShieldAlert}
              tone="rose"
            />
            <MetricCard
              label="Kit reviews"
              value={counts.kitOrdersReviewed}
              icon={Package}
              tone="sky"
            />
            <MetricCard
              label="Tasks completed"
              value={counts.tasksCompleted}
              icon={CheckCircle2}
              tone="emerald"
            />
            <MetricCard
              label="Open assigned"
              value={counts.openAssignedTasks}
              icon={ClipboardList}
              tone="amber"
            />
            <MetricCard
              label="Emergency assigns"
              value={counts.emergencyAssignments}
              icon={BarChart3}
            />
            <MetricCard
              label="Manual assigns"
              value={counts.manualAssignments}
              icon={BarChart3}
            />
            <MetricCard
              label="Withdrawals / SOS"
              value={`${counts.withdrawalsProcessed ?? 0} / ${counts.sosResolved ?? 0}`}
              icon={Wallet}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Tasks by type">
              {!Object.keys(tasksByType).length ? (
                <p className="text-sm text-slate-500">No completed tasks in this range.</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(tasksByType).map(([type, count]) => (
                    <li
                      key={type}
                      className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0"
                    >
                      <span className="text-slate-700">
                        {TASK_TYPE_LABELS[type] || type}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Tasks by action">
              {!Object.keys(tasksByAction).length ? (
                <p className="text-sm text-slate-500">No completed actions in this range.</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(tasksByAction).map(([action, count]) => (
                    <li
                      key={action}
                      className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0"
                    >
                      <span className="text-slate-700 capitalize">
                        {action.replace(/_/g, ' ')}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="pt-3 mt-2 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                <p>
                  Kit approved: <strong>{counts.kitOrdersApproved ?? 0}</strong>
                  {' · '}
                  Kit rejected: <strong>{counts.kitOrdersRejected ?? 0}</strong>
                </p>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Recent completed work">
            {!recent.length ? (
              <p className="text-sm text-slate-500">No recent completed tasks.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((task) => (
                  <li key={task._id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {TASK_TYPE_LABELS[task.taskType] || task.taskType}
                        {task.completedAction
                          ? ` · ${task.completedAction.replace(/_/g, ' ')}`
                          : ''}
                        {' · '}
                        {formatDateTime(task.completedAt)}
                      </p>
                    </div>
                    {task.resourceLink ? (
                      <Link
                        to={task.resourceLink}
                        className="text-xs font-semibold text-primary-dark hover:underline shrink-0"
                      >
                        Open record
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
};

export default TeamMemberAnalyticsPage;
