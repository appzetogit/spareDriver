import AppSettings from '../models/appSettings.model.js';
import { ApiError } from '../utils/apiError.js';

const SETTINGS_KEY = 'default';

function toPublicConfig(doc) {
  return {
    supportPhone: doc.supportPhone || '',
    supportWhatsapp: doc.supportWhatsapp || '',
    supportEmail: doc.supportEmail || '',
    contactAddress: doc.contactAddress || '',
    supportHours: doc.supportHours || '',
    androidAppUrl: doc.androidAppUrl || '',
    iosAppUrl: doc.iosAppUrl || '',
  };
}

export async function getSupportConfigService() {
  let doc = await AppSettings.findOne({ key: SETTINGS_KEY }).lean();
  if (!doc) {
    doc = await AppSettings.create({ key: SETTINGS_KEY });
    doc = doc.toObject();
  }
  return toPublicConfig(doc);
}

export async function updateSupportConfigService(data, staffId) {
  const {
    supportPhone,
    supportWhatsapp,
    supportEmail,
    contactAddress,
    supportHours,
    androidAppUrl,
    iosAppUrl,
  } = data || {};

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
        contactAddress: (contactAddress ?? '').trim(),
        supportHours: (supportHours ?? '').trim(),
        androidAppUrl: (androidAppUrl ?? '').trim(),
        iosAppUrl: (iosAppUrl ?? '').trim(),
        updatedBy: staffId || null,
      },
    },
    { upsert: true, new: true },
  );

  return toPublicConfig(doc);
}
