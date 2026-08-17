import Zone from '../models/zone.model.js';
import User from '../models/user.model.js';
import LegalDocument, { LEGAL_DOCUMENT_TYPES } from '../models/legalDocument.model.js';
import { sendEmail } from './email.service.js';
import { isPlaceholderUserEmail, escapeHtml } from '../utils/email.util.js';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildCarLabel(car) {
  if (!car) return '—';
  const type = car.carTypeId?.name || '';
  const number = car.vehicleNumber || '';
  return [type, number].filter(Boolean).join(' · ') || '—';
}

async function resolveSubscriptionTerms(subscription, termsFromCaller) {
  if (termsFromCaller?.content) return termsFromCaller;

  if (subscription.termsContentSnapshot) {
    return {
      title: subscription.termsTitleSnapshot || 'Subscription terms',
      content: subscription.termsContentSnapshot,
      version: subscription.termsVersionSnapshot,
    };
  }

  if (subscription.termsVersionSnapshot) {
    const byVersion = await LegalDocument.findOne({
      type: LEGAL_DOCUMENT_TYPES.SUBSCRIPTION,
      version: subscription.termsVersionSnapshot,
    })
      .select('title content version')
      .lean();
    if (byVersion?.content) return byVersion;
  }

  return LegalDocument.findOne({
    type: LEGAL_DOCUMENT_TYPES.SUBSCRIPTION,
    isActive: true,
  })
    .sort({ version: -1, updatedAt: -1 })
    .select('title content version')
    .lean();
}

function buildHtml({
  userName,
  planName,
  zoneLabel,
  carLabel,
  hoursLabel,
  durationMonths,
  periodLabel,
  pickup,
  dropoff,
  driverName,
  driverPhone,
  driverRating,
  workingStart,
  workingEnd,
  termsTitle,
  termsContent,
}) {
  const rows = [
    ['Plan', planName],
    ['Zone', zoneLabel],
    ['Vehicle', carLabel],
    ['Driver hours', hoursLabel],
    ['Duration', `${durationMonths} month(s)`],
    ['Subscription period', periodLabel],
    ['Working start', workingStart],
    ['Working end', workingEnd],
    ['Daily pickup', pickup || '—'],
    ['Daily drop-off', dropoff || '—'],
  ];

  const detailRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:40%;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <div style="background:#0f172a;color:#fff;padding:24px;">
        <h1 style="margin:0;font-size:20px;">Your dedicated driver is assigned</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.85;">Hi ${escapeHtml(userName)}, here are your subscription and driver details.</p>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Subscription</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${detailRows}</table>
        <h2 style="margin:0 0 12px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Assigned driver</h2>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#14532d;">${escapeHtml(driverName)}</p>
          <p style="margin:0;font-size:14px;color:#166534;">Phone: ${escapeHtml(driverPhone || '—')}</p>
          ${driverRating ? `<p style="margin:4px 0 0;font-size:13px;color:#166534;">Rating: ${escapeHtml(String(driverRating))}</p>` : ''}
        </div>
        ${
          termsContent
            ? `<h2 style="margin:0 0 12px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Terms &amp; conditions</h2>
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(termsTitle || 'Subscription terms')}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.5;">${escapeHtml(termsContent)}</div>`
            : ''
        }
        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">If you have questions, contact SpareDriver support from the app.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildText(payload) {
  const lines = [
    `Hi ${payload.userName},`,
    '',
    'Your dedicated driver has been assigned.',
    '',
    'Subscription',
    `Plan: ${payload.planName}`,
    `Zone: ${payload.zoneLabel}`,
    `Vehicle: ${payload.carLabel}`,
    `Driver hours: ${payload.hoursLabel}`,
    `Duration: ${payload.durationMonths} month(s)`,
    `Period: ${payload.periodLabel}`,
    `Working: ${payload.workingStart} → ${payload.workingEnd}`,
    '',
    'Assigned driver',
    `Name: ${payload.driverName}`,
    `Phone: ${payload.driverPhone || '—'}`,
    '',
  ];
  if (payload.termsContent) {
    lines.push(`${payload.termsTitle || 'Terms'}`, payload.termsContent, '');
  }
  return lines.join('\n');
}

/**
 * Send subscription driver-assignment email to the customer's registered email.
 */
export async function sendSubscriptionDriverAssignmentEmail({
  subscription,
  driver,
  terms,
}) {
  const user = await User.findById(subscription.userId)
    .select('name email')
    .lean();

  const recipient = user?.email?.trim();
  if (!recipient || isPlaceholderUserEmail(recipient)) {
    console.warn(
      `[email] Skipping subscription assignment email — user ${subscription.userId} has no registered email`,
    );
    return { sent: false, reason: 'no_email' };
  }

  const resolvedTerms = await resolveSubscriptionTerms(subscription, terms);

  const zone = subscription.zoneId?.name
    ? subscription.zoneId
    : await Zone.findById(subscription.zoneId).select('name city').lean();

  const zoneLabel = zone
    ? `${zone.name || ''}${zone.city ? ` · ${zone.city}` : ''}`.trim() || '—'
    : '—';

  const planName =
    subscription.planNameSnapshot || subscription.planId?.name || 'Subscription';
  const hoursLabel =
    subscription.includedHoursPerDay === 0
      ? 'Full-time'
      : `${subscription.includedHoursPerDay}h/day`;
  const periodLabel = `${formatDate(subscription.startDate)} → ${formatDate(subscription.expiryDate)}`;
  const workingEnd = subscription.assignedWorkingEndDate
    ? formatDate(subscription.assignedWorkingEndDate)
    : formatDate(subscription.expiryDate);

  const payload = {
    userName: user.name || 'there',
    planName,
    zoneLabel,
    carLabel: buildCarLabel(subscription.carId),
    hoursLabel,
    durationMonths: subscription.durationMonths,
    periodLabel,
    pickup: subscription.dailyPickup?.address,
    dropoff: subscription.dailyDropoff?.address,
    driverName: driver.name || 'Your driver',
    driverPhone: driver.phone || '',
    driverRating: driver.rating,
    workingStart: formatDate(subscription.assignedAt),
    workingEnd,
    termsTitle: resolvedTerms?.title || subscription.termsTitleSnapshot || 'Subscription terms',
    termsContent: resolvedTerms?.content || '',
  };

  const result = await sendEmail({
    to: recipient,
    subject: `Dedicated driver assigned — ${planName}`,
    html: buildHtml(payload),
    text: buildText(payload),
  });

  console.info(
    `[email] Subscription assignment email sent to ${recipient} via ${result.provider || 'unknown'}`,
  );

  return { sent: true, to: recipient, provider: result.provider };
}
