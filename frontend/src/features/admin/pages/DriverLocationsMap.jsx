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
  Phone,
  Star,
  Clock,
  X,
} from 'lucide-react';
import { useGoogleMaps } from '../../../hooks/useGoogleMaps';
import { useFirebaseDriverLocations } from '../../../hooks/useFirebaseDriverLocations';
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

const STATUS_FILTER = Object.freeze({
  ALL: 'all',
  ONLINE: 'online',
  ON_TRIP: 'on_trip',
  OFFLINE: 'offline',
});

// Poll the Mongo last-known snapshot periodically. Online drivers get a fresher
// pin layered on top from Firebase; offline drivers only move when they briefly
// come online and report a new fix, so a slow poll is plenty.
const SNAPSHOT_REFRESH_MS = 20_000;

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

const useDriverLocationsStore = createQueryStore(async () => {
  const res = await api.get('/admin/drivers/locations');
  return res.data?.data || { items: [], liveLocationReady: false };
});

/** Status → marker palette + label. Offline is the whole point of this page. */
function statusMeta(driver) {
  if (driver.isOnTrip) {
    return { key: 'on_trip', label: 'On trip', color: '#d97706', ring: 'ring-amber-200', badge: 'bg-amber-100 text-amber-700' };
  }
  if (driver.isOnline) {
    return { key: 'online', label: 'Online', color: '#059669', ring: 'ring-emerald-200', badge: 'bg-emerald-100 text-emerald-700' };
  }
  return { key: 'offline', label: 'Offline', color: '#64748b', ring: 'ring-slate-200', badge: 'bg-slate-200 text-slate-600' };
}

/**
 * Fold the live Firebase position (online drivers only) over the Mongo
 * last-known snapshot, then tag each driver with its zone. A driver present in
 * Firebase is authoritative for position + online/on-trip flags; everyone else
 * keeps their persisted last-known pin so they still appear while offline.
 */
function mergeDrivers(snapshotItems, firebaseMap, zones) {
  const liveById = firebaseMap || {};
  const drivers = [];

  for (const item of snapshotItems || []) {
    if (item.lat == null || item.lng == null) continue; // never reported a fix
    const live = liveById[String(item.driverId)];
    const lat = live?.lat ?? item.lat;
    const lng = live?.lng ?? item.lng;
    const zone = findZoneForPoint(lat, lng, zones);
    drivers.push({
      ...item,
      lat,
      lng,
      isLive: Boolean(live),
      isOnline: live ? true : item.isOnline,
      isOnTrip: live?.isOnTrip ?? item.isOnTrip,
      heading: live?.heading ?? item.heading,
      speed: live?.speed ?? item.speed,
      // A live pin is "now"; otherwise fall back to the persisted snapshot time.
      positionAt: live?.updatedAt || item.lastLocationAt || null,
      zoneId: zone?._id ? String(zone._id) : null,
      zoneName: zone?.name || null,
    });
  }

  drivers.sort((a, b) => {
    // Online/on-trip first, then most-recently-seen.
    const rank = (d) => (d.isOnTrip ? 0 : d.isOnline ? 1 : 2);
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return (b.positionAt ? new Date(b.positionAt).getTime() : 0) -
      (a.positionAt ? new Date(a.positionAt).getTime() : 0);
  });
  return drivers;
}

function relativeTime(ts, nowMs = Date.now()) {
  if (!ts) return 'never';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!Number.isFinite(t)) return 'never';
  const diff = Math.max(0, nowMs - t);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function matchesSearch(driver, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    driver.name?.toLowerCase().includes(q) ||
    driver.phone?.includes(q) ||
    driver.driverNumber?.toLowerCase().includes(q) ||
    driver.city?.toLowerCase().includes(q) ||
    driver.driverId.toLowerCase().includes(q)
  );
}

/** Build the DOM content for a status-coloured pin (with a pulse when online). */
function buildPinContent(driver, { selected }) {
  const meta = statusMeta(driver);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;transform:translate(-50%,-50%);';

  if (driver.isOnline) {
    const pulse = document.createElement('div');
    pulse.style.cssText =
      `position:absolute;left:50%;top:50%;width:${selected ? 34 : 26}px;height:${selected ? 34 : 26}px;` +
      `transform:translate(-50%,-50%);border-radius:9999px;background:${meta.color};opacity:0.25;` +
      'animation:dlm-pulse 1.8s ease-out infinite;';
    wrap.appendChild(pulse);
  }

  const dot = document.createElement('div');
  const size = selected ? 20 : 15;
  dot.style.cssText =
    `position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${meta.color};` +
    `border:2.5px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,0.4);` +
    (driver.isOnline ? '' : 'opacity:0.9;');
  wrap.appendChild(dot);
  return wrap;
}

const DriverLocationsMap = () => {
  const { admin } = useAdminAuthStore();
  const assignedZoneIds = useMemo(() => getAssignedZoneIds(admin), [admin]);
  const { ready, error } = useGoogleMaps();
  const { maps, AdvancedMarkerElement } = useGoogleMaps();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const markersRef = useRef(new window.Map());
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTER.ALL);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { map: firebaseMap, disabled: firebaseDisabled } = useFirebaseDriverLocations();

  const snapshotKey = buildCacheKey('admin-driver-locations', {});
  const { data: snapshot, refetch, loading } = useCachedQuery(
    useDriverLocationsStore,
    snapshotKey,
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
    () => mergeDrivers(snapshot?.items, firebaseMap, zones),
    [snapshot?.items, firebaseMap, zones],
  );

  const scopedDrivers = useMemo(() => {
    if (assignedZoneIds === null) return allDrivers;
    if (!assignedZoneIds.length) return [];
    const allowed = new Set(assignedZoneIds);
    return allDrivers.filter((d) => d.zoneId && allowed.has(d.zoneId));
  }, [allDrivers, assignedZoneIds]);

  const filteredDrivers = useMemo(() => {
    let list = scopedDrivers;
    if (statusFilter === STATUS_FILTER.ONLINE) list = list.filter((d) => d.isOnline);
    else if (statusFilter === STATUS_FILTER.ON_TRIP) list = list.filter((d) => d.isOnTrip);
    else if (statusFilter === STATUS_FILTER.OFFLINE) list = list.filter((d) => !d.isOnline);
    if (zoneFilter) list = list.filter((d) => d.zoneId === zoneFilter);
    list = list.filter((d) => matchesSearch(d, search));
    return list;
  }, [scopedDrivers, statusFilter, zoneFilter, search]);

  const selectedDriver = useMemo(
    () => filteredDrivers.find((d) => d.driverId === selectedId)
      || scopedDrivers.find((d) => d.driverId === selectedId)
      || null,
    [filteredDrivers, scopedDrivers, selectedId],
  );

  // A stale selectedId is harmless: `selectedDriver` resolves to null when the
  // driver is filtered out, so the card simply hides and reappears if they
  // return — no clearing effect needed (which would trip set-state-in-effect).

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      refetch().catch(() => {});
    }, SNAPSHOT_REFRESH_MS);
    return () => clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstanceRef.current || !maps) return;
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
    if (mapInstanceRef.current && driver.lat != null && driver.lng != null) {
      mapInstanceRef.current.panTo({ lat: driver.lat, lng: driver.lng });
      if (mapInstanceRef.current.getZoom() < 14) mapInstanceRef.current.setZoom(15);
    }
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  // Diff-render status-coloured markers. Kept local (not the shared driver-pin
  // hook) so offline drivers get a distinct grey pin the shared hook can't give.
  useEffect(() => {
    const map = mapInstance;
    if (!map || !AdvancedMarkerElement) return;
    const seen = new Set();

    for (const d of filteredDrivers) {
      if (d.lat == null || d.lng == null) continue;
      const id = String(d.driverId);
      seen.add(id);
      const selected = id === String(selectedId);
      const content = buildPinContent(d, { selected });

      let marker = markersRef.current.get(id);
      if (!marker) {
        marker = new AdvancedMarkerElement({
          map,
          position: { lat: d.lat, lng: d.lng },
          content,
          title: d.name || `Driver ${id.slice(-4)}`,
          zIndex: selected ? 50 : d.isOnline ? 10 : 5,
        });
        marker.addListener('click', () => focusDriver(d));
        markersRef.current.set(id, marker);
      } else {
        marker.position = { lat: d.lat, lng: d.lng };
        marker.content = content;
        marker.title = d.name || `Driver ${id.slice(-4)}`;
        marker.zIndex = selected ? 50 : d.isOnline ? 10 : 5;
      }
    }

    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
      }
    }
  }, [mapInstance, AdvancedMarkerElement, filteredDrivers, selectedId, focusDriver]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) marker.map = null;
      markers.clear();
    };
  }, []);

  // First useful paint: centre on the fleet once markers exist.
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current || !ready || !mapInstanceRef.current || !maps) return;
    if (filteredDrivers.length === 0) return;
    didFitRef.current = true;
    if (filteredDrivers.length === 1) {
      mapInstanceRef.current.panTo({ lat: filteredDrivers[0].lat, lng: filteredDrivers[0].lng });
      mapInstanceRef.current.setZoom(14);
      return;
    }
    const bounds = new maps.LatLngBounds();
    filteredDrivers.forEach((d) => bounds.extend({ lat: d.lat, lng: d.lng }));
    mapInstanceRef.current.fitBounds(bounds, 64);
  }, [filteredDrivers, ready, maps]);

  const total = scopedDrivers.length;
  const onlineCount = scopedDrivers.filter((d) => d.isOnline).length;
  const onTripCount = scopedDrivers.filter((d) => d.isOnTrip).length;
  const offlineCount = scopedDrivers.filter((d) => !d.isOnline).length;

  return (
    <div className="space-y-3.5 sm:space-y-6 animate-fade-in-up pb-8">
      <style>{`@keyframes dlm-pulse{0%{transform:translate(-50%,-50%) scale(0.6);opacity:0.45}100%{transform:translate(-50%,-50%) scale(1.6);opacity:0}}`}</style>

      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Driver locations</h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1 max-w-2xl leading-relaxed">
          Every approved driver on one map — online drivers stream live, and{' '}
          <span className="font-medium text-slate-700">offline drivers stay pinned at their last-known location</span>{' '}
          with the time they were last seen there.
        </p>
      </div>

      {firebaseDisabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs sm:text-sm text-amber-800">
          Live streaming is off — showing the last-known position saved for each driver. Set{' '}
          <code className="font-mono">VITE_FIREBASE_*</code> in{' '}
          <code className="font-mono">frontend/.env</code> to layer real-time pins on top.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Drivers on map" value={total} tone="muted" />
        <StatCard icon={Wifi} label="Online" value={onlineCount} tone="success" />
        <StatCard icon={Car} label="On trip" value={onTripCount} tone="warning" />
        <StatCard icon={WifiOff} label="Offline" value={offlineCount} tone="slate" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-1.5 sm:gap-3">
        <label className="relative block w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, driver ID, city…"
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
            <option value={STATUS_FILTER.ALL}>All statuses</option>
            <option value={STATUS_FILTER.ONLINE}>Online</option>
            <option value={STATUS_FILTER.ON_TRIP}>On trip</option>
            <option value={STATUS_FILTER.OFFLINE}>Offline</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[350px] sm:min-h-[480px]">
          <div ref={mapRef} className="w-full h-[350px] sm:h-[480px] lg:h-[640px]" aria-label="Driver locations map" />
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
          <MapLegend />
        </div>

        <div className="space-y-3 sm:space-y-4">
          {selectedDriver && (
            <SelectedDriverCard
              driver={selectedDriver}
              nowMs={nowMs}
              onClear={clearSelection}
            />
          )}
          <DriverSidePanel
            drivers={filteredDrivers}
            selectedId={selectedId}
            nowMs={nowMs}
            loading={loading && !snapshot}
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
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
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

const MapLegend = () => (
  <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-white/95 backdrop-blur px-3 py-2 shadow-sm border border-slate-200 text-[11px] text-slate-600 space-y-1">
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#059669' }} /> Online
    </div>
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#d97706' }} /> On trip
    </div>
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#64748b' }} /> Offline (last seen)
    </div>
  </div>
);

const SelectedDriverCard = ({ driver, nowMs, onClear }) => {
  const meta = statusMeta(driver);
  const trip = driver.activeTrip;
  const serviceLabel = trip?.serviceType
    ? SERVICE_TYPE_LABELS[trip.serviceType] || trip.serviceType
    : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{driver.name}</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
          {driver.driverNumber ? (
            <p className="text-xs font-mono text-slate-500 mt-0.5">{driver.driverNumber}</p>
          ) : null}
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
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100">
          <p className="text-slate-500">Zone</p>
          <p className="font-medium text-slate-800 truncate">{driver.zoneName || driver.city || 'Outside zones'}</p>
        </div>
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100">
          <p className="text-slate-500">{driver.isLive ? 'Live position' : 'Last seen here'}</p>
          <p className="font-medium text-slate-800 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            {relativeTime(driver.positionAt, nowMs)}
          </p>
        </div>
        {!driver.isOnline && (
          <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100 col-span-2">
            <p className="text-slate-500">Last online</p>
            <p className="font-medium text-slate-800">{relativeTime(driver.lastOnlineAt, nowMs)}</p>
          </div>
        )}
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100 col-span-2">
          <p className="text-slate-500">Coordinates</p>
          <p className="font-medium text-slate-800 font-mono text-[11px]">
            {driver.lat.toFixed(5)}, {driver.lng.toFixed(5)}
            {typeof driver.heading === 'number' ? ` · ${Math.round(driver.heading)}°` : ''}
          </p>
        </div>
      </div>

      {driver.isOnTrip && trip ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Active trip</p>
          <p className="text-sm font-medium text-slate-900">
            #{trip.bookingNumber}
            <span className="ml-2 text-xs font-normal text-amber-700">
              {TRIP_STATUS_LABELS[trip.status] || trip.status}
            </span>
          </p>
          {serviceLabel && <p className="text-xs text-slate-600">Service: {serviceLabel}</p>}
          {trip.customerName && (
            <p className="text-xs text-slate-600">
              Customer: {trip.customerName}
              {trip.customerPhone ? ` · ${trip.customerPhone}` : ''}
            </p>
          )}
          {trip.pickup && (
            <p className="text-xs text-slate-600"><span className="font-medium">Pickup:</span> {trip.pickup}</p>
          )}
          {trip.dropoff && (
            <p className="text-xs text-slate-600"><span className="font-medium">Drop:</span> {trip.dropoff}</p>
          )}
        </div>
      ) : driver.isOnline ? (
        <p className="text-xs text-emerald-700 font-medium">Online — available, not on a trip</p>
      ) : (
        <p className="text-xs text-slate-500 font-medium">Offline — pin shows where they were last seen</p>
      )}

      <div className="flex items-center gap-3">
        <Link
          to={`/admin/drivers/${driver.driverId}/profile`}
          className="inline-flex text-xs font-medium text-primary hover:underline"
        >
          View driver profile →
        </Link>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${driver.lat},${driver.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs font-medium text-slate-500 hover:underline"
        >
          Open in Google Maps ↗
        </a>
      </div>
    </div>
  );
};

const DriverSidePanel = ({ drivers, selectedId, nowMs, loading, onSelect }) => (
  <div className="rounded-xl border border-slate-200 bg-white max-h-[420px] overflow-y-auto custom-scrollbar">
    <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Drivers ({drivers.length})
      </p>
    </div>
    {loading ? (
      <div className="p-6 flex items-center justify-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    ) : drivers.length === 0 ? (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-500">No drivers match your filters.</p>
      </div>
    ) : (
      <ul className="divide-y divide-slate-100">
        {drivers.map((d) => {
          const meta = statusMeta(d);
          return (
            <li key={d.driverId}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${
                  selectedId === d.driverId ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{d.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {d.zoneName || d.city || 'Outside zones'}
                        {d.activeTrip?.bookingNumber ? ` · #${d.activeTrip.bookingNumber}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.badge}`}>
                      {meta.label}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">{relativeTime(d.positionAt, nowMs)}</p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export default DriverLocationsMap;
