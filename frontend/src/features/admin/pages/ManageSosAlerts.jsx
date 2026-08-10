import { useEffect, useMemo, useState } from 'react';
import { MapPin, Phone, ShieldCheck, Eye, Search, Filter, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../../../components/Badge';
import Card from '../../../components/Card';
import Select from '../../../components/Select';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import {
  useAdminSosStore,
  resolveSosAlert,
  fetchSosDetail,
  assignSosAlert,
} from '../../../store/admin/useAdminSosStore';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { canManageTaskAssignment } from '../../../constants/staffRoles';
import ServerPaginatedTable from '../components/ServerPaginatedTable';
import SosLiveMapModal from '../components/SosLiveMapModal';
import RowActionsMenu from '../components/RowActionsMenu';
import AssigneeBadge from '../components/AssigneeBadge';
import AssignToTeamMemberControl from '../components/AssignToTeamMemberControl';
import { useSocketEvent } from '../../../hooks/useSocket';
import { SOS_SOCKET_EVENTS } from '../../../constants/sos';

const STATUS_BADGE = {
  ACTIVE: 'danger',
  RESOLVED: 'success',
};

const ManageSosAlerts = () => {
  const { admin } = useAdminAuthStore();
  const canAssign = canManageTaskAssignment(admin?.role);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mapAlert, setMapAlert] = useState(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [assigningId, setAssigningId] = useState(null);

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

  const handleAssign = async (alert, assigneeId) => {
    setAssigningId(alert._id);
    try {
      await assignSosAlert(alert._id, { assigneeId });
      toast.success('SOS assigned');
      refetch();
    } catch (err) {
      throw err;
    } finally {
      setAssigningId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: 'passengerName',
        label: 'Passenger',
        unclamp: true,
        render: (val, row) => (
          <div className="space-y-1 min-w-0 py-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-xs sm:text-sm text-slate-900">{val || '—'}</span>
              {row.passengerPhone && (
                <span className="text-[11px] text-slate-500 flex items-center gap-0.5 sm:hidden">
                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                  {row.passengerPhone}
                </span>
              )}
            </div>

            {/* Mobile-only compact details stack */}
            <div className="sm:hidden space-y-1 pt-1 text-[11px] text-slate-600">
              <p className="truncate">
                <span className="text-slate-400">Driver:</span>{' '}
                <span className="font-medium text-slate-800">{row.driverName || '—'}</span>
                {row.driverPhone ? <span className="text-slate-500"> ({row.driverPhone})</span> : ''}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {row.vehicleNumber && (
                  <span className="font-mono bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-[10px]">
                    {row.vehicleNumber}
                  </span>
                )}
                {(row.bookingNumber || row.tripId) && (
                  <span className="font-mono text-slate-500 text-[10px]">
                    #{row.bookingNumber || String(row.tripId).slice(-8)}
                  </span>
                )}
                {row.currentLocation && (
                  <a
                    href={`https://maps.google.com/?q=${row.currentLocation.lat},${row.currentLocation.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-blue-600 font-medium hover:underline text-[10px]"
                  >
                    <MapPin className="w-3 h-3" />
                    Map
                  </a>
                )}
                {row.createdAt && (
                  <span className="text-[10px] text-slate-400">
                    · {new Date(row.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
              {(row.assignedTo || canAssign) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <AssigneeBadge assignedTo={row.assignedTo} compact />
                  {canAssign && row.status === 'ACTIVE' && (
                    <AssignToTeamMemberControl
                      compact
                      disabled={assigningId === row._id}
                      onAssign={(assigneeId) => handleAssign(row, assigneeId)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'driverName',
        label: 'Driver',
        className: 'hidden sm:table-cell',
        render: (val) => val || '—',
      },
      {
        key: 'vehicleNumber',
        label: 'Vehicle',
        className: 'hidden md:table-cell',
        render: (val) => (
          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{val || '—'}</span>
        ),
      },
      {
        key: 'tripId',
        label: 'Trip ID',
        className: 'hidden lg:table-cell',
        render: (_val, row) => (
          <span className="font-mono text-xs">{row.bookingNumber || String(row.tripId).slice(-8)}</span>
        ),
      },
      {
        key: 'assignedTo',
        label: 'Assignee',
        className: 'hidden md:table-cell',
        render: (_val, row) => (
          <div className="space-y-2 min-w-[160px]">
            <AssigneeBadge assignedTo={row.assignedTo} compact />
            {canAssign && row.status === 'ACTIVE' && (
              <AssignToTeamMemberControl
                compact
                disabled={assigningId === row._id}
                onAssign={(assigneeId) => handleAssign(row, assigneeId)}
              />
            )}
          </div>
        ),
      },
      {
        key: 'currentLocation',
        label: 'Location',
        className: 'hidden sm:table-cell',
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
        className: 'hidden md:table-cell',
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
        unclamp: true,
        render: (val) => <Badge variant={STATUS_BADGE[val] || 'default'}>{val}</Badge>,
      },
      {
        key: 'actions',
        label: <span className="hidden sm:inline">Actions</span>,
        compact: true,
        sortable: false,
        unclamp: true,
        align: 'right',
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
    [resolvingId, mapLoading, canAssign, assigningId],
  );

  return (
    <div className="space-y-3.5 sm:space-y-6 animate-fade-in-up pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">SOS Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
            Monitor emergency alerts and resolve incidents in real time.
          </p>
        </div>
      </div>

      <Card padding="p-2.5 sm:p-4" className="bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search passenger, driver, vehicle..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <div className="flex-1 min-w-0 sm:w-56">
              <Select
                value={statusFilter}
                onChange={handleStatusChange}
                placeholder="All Statuses"
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'RESOLVED', label: 'Resolved' },
                ]}
                icon={Filter}
              />
            </div>

            <button
              type="button"
              onClick={refetch}
              disabled={loading}
              className="h-10 px-2.5 sm:px-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
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
