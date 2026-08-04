import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminKitOrdersStore } from '../../../store/admin/useAdminKitOrdersStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageTaskAssignment } from '../../../constants/staffRoles';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import KitOrderFilters from '../components/ManageKitOrders/KitOrderFilters';
import TaskAssigneeBadge from '../components/ManageTasks/TaskAssigneeBadge';
import BulkAssignBar, {
  runBulkAssignFromRows,
} from '../components/ManageTasks/BulkAssignBar';
import { isOpenTask } from '../components/ManageTasks/taskUtils';
import {
  PAYMENT_STATUS_LABELS,
  ADMIN_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
} from '../../../constants/kitStatus';

const ManageKitOrders = () => {
  const navigate = useNavigate();
  const { admin } = useAdminAuthStore();
  const canAssign = canManageTaskAssignment(admin?.role);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selected, setSelected] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo(
    () => ({
      page,
      limit,
      search: debouncedSearch,
      status: statusFilter,
      assigneeId: assigneeFilter || undefined,
    }),
    [page, limit, debouncedSearch, statusFilter, assigneeFilter],
  );
  const cacheKey = buildCacheKey('admin-kit-orders', queryParams);

  const { data, loading, error, refetch } = useCachedQuery(
    useAdminKitOrdersStore,
    cacheKey,
    queryParams,
  );

  const orders = data?.orders ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkAssign = async (assigneeId) => {
    setBulkLoading(true);
    try {
      const ok = await runBulkAssignFromRows({
        rows: orders,
        selectedIds: selected,
        assigneeId,
        onSuccess: () => {
          setSelected([]);
          refetch();
        },
      });
      if (!ok) return;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk assign failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const columns = useMemo(
    () => [
      ...(canAssign
        ? [
            {
              key: '_select',
              label: '',
              width: '4%',
              render: (_v, row) =>
                isOpenTask(row.reviewTask) ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(row._id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(row._id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300"
                  />
                ) : null,
            },
          ]
        : []),
      {
        key: 'orderNumber',
        label: 'Order',
        width: canAssign ? '14%' : '18%',
        render: (val) => <span className="font-mono text-xs font-semibold text-slate-700">{val}</span>,
      },
      {
        key: 'driverId',
        label: 'Driver',
        width: '22%',
        render: (_, row) => (
          <div>
            <p className="text-sm font-semibold text-slate-800">{row.driverId?.name || '—'}</p>
            <p className="text-xs text-slate-500">{row.driverId?.phone}</p>
          </div>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        width: '12%',
        render: (val) => <span className="text-sm font-medium">₹{val?.toLocaleString('en-IN')}</span>,
      },
      {
        key: 'paymentStatus',
        label: 'Payment',
        width: '16%',
        render: (val, row) => (
          <div>
            <span
              className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                val === 'paid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : val === 'pending'
                    ? 'bg-amber-100 text-amber-800'
                    : val === 'failed'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-100 text-slate-600'
              }`}
            >
              {PAYMENT_STATUS_LABELS[val] || val}
            </span>
            {row.razorpayOrderId && (
              <p className="text-[10px] text-slate-400 mt-1 font-mono truncate max-w-[140px]" title={row.razorpayOrderId}>
                {row.razorpayOrderId}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'adminStatus',
        label: 'Approval',
        width: '12%',
        render: (val) => (
          <span className="text-xs font-semibold text-slate-600">
            {ADMIN_STATUS_LABELS[val] || val}
          </span>
        ),
      },
      {
        key: 'reviewTask',
        label: 'Assigned to',
        width: '14%',
        className: 'hidden md:table-cell',
        render: (_val, row) => <TaskAssigneeBadge task={row.reviewTask} compact />,
      },
      {
        key: 'fulfillmentStatus',
        label: 'Delivery',
        width: '14%',
        className: 'hidden lg:table-cell',
        render: (val) => (
          <span className="text-xs text-slate-500">
            {FULFILLMENT_STATUS_LABELS[val] || val}
          </span>
        ),
      },
    ],
    [canAssign, selected],
  );

  return (
    <div className="space-y-6 animate-fade-in-up">
      <KitOrderFilters
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
          setSelected([]);
        }}
        statusFilter={statusFilter}
        onStatusChange={(v) => {
          setStatusFilter(v);
          setPage(1);
          setSelected([]);
        }}
        assigneeFilter={assigneeFilter}
        onAssigneeChange={(v) => {
          setAssigneeFilter(v);
          setPage(1);
          setSelected([]);
        }}
        onRefresh={refetch}
        refreshing={loading}
      />

      {canAssign && (
        <BulkAssignBar
          selectedCount={selected.length}
          onAssign={handleBulkAssign}
          loading={bulkLoading}
        />
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ServerPaginatedTable
        columns={columns}
        data={orders}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={(p) => {
          setPage(p);
          setSelected([]);
        }}
        onRowClick={(row) => navigate(`/admin/kit-orders/${row._id}`)}
        entityLabel="orders"
        emptyMessage="No kit orders found"
      />
    </div>
  );
};

export default ManageKitOrders;
