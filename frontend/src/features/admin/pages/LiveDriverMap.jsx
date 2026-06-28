import { useEffect, useMemo, useRef, useState } from 'react';
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

const STATUS_FILTER = Object.freeze({
  ALL: 'all',
  AVAILABLE: 'available',
  ON_TRIP: 'on_trip',
});

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
      activeTrip: live.activeTrip || meta.activeTrip || null,
      zoneId: zone?._id ? String(zone._id) : null,
      zoneName: zone?.name || null,
    });
  }

  drivers.sort((a, b) => a.name.localeCompare(b.name));
  return drivers;
}

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - ts);
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
  const { maps, AdvancedMarkerElement, PinElement, ready, error } = useGoogleMaps();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTER.ALL);

  const { map: firebaseMap, disabled: firebaseDisabled, error: firebaseError } =
    useFirebaseDriverLocations();

  const metadataKey = buildCacheKey('admin-live-drivers-metadata', {});
  const { data: metadata } = useCachedQuery(useLiveDriverMetadataStore, metadataKey, {});

  const zonesKey = buildCacheKey('admin-zones', {});
  const { data: zonesRaw } = useCachedQuery(useAdminZonesStore, zonesKey, {});
  const zones = useMemo(
    () => (Array.isArray(zonesRaw) ? zonesRaw.filter((z) => z.isActive !== false) : []),
    [zonesRaw],
  );

  const allDrivers = useMemo(
    () => mergeLiveDrivers(firebaseMap, metadata?.items, zones),
    [firebaseMap, metadata?.items, zones],
  );

  const filteredDrivers = useMemo(() => {
    let list = allDrivers;
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
  }, [allDrivers, statusFilter, zoneFilter, search]);

  const selectedDriver = useMemo(
    () => filteredDrivers.find((d) => d.driverId === selectedId)
      || allDrivers.find((d) => d.driverId === selectedId)
      || null,
    [filteredDrivers, allDrivers, selectedId],
  );

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
  }, [ready, maps]);

  useEffect(() => {
    if (!ready || !mapInstanceRef.current) return;

    const seenIds = new Set();

    for (const d of filteredDrivers) {
      seenIds.add(d.driverId);
      let marker = markersRef.current.get(d.driverId);
      const position = { lat: d.lat, lng: d.lng };
      const pinColor = d.isOnTrip ? '#f97316' : '#22c55e';

      if (!marker) {
        const pin = new PinElement({
          background: pinColor,
          borderColor: '#0f172a',
          glyphColor: '#ffffff',
          scale: 1.0,
        });
        marker = new AdvancedMarkerElement({
          map: mapInstanceRef.current,
          position,
          title: d.name,
          content: pin.element,
        });
        marker.__pin = pin;
        marker.__isOnTrip = d.isOnTrip;
        marker.addListener('click', () => setSelectedId(d.driverId));
        markersRef.current.set(d.driverId, marker);
      } else {
        marker.position = position;
        if (marker.__isOnTrip !== d.isOnTrip && marker.__pin) {
          marker.__pin.background = pinColor;
          marker.__isOnTrip = d.isOnTrip;
        }
      }
    }

    for (const [id, marker] of markersRef.current.entries()) {
      if (!seenIds.has(id)) {
        marker.map = null;
        markersRef.current.delete(id);
        if (selectedId === id) setSelectedId(null);
      }
    }
  }, [filteredDrivers, ready, AdvancedMarkerElement, PinElement, selectedId]);

  useEffect(() => {
    if (!ready || !mapInstanceRef.current || filteredDrivers.length === 0) return;
    const c = mapInstanceRef.current.getCenter();
    const isDefault =
      Math.abs(c.lat() - DEFAULT_MAP_CENTER.lat) < 0.001 &&
      Math.abs(c.lng() - DEFAULT_MAP_CENTER.lng) < 0.001;
    if (isDefault) {
      mapInstanceRef.current.panTo({ lat: filteredDrivers[0].lat, lng: filteredDrivers[0].lng });
    }
  }, [filteredDrivers, ready]);

  const focusDriver = (driver) => {
    setSelectedId(driver.driverId);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: driver.lat, lng: driver.lng });
      mapInstanceRef.current.setZoom(15);
    }
  };

  const onlineCount = allDrivers.length;
  const onTripCount = allDrivers.filter((d) => d.isOnTrip).length;
  const visibleCount = filteredDrivers.length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Live driver map</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
          Positions update in real time from Firebase. Driver names and trip details load once on
          page open.
        </p>
      </div>

      {firebaseDisabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live updates are disabled — set <code className="font-mono">VITE_FIREBASE_*</code> in{' '}
          <code className="font-mono">frontend/.env</code> to enable real-time tracking.
        </div>
      )}
      {firebaseError && !firebaseDisabled && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Firebase subscription error: {firebaseError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, booking #, customer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 min-w-[160px]"
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
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 min-w-[140px]"
        >
          <option value={STATUS_FILTER.ALL}>All drivers</option>
          <option value={STATUS_FILTER.AVAILABLE}>Available</option>
          <option value={STATUS_FILTER.ON_TRIP}>On trip</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[480px]">
          <div ref={mapRef} className="w-full h-[480px] lg:h-[640px]" aria-label="Live driver map" />
          {!ready && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/90 z-20">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-slate-600">Loading map…</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rose-50 p-4 text-center z-20">
              <MapPin className="w-8 h-8 text-rose-400" />
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selectedDriver && (
            <SelectedDriverCard driver={selectedDriver} onFocus={() => focusDriver(selectedDriver)} />
          )}
          <DriverSidePanel
            drivers={filteredDrivers}
            selectedId={selectedId}
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
  <div className={`rounded-xl border px-3 py-2.5 ${TONE_STYLES[tone]}`}>
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4" />
      <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-2xl font-bold mt-1">{value}</p>
  </div>
);

const SelectedDriverCard = ({ driver, onFocus }) => {
  const trip = driver.activeTrip;

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
        <button
          type="button"
          onClick={onFocus}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <Navigation className="w-3 h-3" />
          Center
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100">
          <p className="text-slate-500">Zone</p>
          <p className="font-medium text-slate-800 truncate">{driver.zoneName || 'Outside zones'}</p>
        </div>
        <div className="rounded-lg bg-white/80 px-2 py-1.5 border border-slate-100">
          <p className="text-slate-500">Updated</p>
          <p className="font-medium text-slate-800">{relativeTime(driver.updatedAt)}</p>
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
          {trip.customerName && (
            <p className="text-xs text-slate-600">Customer: {trip.customerName}</p>
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

const DriverSidePanel = ({ drivers, selectedId, onSelect }) => (
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
                  <p className="text-[10px] text-slate-400 mt-1">{relativeTime(d.updatedAt)}</p>
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
