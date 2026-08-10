import { useMemo, useState } from 'react';
import { Eye, Filter, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import ImageLightbox from '../../../components/ImageLightbox';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import {
  useAdminSupportStore,
  fetchSupportTicketDetail,
  updateSupportTicket,
  assignSupportTicket,
} from '../../../store/admin/useAdminSupportStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageTaskAssignment } from '../../../constants/staffRoles';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
} from '../../../constants/supportTicket';
import AssigneeBadge from '../components/AssigneeBadge';
import AssignToTeamMemberControl from '../components/AssignToTeamMemberControl';

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
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}/${month}/${year}, ${time}`;
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
  const { admin } = useAdminAuthStore();
  const canAssign = canManageTaskAssignment(admin?.role);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('open');
  const [imagePreview, setImagePreview] = useState(null);

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

  const handleAssign = async (assigneeId) => {
    if (!selectedTicket) return;
    const updated = await assignSupportTicket(selectedTicket._id, { assigneeId });
    toast.success('Ticket assigned');
    setSelectedTicket(updated);
    setStatus(updated?.status || status);
    refetch();
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
          <table className="w-full text-sm min-w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-border-light text-left">
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-text-secondary">Ticket ID</th>
                <th className="hidden sm:table-cell px-4 py-3 font-semibold text-text-secondary">User Name</th>
                <th className="hidden sm:table-cell px-4 py-3 font-semibold text-text-secondary">Category</th>
                <th className="hidden sm:table-cell px-4 py-3 font-semibold text-text-secondary">Subject</th>
                <th className="hidden sm:table-cell px-4 py-3 font-semibold text-text-secondary">Assignee</th>
                <th className="hidden sm:table-cell px-4 py-3 font-semibold text-text-secondary">Status</th>
                <th className="hidden sm:table-cell px-4 py-3 font-semibold text-text-secondary">Created Date</th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-semibold text-text-secondary text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                    Loading tickets…
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                    No tickets found
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket._id} className="border-b border-border-light hover:bg-gray-50/50">
                    <td className="px-3 sm:px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                          <span className="font-mono text-xs font-bold text-slate-900">{ticket.ticketNumber}</span>
                          <span className="sm:hidden">
                            <Badge variant={STATUS_BADGE[ticket.status] || 'default'}>
                              {SUPPORT_STATUS_LABELS[ticket.status] || ticket.status}
                            </Badge>
                          </span>
                        </div>
                        <div className="sm:hidden text-xs text-slate-700 mt-1 flex flex-wrap items-center gap-1.5 font-medium">
                          <span>{userDisplayName(ticket)}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                            {SUPPORT_CATEGORIES.find((c) => c.value === ticket.category)?.label || ticket.category}
                          </span>
                        </div>
                        <p className="sm:hidden text-xs text-slate-800 font-semibold mt-1 break-words">
                          {ticket.subject}
                        </p>
                        <div className="sm:hidden flex items-center justify-between gap-2 mt-2 pt-1 border-t border-slate-100">
                          <AssigneeBadge assignedTo={ticket.assignedTo} compact />
                          <span className="text-[10px] text-slate-400">
                            {formatDate(ticket.createdAt)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">{userDisplayName(ticket)}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      {SUPPORT_CATEGORIES.find((c) => c.value === ticket.category)?.label ||
                        ticket.category}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 max-w-[200px] truncate">{ticket.subject}</td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <AssigneeBadge assignedTo={ticket.assignedTo} compact />
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3">
                      <Badge variant={STATUS_BADGE[ticket.status] || 'default'}>
                        {SUPPORT_STATUS_LABELS[ticket.status] || ticket.status}
                      </Badge>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap">{formatDate(ticket.createdAt)}</td>
                    <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-right">
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
          <div className="p-3 sm:p-4 space-y-3 sm:space-y-5 max-h-[80vh] overflow-y-auto">
            {modalLoading && <p className="text-xs text-text-muted">Loading…</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
              <Card padding="p-3 sm:p-4" className="space-y-1 sm:space-y-2">
                <h4 className="text-[10px] sm:text-xs font-semibold uppercase text-text-muted">User Details</h4>
                {selectedTicket.submitterType === 'driver' ? (
                  <div className="space-y-0.5 text-xs sm:text-sm">
                    <p><span className="text-text-muted">Type:</span> Driver</p>
                    <p><span className="text-text-muted">Name:</span> {selectedTicket.driverId?.name || '—'}</p>
                    <p><span className="text-text-muted">Phone:</span> {selectedTicket.driverId?.phone || '—'}</p>
                    <p className="truncate"><span className="text-text-muted">Email:</span> {selectedTicket.driverId?.email || '—'}</p>
                  </div>
                ) : (
                  <div className="space-y-0.5 text-xs sm:text-sm">
                    <p><span className="text-text-muted">Type:</span> Customer</p>
                    <p><span className="text-text-muted">Name:</span> {selectedTicket.userId?.name || '—'}</p>
                    <p><span className="text-text-muted">Phone:</span> {selectedTicket.userId?.phone || selectedTicket.userId?.phone_no || '—'}</p>
                    <p className="truncate"><span className="text-text-muted">Email:</span> {selectedTicket.userId?.email || '—'}</p>
                  </div>
                )}
              </Card>

              <Card padding="p-3 sm:p-4" className="space-y-1 sm:space-y-2">
                <h4 className="text-[10px] sm:text-xs font-semibold uppercase text-text-muted">Booking Details</h4>
                {selectedTicket.bookingId ? (
                  <div className="space-y-0.5 text-xs sm:text-sm">
                    <p className="font-mono"><span className="text-text-muted">Booking #:</span> {selectedTicket.bookingId.bookingNumber || '—'}</p>
                    <p><span className="text-text-muted">Status:</span> {selectedTicket.bookingId.status || '—'}</p>
                    <p className="truncate"><span className="text-text-muted">Pickup:</span> {selectedTicket.bookingId.pickupAddress || '—'}</p>
                    <p className="truncate"><span className="text-text-muted">Drop:</span> {selectedTicket.bookingId.dropAddress || '—'}</p>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-text-secondary">No booking linked</p>
                )}
              </Card>
            </div>

            <Card padding="p-3 sm:p-4" className="space-y-2 sm:space-y-3">
              <h4 className="text-[10px] sm:text-xs font-semibold uppercase text-text-muted">Complaint Details</h4>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                <div>
                  <p className="text-text-muted text-[10px] sm:text-xs">Ticket ID</p>
                  <p className="font-mono">{selectedTicket.ticketNumber}</p>
                </div>
                <div>
                  <p className="text-text-muted text-[10px] sm:text-xs">Category</p>
                  <p>
                    {SUPPORT_CATEGORIES.find((c) => c.value === selectedTicket.category)?.label ||
                      selectedTicket.category}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-text-muted text-[10px] sm:text-xs">Subject</p>
                  <p className="font-medium">{selectedTicket.subject}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-text-muted text-[10px] sm:text-xs">Description</p>
                  <p className="text-text-secondary whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>
                <div>
                  <p className="text-text-muted text-[10px] sm:text-xs">Created</p>
                  <p>{formatDate(selectedTicket.createdAt)}</p>
                </div>
                <div>
                  <p className="text-text-muted text-[10px] sm:text-xs">Assignee</p>
                  <div className="mt-0.5">
                    <AssigneeBadge assignedTo={selectedTicket.assignedTo} compact />
                  </div>
                </div>
              </div>
              {selectedTicket.screenshot && (
                <div>
                  <p className="text-text-muted text-[10px] sm:text-xs mb-1.5">Screenshot</p>
                  <button
                    type="button"
                    onClick={() =>
                      setImagePreview({
                        url: selectedTicket.screenshot,
                        alt: 'Ticket screenshot',
                      })
                    }
                    className="block text-left"
                  >
                    <img
                      src={selectedTicket.screenshot}
                      alt="Screenshot"
                      className="rounded-lg border border-border-light max-h-40 sm:max-h-56 object-contain"
                    />
                  </button>
                </div>
              )}
            </Card>

            {canAssign && selectedTicket.status !== 'resolved' && (
              <Card padding="p-3 sm:p-4" className="space-y-2 sm:space-y-3">
                <h4 className="text-[10px] sm:text-xs font-semibold uppercase text-text-muted">
                  Assign to Team Member
                </h4>
                <AssignToTeamMemberControl onAssign={handleAssign} />
              </Card>
            )}

            <div className="space-y-2 sm:space-y-3">
              <label className="block text-xs sm:text-sm font-medium text-text">
                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5" />
                Reply
              </label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Write a reply to the customer…"
                className="w-full rounded-xl border border-border-light px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                  Close
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <ImageLightbox
        src={imagePreview?.url}
        alt={imagePreview?.alt}
        onClose={() => setImagePreview(null)}
      />
    </div>
  );
};

export default ManageSupport;
