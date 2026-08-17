import { Resend } from 'resend';
import nodemailer from 'nodemailer';

function getEmailFrom() {
  return process.env.EMAIL_FROM || 'SpareDriver <noreply@sparedriver.com>';
}

let smtpTransporter = null;

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isEmailConfigured() {
  return isResendConfigured() || isSmtpConfigured();
}

/** Ordered providers to try: env preference, then any other configured backend. */
function resolveProviderOrder() {
  const configured = [];
  if (isResendConfigured()) configured.push('resend');
  if (isSmtpConfigured()) configured.push('smtp');

  if (!configured.length) return [];

  const raw = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase().trim();

  // `both` / `all` → try Resend first, then SMTP (single delivery, fallback).
  if (raw === 'both' || raw === 'all') {
    return ['resend', 'smtp'].filter((p) => configured.includes(p));
  }

  if (raw.includes(',')) {
    const preferred = raw
      .split(',')
      .map((s) => s.trim())
      .filter((p) => configured.includes(p));
    const rest = configured.filter((p) => !preferred.includes(p));
    return [...preferred, ...rest];
  }

  if (configured.includes(raw)) {
    return [raw, ...configured.filter((p) => p !== raw)];
  }

  return configured;
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const port = Number(process.env.SMTP_PORT || 587);
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

function toResendAttachments(attachments) {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content)
      ? a.content.toString('base64')
      : a.content,
    contentType: a.contentType || undefined,
  }));
}

function toSmtpAttachments(attachments) {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType || undefined,
  }));
}

async function sendViaResend({ to, subject, html, text, attachments }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = parseFromAddress(getEmailFrom());
  const { error } = await resend.emails.send({
    from: from.name ? `${from.name} <${from.email}>` : from.email,
    to: [to],
    subject,
    html,
    text: text || undefined,
    attachments: toResendAttachments(attachments),
  });
  if (error) {
    throw new Error(error.message || 'Resend failed to send email');
  }
}

async function sendViaSmtp({ to, subject, html, text, attachments }) {
  const transporter = getSmtpTransporter();
  await transporter.sendMail({
    from: getEmailFrom(),
    to,
    subject,
    html,
    text: text || undefined,
    attachments: toSmtpAttachments(attachments),
  });
}

/**
 * Send a transactional email via Resend and/or SMTP.
 *
 * `EMAIL_PROVIDER` options:
 *   - `resend` (default) — Resend, with SMTP fallback if configured
 *   - `smtp` — SMTP, with Resend fallback if configured
 *   - `both` / `all` — try Resend then SMTP until one succeeds
 *   - `resend,smtp` — explicit order with fallback
 *
 * Logs to console when no provider is configured (dev).
 */
export async function sendEmail({ to, subject, html, text, attachments }) {
  if (!to || !subject || !html) {
    throw new Error('Email requires to, subject, and html');
  }

  if (!isEmailConfigured()) {
    console.log('\n=========================================');
    console.log(`[MOCK EMAIL] To: ${to}`);
    console.log(`[MOCK EMAIL] Subject: ${subject}`);
    if (text) console.log(`[MOCK EMAIL] Text:\n${text}`);
    if (attachments?.length) {
      console.log(
        `[MOCK EMAIL] Attachments: ${attachments.map((a) => a.filename).join(', ')}`,
      );
    }
    console.log('=========================================\n');
    return { success: true, mocked: true, provider: 'mock' };
  }

  const order = resolveProviderOrder();
  let lastError;

  for (const provider of order) {
    try {
      if (provider === 'smtp') {
        await sendViaSmtp({ to, subject, html, text, attachments });
      } else {
        await sendViaResend({ to, subject, html, text, attachments });
      }
      return { success: true, mocked: false, provider };
    } catch (err) {
      lastError = err;
      console.warn(`[email] ${provider} send failed for ${to}:`, err?.message || err);
    }
  }

  throw lastError || new Error('All configured email providers failed');
}

export function getEmailProviderStatus() {
  return {
    provider: process.env.EMAIL_PROVIDER || 'resend',
    configured: isEmailConfigured(),
    resend: isResendConfigured(),
    smtp: isSmtpConfigured(),
    order: resolveProviderOrder(),
    from: getEmailFrom(),
  };
}
