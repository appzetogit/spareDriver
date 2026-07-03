import { useEffect, useMemo, useState } from 'react';
import { MapPin, Phone, ShieldCheck, Eye, Search, Filter, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../../../components/Badge';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Select from '../../../components/Select';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { useAdminSosStore, resolveSosAlert, fetchSosDetail } from '../../../store/admin/useAdminSosStore';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import SosLiveMapModal from '../components/SosLiveMapModal';
import RowActionsMenu from '../components/RowActionsMenu';
import { useSocketEvent } from '../../../hooks/useSocket';
import { SOS_SOCKET_EVENTS } from '../../../constants/sos';

const STATUS_BADGE = {
  ACTIVE: 'danger',
  RESOLVED: 'success',
};

const ManageSosAlerts = () => {
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mapAlert, setMapAlert] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
  };

  const handleStatusChange = (val) => {
    setStatusFilter(val);
    setPage(1);
  };

  const queryParams = useMemo(
    () => ({ page, limit, status: statusFilter, search: debouncedSearch }),
    [page, limit, statusFilter, debouncedSearch],
  );

  const cacheKey = buildCacheKey('admin-sos', queryParams);
  const { data, loading, refetch } = useCachedQuery(
    useAdminSosStore,
    cacheKey,
    queryParams,
  );

  const alerts = data?.alerts ?? [];
  const pagination = data?.pagination ?? { total: 0, pages: 1 };

  useSocketEvent(SOS_SOCKET_EVENTS.NEW_SOS, () => {
    refetch();
  });

  useSocketEvent(SOS_SOCKET_EVENTS.SOS_LOCATION, (payload) => {
    setMapAlert((prev) => {
      if (!prev || String(prev._id) !== String(payload.sosId)) return prev;
      return {
        ...prev,
        currentLocation: payload.currentLocation || {
          lat: payload.latitude,
          lng: payload.longitude,
        },
      };
    });
    refetch();
  });

  useSocketEvent(SOS_SOCKET_EVENTS.SOS_RESOLVED, () => {
    refetch();
  });

  const openLiveMap = async (row) => {
    setMapLoading(true);
    try {
      const detail = await fetchSosDetail(row._id);
      setMapAlert(detail?.alert || row);
    } catch {
      setMapAlert(row);
    } finally {
      setMapLoading(false);
    }
  };

  const handleResolve = async (alert) => {
    setResolvingId(alert._id);
    try {
      await resolveSosAlert(alert._id);
      toast.success('SOS resolved');
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to resolve SOS');
    } finally {
      setResolvingId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'passengerName',
        label: 'Passenger',
        render: (val) => <span className="font-medium">{val || '—'}</span>,
      },
      {
        key: 'driverName',
        label: 'Driver',
        render: (val) => val || '—',
      },
      {
        key: 'vehicleNumber',
        label: 'Vehicle',
        render: (val) => (
          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{val || '—'}</span>
        ),
      },
      {
        key: 'tripId',
        label: 'Trip ID',
        render: (_val, row) => (
          <span className="font-mono text-xs">{row.bookingNumber || String(row.tripId).slice(-8)}</span>
        ),
      },
      {
        key: 'currentLocation',
        label: 'Location',
        render: (loc) =>
          loc ? (
            <a
              href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 text-xs hover:underline"
            >
              <MapPin className="w-3.5 h-3.5" />
              View
            </a>
          ) : (
            '—'
          ),
      },
      {
        key: 'createdAt',
        label: 'Created',
        render: (val) =>
          val
            ? new Date(val).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—',
      },
      {
        key: 'status',
        label: 'Status',
        render: (val) => <Badge variant={STATUS_BADGE[val] || 'default'}>{val}</Badge>,
      },
      {
        key: 'actions',
        label: 'Actions',
        sortable: false,
        unclamp: true,
        render: (_val, row) => {
          const actionItems = [
            {
              label: 'Map',
              icon: Eye,
              onClick: () => openLiveMap(row),
            },
          ];

          if (row.passengerPhone) {
            actionItems.push({
              label: 'Call Passenger',
              icon: Phone,
              onClick: () => {
                window.location.href = `tel:+91${String(row.passengerPhone).replace(/\D/g, '')}`;
              },
            });
          }

          if (row.driverPhone) {
            actionItems.push({
              label: 'Call Driver',
              icon: Phone,
              onClick: () => {
                window.location.href = `tel:+91${String(row.driverPhone).replace(/\D/g, '')}`;
              },
            });
          }

          if (row.status === 'ACTIVE') {
            actionItems.push({
              label: 'Resolve',
              icon: ShieldCheck,
              variant: 'danger',
              onClick: () => handleResolve(row),
            });
          }

          return <RowActionsMenu items={actionItems} />;
        },
      },
    ],
    [resolvingId, mapLoading],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SOS Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor emergency alerts and resolve incidents in real time.
          </p>
        </div>
      </div>

      <Card padding="p-4" className="bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          {/* SEARCH */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by passenger, driver, vehicle or booking..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full h-10 pl-11 pr-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>

          {/* STATUS/STATE SELECT */}
          <div className="w-full sm:w-56">
            <Select
              value={statusFilter}
              onChange={handleStatusChange}
              placeholder="All States/Statuses"
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'RESOLVED', label: 'Resolved' },
              ]}
              icon={Filter}
            />
          </div>

          {/* REFRESH BUTTON */}
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </Card>

      <ServerPaginatedTable
        columns={columns}
        data={alerts}
        loading={loading}
        limit={limit}
        page={page}
        pagination={pagination}
        onPageChange={setPage}
        entityLabel="alerts"
        emptyMessage="No SOS alerts found"
      />

      <SosLiveMapModal
        alert={mapAlert}
        isOpen={!!mapAlert}
        onClose={() => setMapAlert(null)}
      />
    </div>
  );
};

export default ManageSosAlerts;
