import { useState } from 'react';
import toast from 'react-hot-toast';
import Select from '../../../components/Select';
import Button from '../../../components/Button';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { useAdminTaskAssigneesStore } from '../../../store/admin/useAdminTasksStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageTaskAssignment, STAFF_ROLES } from '../../../constants/staffRoles';

/**
 * Ops-only control to assign an SOS alert or support ticket to a team member.
 * Reuses GET /admin/tasks/assignees and filters to team_member role.
 */
const AssignToTeamMemberControl = ({ onAssign, disabled = false, compact = false }) => {
  const { admin } = useAdminAuthStore();
  const [assigneeId, setAssigneeId] = useState('');
  const [loading, setLoading] = useState(false);

  const { data } = useCachedQuery(
    useAdminTaskAssigneesStore,
    'admin-task-assignees',
    {},
    { enabled: canManageTaskAssignment(admin?.role) },
  );
  const assignees = (Array.isArray(data) ? data : []).filter(
    (u) => u.role === STAFF_ROLES.TEAM_MEMBER,
  );

  if (!canManageTaskAssignment(admin?.role) || disabled) return null;

  const options = assignees.map((u) => ({
    value: u._id,
    label: u.name || u.email || 'Team member',
  }));

  const handleAssign = async () => {
    if (!assigneeId) {
      toast.error('Select a team member');
      return;
    }
    setLoading(true);
    try {
      await onAssign(assigneeId);
      setAssigneeId('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign');
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-[200px]">
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder="Assign to…"
          options={[{ value: '', label: 'Select member' }, ...options]}
          className="flex-1"
        />
        <Button variant="outline" size="sm" loading={loading} onClick={handleAssign}>
          Assign
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex-1">
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder="Select team member"
          options={[{ value: '', label: 'Select member' }, ...options]}
        />
      </div>
      <Button variant="admin" size="md" loading={loading} onClick={handleAssign}>
        Assign
      </Button>
    </div>
  );
};

export default AssignToTeamMemberControl;
