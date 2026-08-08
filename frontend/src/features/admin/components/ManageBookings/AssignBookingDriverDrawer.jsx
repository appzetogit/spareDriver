import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react';
import Button from '../../../../components/Button';
import Drawer from '../../../../components/Drawer';
import api from '../../../../utils/api';
import OutstationDriverFilterBar, {
  DEFAULT_DRIVER_FILTERS,
  appendDriverFilterParams,
} from '../OutstationDriverFilterBar';
import AssignDriverPickerRow from '../AssignDriverPickerRow';
import AssignBookingTripSummary from './AssignBookingTripSummary';
import {
  BOOKING_ASSIGN_CONFIG,
  DRIVER_ELIGIBILITY_GUIDE,
  getBookingAssignmentMode,
} from '../../utils/bookingAssignment';

const DEFAULT_LIMIT = 20;
const OUTSTATION_LIMIT = 50;

const AssignBookingDriverDrawer = ({ booking, onClose, onAssigned }) => {
  const mode = getBookingAssignmentMode(booking);
  const config = BOOKING_ASSIGN_CONFIG[mode] || null;
  const eligibility = DRIVER_ELIGIBILITY_GUIDE[mode] || null;
  const isOutstation = mode === 'outstation';
  const isReassign = mode === 'reassign';
  const limit = isOutstation ? OUTSTATION_LIMIT : DEFAULT_LIMIT;

  const [fullBooking, setFullBooking] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(true);
  const [drivers, setDrivers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasGeo, setHasGeo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [driverFilters, setDriverFilters] = useState(DEFAULT_DRIVER_FILTERS);
  const [bookingZones, setBookingZones] = useState([]);
  const [outstationDetail, setOutstationDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const searchRef = useRef(null);

  const displayBooking = fullBooking || booking;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setBookingLoading(true);
    api
      .get(`/admin/bookings/${booking._id}`)
      .then((res) => {
        if (!cancelled) setFullBooking(res?.data?.data?.booking || null);
      })
      .catch(() => {
        if (!cancelled) setFullBooking(null);
      })
      .finally(() => {
        if (!cancelled) setBookingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking._id]);

  const buildDriverParams = useCallback(
    (pageNum) => {
      const params = new URLSearchParams({ limit, page: pageNum });
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
      appendDriverFilterParams(params, driverFilters, { outstation: isOutstation });
      return params;
    },
    [limit, isOutstation, debouncedSearch, driverFilters],
  );

  useEffect(() => {
    if (!config?.detailPath) {
      setOutstationDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    api
      .get(config.detailPath(booking._id))
      .then((res) => {
        if (!cancelled) {
          setOutstationDetail(res?.data?.data || null);
          setDetailError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOutstationDetail(null);
          setDetailError(err?.response?.data?.message || 'Failed to load assignment details');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [booking._id, config]);

  useEffect(() => {
    if (!config) return undefined;
    let cancelled = false;
    setDrivers([]);
    setPage(1);
    setTotal(0);
    setLoading(true);
    setError(null);
    setSelectedDriverId(null);

    api
      .get(`${config.driversPath(booking._id)}?${buildDriverParams(1)}`)
      .then((res) => {
        if (cancelled) return;
        const data = res?.data?.data || {};
        setDrivers(data.drivers || []);
        setTotal(data.total || 0);
        setBookingZones(data.bookingZoneIds || []);
        setHasGeo(data.hasGeo ?? false);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || 'Failed to load drivers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [booking._id, config, buildDriverParams]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await api.get(
        `${config.driversPath(booking._id)}?${buildDriverParams(nextPage)}`,
      );
      const data = res?.data?.data || {};
      setDrivers((prev) => [...prev, ...(data.drivers || [])]);
      setTotal(data.total || 0);
      setPage(nextPage);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load more drivers');
    } finally {
      setLoadingMore(false);
    }
  };

  const selectedDriver = useMemo(
    () => drivers.find((d) => String(d._id) === String(selectedDriverId)) || null,
    [drivers, selectedDriverId],
  );

  const vehicleConflicts = outstationDetail?.vehicleConflicts || [];
  const hasVehicleConflict = isOutstation && vehicleConflicts.length > 0;
  const availableCount = drivers.filter((d) => !d.hasConflict).length;
  const conflictCount = drivers.filter((d) => d.hasConflict).length;
  const bufferMinutes = outstationDetail?.bufferMinutes ?? null;
  const extraCar = outstationDetail?.car || null;

  const zoneOptions = useMemo(() => {
    const fromBooking = (displayBooking?.zoneIds || []).filter((z) => z && typeof z === 'object');
    if (fromBooking.length) return fromBooking;
    return (bookingZones || []).map((id) => ({ _id: id, name: 'Zone' }));
  }, [displayBooking?.zoneIds, bookingZones]);

  const handleAssign = async () => {
    if (!selectedDriver) {
      toast.error('Pick a driver first');
      return;
    }
    if (selectedDriver?.hasConflict) {
      toast.error('This driver has an overlapping booking or subscription. Pick another.');
      return;
    }
    if (hasVehicleConflict) {
      toast.error('This vehicle is in an overlapping booking. Resolve first.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(config.assignPath(booking._id), {
        driverId: selectedDriver._id,
        notes: notes || '',
      });
      toast.success(isReassign ? 'Driver reassigned successfully' : 'Driver assigned successfully');
      onAssigned();
    } catch (err) {
      const data = err?.response?.data;
      const conflicts = data?.data?.conflicts || data?.conflicts;
      const message = data?.message || 'Could not assign driver';
      toast.error(
        conflicts?.length
          ? `${message} (${conflicts.length} overlapping ride${conflicts.length === 1 ? '' : 's'})`
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!config) return null;

  const hasMore = drivers.length < total;

  const drawerHeader = (
    <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-100">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          {isReassign ? 'Assign another driver' : 'Assign driver'} · {config.label}
        </p>
        <h2 className="text-base font-bold text-slate-900 truncate">
          {displayBooking.bookingNumber || booking.bookingNumber || booking._id?.slice(-6)}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2 rounded-xl hover:bg-slate-100"
        aria-label="Close"
      >
        <X className="w-5 h-5 text-slate-600" />
      </button>
    </div>
  );

  const drawerFooter = (
    <div className="px-5 py-3 border-t border-slate-100 space-y-3">
      {selectedDriver && !selectedDriver.hasConflict && !hasVehicleConflict ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-[12px] text-emerald-700 truncate">
            Ready to {isReassign ? 'reassign to' : 'assign'} <strong>{selectedDriver.name}</strong>
          </p>
        </div>
      ) : null}
      {(hasVehicleConflict || selectedDriver?.hasConflict) ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-100">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-[12px] text-rose-700">
            {hasVehicleConflict
              ? 'Vehicle conflict — resolve before assigning'
              : 'Driver has overlapping booking'}
          </p>
        </div>
      ) : null}
      <div className="flex gap-3">
        <Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          fullWidth
          loading={submitting}
          disabled={!selectedDriver || hasVehicleConflict || selectedDriver?.hasConflict}
          onClick={handleAssign}
        >
          {selectedDriver
            ? `${isReassign ? 'Reassign to' : 'Assign to'} ${selectedDriver.name?.split(' ')[0] || 'driver'}`
            : isReassign
              ? 'Reassign driver'
              : 'Assign driver'}
        </Button>
      </div>
    </div>
  );

  return (
    <Drawer
      isOpen
      onClose={onClose}
      header={drawerHeader}
      footer={drawerFooter}
      width="max-w-[560px]"
    >
      {bookingLoading && !fullBooking ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          <AssignBookingTripSummary
            booking={displayBooking}
            mode={mode}
            car={extraCar}
            bufferMinutes={bufferMinutes}
            vehicleConflicts={vehicleConflicts}
            detailLoading={detailLoading || bookingLoading}
            detailError={detailError}
          />

          <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Choose driver
              </p>
              <div className="flex items-center gap-2">
                {drivers.length > 0 ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      {availableCount} free
                    </span>
                    {conflictCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        {conflictCount} conflict
                      </span>
                    ) : null}
                  </>
                ) : null}
                {hasGeo ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <Navigation className="w-2.5 h-2.5" />
                    Nearest first
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Sorted by rating</span>
                )}
              </div>
            </div>

            {eligibility ? (
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  {eligibility.title}
                </div>
                <ul className="text-[11px] text-sky-800/90 space-y-1 pl-5 list-disc">
                  {eligibility.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {isOutstation && bookingZones.length > 0 ? (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100">
                <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <p className="text-[11px] text-indigo-700">
                  Showing drivers opted-in to this booking&apos;s{' '}
                  <strong>
                    {bookingZones.length} zone{bookingZones.length > 1 ? 's' : ''}
                  </strong>
                </p>
              </div>
            ) : null}

            <OutstationDriverFilterBar
              filters={driverFilters}
              onChange={setDriverFilters}
              showOutstationOptions={isOutstation}
              zones={isOutstation ? zoneOptions : []}
            />

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : error ? (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">{error}</div>
              ) : drivers.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 text-slate-500 text-sm text-center">
                  <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
                  {isOutstation && bookingZones.length > 0
                    ? 'No outstation-opted drivers match this booking’s zones and filters.'
                    : 'No drivers match your filters.'}
                </div>
              ) : (
                drivers.map((d) => (
                  <AssignDriverPickerRow
                    key={d._id}
                    driver={d}
                    selected={String(selectedDriverId) === String(d._id)}
                    onSelect={() => setSelectedDriverId(d._id)}
                  />
                ))
              )}

              {!loading && hasMore && !debouncedSearch.trim() ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm font-medium text-slate-500 hover:text-slate-700 border border-dashed border-slate-200 rounded-2xl hover:border-slate-300 transition flex items-center justify-center gap-2"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loadingMore ? 'Loading…' : `Load more (${total - drivers.length} remaining)`}
                </button>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Notes (optional)
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything to keep on the audit trail?"
                className="w-full text-sm rounded-2xl border border-slate-200 px-3 py-2 focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
};

export default AssignBookingDriverDrawer;
