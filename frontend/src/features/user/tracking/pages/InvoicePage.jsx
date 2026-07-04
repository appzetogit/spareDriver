import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import useUserActiveBookingStore from '../../../../store/user/useUserActiveBookingStore';
import { formatDistance } from '../../../../utils/geo';
import { SERVICE_TYPE_LABELS } from '../../../../constants/serviceTypes';

/**
 * Trip invoice — backed by the booking object stored in
 * `useUserActiveBookingStore`. Every figure (number, service, distance,
 * duration, total) is computed from real data so the invoice the user
 * sees here matches what's persisted server-side.
 */
const InvoicePage = () => {
  const navigate = useNavigate();
  const booking = useUserActiveBookingStore((s) => s.booking);
  const fetchActive = useUserActiveBookingStore((s) => s.fetchActive);
  const downloadInvoicePdf = useUserActiveBookingStore((s) => s.downloadInvoicePdf);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!booking) fetchActive().catch(() => {});
  }, [booking, fetchActive]);

  const invoice = useMemo(() => {
    if (!booking) {
      return {
        id: '—',
        date: '—',
        service: '—',
        distance: '—',
        duration: '—',
        total: null,
      };
    }
    // Bookings are not always assigned a separate invoice number — we fall
    // back to the booking number so the user can still reference it with
    // support.
    const id = booking.invoiceNumber || booking.bookingNumber || '—';
    const createdAt = booking.timeline?.completedAt || booking.timeline?.createdAt || booking.createdAt;
    const date = createdAt ? new Date(createdAt).toLocaleString() : '—';

    const service =
      SERVICE_TYPE_LABELS[booking.serviceType] ||
      (booking.serviceType ? `${booking.serviceType}` : 'Trip');

    const distanceMeters =
      booking.distanceMeters ??
      booking.fareSnapshot?.distanceMeters ??
      booking.tripSummary?.distanceMeters ??
      null;
    const distance = distanceMeters != null ? formatDistance(distanceMeters) : '—';

    let duration = '—';
    const startedAt = booking.timeline?.startedAt;
    const completedAt = booking.timeline?.completedAt;
    if (startedAt && completedAt) {
      const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) {
        const minutes = Math.max(1, Math.round(diffMs / 60_000));
        duration = `${minutes} min`;
      }
    }

    // Mirror the same total math as the TripCompleted screen so the two
    // pages can never disagree on what the user owes/paid.
    const base = booking.fareSnapshot?.total || 0;
    // Invoices only include extensions the customer actually paid for.
    // Pending / declined / expired intents must not inflate the bill.
    const extensions = (booking.extensions || []).reduce(
      (sum, ext) =>
        sum + (ext?.status === 'accepted' ? Number(ext.fareDelta) || 0 : 0),
      0,
    );
    const total = base + extensions || null;

    return { id, date, service, distance, duration, total };
  }, [booking]);

  const handleDownloadInvoice = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf();
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not download invoice');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="bg-white px-4 pt-4 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Invoice</h1>
        </div>
      </div>

      <div className="flex-1 p-4">
        <Card className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-bold text-text">{invoice.id}</span>
            </div>
            <span className="text-xs text-text-muted">{invoice.date}</span>
          </div>

          <div className="space-y-3 mb-6">
            {[
              ['Service', invoice.service],
              ['Distance', invoice.distance],
              ['Duration', invoice.duration],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-sm text-text-secondary">{label}</span>
                <span className="text-sm font-medium text-text">{value}</span>
              </div>
            ))}
            <div className="h-px bg-border-light" />
            <div className="flex justify-between">
              <span className="text-sm font-bold text-text">Total</span>
              <span className="text-lg font-bold text-text">
                {invoice.total != null ? `₹${invoice.total}` : '—'}
              </span>
            </div>
          </div>

          <Button
            fullWidth
            variant="secondary"
            icon={Download}
            loading={downloading}
            disabled={downloading || !booking?._id}
            onClick={handleDownloadInvoice}
          >
            Download Invoice
          </Button>
        </Card>
      </div>

      <div className="p-4">
        <Button fullWidth onClick={() => navigate('/user/home')}>Done</Button>
      </div>
    </div>
  );
};

export default InvoicePage;
