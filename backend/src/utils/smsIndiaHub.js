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

/** DLT fields required for Indian transactional SMS delivery. */
function appendDltParams(params, cfg) {
  if (cfg.dltTemplateId) {
    // SMS India Hub / SMS Gateway Hub accept both spellings across API versions.
    params.set('dlttemplateid', cfg.dltTemplateId);
    params.set('templateid', cfg.dltTemplateId);
  }
  if (cfg.peId) {
    params.set('PEId', cfg.peId);
    params.set('peid', cfg.peId);
    params.set('EntityId', cfg.peId);
  }
  if (cfg.tmId) {
    params.set('telemarketerid', cfg.tmId);
  }
}

function isSuccessErrorCode(code) {
  const normalized = String(code ?? '').trim();
  return normalized === '0' || normalized === '00' || normalized === '000';
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
    if (isSuccessErrorCode(data.ErrorCode) || data.JobId) {
      const messageId = data?.MessageData?.[0]?.MessageId || null;
      return {
        success: true,
        raw: body,
        data,
        jobId: data.JobId || null,
        messageId,
      };
    }
    return {
      success: false,
      message: data.ErrorMessage || data.Message || 'SMS send failed',
      data,
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

function redactUrl(url) {
  return String(url || '')
    .replace(/([?&](?:password|APIKey|apikey)=)[^&]*/gi, '$1***')
    .replace(/([?&](?:user)=)[^&]*/gi, '$1***');
}

async function callSmsApi(url) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[sms] request ${redactUrl(url)}`);
  }

  const response = await fetch(url, { method: 'GET' });
  const body = await response.text();
  const parsed = parseProviderResponse(body);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[sms] response status=${response.status} body=${String(body).slice(0, 500)}`);
  }

  if (!response.ok || !parsed.success) {
    throw new Error(formatSmsError(parsed));
  }
  return {
    success: true,
    providerResponse: parsed.raw || body,
    jobId: parsed.jobId || null,
    messageId: parsed.messageId || null,
  };
}

async function checkDeliveryStatus(cfg, messageId) {
  if (!messageId) return null;

  const params = new URLSearchParams({ messageid: messageId });
  appendAuthParams(params, cfg);

  const url = `https://cloud.smsindiahub.in/vendorsms/checkdelivery.aspx?${params.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    const body = (await response.text()).trim();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[sms] delivery check messageId=${messageId} body=${body.slice(0, 300)}`);
    }
    return body;
  } catch (err) {
    console.warn('[sms] delivery check failed:', err.message);
    return null;
  }
}

function assertDeliveryOk(deliveryBody) {
  if (!deliveryBody) return;
  const text = String(deliveryBody);
  if (/#Rejected|REJECTD|UNDELIV|FAILED|TL-|Invalid Login/i.test(text)) {
    throw new Error(
      `SMS submitted but not delivered (${text.slice(0, 180)}). ` +
        'Usually missing/incorrect SMS_INDIA_HUB_PE_ID, or sender SMSHUB is not mapped to your DLT Principal Entity + template. ' +
        'Set PE ID from your DLT/SMS India Hub portal and confirm sender header mapping.',
    );
  }
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
  appendDltParams(params, cfg);

  // `route` is the SMS route/product code — NOT the DLT template id.
  if (cfg.route) params.set('route', cfg.route);

  return callSmsApi(`${cfg.sendSmsUrl}?${params.toString()}`);
}

async function sendViaPushSms(cfg, msisdn, message) {
  // Match vendor pushsms.aspx contract: APIKey + msisdn + sid + msg + fl + gwid.
  // Do not append dlttemplateid/PEId here — approved accounts often map DLT
  // on the portal side; extra params can cause rejects.
  const params = new URLSearchParams({
    msisdn,
    sid: cfg.senderId,
    msg: message,
    fl: '0',
    gwid: '2',
  });

  appendAuthParams(params, cfg);
  if (cfg.dltTemplateId || cfg.peId || cfg.tmId) {
    appendDltParams(params, cfg);
  }

  return callSmsApi(`${cfg.pushSmsUrl}?${params.toString()}`);
}

/**
 * Send a DLT-templated OTP SMS via SMS India Hub HTTP API.
 * @param {string} phone 10-digit Indian mobile
 * @param {string} otp
 */
export async function sendSmsIndiaHubOtp(phone, otp) {
  const cfg = getSmsIndiaHubConfig();
  // pushsms accounts (vendor sample URL) often rely on portal-side DLT mapping
  // and only need the exact approved message body + registered sender id.
  if (cfg.apiStyle !== 'pushsms') {
    if (!cfg.dltTemplateId) {
      throw new Error('SMS_INDIA_HUB_DLT_TEMPLATE_ID is required for OTP SMS');
    }
    if (!cfg.peId) {
      throw new Error(
        'SMS_INDIA_HUB_PE_ID is required for send_sms. Without Principal Entity ID, ' +
          'SMS India Hub may accept the SMS (JobId) but telecom DLT rejects delivery.',
      );
    }
  }

  const msisdn = normalizeIndianMobile(phone);
  const message = buildOtpMessage(cfg.otpMessageTemplate, otp, cfg.appName);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[sms] OTP message preview: ${message}`);
  }

  const result =
    cfg.apiStyle === 'pushsms'
      ? await sendViaPushSms(cfg, msisdn, message)
      : await sendViaSendSms(cfg, msisdn, message);

  // Gateway "Done" only means accepted. Poll delivery to catch DLT rejects.
  if (result.messageId) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const delivery = await checkDeliveryStatus(cfg, result.messageId);
    assertDeliveryOk(delivery);
  }

  return result;
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
  appendDltParams(params, cfg);
  if (cfg.route) params.set('route', cfg.route);

  return callSmsApi(`${cfg.sendSmsUrl}?${params.toString()}`);
}

export { isAuthFailure };
