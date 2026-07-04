import { asyncHandler } from '../utils/asyncHandler.js';
import { buildBookingInvoicePdf } from '../services/bookingInvoicePdf.service.js';

/**
 * GET /auth/bookings/:id/invoice/pdf
 *
 * Streams a trip invoice PDF for a completed booking owned by the
 * authenticated customer.
 */
export const downloadBookingInvoicePdf = asyncHandler(async (req, res) => {
  await buildBookingInvoicePdf(req.params.id, {
    userId: req.user._id,
    res,
  });
});
