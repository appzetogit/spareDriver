import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { Driver } from '../models/driverModels/driver.model.js';
import KitOrder from '../models/kitOrder.model.js';
import AdminTask from '../models/adminTask.model.js';
import Booking from '../models/booking.model.js';
import WithdrawalRequest from '../models/withdrawalRequest.model.js';
import SosAlert from '../models/sosAlert.model.js';
import { ApiError } from '../utils/apiError.js';
import { STAFF_ROLES } from '../constants/staffPermissions.js';
import { KIT_ADMIN_STATUS } from '../constants/kitStatus.js';
import { OPEN_TASK_STATUSES, TASK_TYPE } from '../constants/adminTask.js';

function parseDateBound(value, endOfDay = false) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

function withDateRange(base, field, from, to) {
  const filter = { ...base };
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = from;
    if (to) filter[field].$lte = to;
  }
  return filter;
}

export async function getStaffMemberAnalyticsService(memberId, query = {}) {
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    throw new ApiError(400, 'Invalid team member id');
  }

  const member = await User.findById(memberId).select(
    'name email phone_no role isActive createdAt assignedZones',
  );
  if (!member || !STAFF_ROLES.includes(member.role)) {
    throw new ApiError(404, 'Staff member not found');
  }

  const from = parseDateBound(query.from, false);
  const to = parseDateBound(query.to, true);
  const staffOid = member._id;

  const [
    driversApproved,
    driversRejected,
    kitOrdersApproved,
    kitOrdersRejected,
    tasksCompletedAgg,
    openAssignedTasks,
    emergencyAssignments,
    manualAssignments,
    withdrawalsProcessed,
    sosResolved,
    recentTasks,
  ] = await Promise.all([
    Driver.countDocuments(
      withDateRange(
        { approvedBy: staffOid, approvalStatus: 'approved' },
        'approvedAt',
        from,
        to,
      ),
    ),
    Driver.countDocuments(
      withDateRange(
        { approvedBy: staffOid, approvalStatus: 'rejected' },
        'updatedAt',
        from,
        to,
      ),
    ),
    KitOrder.countDocuments(
      withDateRange(
        {
          reviewedBy: staffOid,
          adminStatus: KIT_ADMIN_STATUS.APPROVED,
        },
        'reviewedAt',
        from,
        to,
      ),
    ),
    KitOrder.countDocuments(
      withDateRange(
        {
          reviewedBy: staffOid,
          adminStatus: KIT_ADMIN_STATUS.REJECTED,
        },
        'reviewedAt',
        from,
        to,
      ),
    ),
    AdminTask.aggregate([
      {
        $match: withDateRange(
          { completedBy: staffOid, status: 'completed' },
          'completedAt',
          from,
          to,
        ),
      },
      {
        $group: {
          _id: {
            taskType: '$taskType',
            completedAction: '$completedAction',
          },
          count: { $sum: 1 },
        },
      },
    ]),
    AdminTask.countDocuments({
      assignedTo: staffOid,
      status: { $in: OPEN_TASK_STATUSES },
    }),
    Booking.countDocuments(
      withDateRange(
        { 'scheduled.emergencyPool.assignedBy': staffOid },
        'scheduled.emergencyPool.assignedAt',
        from,
        to,
      ),
    ),
    Booking.countDocuments(
      withDateRange(
        { 'scheduled.manualAssign.assignedBy': staffOid },
        'scheduled.manualAssign.assignedAt',
        from,
        to,
      ),
    ),
    WithdrawalRequest.countDocuments(
      withDateRange({ processedBy: staffOid }, 'processedAt', from, to),
    ),
    SosAlert.countDocuments(
      withDateRange({ resolvedBy: staffOid }, 'resolvedAt', from, to),
    ),
    AdminTask.find(
      withDateRange(
        { completedBy: staffOid, status: 'completed' },
        'completedAt',
        from,
        to,
      ),
    )
      .sort({ completedAt: -1 })
      .limit(20)
      .select('title taskType status completedAction completedAt resourceId')
      .lean(),
  ]);

  const tasksByType = {};
  const tasksByAction = {};
  let tasksCompleted = 0;
  for (const row of tasksCompletedAgg) {
    const type = row._id.taskType || 'unknown';
    const action = row._id.completedAction || 'completed';
    tasksByType[type] = (tasksByType[type] || 0) + row.count;
    tasksByAction[action] = (tasksByAction[action] || 0) + row.count;
    tasksCompleted += row.count;
  }

  return {
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      phone_no: member.phone_no,
      role: member.role,
      isActive: member.isActive,
      createdAt: member.createdAt,
    },
    range: {
      from: from?.toISOString() || null,
      to: to?.toISOString() || null,
    },
    counts: {
      driversApproved,
      driversRejected,
      kitOrdersApproved,
      kitOrdersRejected,
      kitOrdersReviewed: kitOrdersApproved + kitOrdersRejected,
      tasksCompleted,
      openAssignedTasks,
      emergencyAssignments,
      manualAssignments,
      withdrawalsProcessed,
      sosResolved,
    },
    tasksByType,
    tasksByAction,
    recentCompletedTasks: recentTasks.map((t) => ({
      _id: t._id,
      title: t.title,
      taskType: t.taskType,
      completedAction: t.completedAction || '',
      completedAt: t.completedAt,
      resourceId: t.resourceId,
      resourceLink:
        t.taskType === TASK_TYPE.DRIVER_REVIEW
          ? `/admin/drivers/${t.resourceId}/profile`
          : t.taskType === TASK_TYPE.KIT_ORDER_REVIEW
            ? `/admin/kit-orders/${t.resourceId}`
            : null,
    })),
  };
}
