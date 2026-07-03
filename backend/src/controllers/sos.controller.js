import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import {
  createSosSchema,
  updateSosLocationSchema,
  listAdminSosSchema,
} from '../validations/sos.validation.js';
import {
  createSosService,
  updateSosLocationService,
  resolveSosService,
  getActiveSosForTripService,
  listAdminSosService,
  getAdminSosDetailService,
} from '../services/sos.service.js';
import {
  listEmergencyContactsService,
  createEmergencyContactService,
  updateEmergencyContactService,
  deleteEmergencyContactService,
} from '../services/emergencyContact.service.js';
import {
  createEmergencyContactSchema,
  updateEmergencyContactSchema,
} from '../validations/sos.validation.js';

function principalFromReq(req) {
  if (req.driver) {
    return { type: 'driver', id: req.driver._id };
  }
  if (req.user) {
    return { type: 'user', id: req.user._id };
  }
  throw new ApiError(401, 'Not authenticated');
}

export const createSos = asyncHandler(async (req, res) => {
  const body = createSosSchema.parse(req.body);
  const principal = principalFromReq(req);
  const { sosId } = await createSosService({
    tripId: body.tripId,
    latitude: body.latitude,
    longitude: body.longitude,
    principal,
    ip: req.ip || '',
  });

  return res.status(201).json(
    new ApiResponse(201, { success: true, sosId }, 'SOS alert created'),
  );
});

export const updateSosLocation = asyncHandler(async (req, res) => {
  const body = updateSosLocationSchema.parse(req.body);
  const principal = principalFromReq(req);
  const result = await updateSosLocationService({
    sosId: body.sosId,
    latitude: body.latitude,
    longitude: body.longitude,
    principal,
    ip: req.ip || '',
  });

  return res.json(new ApiResponse(200, result, 'Location updated'));
});

export const resolveSos = asyncHandler(async (req, res) => {
  const alert = await resolveSosService({
    sosId: req.params.id,
    staffId: req.staff._id,
    ip: req.ip || '',
  });

  return res.json(new ApiResponse(200, { alert }, 'SOS resolved'));
});

export const getActiveSosForTrip = asyncHandler(async (req, res) => {
  const principal = principalFromReq(req);
  const alert = await getActiveSosForTripService(req.params.tripId, principal);
  return res.json(new ApiResponse(200, { alert }, 'Active SOS'));
});

export const listAdminSos = asyncHandler(async (req, res) => {
  const query = listAdminSosSchema.parse(req.query);
  const data = await listAdminSosService(query);
  return res.json(new ApiResponse(200, data, 'SOS alerts'));
});

export const getAdminSosDetail = asyncHandler(async (req, res) => {
  const data = await getAdminSosDetailService(req.params.id);
  return res.json(new ApiResponse(200, data, 'SOS detail'));
});

export const listEmergencyContacts = asyncHandler(async (req, res) => {
  const contacts = await listEmergencyContactsService(req.user._id);
  return res.json(new ApiResponse(200, { contacts }, 'Emergency contacts'));
});

export const createEmergencyContact = asyncHandler(async (req, res) => {
  const body = createEmergencyContactSchema.parse(req.body);
  const contact = await createEmergencyContactService(req.user._id, body);
  return res.status(201).json(new ApiResponse(201, { contact }, 'Emergency contact added'));
});

export const updateEmergencyContact = asyncHandler(async (req, res) => {
  const body = updateEmergencyContactSchema.parse(req.body);
  const contact = await updateEmergencyContactService(req.user._id, req.params.id, body);
  return res.json(new ApiResponse(200, { contact }, 'Emergency contact updated'));
});

export const deleteEmergencyContact = asyncHandler(async (req, res) => {
  await deleteEmergencyContactService(req.user._id, req.params.id);
  return res.json(new ApiResponse(200, null, 'Emergency contact deleted'));
});
