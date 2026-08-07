import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { USER_ROLES } from '../constants/roles.js';
import { hasOperationalStaffAccess } from '../constants/staffPermissions.js';
import { ApiError } from './apiError.js';

/** Ops see everything; team members only see items assigned to them. */
export function staffAssigneeListFilter(staff) {
  if (hasOperationalStaffAccess(staff)) return {};
  return { assignedTo: staff._id };
}

export function assertStaffCanAccessAssigned(staff, assignedTo) {
  if (hasOperationalStaffAccess(staff)) return;
  const assigneeId =
    assignedTo && typeof assignedTo === 'object' && assignedTo._id != null
      ? assignedTo._id
      : assignedTo;
  if (!assigneeId || String(assigneeId) !== String(staff._id)) {
    throw new ApiError(403, 'You do not have access to this record');
  }
}

export async function findTeamMemberAssignee(assigneeId) {
  if (!assigneeId || !mongoose.Types.ObjectId.isValid(assigneeId)) {
    throw new ApiError(400, 'Select a team member');
  }
  const assignee = await User.findOne({
    _id: assigneeId,
    role: USER_ROLES.TEAM_MEMBER,
    isActive: true,
    isDeleted: false,
  });
  if (!assignee) throw new ApiError(404, 'Team member not found or inactive');
  return assignee;
}

export function assertCanAssignToTeamMember(staff) {
  if (!hasOperationalStaffAccess(staff)) {
    throw new ApiError(403, 'Only admins can assign to team members');
  }
}
