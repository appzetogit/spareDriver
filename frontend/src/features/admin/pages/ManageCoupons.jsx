import { useState } from 'react';
import { Plus, Edit2, Trash2, Tag, Check, BarChart3, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Toggle from '../../../components/Toggle';
import Modal from '../../../components/Modal';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminCouponsStore } from '../../../store/admin/useAdminCouponsStore';
import {
  COUPON_DISCOUNT_TYPES,
  COUPON_APPLICABLE_SERVICE_LIST,
  COUPON_APPLICABLE_SERVICE_LABELS,
} from '../../../constants/couponTypes';

const emptyForm = {
  code: '',
  description: '',
  discountType: COUPON_DISCOUNT_TYPES.PERCENTAGE,
  discountValue: 10,
  applicableTo: [...COUPON_APPLICABLE_SERVICE_LIST],
  isActive: true,
  minOrderAmount: 0,
  maxDiscountAmount: 0,
  maxUses: '',
  expiresAt: '',
};

function formatDiscount(coupon) {
  if (coupon.discountType === COUPON_DISCOUNT_TYPES.PERCENTAGE) {
    return `${coupon.discountValue}%`;
  }
  return `₹${coupon.discountValue}`;
}

function formatApplicable(coupon) {
  return (coupon.applicableTo || [])
    .map((s) => COUPON_APPLICABLE_SERVICE_LABELS[s] || s)
    .join(', ');
}

const ManageCoupons = () => {
  const cacheKey = buildCacheKey('admin-coupons', {});
  const { data, loading, refetch } = useCachedQuery(useAdminCouponsStore, cacheKey, {});
  const coupons = Array.isArray(data) ? data : [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [analyticsCoupon, setAnalyticsCoupon] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const openAnalytics = async (coupon) => {
    setAnalyticsCoupon(coupon);
    setAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const res = await api.get(`/admin/coupons/${coupon._id}/analytics`);
      setAnalytics(res?.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load analytics');
      setAnalyticsCoupon(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (coupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description || '',
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      applicableTo: coupon.applicableTo || [],
      isActive: coupon.isActive !== false,
      minOrderAmount: coupon.minOrderAmount || 0,
      maxDiscountAmount: coupon.maxDiscountAmount || 0,
      maxUses: coupon.maxUses ?? '',
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 16) : '',
    });
    setShowModal(true);
  };

  const toggleApplicable = (service) => {
    setForm((prev) => {
      const set = new Set(prev.applicableTo || []);
      if (set.has(service)) set.delete(service);
      else set.add(service);
      return { ...prev, applicableTo: [...set] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.code?.trim()) {
      toast.error('Coupon code is required');
      return;
    }
    if (!form.applicableTo?.length) {
      toast.error('Select at least one applicable service');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        maxUses: form.maxUses === '' ? null : Number(form.maxUses),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        await api.put(`/admin/coupons/${editing._id}`, payload);
        toast.success('Coupon updated');
      } else {
        await api.post('/admin/coupons', payload);
        toast.success('Coupon created');
      }
      setShowModal(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save coupon');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon "${coupon.code}"?`)) return;
    setDeletingId(coupon._id);
    try {
      await api.delete(`/admin/coupons/${coupon._id}`);
      toast.success('Coupon deleted');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete coupon');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (coupon) => {
    try {
      await api.put(`/admin/coupons/${coupon._id}`, { isActive: !coupon.isActive });
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update coupon');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <Tag className="w-6 h-6" />
            Coupon Codes
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create flat or percentage discounts for hourly, outstation, or subscription purchases.
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Coupon
        </Button>
      </div>

      <div className="bg-surface rounded-2xl border border-border-light overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-text-muted">Loading coupons…</div>
        ) : coupons.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No coupons yet. Create one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light bg-surface-secondary/50">
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Discount</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Applies to</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Usage</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Expires</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-secondary">Active</th>
                  <th className="text-right px-4 py-3 font-semibold text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon._id} className="border-b border-border-light last:border-0">
                    <td className="px-4 py-3 font-mono font-semibold text-text">{coupon.code}</td>
                    <td className="px-4 py-3 text-text">{formatDiscount(coupon)}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatApplicable(coupon)}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {coupon.usedCount || 0}
                      {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {coupon.expiresAt
                        ? new Date(coupon.expiresAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle checked={coupon.isActive} onChange={() => toggleActive(coupon)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openAnalytics(coupon)}
                          className="p-2 rounded-lg hover:bg-surface-secondary text-text-secondary"
                          aria-label="Analytics"
                          title="Usage analytics"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(coupon)}
                          className="p-2 rounded-lg hover:bg-surface-secondary text-text-secondary"
                          aria-label="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(coupon)}
                          disabled={deletingId === coupon._id}
                          className="p-2 rounded-lg hover:bg-danger/10 text-danger disabled:opacity-50"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Coupon' : 'New Coupon'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <Input
            label="Coupon code"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
            placeholder="SAVE20"
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Summer offer"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Discount type</label>
              <select
                value={form.discountType}
                onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))}
                className="w-full rounded-xl border border-border-light bg-surface px-3 py-2 text-sm"
              >
                <option value={COUPON_DISCOUNT_TYPES.PERCENTAGE}>Percentage (%)</option>
                <option value={COUPON_DISCOUNT_TYPES.FLAT}>Flat (₹)</option>
              </select>
            </div>
            <Input
              label={form.discountType === COUPON_DISCOUNT_TYPES.PERCENTAGE ? 'Discount (%)' : 'Discount (₹)'}
              type="number"
              min="0"
              step="0.01"
              value={form.discountValue}
              onChange={(e) => setForm((p) => ({ ...p, discountValue: Number(e.target.value) }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Applicable services</label>
            <div className="flex flex-wrap gap-2">
              {COUPON_APPLICABLE_SERVICE_LIST.map((svc) => {
                const selected = form.applicableTo.includes(svc);
                return (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => toggleApplicable(svc)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface border-border-light text-text-secondary'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 inline mr-1" />}
                    {COUPON_APPLICABLE_SERVICE_LABELS[svc]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Min order (₹)"
              type="number"
              min="0"
              value={form.minOrderAmount}
              onChange={(e) => setForm((p) => ({ ...p, minOrderAmount: Number(e.target.value) }))}
            />
            <Input
              label="Max discount (₹, for % only)"
              type="number"
              min="0"
              value={form.maxDiscountAmount}
              onChange={(e) => setForm((p) => ({ ...p, maxDiscountAmount: Number(e.target.value) }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Max uses (blank = unlimited)"
              type="number"
              min="1"
              value={form.maxUses}
              onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
            />
            <Input
              label="Expires at (optional)"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Active</span>
            <Toggle
              checked={form.isActive}
              onChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" loading={submitting}>
              {editing ? 'Save changes' : 'Create coupon'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!analyticsCoupon}
        onClose={() => {
          setAnalyticsCoupon(null);
          setAnalytics(null);
        }}
        title={analyticsCoupon ? `Analytics · ${analyticsCoupon.code}` : 'Coupon analytics'}
        size="3xl"
      >
        {analyticsLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : analytics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Completed (counted)"
                value={analytics.summary?.completedTrips || 0}
              />
              <Stat
                label="Applications"
                value={analytics.summary?.totalApplications || 0}
              />
              <Stat
                label="Not counted"
                value={analytics.summary?.cancelledOrUnfulfilled || 0}
              />
              <Stat
                label="Absorbed discount"
                value={`₹${Number(analytics.summary?.absorbedDiscountTotal || 0).toLocaleString('en-IN')}`}
              />
            </div>
            <p className="text-xs text-text-muted">
              Usage limit only increments on completed trips. Cancelled and
              no-driver bookings are listed but do not burn the coupon.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border-light max-h-[50vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-secondary">
                  <tr className="border-b border-border-light text-left text-text-secondary">
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Discount</th>
                    <th className="px-3 py-2">Counted</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics.redemptions || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-text-muted">
                        No trips have used this coupon yet.
                      </td>
                    </tr>
                  ) : (
                    analytics.redemptions.map((row) => (
                      <tr key={row.bookingId} className="border-b border-border-light last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.bookingNumber}
                          <div className="text-[10px] text-text-muted capitalize">
                            {row.serviceType}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-text">
                            {row.user?.name || '—'}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {row.user?.phone || row.user?.email || ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 capitalize text-text-secondary">
                          {String(row.status || '').replace(/_/g, ' ')}
                        </td>
                        <td className="px-3 py-2">
                          ₹{Number(row.couponDiscount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2">
                          {row.countedTowardLimit ? (
                            <span className="text-emerald-700 text-xs font-semibold">Yes</span>
                          ) : (
                            <span className="text-amber-700 text-xs font-semibold">No</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-border-light bg-surface-secondary/40 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm font-bold text-text mt-0.5">{value}</p>
    </div>
  );
}

export default ManageCoupons;
