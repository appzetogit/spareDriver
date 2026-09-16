import AppSettings from '../models/appSettings.model.js';
import { ApiError } from '../utils/apiError.js';
import {
  PAYMENT_FLOW,
  PAYMENT_RAIL,
  normalisePaymentMethodConfig,
  isRailEnabled,
  isWalletTopupEnabled,
  resolveDuesSettlementModes,
} from '../utils/paymentMethods.util.js';

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
    instagramUrl: doc.instagramUrl || '',
    facebookUrl: doc.facebookUrl || '',
    twitterUrl: doc.twitterUrl || '',
    linkedinUrl: doc.linkedinUrl || '',
    youtubeUrl: doc.youtubeUrl || '',
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
    instagramUrl,
    facebookUrl,
    twitterUrl,
    linkedinUrl,
    youtubeUrl,
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
        instagramUrl: (instagramUrl ?? '').trim(),
        facebookUrl: (facebookUrl ?? '').trim(),
        twitterUrl: (twitterUrl ?? '').trim(),
        linkedinUrl: (linkedinUrl ?? '').trim(),
        youtubeUrl: (youtubeUrl ?? '').trim(),
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

function toDriverDocumentRequirements(doc) {
  return {
    policeVerificationRequired: Boolean(doc?.driverDocumentRequirements?.policeVerificationRequired),
  };
}

export async function getDriverDocumentRequirementsService() {
  const doc = await getOrCreateSettingsDoc();
  return toDriverDocumentRequirements(doc);
}

export async function updateDriverDocumentRequirementsService(data, staffId) {
  const policeVerificationRequired = Boolean(data?.policeVerificationRequired);

  const doc = await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        'driverDocumentRequirements.policeVerificationRequired': policeVerificationRequired,
        updatedBy: staffId || null,
      },
    },
    { upsert: true, new: true },
  );

  return toDriverDocumentRequirements(doc);
}

/* ------------------------------------------------------------------ */
/* Payment methods                                                     */
/* ------------------------------------------------------------------ */

/**
 * Short-lived memo for the payment config.
 *
 * Unlike the other settings groups (read once per admin page load), this
 * one is consulted on hot paths — the driver-online eligibility gate
 * runs per driver per dispatch wave. A few seconds of staleness on a
 * toggle an admin flips by hand is a fine trade for not adding a Mongo
 * round-trip to every dispatch. Writes bust it immediately, so the admin
 * panel still round-trips its own change synchronously.
 */
const PAYMENT_CONFIG_TTL_MS = 30_000;
let paymentConfigCache = { at: 0, value: null };

const bustPaymentConfigCache = () => {
  paymentConfigCache = { at: 0, value: null };
};

export async function getPaymentMethodsConfigService({ fresh = false } = {}) {
  const cached = paymentConfigCache;
  if (!fresh && cached.value && Date.now() - cached.at < PAYMENT_CONFIG_TTL_MS) {
    return cached.value;
  }
  const doc = await getOrCreateSettingsDoc();
  const value = normalisePaymentMethodConfig(doc?.paymentMethods);
  paymentConfigCache = { at: Date.now(), value };
  return value;
}

/**
 * Trimmed shape for the public `/common/payment-methods` endpoint, read
 * by both the user and driver apps to decide which entry points to
 * render. Deliberately omits every threshold — a customer has no
 * business knowing the driver dues limit.
 */
export function toPublicPaymentMethodsConfig(config) {
  const cfg = normalisePaymentMethodConfig(config);
  return {
    razorpayEnabled: cfg.razorpayEnabled,
    codEnabled: cfg.codEnabled,
    walletTopupEnabled: isWalletTopupEnabled(cfg),
    booking: {
      wallet: isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.WALLET),
      razorpay: isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.RAZORPAY),
      cod: isRailEnabled(cfg, PAYMENT_FLOW.BOOKING, PAYMENT_RAIL.COD),
    },
    subscriptionCheckout: {
      razorpay: isRailEnabled(cfg, PAYMENT_FLOW.SUBSCRIPTION_CHECKOUT, PAYMENT_RAIL.RAZORPAY),
      cod: isRailEnabled(cfg, PAYMENT_FLOW.SUBSCRIPTION_CHECKOUT, PAYMENT_RAIL.COD),
    },
    driverKit: {
      razorpay: isRailEnabled(cfg, PAYMENT_FLOW.DRIVER_KIT, PAYMENT_RAIL.RAZORPAY),
      cod: isRailEnabled(cfg, PAYMENT_FLOW.DRIVER_KIT, PAYMENT_RAIL.COD),
    },
    cod: {
      serviceTypes: cfg.cod.serviceTypes,
      allowInstant: cfg.cod.allowInstant,
      allowScheduled: cfg.cod.allowScheduled,
      maxBookingValueRupees: cfg.cod.maxBookingValueRupees,
    },
    duesSettlement: resolveDuesSettlementModes(cfg),
  };
}

export async function getPublicPaymentMethodsConfigService() {
  const cfg = await getPaymentMethodsConfigService();
  return toPublicPaymentMethodsConfig(cfg);
}

export async function updatePaymentMethodsConfigService(data, staffId) {
  // Normalise the merge of current + incoming so a partial PUT can never
  // blank a missing boolean into `false`.
  const current = await getPaymentMethodsConfigService({ fresh: true });
  const next = normalisePaymentMethodConfig({
    ...current,
    ...(data || {}),
    flows: { ...current.flows, ...(data?.flows || {}) },
    cod: { ...current.cod, ...(data?.cod || {}) },
  });

  if (next.cod.driverDuesWarnRupees > next.cod.driverDuesBlockRupees) {
    throw new ApiError(
      400,
      'Driver dues warning threshold cannot be higher than the block threshold',
    );
  }

  const doc = await AppSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { paymentMethods: next, updatedBy: staffId || null } },
    { upsert: true, new: true },
  );

  bustPaymentConfigCache();
  return normalisePaymentMethodConfig(doc?.paymentMethods);
}
