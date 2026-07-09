import { getSmsIndiaHubConfig } from '../config/sms.config.js';

function normalizeIndianMobile(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  throw new Error('Valid 10-digit Indian mobile number required');
}

const DLT_VAR_PATTERN = /##var##|\{#var#\}/gi;

function applyOtpToTemplate(template, otp, appName = 'SpareDriver') {
  const text = String(template || '').trim();
  if (!text) {
    throw new Error('SMS_INDIA_HUB_OTP_MESSAGE is required when SMS India Hub is enabled');
  }

  if (text.includes('__APP__') || text.includes('__OTP__')) {
    return text.replace(/__APP__/g, appName).replace(/__OTP__/g, String(otp));
  }

  const varCount = (text.match(DLT_VAR_PATTERN) || []).length;
  if (varCount >= 2) {
    let index = 0;
    return text.replace(DLT_VAR_PATTERN, () => {
      index += 1;
      return index === 1 ? appName : String(otp);
    });
  }
  if (varCount === 1) {
    return text.replace(DLT_VAR_PATTERN, String(otp));
  }

  throw new Error(
    'SMS_INDIA_HUB_OTP_MESSAGE must contain ##var## (or {#var#}) placeholders. ' +
      'Quote the value in .env if it includes #.',
  );
}

function buildOtpMessage(template, otp, appName) {
  return applyOtpToTemplate(template, otp, appName);
}

function appendAuthParams(params, cfg) {
  if (cfg.authMode === 'api_key') {
    params.set('APIKey', cfg.apiKey);
    return;
  }
  params.set('user', cfg.username);
  params.set('password', cfg.password);
}

function parseLegacyResponse(body) {
  const text = String(body || '').trim();
  if (/^success/i.test(text)) {
    return { success: true, raw: text };
  }
  const message = text.includes('#') ? text.split('#').slice(1).join('#').trim() : text;
  return { success: false, message: message || 'SMS send failed' };
}

function parseJsonResponse(body) {
  try {
    const data = JSON.parse(body);
    if (String(data.ErrorCode) === '0' || data.JobId) {
      return { success: true, raw: body };
    }
    return {
      success: false,
      message: data.ErrorMessage || data.Message || 'SMS send failed',
    };
  } catch {
    return parseLegacyResponse(body);
  }
}

function parseProviderResponse(body) {
  const trimmed = String(body || '').trim();
  if (trimmed.startsWith('{')) return parseJsonResponse(trimmed);
  return parseLegacyResponse(trimmed);
}

function isAuthFailure(message) {
  return /invalid login|username or password is invalid/i.test(String(message || ''));
}

function formatSmsError(parsed) {
  if (isAuthFailure(parsed.message)) {
    return (
      'SMS India Hub login failed. In cloud.smsindiahub.in check API username/password ' +
      '(or set SMS_INDIA_HUB_AUTH_MODE=api_key). ' +
      'SMS_INDIA_HUB_PASSWORD can differ from SMS_INDIA_HUB_API_KEY.'
    );
  }
  return parsed.message || 'SMS send failed';
}

async function callSmsApi(url) {
  const response = await fetch(url, { method: 'GET' });
  const body = await response.text();
  const parsed = parseProviderResponse(body);
  if (!response.ok || !parsed.success) {
    throw new Error(formatSmsError(parsed));
  }
  return { success: true, providerResponse: parsed.raw || body };
}

async function sendViaSendSms(cfg, msisdn, message) {
  const params = new URLSearchParams({
    senderid: cfg.senderId,
    channel: cfg.channel || 'Trans',
    DCS: '0',
    flashsms: '0',
    number: msisdn,
    text: message,
  });

  appendAuthParams(params, cfg);

  if (cfg.route) params.set('route', cfg.route);
  else if (cfg.dltTemplateId) params.set('route', cfg.dltTemplateId);

  if (cfg.peId) params.set('PEId', cfg.peId);

  return callSmsApi(`${cfg.sendSmsUrl}?${params.toString()}`);
}

async function sendViaPushSms(cfg, msisdn, message) {
  const params = new URLSearchParams({
    msisdn,
    sid: cfg.senderId,
    msg: message,
    fl: '0',
    gwid: '2',
    templateid: cfg.dltTemplateId,
  });

  appendAuthParams(params, cfg);

  return callSmsApi(`${cfg.pushSmsUrl}?${params.toString()}`);
}

/**
 * Send a DLT-templated OTP SMS via SMS India Hub HTTP API.
 * @param {string} phone 10-digit Indian mobile
 * @param {string} otp
 */
export async function sendSmsIndiaHubOtp(phone, otp) {
  const cfg = getSmsIndiaHubConfig();
  const msisdn = normalizeIndianMobile(phone);
  const message = buildOtpMessage(cfg.otpMessageTemplate, otp, cfg.appName);

  if (cfg.apiStyle === 'pushsms') {
    return sendViaPushSms(cfg, msisdn, message);
  }
  return sendViaSendSms(cfg, msisdn, message);
}

/**
 * Plain transactional SMS (no DLT template). May be rejected without a registered template.
 */
export async function sendSmsIndiaHubPlain(phone, message) {
  const cfg = getSmsIndiaHubConfig();
  const msisdn = normalizeIndianMobile(phone);

  const params = new URLSearchParams({
    senderid: cfg.senderId,
    channel: cfg.channel || 'Trans',
    DCS: '0',
    flashsms: '0',
    number: msisdn,
    text: String(message || '').trim(),
  });

  appendAuthParams(params, cfg);

  return callSmsApi(`${cfg.sendSmsUrl}?${params.toString()}`);
}

export { isAuthFailure };
