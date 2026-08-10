import { useState } from 'react';
import { Clock, Mountain, Settings2, Trash2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../utils/api';
import Button from '../../../components/Button';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminServicePricingStore } from '../../../store/admin/useAdminServicePricingStore';
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_DESCRIPTIONS,
} from '../../../constants/serviceTypes';
import { formatCurrency } from '../../../utils/fareCalculator';
import ServicePricingModal from '../components/ManagePricing/ServicePricingModal';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageServicePricing } from '../../../constants/staffRoles';

const SERVICE_CARDS = [
  { type: SERVICE_TYPES.HOURLY, icon: Clock },
  { type: SERVICE_TYPES.OUTSTATION, icon: Mountain },
];

const ManagePricing = () => {
  const { admin } = useAdminAuthStore();
  const canEdit = canManageServicePricing(admin?.role);
  const cacheKey = buildCacheKey('admin-service-pricings', {});
  const { data, loading, refetch } = useCachedQuery(
    useAdminServicePricingStore,
    cacheKey,
    {},
  );
  const pricings = Array.isArray(data) ? data : [];

  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const pricingByType = pricings.reduce((acc, p) => {
    acc[p.serviceType] = p;
    return acc;
  }, {});

  const handleDelete = async (pricing) => {
    if (
      !window.confirm(
        `Reset pricing for "${pricing.name}"? This will remove all slabs and charges for this service.`,
      )
    ) {
      return;
    }
    setDeletingId(pricing._id);
    try {
      await api.delete(`/admin/pricing/services/${pricing._id}`);
      toast.success('Pricing reset');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset pricing');
    } finally {
      setDeletingId(null);
    }
  };

  const renderSummary = (pricing) => {
    if (pricing.serviceType === SERVICE_TYPES.HOURLY) {
      const cheapest = pricing.slabs?.length
        ? [...pricing.slabs].sort((a, b) => a.price - b.price)[0]
        : null;
      const priciest = pricing.slabs?.length
        ? [...pricing.slabs].sort((a, b) => b.price - a.price)[0]
        : null;
      return (
        <>
          <Row label="Slabs" value={pricing.slabs?.length || 0} />
          {cheapest && priciest && (
            <Row
              label="Price range"
              value={`${formatCurrency(cheapest.price)} – ${formatCurrency(priciest.price)}`}
            />
          )}
          <Row label="Extra hour" value={formatCurrency(pricing.extraHourCharge || 0)} />
        </>
      );
    }
    // Outstation
    const o = pricing.outstation || {};
    const foodPerDay = Number(o.foodAllowancePerDay) || 0;
    const stayPerNight = Number(o.stayAllowancePerNight) || 0;
    const legacyAllowance = Number(o.allowancePerNight) || 0;
    // Prefer the split fields; only show the legacy combined number if
    // the admin hasn't migrated yet (and the engine is still using it).
    const hasSplit = foodPerDay > 0 || stayPerNight > 0;
    return (
      <>
        <Row label="Daily rate" value={`${formatCurrency(o.dailyRate || 0)}/day`} />
        {hasSplit ? (
          <>
            <Row
              label="Food allowance"
              value={`${formatCurrency(foodPerDay)}/day`}
            />
            <Row
              label="Stay allowance"
              value={`${formatCurrency(stayPerNight)}/night`}
            />
          </>
        ) : (
          <Row
            label="Allowance (legacy)"
            value={`${formatCurrency(legacyAllowance)}/night`}
          />
        )}
        <Row
          label="Trip length"
          value={`${o.minDays || 1}\u2013${
            o.maxDays > 0 ? o.maxDays : '\u221E'
          } days`}
        />
      </>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pricing &amp; commission</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure each service type: hourly slabs and round trip rates. Fare engine and live
            billing use these values during booking and checkout.
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          View only — only the super admin can edit service pricing.
        </div>
      )}

      {loading && pricings.length === 0 && (
        <p className="text-sm text-slate-500">Loading pricing…</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SERVICE_CARDS.map(({ type, icon: Icon }) => {
          const pricing = pricingByType[type];
          return (
            <div
              key={type}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {SERVICE_TYPE_LABELS[type]}
                    </h3>
                    {pricing ? (
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          pricing.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {pricing.isActive ? 'Active' : 'Inactive'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        Not configured
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {SERVICE_TYPE_DESCRIPTIONS[type]}
              </p>

              {pricing && (
                <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                  {renderSummary(pricing)}
                  <Row label="GST" value={`${pricing.gstPercent || 0}%`} />
                  <Row
                    label="Platform fee · Commission"
                    value={`${
                      pricing.platformFeeType === 'flat'
                        ? `₹${pricing.platformFeeAmount || 0}`
                        : `${pricing.platformFeeAmount || pricing.serviceChargePercent || 0}%`
                    } · ${pricing.platformCommissionPercent || 0}%`}
                  />
                </div>
              )}

              {canEdit && (
                <div className="flex gap-2 mt-auto">
                  <Button
                    variant="admin"
                    size="sm"
                    className="flex-1 flex items-center justify-center gap-1.5"
                    onClick={() => setEditing(type)}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    {pricing ? 'Edit' : 'Configure'}
                  </Button>
                  {pricing && (
                    <button
                      type="button"
                      onClick={() => handleDelete(pricing)}
                      disabled={deletingId === pricing._id}
                      className="p-2.5 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-50"
                      title="Reset pricing"
                    >
                      <Trash2
                        className={`w-4 h-4 ${deletingId === pricing._id ? 'animate-pulse' : ''}`}
                      />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 flex items-center gap-4 text-white">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="text-sm">
          <p className="font-semibold mb-0.5">Subscriptions assign a dedicated driver</p>
          <p className="text-white/60 text-xs">
            Configure subscription plans (full-time driver + booking discount) in Subscription Plans.
          </p>
        </div>
      </div>

      {editing && (
        <ServicePricingModal
          key={`${editing}-${pricingByType[editing]?._id || 'new'}`}
          isOpen
          onClose={() => setEditing(null)}
          serviceType={editing}
          existing={pricingByType[editing] || null}
          onSaved={refetch}
        />
      )}
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold text-slate-900">{value}</span>
  </div>
);

export default ManagePricing;
