import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  Phone,
  MessageCircle,
  Mail,
  Send,
  Ticket,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../utils/api';
import Card from '../../../../components/Card';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Select from '../../../../components/Select';
import Modal from '../../../../components/Modal';
import Badge from '../../../../components/Badge';
import DocumentUploadField from '../../../../components/DocumentUploadField';
import { uploadImage } from '../../../../utils/upload';
import {
  FAQ_ITEMS,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
} from '../../../../constants/supportTicket';

const STATUS_BADGE = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
};

const emptyForm = {
  bookingId: '',
  category: 'booking_issue',
  subject: '',
  description: '',
  screenshot: '',
};

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="space-y-2">
      {FAQ_ITEMS.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question} className="border border-border-light rounded-xl overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-text">{item.question}</span>
              <ChevronDown
                className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 text-sm text-text-secondary leading-relaxed border-t border-border-light pt-3">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContactCard({ icon: Icon, title, value, actionLabel, onClick, colorClass }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!value}
      className="flex flex-col items-start gap-2 p-4 bg-white rounded-xl border border-border-light shadow-card hover:border-primary/30 transition-colors text-left w-full disabled:opacity-50"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-xs text-text-secondary mt-0.5 break-all">{value || 'Not configured'}</p>
      </div>
      <span className="text-xs font-medium text-primary mt-1">{actionLabel}</span>
    </button>
  );
}

const HelpSupportPage = ({ audience = 'user' }) => {
  const navigate = useNavigate();
  const backPath = audience === 'driver' ? '/driver/account' : '/user/account';

  const [config, setConfig] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [screenshotDoc, setScreenshotDoc] = useState({ url: null, publicId: null, loading: false });
  const [success, setSuccess] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [configRes, ticketsRes] = await Promise.all([
          api.get('/common/support-config'),
          api.get('/support/my-tickets'),
        ]);
        if (cancelled) return;
        setConfig(configRes.data?.data || {});
        setTickets(ticketsRes.data?.data?.tickets || []);

        const bookingsRes =
          audience === 'driver'
            ? await api.get('/driver/trips', { params: { limit: 15, page: 1 } })
            : await api.get('/auth/bookings');
        if (cancelled) return;
        const list =
          audience === 'driver'
            ? bookingsRes.data?.data?.data || []
            : bookingsRes.data?.data?.bookings || [];
        setBookings(list);
      } catch {
        if (!cancelled) toast.error('Failed to load support page');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const bookingOptions = useMemo(
    () => [
      { value: '', label: 'No booking (optional)' },
      ...bookings.map((b) => ({
        value: b._id,
        label: b.bookingNumber || `Booking ${String(b._id).slice(-6)}`,
      })),
    ],
    [bookings],
  );

  const handleScreenshotUpload = async (file) => {
    setScreenshotDoc((prev) => ({ ...prev, loading: true }));
    try {
      const result = await uploadImage(file, screenshotDoc.publicId);
      setScreenshotDoc({ url: result.url, publicId: result.publicId, loading: false });
      setForm((prev) => ({ ...prev, screenshot: result.url }));
    } catch (err) {
      setScreenshotDoc((prev) => ({ ...prev, loading: false }));
      throw err;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Description is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/support', {
        ...form,
        bookingId: form.bookingId || null,
        screenshot: form.screenshot || '',
      });
      setSuccess(true);
      setForm(emptyForm);
      setScreenshotDoc({ url: null, publicId: null, loading: false });
      const ticketsRes = await api.get('/support/my-tickets');
      setTickets(ticketsRes.data?.data?.tickets || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit complaint');
    } finally {
      setSubmitting(false);
    }
  };

  const openTicketDetail = async (ticket) => {
    setDetailLoading(true);
    setDetailTicket(ticket);
    try {
      const res = await api.get(`/support/${ticket._id}`);
      setDetailTicket(res.data?.data?.ticket || ticket);
    } catch {
      toast.error('Failed to load ticket details');
    } finally {
      setDetailLoading(false);
    }
  };

  const whatsappHref = config?.supportWhatsapp
    ? `https://wa.me/${String(config.supportWhatsapp).replace(/\D/g, '')}`
    : null;

  return (
    <div className="flex-1 flex flex-col bg-bg min-h-dvh">
      <div className="sticky top-0 z-10 bg-white border-b border-border-light px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="p-1.5 -ml-1 rounded-full hover:bg-gray-100"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5 text-text" />
        </button>
        <h1 className="text-base font-bold text-text">Help & Support</h1>
      </div>

      <div className="flex-1 p-4 pb-8 space-y-6 max-w-lg mx-auto w-full">
        {loading ? (
          <p className="text-sm text-text-muted text-center py-8">Loading…</p>
        ) : (
          <>
            <section>
              <h2 className="text-sm font-semibold text-text mb-3">Frequently Asked Questions</h2>
              <FaqAccordion />
            </section>

            <section>
              <h2 className="text-sm font-semibold text-text mb-3">Contact Support</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ContactCard
                  icon={Phone}
                  title="Call Support"
                  value={config?.supportPhone}
                  actionLabel="Call now"
                  colorClass="bg-blue-50 text-blue-600"
                  onClick={() => config?.supportPhone && (window.location.href = `tel:${config.supportPhone}`)}
                />
                <ContactCard
                  icon={MessageCircle}
                  title="WhatsApp Support"
                  value={config?.supportWhatsapp}
                  actionLabel="Open chat"
                  colorClass="bg-green-50 text-green-600"
                  onClick={() => whatsappHref && window.open(whatsappHref, '_blank')}
                />
                <ContactCard
                  icon={Mail}
                  title="Email Support"
                  value={config?.supportEmail}
                  actionLabel="Send email"
                  colorClass="bg-purple-50 text-purple-600"
                  onClick={() =>
                    config?.supportEmail &&
                    (window.location.href = `mailto:${config.supportEmail}`)
                  }
                />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-text mb-3">Raise Complaint</h2>
              {success ? (
                <Card className="text-center py-6 space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-success mx-auto" />
                  <p className="text-sm font-medium text-text">
                    Your complaint has been submitted. Our team will contact you soon.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setSuccess(false)}>
                    Submit another
                  </Button>
                </Card>
              ) : (
                <Card className="space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <Select
                      label="Booking (optional)"
                      options={bookingOptions}
                      value={form.bookingId}
                      onChange={(val) => setForm((prev) => ({ ...prev, bookingId: val }))}
                    />
                    <Select
                      label="Category"
                      options={SUPPORT_CATEGORIES}
                      value={form.category}
                      onChange={(val) => setForm((prev) => ({ ...prev, category: val }))}
                    />
                    <Input
                      label="Subject"
                      value={form.subject}
                      onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="Brief summary of your issue"
                      maxLength={200}
                    />
                    <div>
                      <label className="block text-sm font-medium text-text mb-1.5">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        rows={4}
                        maxLength={5000}
                        placeholder="Describe your issue in detail"
                        className="w-full rounded-xl border border-border-light px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>
                    <DocumentUploadField
                      label="Screenshot (optional)"
                      doc={screenshotDoc}
                      onUpload={handleScreenshotUpload}
                      variant="card"
                      hint="PNG or JPG, max 200 KB"
                    />
                    <Button type="submit" className="w-full" loading={submitting}>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Complaint
                    </Button>
                  </form>
                </Card>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold text-text mb-3">My Complaints</h2>
              {tickets.length === 0 ? (
                <Card className="text-center py-6">
                  <Ticket className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No complaints yet</p>
                </Card>
              ) : (
                <Card padding="p-0" className="divide-y divide-border-light">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket._id}
                      type="button"
                      onClick={() => openTicketDetail(ticket)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-text-muted">{ticket.ticketNumber}</p>
                        <p className="text-sm font-medium text-text truncate">{ticket.subject}</p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {new Date(ticket.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE[ticket.status] || 'default'}>
                        {SUPPORT_STATUS_LABELS[ticket.status] || ticket.status}
                      </Badge>
                    </button>
                  ))}
                </Card>
              )}
            </section>
          </>
        )}
      </div>

      <Modal
        isOpen={Boolean(detailTicket)}
        onClose={() => setDetailTicket(null)}
        title="Complaint Details"
        size="lg"
      >
        {detailTicket && (
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {detailLoading && (
              <p className="text-xs text-text-muted">Refreshing…</p>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted text-xs">Ticket ID</p>
                <p className="font-mono font-medium">{detailTicket.ticketNumber}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Status</p>
                <Badge variant={STATUS_BADGE[detailTicket.status] || 'default'}>
                  {SUPPORT_STATUS_LABELS[detailTicket.status]}
                </Badge>
              </div>
              <div>
                <p className="text-text-muted text-xs">Category</p>
                <p>
                  {SUPPORT_CATEGORIES.find((c) => c.value === detailTicket.category)?.label ||
                    detailTicket.category}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Created</p>
                <p>{new Date(detailTicket.createdAt).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div>
              <p className="text-text-muted text-xs mb-1">Subject</p>
              <p className="text-sm font-medium">{detailTicket.subject}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs mb-1">Description</p>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{detailTicket.description}</p>
            </div>
            {detailTicket.screenshot && (
              <div>
                <p className="text-text-muted text-xs mb-2">Screenshot</p>
                <img
                  src={detailTicket.screenshot}
                  alt="Complaint screenshot"
                  className="rounded-lg border border-border-light max-h-48 object-contain"
                />
              </div>
            )}
            {detailTicket.adminReply && (
              <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
                <p className="text-xs font-semibold text-primary mb-1">Support Reply</p>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{detailTicket.adminReply}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default HelpSupportPage;
