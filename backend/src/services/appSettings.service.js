import AppSettings from '../models/appSettings.model.js';
import { ApiError } from '../utils/apiError.js';

const SETTINGS_KEY = 'default';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

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

function toGstDetails(doc) {
  const g = doc?.gstDetails || {};
  return {
    gstin: g.gstin || '',
    legalName: g.legalName || '',
    tradeName: g.tradeName || '',
    address: g.address || '',
    state: g.state || '',
    stateCode: g.stateCode || '',
    pan: g.pan || '',
  };
}

async function getOrCreateSettingsDoc() {
  let doc = await AppSettings.findOne({ key: SETTINGS_KEY }).lean();
  if (!doc) {
    doc = await AppSettings.create({ key: SETTINGS_KEY });
    doc = doc.toObject();
  }
  return doc;
}

export async function getSupportConfigService() {
  const doc = await getOrCreateSettingsDoc();
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

export async function getGstDetailsService() {
  const doc = await getOrCreateSettingsDoc();
  return toGstDetails(doc);
}

export async function updateGstDetailsService(data, staffId) {
  const gstin = String(data?.gstin ?? '').trim().toUpperCase();
  const legalName = String(data?.legalName ?? '').trim();
  const tradeName = String(data?.tradeName ?? '').trim();
  const address = String(data?.address ?? '').trim();
  const state = String(data?.state ?? '').trim();
  const stateCode = String(data?.stateCode ?? '').trim();
  const pan = String(data?.pan ?? '').trim().toUpperCase();

  if (gstin && !GSTIN_RE.test(gstin)) {
    throw new ApiError(400, 'Invalid GSTIN format');
  }
  if (pan && !PAN_RE.test(pan)) {
    throw new ApiError(400, 'Invalid PAN format');
  }
  if (gstin && !legalName) {
    throw new ApiError(400, 'Legal / registered business name is required when GSTIN is set');
  }

  const doc = await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        gstDetails: {
          gstin,
          legalName,
          tradeName,
          address,
          state,
          stateCode,
          pan,
        },
        updatedBy: staffId || null,
      },
    },
    { upsert: true, new: true },
  );

  return toGstDetails(doc);
}
