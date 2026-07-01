import { Resend } from 'resend';
import nodemailer from 'nodemailer';

const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
const EMAIL_FROM = process.env.EMAIL_FROM || 'SpareDriver <noreply@sparedriver.com>';

let smtpTransporter = null;

function isEmailConfigured() {
  if (EMAIL_PROVIDER === 'smtp') {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  return Boolean(process.env.RESEND_API_KEY);
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const port = Number(process.env.SMTP_PORT || 587);
  // Port 465 = implicit TLS (secure: true). Port 587 = STARTTLS (secure: false).
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;
  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return smtpTransporter;
}

function parseFromAddress(from) {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: from.trim() };
}

async function sendViaResend({ to, subject, html, text }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = parseFromAddress(EMAIL_FROM);
  const { error } = await resend.emails.send({
    from: from.name ? `${from.name} <${from.email}>` : from.email,
    to: [to],
    subject,
    html,
    text: text || undefined,
  });
  if (error) {
    throw new Error(error.message || 'Resend failed to send email');
  }
}

async function sendViaSmtp({ to, subject, html, text }) {
  const transporter = getSmtpTransporter();
  await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text: text || undefined,
  });
}

/**
 * Send a transactional email. Logs to console when provider is not configured (dev).
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || !html) {
    throw new Error('Email requires to, subject, and html');
  }

  if (!isEmailConfigured()) {
    console.log('\n=========================================');
    console.log(`[MOCK EMAIL] To: ${to}`);
    console.log(`[MOCK EMAIL] Subject: ${subject}`);
    if (text) console.log(`[MOCK EMAIL] Text:\n${text}`);
    console.log('=========================================\n');
    return { success: true, mocked: true };
  }

  if (EMAIL_PROVIDER === 'smtp') {
    await sendViaSmtp({ to, subject, html, text });
  } else {
    await sendViaResend({ to, subject, html, text });
  }

  return { success: true, mocked: false };
}

export function getEmailProviderStatus() {
  return {
    provider: EMAIL_PROVIDER,
    configured: isEmailConfigured(),
    from: EMAIL_FROM,
  };
}
