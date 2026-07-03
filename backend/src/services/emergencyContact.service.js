import { ApiError } from '../utils/apiError.js';
import EmergencyContact from '../models/emergencyContact.model.js';

export async function listEmergencyContactsService(userId) {
  return EmergencyContact.find({ userId }).sort({ isPrimary: -1, createdAt: 1 }).lean();
}

export async function createEmergencyContactService(userId, data) {
  if (data.isPrimary) {
    await EmergencyContact.updateMany({ userId }, { $set: { isPrimary: false } });
  }

  try {
    return await EmergencyContact.create({ userId, ...data });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'This phone number is already saved as an emergency contact');
    }
    throw err;
  }
}

export async function updateEmergencyContactService(userId, contactId, data) {
  const contact = await EmergencyContact.findOne({ _id: contactId, userId });
  if (!contact) throw new ApiError(404, 'Emergency contact not found');

  if (data.isPrimary) {
    await EmergencyContact.updateMany({ userId, _id: { $ne: contactId } }, { $set: { isPrimary: false } });
  }

  Object.assign(contact, data);
  try {
    await contact.save();
    return contact;
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'This phone number is already saved as an emergency contact');
    }
    throw err;
  }
}

export async function deleteEmergencyContactService(userId, contactId) {
  const deleted = await EmergencyContact.findOneAndDelete({ _id: contactId, userId });
  if (!deleted) throw new ApiError(404, 'Emergency contact not found');
  return deleted;
}
