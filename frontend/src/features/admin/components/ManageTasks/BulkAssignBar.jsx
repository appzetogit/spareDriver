import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import Select from '../../../../components/Select';
import Button from '../../../../components/Button';
import { useCachedQuery } from '../../../../hooks/useCachedQuery';
import {
  assignAdminTasks,
  useAdminTaskAssigneesStore,
} from '../../../../store/admin/useAdminTasksStore';
import useAdminAuthStore from '../../../../store/useAdminAuthStore';
import { canManageTaskAssignment } from '../../../../constants/staffRoles';
import { isOpenTask } from './taskUtils';

/**
 * Collect open review-task ids from selected list rows that attach `reviewTask`.
 * @returns {{ taskIds: string[], skipped: number }}
 */
export function collectOpenReviewTaskIds(rows, selectedIds) {
  const selectedSet = new Set(selectedIds.map(String));
  const taskIds = [];
  let skipped = 0;

  for (const row of rows) {
    if (!selectedSet.has(String(row._id))) continue;
    if (isOpenTask(row.reviewTask)) {
      taskIds.push(row.reviewTask._id);
    } else {
      skipped += 1;
    }
  }

  return { taskIds, skipped };
}

const BulkAssignBar = ({
  selectedCount,
  onAssign,
  loading = false,
  className = '',
}) => {
  const { admin } = useAdminAuthStore();
  const [assigneeId, setAssigneeId] = useState('');

  const { data: assigneesData } = useCachedQuery(
    useAdminTaskAssigneesStore,
    'admin-task-assignees',
    {},
    { enabled: canManageTaskAssignment(admin?.role) },
  );
  const assignees = Array.isArray(assigneesData) ? assigneesData : [];

  if (!canManageTaskAssignment(admin?.role) || selectedCount <= 0) return null;

  const handleClick = async () => {
    if (!assigneeId) {
      toast.error('Select a team member');
      return;
    }
    await onAssign(assigneeId);
  };

  return (
    <div
      className={`flex flex-col sm:flex-row gap-3 items-start sm:items-center p-4 rounded-xl bg-white border border-slate-200 ${className}`}
    >
      <span className="text-sm font-medium text-slate-700">
        {selectedCount} selected
      </span>
      <div className="flex-1 w-full sm:max-w-xs">
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder="Assign to member"
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
        size="md"
        icon={UserPlus}
        loading={loading}
        onClick={handleClick}
      >
        Assign selected
      </Button>
    </div>
  );
};

export async function runBulkAssignFromRows({
  rows,
  selectedIds,
  assigneeId,
  onSuccess,
}) {
  const { taskIds, skipped } = collectOpenReviewTaskIds(rows, selectedIds);

  if (!taskIds.length) {
    toast.error('No open review tasks in selection');
    return false;
  }

  await assignAdminTasks({ taskIds, assigneeId });

  const parts = [`${taskIds.length} task(s) assigned`];
  if (skipped) parts.push(`${skipped} skipped (no open task)`);
  toast.success(parts.join(' — '));
  onSuccess?.();
  return true;
}

export default BulkAssignBar;
