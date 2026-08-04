import { useState } from 'react';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Input from '../../../../components/Input';
import Toggle from '../../../../components/Toggle';
import Modal from '../../../../components/Modal';
import api from '../../../../utils/api';

const emptyForm = { name: '', isActive: true, sortOrder: 0 };

const BanksTab = ({ banks, onRefresh }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (bank) => {
    setEditing(bank);
    setForm({
      name: bank.name || '',
      isActive: bank.isActive !== false,
      sortOrder: bank.sortOrder ?? 0,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Bank name is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) {
        await api.put(`/admin/settings/banks/${editing._id}`, payload);
        toast.success('Bank updated');
      } else {
        await api.post('/admin/settings/banks', payload);
        toast.success('Bank added');
      }
      setShowModal(false);
      setEditing(null);
      await onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bank? Drivers will no longer see it in the dropdown.')) return;
    try {
      await api.delete(`/admin/settings/banks/${id}`);
      toast.success('Bank deleted');
      await onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Banks</h3>
          <p className="text-sm text-slate-500 mt-1">
            Bank names shown in the driver onboarding bank-details dropdown.
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Add Bank
        </Button>
      </div>

      {banks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">No banks yet</p>
          <p className="text-xs text-slate-400 mt-1">Add a bank or run the seed script.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {banks.map((bank, idx) => (
            <div
              key={bank._id}
              className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-200 shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{bank.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {!bank.isActive && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 text-[10px] font-bold">
                        DISABLED
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Order: {bank.sortOrder ?? 0}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(bank)}
                  className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(bank._id)}
                  className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit bank' : 'Add bank'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-2">
          <Input
            label="Bank name"
            placeholder="e.g. HDFC Bank"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
            <span className="text-sm font-semibold text-slate-700">Show in driver dropdown</span>
            <Toggle
              checked={form.isActive}
              onChange={(val) => setForm({ ...form, isActive: val })}
            />
          </div>
          <div className="pt-4 flex gap-3">
            <Button variant="outline" fullWidth type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button fullWidth type="submit" loading={submitting}>
              {editing ? 'Update Bank' : 'Add Bank'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default BanksTab;
