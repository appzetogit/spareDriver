import api from './api';

/**
 * Download a booking invoice PDF.
 * Shared by trip-complete, invoice page, and activity history — do not
 * reimplement the blob → save-as flow elsewhere.
 *
 * @param {object|string} bookingOrId - booking doc (preferred for filename) or id
 */
export async function downloadBookingInvoicePdf(bookingOrId) {
  const booking =
    bookingOrId && typeof bookingOrId === 'object' ? bookingOrId : null;
  const id = booking?._id || bookingOrId;
  if (!id) throw new Error('No booking selected');

  const res = await api.get(`/auth/bookings/${id}/invoice/pdf`, {
    responseType: 'blob',
  });

  const invoiceRef =
    booking?.invoiceNumber || booking?.bookingNumber || String(id);
  const filenameSafe = String(invoiceRef).replace(/[^a-zA-Z0-9-_]/g, '-');
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${filenameSafe}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
