import { useState } from 'react';
import { Plus, Edit2, Package, Trash2 } from 'lucide-react';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Toggle from '../../../components/Toggle';
import Modal from '../../../components/Modal';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminKitsStore } from '../../../store/admin/useAdminKitsStore';
import KitItemsEditor from '../components/ManageKits/KitItemsEditor';
import {
  createEmptyKitItem,
  kitItemFromApi,
  kitItemsToPayload,
} from '../components/ManageKits/kitItemFormUtils';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageKitsCatalog } from '../../../constants/staffRoles';

const emptyForm = {
  name: '',
  description: '',
  price: '',
  isMandatory: true,
  isActive: true,
  sortOrder: 0,
  items: [createEmptyKitItem()],
};

const ManageKits = () => {
  const { admin } = useAdminAuthStore();
  const canEdit = canManageKitsCatalog(admin?.role);
  const cacheKey = buildCacheKey('admin-kits', {});
  const { data: kits = [], loading, refetch } = useCachedQuery(useAdminKitsStore, cacheKey, {});
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (kit) => {
    setEditing(kit);
    setForm({
      name: kit.name,
      description: kit.description || '',
      price: String(kit.price),
      isMandatory: kit.isMandatory,
      isActive: kit.isActive,
      sortOrder: kit.sortOrder || 0,
      items: kit.items?.length ? kit.items.map(kitItemFromApi) : [createEmptyKitItem()],
    });
    setShowModal(true);
  };

  const handleDelete = async (kit) => {
    if (
      !window.confirm(
        `Delete "${kit.name}"? This cannot be undone. Kits with existing orders cannot be deleted.`,
      )
    ) {
      return;
    }

    setDeletingId(kit._id);
    try {
      await api.delete(`/admin/kits/${kit._id}`);
      toast.success('Kit deleted');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete kit');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payloadItems = kitItemsToPayload(form.items);
    if (!payloadItems.length) {
      toast.error('Add at least one kit item');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: Number(form.price),
        isMandatory: form.isMandatory,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        items: payloadItems,
      };
      if (editing) {
        await api.put(`/admin/kits/${editing._id}`, payload);
        toast.success('Kit updated');
      } else {
        await api.post('/admin/kits', payload);
        toast.success('Kit created');
      }
      setShowModal(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save kit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Driver kits</h1>
          <p className="text-sm text-slate-500 mt-1">
            Each kit includes items (T-shirt with sizes, badge, etc.)
          </p>
        </div>
        {canEdit && (
          <Button variant="admin" size="md" onClick={openCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add kit
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          View only — only the super admin can edit driver kits.
        </div>
      )}

      <div className="grid gap-4">
        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {!loading && kits.length === 0 && (
          <p className="text-sm text-slate-500 p-8 text-center bg-white rounded-2xl border">No kits yet</p>
        )}
        {kits?.map((kit) => (
          <div
            key={kit._id}
            className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center gap-4 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-slate-600" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{kit.name}</p>
                <p className="text-sm text-slate-500">
                  ₹{kit.price?.toLocaleString('en-IN')} · {kit.items?.length || 0} items
                  {kit.isMandatory ? ' · Mandatory' : ''}
                  {!kit.isActive ? ' · Inactive' : ''}
                </p>
                {kit.items?.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1 truncate">
                    {kit.items.map((i) => i.name).join(', ')}
                  </p>
                )}
              </div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(kit)}
                  className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors"
                  title="Edit kit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(kit)}
                  disabled={deletingId === kit._id}
                  className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                  title="Delete kit"
                >
                  <Trash2 className={`w-4 h-4 ${deletingId === kit._id ? 'animate-pulse' : ''}`} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit driver kit' : 'New driver kit'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-2 max-h-[80vh] overflow-y-auto">
          <Input label="Kit name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            label="Price (INR)"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
          />

          <KitItemsEditor items={form.items} onChange={(items) => setForm({ ...form, items })} />

          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Mandatory</span>
              <Toggle checked={form.isMandatory} onChange={(v) => setForm({ ...form, isMandatory: v })} />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-sm font-semibold">Active</span>
              <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>

          <div className="pt-4 flex gap-3 sticky bottom-0 bg-white pb-1">
            <Button variant="outline" size="md" fullWidth type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="admin" size="md" fullWidth type="submit" loading={submitting}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
      )}
    </div>
  );
};

export default ManageKits;
