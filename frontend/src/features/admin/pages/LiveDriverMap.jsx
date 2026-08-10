import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2,
  MapPin,
  Users,
  Wifi,
  WifiOff,
  Car,
  Search,
  Filter,
  Navigation,
  Phone,
  Star,
  X,
} from 'lucide-react';
import { useGoogleMaps } from '../../../hooks/useGoogleMaps';
import { useFirebaseDriverLocations } from '../../../hooks/useFirebaseDriverLocations';
import { useDriverMarkers } from '../../../hooks/useDriverMarkers';
import { useCachedQuery } from '../../../hooks/useCachedQuery';
import { buildCacheKey } from '../../../store/lib/buildCacheKey';
import { createQueryStore } from '../../../store/lib/createQueryStore';
import { useAdminZonesStore } from '../../../store/admin/useAdminZonesStore';
import api from '../../../utils/api';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, GOOGLE_MAP_ID } from '../../../constants/mapDefaults';
import { findZoneForPoint } from '../../../utils/zoneContains';
import { BOOKING_STATUS } from '../../../constants/bookingStatus';
import { SERVICE_TYPE_LABELS } from '../../../constants/serviceTypes';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { getAssignedZoneIds } from '../../../constants/staffRoles';
import TripTrackingMap from '../../../components/maps/TripTrackingMap';

const STATUS_FILTER = Object.freeze({
  ALL: 'all',
  AVAILABLE: 'available',
  ON_TRIP: 'on_trip',
});

const METADATA_REFRESH_MS = 30_000;

const TRIP_STATUS_LABELS = {
  [BOOKING_STATUS.PENDING_ASSIGNMENT]: 'Pending assignment',
  [BOOKING_STATUS.SEARCHING]: 'Searching',
  [BOOKING_STATUS.DRIVER_ASSIGNED]: 'Assigned',
  [BOOKING_STATUS.AWAITING_PAYMENT]: 'Awaiting payment',
  [BOOKING_STATUS.EN_ROUTE]: 'En route to pickup',
  [BOOKING_STATUS.ARRIVED]: 'At pickup',
  [BOOKING_STATUS.STARTED]: 'Trip in progress',
  [BOOKING_STATUS.IN_EMERGENCY_POOL]: 'Emergency pool',
};

const useLiveDriverMetadataStore = createQueryStore(async () => {
  const res = await api.get('/admin/drivers/live');
  return res.data?.data || { items: [], liveLocationReady: false };
});

function mergeActiveTrip(liveTrip, metaTrip) {
  if (!liveTrip && !metaTrip) return null;
  return {
    ...(metaTrip || {}),
    ...(liveTrip || {}),
    // Coords live on the Mongo metadata payload; keep them if Firebase status is leaner.
    pickupCoords: liveTrip?.pickupCoords || metaTrip?.pickupCoords || null,
    dropoffCoords: liveTrip?.dropoffCoords || metaTrip?.dropoffCoords || null,
    pickup: liveTrip?.pickup || metaTrip?.pickup || null,
    dropoff: liveTrip?.dropoff || metaTrip?.dropoff || null,
    customerName: liveTrip?.customerName || metaTrip?.customerName || null,
    customerPhone: liveTrip?.customerPhone || metaTrip?.customerPhone || null,
  };
}

function mergeLiveDrivers(firebaseMap, metadataItems, zones) {
  const metaById = new Map(
    (metadataItems || []).map((item) => [String(item.driverId), item]),
  );
  const drivers = [];

  for (const live of Object.values(firebaseMap || {})) {
    const meta = metaById.get(live.driverId) || {};
    const zone = findZoneForPoint(live.lat, live.lng, zones);
    drivers.push({
      ...live,
      name: meta.name || `Driver ${live.driverId.slice(-6)}`,
      phone: meta.phone || null,
      rating: meta.rating ?? null,
      isOnTrip: live.isOnTrip ?? meta.isOnTrip ?? false,
      activeTrip: mergeActiveTrip(live.activeTrip, meta.activeTrip),
      zoneId: zone?._id ? String(zone._id) : null,
      zoneName: zone?.name || null,
    });
  }

  drivers.sort((a, b) => a.name.localeCompare(b.name));
  return drivers;
}

function relativeTime(ts, nowMs = Date.now()) {
  if (!ts) return '—';
  const diff = Math.max(0, nowMs - ts);
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function matchesSearch(driver, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    driver.name?.toLowerCase().includes(q) ||
    driver.phone?.includes(q) ||
    driver.driverId.toLowerCase().includes(q) ||
    driver.activeTrip?.bookingNumber?.toLowerCase().includes(q) ||
    driver.activeTrip?.customerName?.toLowerCase().includes(q)
  );
}

const LiveDriverMap = () => {
  const { admin } = useAdminAuthStore();
  const assignedZoneIds = useMemo(() => getAssignedZoneIds(admin), [admin]);
  const { maps, ready, error } = useGoogleMaps();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTER.ALL);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { map: firebaseMap, disabled: firebaseDisabled, error: firebaseError } =
    useFirebaseDriverLocations();

  const metadataKey = buildCacheKey('admin-live-drivers-metadata', {});
  const { data: metadata, refetch: refetchMetadata } = useCachedQuery(
    useLiveDriverMetadataStore,
    metadataKey,
    {},
  );

  const zonesKey = buildCacheKey('admin-zones', {});
  const { data: zonesRaw } = useCachedQuery(useAdminZonesStore, zonesKey, {});
  const zones = useMemo(() => {
    const active = Array.isArray(zonesRaw) ? zonesRaw.filter((z) => z.isActive !== false) : [];
    if (assignedZoneIds === null) return active;
    const allowed = new Set(assignedZoneIds);
    return active.filter((z) => allowed.has(String(z._id)));
  }, [zonesRaw, assignedZoneIds]);

  const allDrivers = useMemo(
    () => mergeLiveDrivers(firebaseMap, metadata?.items, zones),
    [firebaseMap, metadata?.items, zones],
  );

  const scopedDrivers = useMemo(() => {
    if (assignedZoneIds === null) return allDrivers;
    if (!assignedZoneIds.length) return [];
    const allowed = new Set(assignedZoneIds);
    return allDrivers.filter((d) => d.zoneId && allowed.has(d.zoneId));
  }, [allDrivers, assignedZoneIds]);

  const filteredDrivers = useMemo(() => {
    let list = scopedDrivers;
    if (statusFilter === STATUS_FILTER.AVAILABLE) {
      list = list.filter((d) => !d.isOnTrip);
    } else if (statusFilter === STATUS_FILTER.ON_TRIP) {
      list = list.filter((d) => d.isOnTrip);
    }
    if (zoneFilter) {
      list = list.filter((d) => d.zoneId === zoneFilter);
    }
    list = list.filter((d) => matchesSearch(d, search));
    return list;
  }, [scopedDrivers, statusFilter, zoneFilter, search]);

  const selectedDriver = useMemo(
    () => filteredDrivers.find((d) => d.driverId === selectedId)
      || scopedDrivers.find((d) => d.driverId === selectedId)
      || null,
    [filteredDrivers, scopedDrivers, selectedId],
  );

  // Same live point shape user tracking pages build from useFirebaseDriverLocations.
  const selectedLivePoint = useMemo(() => {
    if (!selectedDriver) return null;
    return {
      lat: selectedDriver.lat,
      lng: selectedDriver.lng,
      heading:
        typeof selectedDriver.heading === 'number' ? selectedDriver.heading : undefined,
    };
  }, [selectedDriver]);

  const selectedPickupPoint = useMemo(() => {
    if (!selectedDriver?.isOnTrip) return null;
    const trip = selectedDriver.activeTrip;
    if (trip?.pickupCoords?.lat != null && trip?.pickupCoords?.lng != null) {
      return { lat: trip.pickupCoords.lat, lng: trip.pickupCoords.lng };
    }
    return null;
  }, [selectedDriver]);

  const selectedDropoffPoint = useMemo(() => {
    if (!selectedDriver?.isOnTrip) return null;
    const c = selectedDriver?.activeTrip?.dropoffCoords;
    if (c?.lat == null || c?.lng == null) return null;
    return { lat: c.lat, lng: c.lng };
  }, [selectedDriver]);

  useEffect(() => {
    if (selectedId && !selectedDriver) setSelectedId(null);
  }, [selectedId, selectedDriver]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Keep Mongo names / trip labels fresh; positions stay on Firebase.
  useEffect(() => {
    const id = setInterval(() => {
      refetchMetadata().catch(() => {});
    }, METADATA_REFRESH_MS);
    return () => clearInterval(id);
  }, [refetchMetadata]);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new maps.Map(mapRef.current, {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      mapId: GOOGLE_MAP_ID,
      disableDefaultUI: false,
      streetViewControl: false,
      mapTypeControl: false,
    });
    setMapInstance(mapInstanceRef.current);
  }, [ready, maps]);

  const focusDriver = useCallback((driver) => {
    setSelectedId(driver.driverId);
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  useDriverMarkers(selectedId ? null : mapInstance, filteredDrivers, {
    selectedId,
    onDriverClick: focusDriver,
  });

  useEffect(() => {
    if (selectedId || !ready || !mapInstanceRef.current || filteredDrivers.length === 0) return;
    const c = mapInstanceRef.current.getCenter();
    const isDefault =
      Math.abs(c.lat() - DEFAULT_MAP_CENTER.lat) < 0.001 &&
      Math.abs(c.lng() - DEFAULT_MAP_CENTER.lng) < 0.001;
    if (isDefault) {
      mapInstanceRef.current.panTo({ lat: filteredDrivers[0].lat, lng: filteredDrivers[0].lng });
    }
  }, [filteredDrivers, ready, selectedId]);

  const onlineCount = scopedDrivers.length;
  const onTripCount = scopedDrivers.filter((d) => d.isOnTrip).length;
  const visibleCount = filteredDrivers.length;

  return (
    <div className="space-y-3.5 sm:space-y-6 animate-fade-in-up pb-8">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Live driver map</h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1 max-w-2xl leading-relaxed">
          Positions update in real time from Firebase (same feed as customer tracking). Select a
          driver to follow their live pin and see the active ride.
        </p>
      </div>

      {firebaseDisabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs sm:text-sm text-amber-800">
          Live updates are disabled — set <code className="font-mono">VITE_FIREBASE_*</code> in{' '}
          <code className="font-mono">frontend/.env</code> to enable real-time tracking.
        </div>
      )}
      {firebaseError && !firebaseDisabled && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm text-rose-800">
          Firebase subscription error: {firebaseError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Live on map" value={onlineCount} tone="success" />
        <StatCard icon={Car} label="On trip" value={onTripCount} tone="warning" />
        <StatCard
          icon={firebaseDisabled ? WifiOff : Wifi}
          label="Firebase feed"
          value={firebaseDisabled ? 'Off' : 'Live'}
          tone={firebaseDisabled ? 'muted' : 'success'}
        />
        <StatCard icon={Filter} label="Filtered" value={visibleCount} tone="muted" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-1.5 sm:gap-3">
        <label className="relative block w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, booking #, customer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 sm:py-2.5 pl-9 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto">
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="flex-1 min-w-0 md:w-48 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-700"
          >
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z._id} value={String(z._id)}>
                {z.name}{z.city ? ` · ${z.city}` : ''}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 min-w-0 md:w-40 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-700"
          >
            <option value={STATUS_FILTER.ALL}>All drivers</option>
            <option value={STATUS_FILTER.AVAILABLE}>Available</option>
            <option value={STATUS_FILTER.ON_TRIP}>On trip</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[350px] sm:min-h-[480px]">
          {/* Keep fleet map mounted so Google Map instance survives selection toggles. */}
          <div className={selectedDriver ? 'hidden' : 'relative'}>
            <div ref={mapRef} className="w-full h-[350px] sm:h-[480px] lg:h-[640px]" aria-label="Live driver map" />
            {!ready && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/90 z-20">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
                <p className="text-xs sm:text-sm text-slate-600">Loading map…</p>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rose-50 p-4 text-center z-20">
                <MapPin className="w-8 h-8 text-rose-400" />
                <p className="text-xs sm:text-sm font-medium text-rose-800">{error}</p>
              </div>
            )}
          </div>

          {selectedDriver && selectedLivePoint && (
            <TripTrackingMap
              key={selectedDriver.driverId}
              driver={selectedLivePoint}
              pickup={selectedPickupPoint}
              dropoff={selectedDropoffPoint}
              height={640}
              className="!rounded-none h-[350px] sm:h-[480px] lg:h-[640px]"
              showRoute={Boolean(selectedPickupPoint)}
              followDriver
              emphasis="driver"
              bookingStatus={selectedDriver.activeTrip?.status || null}
            />
          )}
        </div>

        <div className="space-y-3 sm:space-y-4">
          {selectedDriver && (
            <SelectedDriverCard
              driver={selectedDriver}
              nowMs={nowMs}
              onFocus={() => focusDriver(selectedDriver)}
              onClear={clearSelection}
            />
          )}
          <DriverSidePanel
            drivers={filteredDrivers}
            selectedId={selectedId}
            nowMs={nowMs}
            onSelect={focusDriver}
          />
        </div>
      </div>
    </div>
  );
};

const TONE_STYLES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  muted: 'bg-slate-50 text-slate-600 border-slate-200',
};

const StatCard = ({ icon: Icon, label, value, tone = 'muted' }) => (
  <div className={`rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5 ${TONE_STYLES[tone]}`}>
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
      <span className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider truncate">{label}</span>
    </div>
    <p className="text-lg sm:text-2xl font-bold mt-0.5 sm:mt-1 truncate">{value}</p>
  </div>
);

const SelectedDriverCard = ({ driver, nowMs, onFocus, onClear }) => {
  const trip = driver.activeTrip;
  const serviceLabel = trip?.serviceType
    ? SERVICE_TYPE_LABELS[trip.serviceType] || trip.serviceType
    : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{driver.name}</p>
          {driver.phone && (
            <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {driver.phone}
            </p>
          )}
          {driver.rating != null && (
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Star className="w-3 h-3" />
              {Number(driver.rating).toFixed(1)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onFocus}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <Navigation className="w-3 h-3" />
            Follow
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100">
          <p className="text-slate-500">Zone</p>
          <p className="font-medium text-slate-800 truncate">{driver.zoneName || 'Outside zones'}</p>
        </div>
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100">
          <p className="text-slate-500">Location updated</p>
          <p className="font-medium text-slate-800">{relativeTime(driver.updatedAt, nowMs)}</p>
        </div>
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100 col-span-2">
          <p className="text-slate-500">Coordinates</p>
          <p className="font-medium text-slate-800 font-mono text-[11px]">
            {driver.lat.toFixed(5)}, {driver.lng.toFixed(5)}
            {typeof driver.heading === 'number' ? ` · ${Math.round(driver.heading)}°` : ''}
            {typeof driver.speed === 'number' ? ` · ${Math.round(driver.speed)} m/s` : ''}
          </p>
        </div>
      </div>

      {driver.isOnTrip && trip ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Active trip
          </p>
          <p className="text-sm font-medium text-slate-900">
            #{trip.bookingNumber}
            <span className="ml-2 text-xs font-normal text-amber-700">
              {TRIP_STATUS_LABELS[trip.status] || trip.status}
            </span>
          </p>
          {serviceLabel && (
            <p className="text-xs text-slate-600">Service: {serviceLabel}</p>
          )}
          {trip.customerName && (
            <p className="text-xs text-slate-600">
              Customer: {trip.customerName}
              {trip.customerPhone ? ` · ${trip.customerPhone}` : ''}
            </p>
          )}
          {trip.pickup && (
            <p className="text-xs text-slate-600">
              <span className="font-medium">Pickup:</span> {trip.pickup}
            </p>
          )}
          {trip.dropoff && (
            <p className="text-xs text-slate-600">
              <span className="font-medium">Drop:</span> {trip.dropoff}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-emerald-700 font-medium">Available — not on a trip</p>
      )}

      <Link
        to={`/admin/drivers/${driver.driverId}/profile`}
        className="inline-flex text-xs font-medium text-primary hover:underline"
      >
        View driver profile →
      </Link>
    </div>
  );
};

const DriverSidePanel = ({ drivers, selectedId, nowMs, onSelect }) => (
  <div className="rounded-xl border border-slate-200 bg-white max-h-[420px] overflow-y-auto custom-scrollbar">
    <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Drivers ({drivers.length})
      </p>
    </div>
    {drivers.length === 0 ? (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-500">No drivers match your filters.</p>
      </div>
    ) : (
      <ul className="divide-y divide-slate-100">
        {drivers.map((d) => (
          <li key={d.driverId}>
            <button
              type="button"
              onClick={() => onSelect(d)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${
                selectedId === d.driverId ? 'bg-primary/5' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{d.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {d.zoneName || 'Outside zones'}
                    {d.activeTrip?.bookingNumber ? ` · #${d.activeTrip.bookingNumber}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      d.isOnTrip
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {d.isOnTrip ? 'On trip' : 'Available'}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">{relativeTime(d.updatedAt, nowMs)}</p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default LiveDriverMap;
