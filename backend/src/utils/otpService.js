import {
  isDefaultOtpEnabled,
  isSmsIndiaHubConfigured,
} from '../config/sms.config.js';
import { sendSmsIndiaHubOtp, sendSmsIndiaHubPlain, isAuthFailure } from './smsIndiaHub.js';
import { ApiError } from './apiError.js';

const TEST_OTPS = new Set(['1234', '123456']);

export function isTestOtp(otp) {
  if (!isDefaultOtpEnabled()) return false;
  return TEST_OTPS.has(String(otp || '').trim());
}

function logMockSms(phone, lines) {
  console.log('\n=========================================');
  console.log(`[MOCK SMS] To +91${phone}`);
  for (const line of lines) console.log(`[MOCK SMS] ${line}`);
  console.log('=========================================\n');
}

function shouldFallbackToMock(err) {
  return isDefaultOtpEnabled() && isAuthFailure(err?.message);
}

export const sendSmsOtp = async (phone, otp) => {
  if (isSmsIndiaHubConfigured()) {
    try {
      const result = await sendSmsIndiaHubOtp(phone, otp);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[sms] OTP sent via SMS India Hub to +91${phone}`);
      }
      return { success: true, message: 'OTP sent successfully', ...result };
    } catch (err) {
      console.error('[sms] SMS India Hub OTP failed:', err.message);

      if (shouldFallbackToMock(err)) {
        logMockSms(phone, [
          `Your SpareDriver verification code is: ${otp}`,
          '(SMS India Hub login failed — using USE_DEFAULT_OTP mock fallback)',
        ]);
        return {
          success: true,
          message: 'OTP sent successfully (mock fallback — fix SMS India Hub credentials)',
        };
      }

      throw new ApiError(502, err.message || 'Failed to send OTP SMS');
    }
  }

  logMockSms(phone, [`Your SpareDriver verification code is: ${otp}`]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { success: true, message: 'OTP sent successfully (mock)' };
};

export const sendEmergencySms = async (phone, message) => {
  if (isSmsIndiaHubConfigured()) {
    try {
      return await sendSmsIndiaHubPlain(phone, message);
    } catch (err) {
      console.error('[sms] SMS India Hub emergency SMS failed:', err.message);
      if (shouldFallbackToMock(err)) {
        logMockSms(phone, [message, '(SMS India Hub login failed — mock fallback)']);
        return { success: true, message: 'Emergency SMS sent (mock fallback)' };
      }
      throw new ApiError(502, err.message || 'Failed to send emergency SMS');
    }
  }

  logMockSms(phone, [message]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { success: true, message: 'Emergency SMS sent (mock)' };
};
