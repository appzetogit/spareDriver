/**
 * SMS / OTP environment flags.
 *
 * USE_DEFAULT_OTP=true  → accept 1234 / 123456 without checking the OTP collection.
 * SMS_INDIA_HUB_ENABLED=true → send real SMS via SMS India Hub (otherwise log mock).
 */

export function isDefaultOtpEnabled() {
  return process.env.USE_DEFAULT_OTP === 'true';
}

export function isSmsIndiaHubEnabled() {
  return process.env.SMS_INDIA_HUB_ENABLED === 'true';
}

export function getSmsIndiaHubConfig() {
  const apiKey = (process.env.SMS_INDIA_HUB_API_KEY || '').trim();
  const password = (process.env.SMS_INDIA_HUB_PASSWORD || apiKey).trim();
  const authMode = (process.env.SMS_INDIA_HUB_AUTH_MODE || 'user_password').trim().toLowerCase();
  const apiStyle = (process.env.SMS_INDIA_HUB_API_STYLE || 'send_sms').trim().toLowerCase();

  return {
    username: (process.env.SMS_INDIA_HUB_USERNAME || '').trim(),
    apiKey,
    password,
    authMode: authMode === 'api_key' ? 'api_key' : 'user_password',
    apiStyle: apiStyle === 'pushsms' ? 'pushsms' : 'send_sms',
    senderId: (process.env.SMS_INDIA_HUB_SENDER_ID || '').trim(),
    dltTemplateId: (process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '').trim(),
    peId: (process.env.SMS_INDIA_HUB_PE_ID || '').trim(),
    route: (process.env.SMS_INDIA_HUB_ROUTE || '').trim(),
    channel: (process.env.SMS_INDIA_HUB_CHANNEL || 'Trans').trim(),
    appName: (process.env.SMS_INDIA_HUB_APP_NAME || 'SpareDriver').trim(),
    otpMessageTemplate: (
      process.env.SMS_INDIA_HUB_OTP_MESSAGE ||
      'Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.BGADEC'
    ).trim(),
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
  return Boolean(
    hasAuth && cfg.senderId && cfg.dltTemplateId && cfg.otpMessageTemplate,
  );
}
