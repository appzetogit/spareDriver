import { User, UserX } from 'lucide-react';
import { getAssigneeName, isOpenTask } from './taskUtils';

const TaskAssigneeBadge = ({ task, compact = false }) => {
  if (!task || !isOpenTask(task)) {
    return <span className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>—</span>;
  }

  const name = getAssigneeName(task);
  const unassigned = !name;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full border ${
        compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      } ${
        unassigned
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-sky-50 text-sky-800 border-sky-200'
      }`}
      title={unassigned ? 'Not assigned yet' : `Assigned to ${name}`}
    >
      {unassigned ? (
        <UserX className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      ) : (
        <User className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      )}
      {unassigned ? 'Unassigned' : name}
    </span>
  );
};

export default TaskAssigneeBadge;
