import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import {
  useAdminKitOrderDetailStore,
  useAdminKitOrdersStore,
} from '../../../store/admin/useAdminKitOrdersStore';
import { SectionCard, InfoGrid } from '../components/DetailBlocks';
import KitOrderActions from '../components/ManageKitOrders/KitOrderActions';
import PaymentDetailsCard from '../components/ManageKitOrders/PaymentDetailsCard';
import KitOrderItemsList from '../../driver/kit/components/KitOrderItemsList';
import {
  PAYMENT_STATUS_LABELS,
  ADMIN_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
} from '../../../constants/kitStatus';

const formatDate = (d) => (d ? new Date(d).toLocaleString() : '—');

const KitOrderDetailPage = () => {
  const { orderId } = useParams();
  const queryParams = useMemo(() => ({ orderId }), [orderId]);
  const cacheKey = buildCacheKey('kit-order-detail', queryParams);

  const { data: order, loading, error, refetch } = useCachedQuery(
    useAdminKitOrderDetailStore,
    cacheKey,
    queryParams,
    { enabled: Boolean(orderId) },
  );

  const invalidateAfterReview = () => {
    useAdminKitOrdersStore.getState().invalidate('admin-kit-orders');
  };

  const handleSuccess = () => {
    invalidateAfterReview();
    refetch();
  };

  if (loading && !order) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-rose-600">{error || 'Order not found'}</p>
      </div>
    );
  }

  const driver = order.driverId;

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <BackLink />
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border p-4 sm:p-6">
        <p className="font-mono text-xs sm:text-sm text-slate-500">{order.orderNumber}</p>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{order.kitSnapshot?.name}</h1>
        <p className="text-lg sm:text-xl font-bold text-slate-900 mt-2">₹{order.amount?.toLocaleString('en-IN')}</p>
      </div>

      <PaymentDetailsCard order={order} />

      <KitOrderActions
        order={order}
        onSuccess={handleSuccess}
        onReviewComplete={invalidateAfterReview}
      />

      <SectionCard title="Ordered items">
        <KitOrderItemsList
          selections={order.itemSelections || order.kitSnapshot?.itemSelections}
        />
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Status">
          <InfoGrid
            items={[
              { label: 'Payment', value: PAYMENT_STATUS_LABELS[order.paymentStatus] },
              { label: 'Admin approval', value: ADMIN_STATUS_LABELS[order.adminStatus] },
              { label: 'Fulfillment', value: FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus] },
              { label: 'Created', value: formatDate(order.createdAt) },
              { label: 'Reviewed', value: formatDate(order.reviewedAt) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Driver">
          <InfoGrid
            items={[
              { label: 'Name', value: driver?.name },
              { label: 'Phone', value: driver?.phone },
              { label: 'Email', value: driver?.email || '—' },
            ]}
          />
          {driver?._id && (
            <Link
              to={`/admin/drivers/${driver._id}/profile`}
              className="inline-block mt-4 text-sm font-semibold text-primary"
            >
              View driver profile →
            </Link>
          )}
        </SectionCard>

        <SectionCard title="Shipping">
          <InfoGrid
            items={[
              { label: 'Address', value: order.shippingAddress?.line1 },
              { label: 'City', value: order.shippingAddress?.city },
              { label: 'State', value: order.shippingAddress?.state },
              { label: 'PIN', value: order.shippingAddress?.pincode },
            ]}
          />
        </SectionCard>

        {order.tracking?.trackingId && (
          <SectionCard title="Tracking">
            <InfoGrid
              items={[
                { label: 'Carrier', value: order.tracking.carrier },
                { label: 'Tracking ID', value: order.tracking.trackingId },
                { label: 'URL', value: order.tracking.trackingUrl || '—' },
                { label: 'Dispatched', value: formatDate(order.tracking.dispatchedAt) },
                { label: 'Delivered', value: formatDate(order.tracking.deliveredAt) },
              ]}
            />
          </SectionCard>
        )}
      </div>

      {order.statusHistory?.length > 0 && (
        <SectionCard title="History">
          <ul className="space-y-2">
            {order.statusHistory.map((h, i) => (
              <li key={i} className="text-xs text-slate-600 border-b border-slate-50 pb-2">
                <span className="font-semibold">{h.field}</span>: {h.from || '—'} → {h.to}
                {h.note ? ` — ${h.note}` : ''}
                <span className="text-slate-400 block">{formatDate(h.at)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
};

function BackLink() {
  return (
    <Link to="/admin/kit-orders" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
      <ArrowLeft className="w-4 h-4" />
      Back to kit orders
    </Link>
  );
}

export default KitOrderDetailPage;
