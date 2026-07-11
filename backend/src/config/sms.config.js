/**
 * SMS / OTP environment flags.
 *
 * USE_DEFAULT_OTP=true  → accept 1234 / 123456 without checking the OTP collection.
 * SMS_INDIA_HUB_ENABLED=true → send real SMS via SMS India Hub (otherwise log mock).
 */

function stripEnvQuotes(value) {
  const text = String(value || '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}

export function isDefaultOtpEnabled() {
  return process.env.USE_DEFAULT_OTP === 'true';
}

export function isSmsIndiaHubEnabled() {
  return process.env.SMS_INDIA_HUB_ENABLED === 'true';
}

export function getSmsIndiaHubConfig() {
  const apiKey = (process.env.SMS_INDIA_HUB_API_KEY || '').trim();
  const password = (process.env.SMS_INDIA_HUB_PASSWORD || apiKey).trim();
  const authModeRaw = (process.env.SMS_INDIA_HUB_AUTH_MODE || '').trim().toLowerCase();
  const apiStyle = (process.env.SMS_INDIA_HUB_API_STYLE || 'send_sms').trim().toLowerCase();

  // Prefer explicit mode; otherwise use API-key auth when only the key is set.
  let authMode = 'user_password';
  if (authModeRaw === 'api_key') authMode = 'api_key';
  else if (authModeRaw === 'user_password') authMode = 'user_password';
  else if (apiKey && !(process.env.SMS_INDIA_HUB_USERNAME || '').trim()) authMode = 'api_key';

  return {
    username: (process.env.SMS_INDIA_HUB_USERNAME || '').trim(),
    apiKey,
    password,
    authMode,
    apiStyle: apiStyle === 'pushsms' ? 'pushsms' : 'send_sms',
    senderId: (process.env.SMS_INDIA_HUB_SENDER_ID || '').trim(),
    dltTemplateId: (process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '').trim(),
    peId: (process.env.SMS_INDIA_HUB_PE_ID || '').trim(),
    tmId: (process.env.SMS_INDIA_HUB_TM_ID || '').trim(),
    route: (process.env.SMS_INDIA_HUB_ROUTE || '1').trim(),
    channel: (process.env.SMS_INDIA_HUB_CHANNEL || 'Trans').trim(),
    appName: stripEnvQuotes(process.env.SMS_INDIA_HUB_APP_NAME || 'SpareDriver'),
    otpMessageTemplate: stripEnvQuotes(
      process.env.SMS_INDIA_HUB_OTP_MESSAGE ||
        'Welcome to the ##var##. Your OTP for registration is ##var##',
    ),
    sendSmsUrl:
      (process.env.SMS_INDIA_HUB_SEND_SMS_URL || '').trim() ||
      'https://cloud.smsindiahub.in/api/mt/SendSMS',
    pushSmsUrl:
      (process.env.SMS_INDIA_HUB_PUSH_SMS_URL || '').trim() ||
      'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx',
  };
}

export function isSmsIndiaHubConfigured() {
  if (!isSmsIndiaHubEnabled()) return false;
  const cfg = getSmsIndiaHubConfig();
  const hasAuth =
    cfg.authMode === 'api_key'
      ? Boolean(cfg.apiKey)
      : Boolean(cfg.username && cfg.password);
  // pushsms: portal maps DLT; only auth + sender + exact approved message needed.
  // send_sms: also needs DLT template id (and PE id is enforced at send time).
  const hasDlt =
    cfg.apiStyle === 'pushsms' ? true : Boolean(cfg.dltTemplateId);
  return Boolean(hasAuth && cfg.senderId && hasDlt && cfg.otpMessageTemplate);
}
