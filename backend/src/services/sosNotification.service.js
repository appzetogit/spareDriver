import { sendEmergencySms } from '../utils/otpService.js';

export function buildEmergencyMessage({
  userName,
  driverName,
  driverPhone,
  vehicleNumber,
  lat,
  lng,
  tripId,
}) {
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
  return [
    '🚨 EMERGENCY ALERT',
    '',
    `Passenger Name: ${userName || 'Unknown'}`,
    `Driver Name: ${driverName || 'Unknown'}`,
    `Driver Phone: ${driverPhone || 'N/A'}`,
    `Vehicle Number: ${vehicleNumber || 'N/A'}`,
    '',
    'Live Location:',
    mapsUrl,
    '',
    'Trip ID:',
    String(tripId || ''),
  ].join('\n');
}

export async function notifyEmergencyContactsBySms(contacts, message) {
  const results = [];
  for (const contact of contacts) {
    try {
      await sendEmergencySms(contact.phoneNumber, message);
      results.push({ contactId: String(contact._id), phoneNumber: contact.phoneNumber, ok: true });
    } catch (err) {
      results.push({
        contactId: String(contact._id),
        phoneNumber: contact.phoneNumber,
        ok: false,
        error: err?.message || 'SMS failed',
      });
    }
  }
  return results;
}
