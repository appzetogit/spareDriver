import SupportTicket from '../models/supportTicket.model.js';
import Booking from '../models/booking.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  SUPPORT_TICKET_STATUS,
  SUPPORT_TICKET_STATUS_LIST,
  SUPPORT_TICKET_CATEGORY_LIST,
  SUPPORT_SUBMITTER_TYPE,
} from '../constants/supportTicket.js';
import {
  notifyAdminSupportTicketReceived,
  notifyUserSupportReply,
  notifyDriverSupportReply,
} from '../utils/notificationDispatch.js';
import {
  staffAssigneeListFilter,
  assertStaffCanAccessAssigned,
  findTeamMemberAssignee,
  assertCanAssignToTeamMember,
} from '../utils/staffAssignment.util.js';

async function generateTicketNumber() {
  const count = await SupportTicket.countDocuments();
  return `TKT-${String(count + 1).padStart(6, '0')}`;
}

function assertCategory(category) {
  if (!SUPPORT_TICKET_CATEGORY_LIST.includes(category)) {
    throw new ApiError(400, 'Invalid complaint category');
  }
}

async function assertBookingOwnership(bookingId, { userId, driverId, submitterType }) {
  if (!bookingId) return null;
  const booking = await Booking.findById(bookingId).select('_id userId driverId bookingNumber').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (submitterType === SUPPORT_SUBMITTER_TYPE.USER && String(booking.userId) !== String(userId)) {
    throw new ApiError(403, 'This booking does not belong to you');
  }
  if (submitterType === SUPPORT_SUBMITTER_TYPE.DRIVER && String(booking.driverId) !== String(driverId)) {
    throw new ApiError(403, 'This booking does not belong to you');
  }
  return booking;
}

export async function createSupportTicketService(payload, principal) {
  const { category, subject, description, screenshot, bookingId } = payload || {};
  assertCategory(category);

  if (!subject?.trim()) throw new ApiError(400, 'Subject is required');
  if (!description?.trim()) throw new ApiError(400, 'Description is required');

  const submitterType = principal.type;
  const userId = submitterType === SUPPORT_SUBMITTER_TYPE.USER ? principal.id : null;
  const driverId = submitterType === SUPPORT_SUBMITTER_TYPE.DRIVER ? principal.id : null;

  await assertBookingOwnership(bookingId || null, { userId, driverId, submitterType });

  const ticketNumber = await generateTicketNumber();
  const ticket = await SupportTicket.create({
    ticketNumber,
    userId,
    driverId,
    submitterType,
    bookingId: bookingId || null,
    category,
    subject: subject.trim(),
    description: description.trim(),
    screenshot: screenshot?.trim() || '',
    status: SUPPORT_TICKET_STATUS.OPEN,
  });

  notifyAdminSupportTicketReceived(ticket).catch(() => {});

  return ticket;
}

function ownerFilter(principal) {
  if (principal.type === SUPPORT_SUBMITTER_TYPE.USER) {
    return { userId: principal.id };
  }
  return { driverId: principal.id };
}

export async function listMySupportTicketsService(principal) {
  return SupportTicket.find(ownerFilter(principal))
    .sort({ createdAt: -1 })
    .select('ticketNumber subject status category createdAt updatedAt adminReply')
    .lean();
}

export async function getSupportTicketByIdService(id, principal) {
  const ticket = await SupportTicket.findOne({ _id: id, ...ownerFilter(principal) })
    .populate('bookingId', 'bookingNumber status pickupAddress dropAddress createdAt')
    .lean();
  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  return ticket;
}

const ASSIGNEE_POPULATE = [
  { path: 'assignedTo', select: 'name email role' },
  { path: 'assignedBy', select: 'name email role' },
];

export async function listAdminSupportTicketsService(staff, { status } = {}) {
  const filter = {
    ...staffAssigneeListFilter(staff),
  };
  if (status && status !== 'all' && SUPPORT_TICKET_STATUS_LIST.includes(status)) {
    filter.status = status;
  }

  return SupportTicket.find(filter)
    .sort({ createdAt: -1 })
    .populate('userId', 'name phone email')
    .populate('driverId', 'name phone email')
    .populate('bookingId', 'bookingNumber status pickupAddress dropAddress')
    .populate(ASSIGNEE_POPULATE)
    .lean();
}

export async function getAdminSupportTicketService(staff, id) {
  const ticket = await SupportTicket.findById(id)
    .populate('userId', 'name phone email')
    .populate('driverId', 'name phone email')
    .populate('bookingId', 'bookingNumber status pickupAddress dropAddress createdAt serviceType')
    .populate(ASSIGNEE_POPULATE)
    .lean();
  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  assertStaffCanAccessAssigned(staff, ticket.assignedTo);
  return ticket;
}

export async function updateAdminSupportTicketService(staff, id, data) {
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  assertStaffCanAccessAssigned(staff, ticket.assignedTo);

  const { status, adminReply } = data || {};
  const replyChanged =
    adminReply !== undefined &&
    String(adminReply).trim() !== String(ticket.adminReply || '').trim();

  if (status !== undefined) {
    if (!SUPPORT_TICKET_STATUS_LIST.includes(status)) {
      throw new ApiError(400, 'Invalid status');
    }
    ticket.status = status;
  }

  if (adminReply !== undefined) {
    ticket.adminReply = String(adminReply).trim();
  }

  await ticket.save();

  if (replyChanged && ticket.adminReply) {
    if (ticket.submitterType === SUPPORT_SUBMITTER_TYPE.USER && ticket.userId) {
      notifyUserSupportReply(ticket.userId, ticket).catch(() => {});
    } else if (ticket.submitterType === SUPPORT_SUBMITTER_TYPE.DRIVER && ticket.driverId) {
      notifyDriverSupportReply(ticket.driverId, ticket).catch(() => {});
    }
  }

  return getAdminSupportTicketService(staff, id);
}

export async function assignSupportTicketService(staff, id, { assigneeId }) {
  assertCanAssignToTeamMember(staff);

  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw new ApiError(404, 'Support ticket not found');
  if (ticket.status === SUPPORT_TICKET_STATUS.RESOLVED) {
    throw new ApiError(400, 'Cannot assign a resolved ticket');
  }

  const assignee = await findTeamMemberAssignee(assigneeId);
  ticket.assignedTo = assignee._id;
  ticket.assignedBy = staff._id;
  ticket.assignedAt = new Date();
  if (ticket.status === SUPPORT_TICKET_STATUS.OPEN) {
    ticket.status = SUPPORT_TICKET_STATUS.IN_PROGRESS;
  }
  await ticket.save();

  return getAdminSupportTicketService(staff, id);
}
