import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { SUPPORT_SUBMITTER_TYPE } from '../constants/supportTicket.js';
import * as supportService from '../services/support.service.js';
import { getSupportConfigService } from '../services/appSettings.service.js';

function resolvePrincipal(req) {
  if (req.principalType === 'driver' && req.driver) {
    return { type: SUPPORT_SUBMITTER_TYPE.DRIVER, id: req.driver._id };
  }
  if (req.user) {
    return { type: SUPPORT_SUBMITTER_TYPE.USER, id: req.user._id };
  }
  return null;
}

export const getSupportConfig = asyncHandler(async (_req, res) => {
  const config = await getSupportConfigService();
  return res.status(200).json(new ApiResponse(200, config, 'Support config fetched'));
});

export const createSupportTicket = asyncHandler(async (req, res) => {
  const principal = resolvePrincipal(req);
  if (!principal) {
    return res.status(401).json({ status: 401, message: 'Not authorized' });
  }
  const ticket = await supportService.createSupportTicketService(req.body, principal);
  return res.status(201).json(new ApiResponse(201, { ticket }, 'Complaint submitted'));
});

export const getMySupportTickets = asyncHandler(async (req, res) => {
  const principal = resolvePrincipal(req);
  if (!principal) {
    return res.status(401).json({ status: 401, message: 'Not authorized' });
  }
  const tickets = await supportService.listMySupportTicketsService(principal);
  return res.status(200).json(new ApiResponse(200, { tickets }, 'Tickets fetched'));
});

export const getSupportTicketById = asyncHandler(async (req, res) => {
  const principal = resolvePrincipal(req);
  if (!principal) {
    return res.status(401).json({ status: 401, message: 'Not authorized' });
  }
  const ticket = await supportService.getSupportTicketByIdService(req.params.id, principal);
  return res.status(200).json(new ApiResponse(200, { ticket }, 'Ticket fetched'));
});

export const adminListSupportTickets = asyncHandler(async (req, res) => {
  const tickets = await supportService.listAdminSupportTicketsService({
    status: req.query.status,
  });
  return res.status(200).json(new ApiResponse(200, { tickets }, 'Support tickets fetched'));
});

export const adminGetSupportTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.getAdminSupportTicketService(req.params.id);
  return res.status(200).json(new ApiResponse(200, { ticket }, 'Support ticket fetched'));
});

export const adminUpdateSupportTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.updateAdminSupportTicketService(req.params.id, req.body);
  return res.status(200).json(new ApiResponse(200, { ticket }, 'Support ticket updated'));
});
