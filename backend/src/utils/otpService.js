/**
 * Mock OTP Service.
 * In a real-world scenario, you would integrate Twilio, Fast2SMS, AWS SNS, MSG91, etc. here.
 */

export function isTestOtp(otp) {
  const value = String(otp || '').trim();
  return value === '1234' || value === '123456';
}

export const sendSmsOtp = async (phone, otp) => {
  console.log(`\n=========================================`);
  console.log(`[MOCK SMS] Sending OTP to +91${phone}`);
  console.log(`[MOCK SMS] Your SpareDriver verification code is: ${otp}`);
  console.log(`=========================================\n`);

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Return success
  return { success: true, message: 'OTP sent successfully' };

  /*
  // Example Twilio integration structure:
  // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
  // await twilio.messages.create({
  //   body: `Your SpareDriver verification code is: ${otp}`,
  //   from: process.env.TWILIO_PHONE,
  //   to: `+91${phone}`
  // });
  */
};

export const sendEmergencySms = async (phone, message) => {
  console.log(`\n=========================================`);
  console.log(`[MOCK SMS] Emergency alert to +91${phone}`);
  console.log(message);
  console.log(`=========================================\n`);

  await new Promise((resolve) => setTimeout(resolve, 500));
  return { success: true, message: 'Emergency SMS sent' };
};
