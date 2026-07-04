import AppSettings from '../models/appSettings.model.js';
import { ApiError } from '../utils/apiError.js';

const SETTINGS_KEY = 'default';

export async function getSupportConfigService() {
  let doc = await AppSettings.findOne({ key: SETTINGS_KEY }).lean();
  if (!doc) {
    doc = await AppSettings.create({ key: SETTINGS_KEY });
    doc = doc.toObject();
  }
  return {
    supportPhone: doc.supportPhone,
    supportWhatsapp: doc.supportWhatsapp,
    supportEmail: doc.supportEmail,
  };
}

export async function updateSupportConfigService(data, staffId) {
  const { supportPhone, supportWhatsapp, supportEmail } = data || {};
  if (!supportPhone?.trim() || !supportWhatsapp?.trim() || !supportEmail?.trim()) {
    throw new ApiError(400, 'Support phone, WhatsApp, and email are required');
  }

  const doc = await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        supportPhone: supportPhone.trim(),
        supportWhatsapp: supportWhatsapp.trim(),
        supportEmail: supportEmail.trim(),
        updatedBy: staffId || null,
      },
    },
    { upsert: true, new: true },
  );

  return {
    supportPhone: doc.supportPhone,
    supportWhatsapp: doc.supportWhatsapp,
    supportEmail: doc.supportEmail,
  };
}
