import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Sparkles, Check, UserCheck, FileText, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import Button from '../../../components/Button';
import Input from '../../../components/Input';
import Toggle from '../../../components/Toggle';
import Modal from '../../../components/Modal';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminSubscriptionsStore } from '../../../store/admin/useAdminSubscriptionsStore';
import { SUBSCRIPTION_DISCOUNT_TYPES } from '../../../constants/serviceTypes';
import { formatCurrency, calculateSubscriptionCheckout } from '../../../utils/fareCalculator';

const emptyForm = {
  name: '',
  durationMonths: 1,
  price: 0,
  includedHoursPerDay: 0,
  bookingDiscountType: SUBSCRIPTION_DISCOUNT_TYPES.PERCENTAGE,
  bookingDiscountValue: 0,
  bookingDiscountMinAmount: 0,
  serviceChargePercent: 0,
  gstPercent: 18,
  platformSharePercent: 50,
  driverSharePercent: 50,
  description: '',
  features: [],
  isActive: true,
  sortOrder: 0,
};

const emptyDispatch = {
  AUTO_SEARCH_ENABLED: true,
  ESCALATE_MINUTES: 1440,
  INBOX_BROADCAST_LIMIT: 50,
  SEARCH_RADIUS_METERS: 25000,
};

const ManageSubscriptions = () => {
  const cacheKey = buildCacheKey('admin-subscription-plans', {});
  const { data, loading, refetch } = useCachedQuery(
    useAdminSubscriptionsStore,
    cacheKey,
    {},
  );
  const plans = Array.isArray(data) ? data : [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [featureInput, setFeatureInput] = useState('');
  const [termsForm, setTermsForm] = useState({ title: '', content: '' });
  const [termsLoading, setTermsLoading] = useState(true);
  const [termsSaving, setTermsSaving] = useState(false);
  const [dispatchForm, setDispatchForm] = useState(emptyDispatch);
  const [dispatchLoading, setDispatchLoading] = useState(true);
  const [dispatchSaving, setDispatchSaving] = useState(false);

  useEffect(() => {
    setTermsLoading(true);
    api.get('/admin/settings/legal-documents?type=subscription')
      .then((res) => {
        const docs = res?.data?.data || [];
        const active = docs.find((d) => d.isActive) || docs[0];
        if (active) {
          setTermsForm({ title: active.title || '', content: active.content || '' });
        }
      })
      .catch(() => {})
      .finally(() => setTermsLoading(false));
  }, []);

  useEffect(() => {
    setDispatchLoading(true);
    api.get('/admin/settings/subscription-dispatch')
      .then((res) => {
        const cfg = res?.data?.data || {};
        setDispatchForm({ ...emptyDispatch, ...cfg });
      })
      .catch(() => {})
      .finally(() => setDispatchLoading(false));
  }, []);

  const saveDispatch = async () => {
    setDispatchSaving(true);
    try {
      const res = await api.put('/admin/settings/subscription-dispatch', dispatchForm);
      setDispatchForm({ ...emptyDispatch, ...(res?.data?.data || {}) });
      toast.success('Driver search settings saved');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save search settings');
    } finally {
      setDispatchSaving(false);
    }
  };

  const saveTerms = async () => {
    if (!termsForm.title.trim() || !termsForm.content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    setTermsSaving(true);
    try {
      await api.post('/admin/settings/subscription-terms', termsForm);
      toast.success('Subscription terms saved');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save terms');
    } finally {
      setTermsSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFeatureInput('');
    setShowModal(true);
  };

  const openEdit = (plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      durationMonths: plan.durationMonths,
      price: plan.price,
      includedHoursPerDay: plan.includedHoursPerDay || 0,
      bookingDiscountType: plan.bookingDiscountType || SUBSCRIPTION_DISCOUNT_TYPES.PERCENTAGE,
      bookingDiscountValue: plan.bookingDiscountValue || 0,
      bookingDiscountMinAmount: plan.bookingDiscountMinAmount || 0,
      serviceChargePercent: plan.serviceChargePercent ?? 0,
      gstPercent: plan.gstPercent ?? 18,
      platformSharePercent: plan.platformSharePercent ?? 50,
      driverSharePercent: plan.driverSharePercent ?? 50,
      description: plan.description || '',
      features: plan.features || [],
      isActive: plan.isActive,
      sortOrder: plan.sortOrder || 0,
    });
    setFeatureInput('');
    setShowModal(true);
  };

  const addFeature = () => {
    const v = featureInput.trim();
    if (!v) return;
    setForm((prev) => ({ ...prev, features: [...prev.features, v] }));
    setFeatureInput('');
  };

  const removeFeature = (idx) =>
    setForm((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== idx),
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/admin/pricing/subscriptions/${editing._id}`, form);
        toast.success('Subscription plan updated');
      } else {
        await api.post('/admin/pricing/subscriptions', form);
        toast.success('Subscription plan created');
      }
      setShowModal(false);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (plan) => {
    if (!window.confirm(`Delete "${plan.name}"? Existing subscribers keep their plan snapshot.`)) return;
    setDeletingId(plan._id);
    try {
      await api.delete(`/admin/pricing/subscriptions/${plan._id}`);
      toast.success('Plan deleted');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete plan');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Subscription plans</h1>
          <p className="text-sm text-slate-500 mt-1">
            Each plan assigns a dedicated driver to the subscriber and can give a discount on
            additional (non-dedicated) bookings.
          </p>
        </div>
        <Button variant="admin" size="md" onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add plan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && plans.length === 0 && (
          <p className="text-sm text-slate-500 col-span-full">Loading plans…</p>
        )}
        {!loading && plans.length === 0 && (
          <p className="text-sm text-slate-500 p-8 text-center bg-white rounded-2xl border col-span-full">
            No subscription plans yet
          </p>
        )}
        {plans?.map((plan) => (
          <div
            key={plan._id}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.durationMonths} month(s)</p>
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                  plan.isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {plan.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{formatCurrency(plan.price)}</span>
              <span className="text-xs text-slate-500">/ {plan.durationMonths} mo</span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-slate-700">
                  Dedicated driver{' '}
                  {plan.includedHoursPerDay > 0
                    ? `· ${plan.includedHoursPerDay}h/day`
                    : '· Always available'}
                </p>
              </div>
              {plan.bookingDiscountValue > 0 && (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-slate-700">
                    {plan.bookingDiscountType === 'percentage'
                      ? `${plan.bookingDiscountValue}% off`
                      : `${formatCurrency(plan.bookingDiscountValue)} off`}{' '}
                    on additional bookings
                  </p>
                </div>
              )}
            </div>

            {plan.features?.length > 0 && (
              <ul className="space-y-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-1 mt-auto pt-1">
              <button
                type="button"
                onClick={() => openEdit(plan)}
                className="flex-1 p-2 hover:bg-slate-100 rounded-xl text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(plan)}
                disabled={deletingId === plan._id}
                className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                title="Delete plan"
              >
                <Trash2
                  className={`w-4 h-4 ${deletingId === plan._id ? 'animate-pulse' : ''}`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Dedicated-driver auto-search</h2>
            <p className="text-xs text-slate-500">
              After a customer pays, matching online drivers see the request in Incoming.
              Unmatched subscriptions escalate to manual assignment after the window below.
            </p>
          </div>
        </div>
        {dispatchLoading ? (
          <p className="text-sm text-slate-500">Loading search settings…</p>
        ) : (
          <div className="space-y-4">
            <Toggle
              label="Enable auto-search"
              checked={!!dispatchForm.AUTO_SEARCH_ENABLED}
              onChange={(v) =>
                setDispatchForm((f) => ({ ...f, AUTO_SEARCH_ENABLED: v }))
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                label="Escalate after (minutes)"
                type="number"
                min={5}
                value={dispatchForm.ESCALATE_MINUTES}
                onChange={(e) =>
                  setDispatchForm((f) => ({
                    ...f,
                    ESCALATE_MINUTES: Number(e.target.value),
                  }))
                }
                helper="Default 1440 = 24 hours"
              />
              <Input
                label="Broadcast limit"
                type="number"
                min={1}
                max={100}
                value={dispatchForm.INBOX_BROADCAST_LIMIT}
                onChange={(e) =>
                  setDispatchForm((f) => ({
                    ...f,
                    INBOX_BROADCAST_LIMIT: Number(e.target.value),
                  }))
                }
              />
              <Input
                label="Search radius (meters)"
                type="number"
                min={1000}
                step={1000}
                value={dispatchForm.SEARCH_RADIUS_METERS}
                onChange={(e) =>
                  setDispatchForm((f) => ({
                    ...f,
                    SEARCH_RADIUS_METERS: Number(e.target.value),
                  }))
                }
              />
            </div>
            <Button variant="admin" onClick={saveDispatch} disabled={dispatchSaving}>
              {dispatchSaving ? 'Saving…' : 'Save search settings'}
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Subscription terms & conditions</h2>
            <p className="text-xs text-slate-500">
              Customers must accept these before purchasing. A new version is sent on driver assignment.
            </p>
          </div>
        </div>
        {termsLoading ? (
          <p className="text-sm text-slate-500">Loading terms…</p>
        ) : (
          <>
            <Input
              label="Title"
              value={termsForm.title}
              onChange={(e) => setTermsForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Subscription Terms & Conditions"
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
              <textarea
                value={termsForm.content}
                onChange={(e) => setTermsForm((f) => ({ ...f, content: e.target.value }))}
                rows={10}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter the full terms customers must accept…"
              />
            </div>
            <Button variant="admin" onClick={saveTerms} disabled={termsSaving}>
              {termsSaving ? 'Saving…' : 'Save terms'}
            </Button>
          </>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit subscription plan' : 'New subscription plan'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <Input
            label="Plan name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Monthly Chauffeur"
            required
          />

          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Personal full-time driver, plus discount on extra bookings"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Duration (months)"
              type="number"
              min={1}
              value={form.durationMonths}
              onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
              required
            />
            <Input
              label="Plan price (₹)"
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              required
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Dedicated driver</p>
              <p className="text-xs text-slate-500">
                Each subscriber is assigned a full-time driver by ops after payment.
              </p>
            </div>
            <Input
              label="Included hours per day (0 = always available)"
              type="number"
              min={0}
              max={24}
              value={form.includedHoursPerDay}
              onChange={(e) =>
                setForm({ ...form, includedHoursPerDay: Number(e.target.value) })
              }
              helper="E.g. 8h/day for office commute. Beyond this, the subscriber pays per-hour rates (with discount)."
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Discount on additional bookings</p>
              <p className="text-xs text-slate-500">
                Applied when the subscriber books any other ride (e.g. their dedicated driver is on
                leave, or they need a second vehicle).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text">Discount type</span>
                <select
                  className="h-12 px-3 bg-white border border-border rounded-xl text-sm"
                  value={form.bookingDiscountType}
                  onChange={(e) => setForm({ ...form, bookingDiscountType: e.target.value })}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat (₹)</option>
                </select>
              </label>
              <Input
                label={
                  form.bookingDiscountType === 'percentage' ? 'Discount (%)' : 'Discount (₹)'
                }
                type="number"
                min={0}
                value={form.bookingDiscountValue}
                onChange={(e) =>
                  setForm({ ...form, bookingDiscountValue: Number(e.target.value) })
                }
              />
            </div>
            <Input
              label="Minimum booking amount for discount (₹)"
              type="number"
              min={0}
              value={form.bookingDiscountMinAmount}
              onChange={(e) =>
                setForm({ ...form, bookingDiscountMinAmount: Number(e.target.value) })
              }
              helper="Discount applies only when the ride subtotal is at least this amount."
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-xl space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Checkout fees & revenue split</p>
              <p className="text-xs text-slate-500">
                Customer pays base + service charge + GST. Platform and driver shares are calculated on the base price.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Service charge (%)"
                type="number"
                min={0}
                max={100}
                value={form.serviceChargePercent}
                onChange={(e) =>
                  setForm({ ...form, serviceChargePercent: Number(e.target.value) })
                }
              />
              <Input
                label="GST (%)"
                type="number"
                min={0}
                max={100}
                value={form.gstPercent}
                onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) })}
              />
              <Input
                label="Platform share (%)"
                type="number"
                min={0}
                max={100}
                value={form.platformSharePercent}
                onChange={(e) => {
                  const platformSharePercent = Number(e.target.value);
                  setForm({
                    ...form,
                    platformSharePercent,
                    driverSharePercent: Math.max(0, 100 - platformSharePercent),
                  });
                }}
              />
              <Input
                label="Driver share (%)"
                type="number"
                min={0}
                max={100}
                value={form.driverSharePercent}
                onChange={(e) => {
                  const driverSharePercent = Number(e.target.value);
                  setForm({
                    ...form,
                    driverSharePercent,
                    platformSharePercent: Math.max(0, 100 - driverSharePercent),
                  });
                }}
              />
            </div>
            {form.price > 0 && (
              <CheckoutPreview plan={form} />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-text">Features (shown to users)</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Priority support"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFeature();
                  }
                }}
                className="flex-1 h-12 px-3 bg-white border border-border rounded-xl text-sm"
              />
              <Button variant="outline" size="md" type="button" onClick={addFeature}>
                Add
              </Button>
            </div>
            {form.features.length > 0 && (
              <ul className="space-y-1.5 mt-2">
                {form.features.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-slate-700">{f}</span>
                    <button
                      type="button"
                      onClick={() => removeFeature(i)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <span className="text-sm font-semibold">Active</span>
            <Toggle
              checked={form.isActive}
              onChange={(v) => setForm({ ...form, isActive: v })}
            />
          </div>

          <div className="pt-2 flex gap-3 sticky bottom-0 bg-white pb-1">
            <Button
              variant="outline"
              size="md"
              fullWidth
              type="button"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button variant="admin" size="md" fullWidth type="submit" loading={submitting}>
              {editing ? 'Update plan' : 'Create plan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

function CheckoutPreview({ plan }) {
  const checkout = calculateSubscriptionCheckout(plan);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1.5">
      <p className="font-semibold text-slate-800">Checkout preview</p>
      <div className="flex justify-between text-slate-600">
        <span>Customer pays</span>
        <span className="font-bold text-slate-900">{formatCurrency(checkout.totalPayable)}</span>
      </div>
      <div className="flex justify-between text-slate-500">
        <span>Platform keeps (base)</span>
        <span>{formatCurrency(checkout.platformShareRupees)}</span>
      </div>
      <div className="flex justify-between text-slate-500">
        <span>Driver gets on assign (base)</span>
        <span>{formatCurrency(checkout.driverShareRupees)}</span>
      </div>
    </div>
  );
}

export default ManageSubscriptions;
