import { z } from 'zod';
import { isValidUserEmail } from '../utils/email.util.js';

export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(6, 'Enter a valid email address')
  .max(254, 'Email is too long')
  .refine((value) => isValidUserEmail(value), {
    message: 'Enter a valid email address',
  });

export const phoneSchema = z
  .string({ required_error: 'Mobile number is required' })
  .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number');

export const otpSchema = z
  .string({ required_error: 'OTP is required' })
  .regex(/^[0-9]{6}$/, 'Enter the 6-digit verification code');

export const sendRegistrationEmailOtpSchema = z.object({
  phone: phoneSchema,
  email: emailSchema,
});

export const verifyRegistrationEmailOtpSchema = z.object({
  phone: phoneSchema,
  email: emailSchema,
  otp: otpSchema,
});

export const completeRegistrationSchema = z.object({
  name: z
    .string({ required_error: 'Please enter your full name' })
    .trim()
    .min(2, 'Please enter your full name'),
  phone: phoneSchema,
  email: emailSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),
  alternatePhone: z.preprocess(
    (val) => (val == null || String(val).trim() === '' ? undefined : String(val).trim()),
    z
      .string()
      .regex(/^[0-9]{10}$/, 'Emergency / alternate mobile must be a valid 10-digit number')
      .optional(),
  ),
  referralCode: z.preprocess(
    (val) => (val == null || String(val).trim() === '' ? undefined : String(val).trim()),
    z.string().min(4, 'Invalid referral code').max(12, 'Invalid referral code').optional(),
  ),
});

export const sendOnboardingEmailOtpSchema = z.object({
  email: emailSchema,
});

export const verifyOnboardingEmailOtpSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

export const userValidationSchema = z.object({
  name: z
    .string()
    .min(2, 'Minimum length 2 required')
    .trim(),

  email: emailSchema,

  phone_no: phoneSchema,

  role: z
    .string()
    .refine((val) => ['user', 'admin'].includes(val), {
      message: 'Role must be user or admin',
    })
    .optional(),

  password: z
    .string()
    .min(8, 'Minimum 8 characters')
    .max(15, 'Maximum 15 characters')
    .trim(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
