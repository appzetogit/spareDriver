import { useMemo, useState } from 'react';
import { Eye, Filter, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import {
  useAdminSupportStore,
  fetchSupportTicketDetail,
  updateSupportTicket,
} from '../../../store/admin/useAdminSupportStore';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
} from '../../../constants/supportTicket';

const STATUS_BADGE = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userDisplayName(ticket) {
  if (ticket.submitterType === 'driver' && ticket.driverId) {
    return ticket.driverId.name || 'Driver';
  }
  if (ticket.userId) {
    return ticket.userId.name || 'User';
  }
  return '—';
}

const ManageSupport = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('open');

  const queryParams = useMemo(() => ({ status: statusFilter }), [statusFilter]);
  const cacheKey = buildCacheKey('admin-support', queryParams);
  const { data, loading, refetch } = useCachedQuery(useAdminSupportStore, cacheKey, queryParams);
  const tickets = Array.isArray(data) ? data : [];

  const openTicket = async (ticket) => {
    setModalOpen(true);
    setModalLoading(true);
    setSelectedTicket(ticket);
    setReply(ticket.adminReply || '');
    setStatus(ticket.status || 'open');
    try {
      const detail = await fetchSupportTicketDetail(ticket._id);
      if (detail) {
        setSelectedTicket(detail);
        setReply(detail.adminReply || '');
        setStatus(detail.status || 'open');
      }
    } catch {
      toast.error('Failed to load ticket details');
    } finally {
      setModalLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedTicket) return;
    setSaving(true);
    try {
      const updated = await updateSupportTicket(selectedTicket._id, {
        adminReply: reply,
        status,
      });
      toast.success('Ticket updated');
      setSelectedTicket(updated);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">Support Tickets</h2>
          <p className="text-sm text-text-secondary">Review and respond to customer complaints</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-48">
          <Filter className="w-4 h-4 text-text-muted shrink-0" />
          <Select
            options={FILTER_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            containerClassName="flex-1"
          />
        </div>
      </div>

      <Card padding="p-0" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-border-light text-left">
                <th className="px-4 py-3 font-semibold text-text-secondary">Ticket ID</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">User Name</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Category</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Subject</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Status</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Created Date</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                    Loading tickets…
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                    No tickets found
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket._id} className="border-b border-border-light hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs">{ticket.ticketNumber}</td>
                    <td className="px-4 py-3">{userDisplayName(ticket)}</td>
                    <td className="px-4 py-3">
                      {SUPPORT_CATEGORIES.find((c) => c.value === ticket.category)?.label ||
                        ticket.category}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{ticket.subject}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[ticket.status] || 'default'}>
                        {SUPPORT_STATUS_LABELS[ticket.status] || ticket.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(ticket.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" onClick={() => openTicket(ticket)}>
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedTicket(null);
        }}
        title="Ticket Details"
        size="2xl"
      >
        {selectedTicket && (
          <div className="p-4 space-y-5 max-h-[75vh] overflow-y-auto">
            {modalLoading && <p className="text-xs text-text-muted">Loading…</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-text-muted">User Details</h4>
                {selectedTicket.submitterType === 'driver' ? (
                  <>
                    <p className="text-sm"><span className="text-text-muted">Type:</span> Driver</p>
                    <p className="text-sm"><span className="text-text-muted">Name:</span> {selectedTicket.driverId?.name || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Phone:</span> {selectedTicket.driverId?.phone || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Email:</span> {selectedTicket.driverId?.email || '—'}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm"><span className="text-text-muted">Type:</span> Customer</p>
                    <p className="text-sm"><span className="text-text-muted">Name:</span> {selectedTicket.userId?.name || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Phone:</span> {selectedTicket.userId?.phone || selectedTicket.userId?.phone_no || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Email:</span> {selectedTicket.userId?.email || '—'}</p>
                  </>
                )}
              </Card>

              <Card className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-text-muted">Booking Details</h4>
                {selectedTicket.bookingId ? (
                  <>
                    <p className="text-sm"><span className="text-text-muted">Booking #:</span> {selectedTicket.bookingId.bookingNumber || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Status:</span> {selectedTicket.bookingId.status || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Pickup:</span> {selectedTicket.bookingId.pickupAddress || '—'}</p>
                    <p className="text-sm"><span className="text-text-muted">Drop:</span> {selectedTicket.bookingId.dropAddress || '—'}</p>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">No booking linked</p>
                )}
              </Card>
            </div>

            <Card className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-text-muted">Complaint Details</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-muted text-xs">Ticket ID</p>
                  <p className="font-mono">{selectedTicket.ticketNumber}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Category</p>
                  <p>
                    {SUPPORT_CATEGORIES.find((c) => c.value === selectedTicket.category)?.label ||
                      selectedTicket.category}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-text-muted text-xs">Subject</p>
                  <p className="font-medium">{selectedTicket.subject}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-text-muted text-xs">Description</p>
                  <p className="text-text-secondary whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-text-muted text-xs">Created</p>
                  <p>{formatDate(selectedTicket.createdAt)}</p>
                </div>
              </div>
              {selectedTicket.screenshot && (
                <div>
                  <p className="text-text-muted text-xs mb-2">Screenshot</p>
                  <a href={selectedTicket.screenshot} target="_blank" rel="noreferrer">
                    <img
                      src={selectedTicket.screenshot}
                      alt="Screenshot"
                      className="rounded-lg border border-border-light max-h-56 object-contain"
                    />
                  </a>
                </div>
              )}
            </Card>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-text">
                <MessageSquare className="w-4 h-4 inline mr-1.5" />
                Reply
              </label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Write a reply to the customer…"
                className="w-full rounded-xl border border-border-light px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setModalOpen(false)}>
                  Close
                </Button>
                <Button onClick={handleSave} loading={saving}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManageSupport;
