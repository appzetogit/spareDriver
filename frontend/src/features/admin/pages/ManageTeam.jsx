import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  User, Mail, Phone, Lock, Edit2, Trash2, MapPin, Check, BarChart3,
} from 'lucide-react';
import RowActionsMenu from '../components/RowActionsMenu';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Modal from '../../../components/Modal';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import Badge from '../../../components/Badge';
import api from '../../../utils/api';
import TeamStats from '../components/ManageTeam/TeamStats';
import TeamFilters from '../components/ManageTeam/TeamFilters';
import { STAFF_ROLE_LABELS } from '../../../constants/staffRoles';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';

const ASSIGNABLE_ROLES = ['team_member', 'sub_admin'];

const ManageTeam = () => {
  const navigate = useNavigate();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone_no: '',
    password: '',
    role: 'team_member',
    isActive: true,
    assignedZones: [],
  });
  // Lazy-loaded admin zones for the team_member zone picker. We only
  // need them when the add/edit modal opens — fetching on mount would
  // be wasteful for an infrequently-used page.
  const fetchZones = useAdminZonesStore((s) => s.fetch);
  const zonesEntry = useAdminZonesStore((s) => s.getEntry('admin-zones'));
  const allZones = useMemo(
    () => (Array.isArray(zonesEntry?.data) ? zonesEntry.data : []),
    [zonesEntry?.data],
  );

  useEffect(() => {
    if (!showAddModal) return;
    fetchZones('admin-zones').catch(() => {});
  }, [showAddModal, fetchZones]);

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit });
      if (search) params.append('search', search);

      const res = await api.get(`/admin/team?${params.toString()}`);

      if (res.data?.data?.data) {
        setTeamMembers(res.data.data.data);
        setPagination(res.data.data.pagination);
      } else {
        setTeamMembers(res.data.data);
        setPagination({ total: res.data.data.length, pages: 1 });
      }
      setError(null);
    } catch (err) {
      setError('Failed to fetch team members');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchTeam();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchTeam]);

  const handleEdit = (member) => {
    setSelectedMember(member);
    setFormError(null);
    setFormData({
      name: member.name,
      email: member.email,
      phone_no: member.phone_no,
      password: '', // Don't show password for edit
      role: member.role,
      isActive: member.isActive ?? true,
      assignedZones: (member.assignedZones || []).map((z) =>
        typeof z === 'string' ? z : z?._id,
      ).filter(Boolean),
    });
    setShowAddModal(true);
  };

  const confirmDelete = (member) => {
    setSelectedMember(member);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    try {
      setSubmitting(true);
      await api.delete(`/admin/team/${selectedMember._id}`);
      toast.success('Team member removed successfully');
      fetchTeam();
      setShowDeleteModal(false);
      setSelectedMember(null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete member';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      // sub_admin + team_member carry zone assignments
      const zonesForPayload =
        formData.role === 'team_member' || formData.role === 'sub_admin'
          ? formData.assignedZones || []
          : [];
      if (selectedMember) {
        await api.put(`/admin/team/${selectedMember._id}`, {
          name: formData.name,
          email: formData.email,
          phone_no: formData.phone_no,
          role: formData.role,
          isActive: formData.isActive,
          assignedZones: zonesForPayload,
        });
        toast.success('Team member updated successfully');
      } else {
        await api.post('/admin/team', { ...formData, assignedZones: zonesForPayload });
        toast.success('Team member created successfully');
      }
      fetchTeam();
      setShowAddModal(false);
      setSelectedMember(null);
      setFormData({
        name: '',
        email: '',
        phone_no: '',
        password: '',
        role: 'team_member',
        isActive: true,
        assignedZones: [],
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save member';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => ({
    total: pagination.total,
    active: teamMembers.filter(m => m.isActive).length,
    inactive: teamMembers.filter(m => !m.isActive).length,
    admins: teamMembers.filter(m => m.role === 'admin').length,
  }), [teamMembers, pagination.total]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Team Member',
      width: '35%',
      render: (val, row) => (
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold uppercase ring-1 ring-slate-200 shadow-sm shrink-0">
            {val.charAt(0)}
          </div>
          <div className="overflow-hidden min-w-0">
            <p className="font-semibold text-slate-900 truncate text-sm">{val}</p>
            <p className="text-[11px] text-slate-500 truncate hidden sm:block">{row.email}</p>
            {/* Mobile: show role badge inline */}
            <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
              <Badge variant={row.role === 'admin' ? 'warning' : row.role === 'sub_admin' ? 'success' : 'info'} className="text-[9px] px-1.5 py-0.5">
                {STAFF_ROLE_LABELS[row.role] || row.role}
              </Badge>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${row.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className={`text-[9px] font-semibold ${row.isActive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {row.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      width: '15%',
      className: 'hidden sm:table-cell',
      render: (val) => (
        <Badge
          variant={val === 'admin' ? 'warning' : val === 'sub_admin' ? 'success' : 'info'}
        >
          {STAFF_ROLE_LABELS[val] || val}
        </Badge>
      ),
    },
    {
      key: 'phone_no',
      label: 'Phone',
      width: '20%',
      className: 'hidden md:table-cell',
    },
    {
      key: 'isActive',
      label: 'Status',
      width: '15%',
      className: 'hidden sm:table-cell',
      render: (val) => (
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${val ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
          <span className={`text-xs font-semibold ${val ? 'text-emerald-600' : 'text-rose-600'}`}>
            {val ? 'Active' : 'Inactive'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      sortable: false,
      unclamp: true,
      align: 'center',
      width: '15%',
      render: (_, row) => (
        <RowActionsMenu
          align="center"
          items={[
            {
              label: 'Analytics',
              icon: BarChart3,
              onClick: () => navigate(`/admin/settings/team/${row._id}/analytics`),
            },
            {
              label: 'Update',
              icon: Edit2,
              onClick: () => handleEdit(row),
            },
            {
              label: 'Delete',
              icon: Trash2,
              variant: 'danger',
              onClick: () => confirmDelete(row),
            },
          ]}
        />
      ),
    },
  ], [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 animate-fade-in-up pb-10">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm">
          {error}
        </div>
      )}

      <TeamFilters
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        onAddMember={() => {
          setSelectedMember(null);
          setFormError(null);
          setFormData({
            name: '',
            email: '',
            phone_no: '',
            password: '',
            role: 'team_member',
            isActive: true,
            assignedZones: [],
          });
          setShowAddModal(true);
        }}
      />

      <TeamStats {...stats} />

      <ServerPaginatedTable
        columns={columns}
        data={teamMembers}
        loading={loading}
        page={page}
        limit={limit}
        pagination={pagination}
        onPageChange={setPage}
        entityLabel="members"
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={selectedMember ? 'Update Team Member' : 'Onboard New Member'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 animate-fade-in flex items-center justify-between gap-2">
              <span>{formError}</span>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-rose-400 hover:text-rose-600 font-bold"
              >
                ✕
              </button>
            </div>
          )}
          <Input
            label="Full Name"
            placeholder="e.g. John Doe"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            icon={User}
            required
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="member@appzeto.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              icon={Mail}
              required
            />
            <Input
              label="Phone Number"
              placeholder="10-digit mobile"
              value={formData.phone_no}
              onChange={(e) => setFormData({ ...formData, phone_no: e.target.value })}
              icon={Phone}
              maxLength={10}
              required
            />
          </div>

          {!selectedMember && (
            <Input
              label="Initial Password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              icon={Lock}
              required
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Assign Role</label>
              <div className="grid grid-cols-2 gap-3">
                {selectedMember?.role === 'admin' ? (
                  <p className="text-sm text-slate-600 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    Super Admin — role cannot be changed
                  </p>
                ) : (
                  ASSIGNABLE_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setFormData({ ...formData, role })}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                        formData.role === role
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {STAFF_ROLE_LABELS[role]}
                    </button>
                  ))
                )}
              </div>
            </div>

            {selectedMember && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Account Status</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: true })}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${formData.isActive
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: false })}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${!formData.isActive
                      ? 'border-rose-500 bg-rose-50/50 text-rose-600'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                  >
                    Inactive
                  </button>
                </div>
              </div>
            )}
          </div>

          {(formData.role === 'team_member' || formData.role === 'sub_admin') && (
            <AssignedZonesPicker
              zones={allZones}
              loading={!!zonesEntry?.loading}
              selectedIds={formData.assignedZones}
              onToggle={(zoneId) => {
                const set = new Set(formData.assignedZones || []);
                if (set.has(zoneId)) set.delete(zoneId);
                else set.add(zoneId);
                setFormData({ ...formData, assignedZones: [...set] });
              }}
              onClear={() => setFormData({ ...formData, assignedZones: [] })}
            />
          )}

          <div className="pt-4 flex gap-3">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowAddModal(false)} disabled={submitting}>Cancel</Button>
            <Button fullWidth type="submit" loading={submitting}>{selectedMember ? 'Save Changes' : 'Create Account'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Confirm Removal"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
            <p className="text-sm text-rose-700 leading-relaxed">
              Are you sure you want to <span className="font-bold underline">permanently delete</span> <span className="font-bold">{selectedMember?.name}</span>?
              <br /><br />
              This action <span className="font-bold">cannot be undone</span>. All records associated with this account will be removed from the database.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setShowDeleteModal(false)} disabled={submitting}>Keep Member</Button>
            <Button
              fullWidth
              className="bg-rose-600 hover:bg-rose-700 text-white border-transparent shadow-lg shadow-rose-200"
              onClick={handleDelete}
              loading={submitting}
            >
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/**
 * Multi-select pill grid for assigning zones to sub_admin / team_member.
 * The server scopes bookings, emergency pool, and live map to these IDs —
 * pick zero and the member sees an empty queue (intentional: they must be
 * explicitly enrolled before getting access).
 */
function AssignedZonesPicker({ zones, loading, selectedIds, onToggle, onClear }) {
  const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const grouped = useMemo(() => {
    const out = {};
    (zones || []).forEach((z) => {
      const city = z.city || 'Other';
      if (!out[city]) out[city] = [];
      out[city].push(z);
    });
    return out;
  }, [zones]);
  const cityKeys = Object.keys(grouped).sort();

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Assigned Zones
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Members only see emergency-pool bookings whose pickup falls in
            one of these zones.
          </p>
        </div>
        {(selectedSet.size > 0) && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
          >
            Clear all
          </button>
        )}
      </div>

      {loading && !zones.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 text-center">
          Loading zones…
        </div>
      ) : zones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 text-center">
          No active zones found. Create zones first in Settings → Service Zones.
        </div>
      ) : (
        <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
          {cityKeys.map((city) => (
            <div key={city}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {city}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {grouped[city].map((z) => {
                  const active = selectedSet.has(z._id);
                  return (
                    <button
                      key={z._id}
                      type="button"
                      onClick={() => onToggle(z._id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-xl border text-xs font-semibold transition ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {active ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5" />
                      )}
                      {z.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ManageTeam;
