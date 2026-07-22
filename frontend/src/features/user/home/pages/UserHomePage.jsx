import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Bell,
  ChevronUp,
  X,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import useUserWalletStore from '../../../../store/user/useUserWalletStore';
import Badge from '../../../../components/Badge';
import BookDriverSection from '../components/BookDriverSection';
import { useGoogleMaps } from '../../../../hooks/useGoogleMaps';
import { useGeolocation } from '../../../../hooks/useGeolocation';
import { useNearbyDrivers } from '../../../../hooks/useNearbyDrivers';
import { reverseGeocode } from '../../../../utils/geocoding';
import NearbyDriversMap from '../../../../components/maps/NearbyDriversMap';
import NearbyDriversList from '../../../../components/maps/NearbyDriversList';
import AdsCarousel from '../../../../components/AdsCarousel';
import { useNotificationPanel } from '../../../../components/notifications/NotificationCenter';
import { useUserNotificationStore } from '../../../../store/useNotificationStore';

const NEARBY_RADIUS_METERS = 2000;
const NEARBY_LIMIT = 8;

const UserHomePage = () => {
  const navigate = useNavigate();
  const { setOpen: openNotifications, unreadCount, panel: notificationPanel } = useNotificationPanel(
    useUserNotificationStore,
    { audience: 'user', title: 'Notifications' },
  );
  const { wallet, fetchWallet } = useUserWalletStore();
  const [showDriverSheet, setShowDriverSheet] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(null);

  useEffect(() => {
    fetchWallet().catch((err) => console.error('Failed to fetch wallet', err));
  }, [fetchWallet]);

  const mapRef = useRef(null);
  const scrollRef = useRef(null);

  const { maps, ready } = useGoogleMaps();
  const { coords, loading: locating, error: geoError } = useGeolocation();
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!ready || !maps || !coords) return undefined;
    (async () => {
      const point = await reverseGeocode(maps, { lat: coords.lat, lng: coords.lng });
      if (!cancelled && point) setCurrentLocation(point);
    })();
    return () => {
      cancelled = true;
    };
  }, [maps, ready, coords]);

  const center = useMemo(
    () => (coords ? { lat: coords.lat, lng: coords.lng } : null),
    [coords],
  );

  const {
    drivers,
    loading: driversLoading,
    error: driversError,
    refresh: refreshDrivers,
  } = useNearbyDrivers({
    center,
    radiusMeters: NEARBY_RADIUS_METERS,
    limit: NEARBY_LIMIT,
    enabled: !!center,
  });

  const locationLine = currentLocation?.city
    ? currentLocation.city
    : currentLocation?.address || (geoError ? 'Location unavailable' : 'Locating you…');
  const locationLoading = !geoError && !currentLocation && (locating || !ready);

  const driversCount = drivers.length;

  // Auto-open the bottom sheet when the map crosses under the sticky header
  // as the user scrolls down (existing UX behaviour, kept).
  const handleScroll = useCallback(() => {
    if (!mapRef.current || !scrollRef.current) return;
    const mapRect = mapRef.current.getBoundingClientRect();
    const headerBottom = 104;
    if (mapRect.top <= headerBottom && !showDriverSheet) {
      setShowDriverSheet(true);
    }
  }, [showDriverSheet]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleDriverPick = useCallback(
    (driver) => {
      setSelectedDriverId(String(driver._id));
      setShowDriverSheet(true);
    },
    [],
  );

  return (
    <div className="flex-1 flex flex-col bg-bg relative">
      {/* ====== Sticky Header ====== */}
      <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur-sm px-4 pt-3.5 pb-3.5 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-text-muted text-xs font-medium">Your location</p>
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              <MapPin className="w-4 h-4 text-primary-dark shrink-0" />
              <span
                className="text-text text-sm font-semibold truncate"
                title={currentLocation?.address || locationLine}
              >
                {locationLine}
              </span>
              {locationLoading && (
                <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin shrink-0" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/user/wallet')}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-50 hover:bg-primary-light/40 active:scale-[0.97] rounded-xl border border-primary/30 transition-all cursor-pointer"
              aria-label="Wallet"
            >
              <Wallet className="w-4 h-4 text-primary-dark" />
              <span className="text-text text-sm font-bold">
                ₹{wallet?.balance?.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}
              </span>
            </button>
            <button
              className="relative p-2.5 rounded-xl bg-bg hover:bg-border-light transition-colors"
              type="button"
              aria-label="Notifications"
              onClick={() => openNotifications(true)}
            >
              <Bell className="w-5 h-5 text-text-secondary" />
              {unreadCount > 0 ? (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-danger rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {/* ====== Scrollable Content ====== */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
          <div className="animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-bold text-text">Nearby drivers</h2>
                <p className="text-[11px] text-text-muted">
                  Within {Math.round(NEARBY_RADIUS_METERS / 1000)} km of you
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={driversCount > 0 ? 'success' : 'warning'}>
                  {driversCount} available
                </Badge>
                <button
                  type="button"
                  onClick={refreshDrivers}
                  className="p-1.5 rounded-full hover:bg-gray-200 text-text-muted"
                  aria-label="Refresh nearby drivers"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${driversLoading ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            <div
              ref={mapRef}
              className="rounded-2xl overflow-hidden shadow-card bg-gray-100"
            >
              {center ? (
                <NearbyDriversMap
                  center={center}
                  drivers={drivers}
                  radiusMeters={NEARBY_RADIUS_METERS}
                  selectedDriverId={selectedDriverId}
                  onDriverClick={handleDriverPick}
                  height={256}
                />
              ) : (
                <div className="h-64 flex items-center justify-center text-text-muted">
                  {geoError ? (
                    <div className="px-4 text-center">
                      <p className="text-sm">{geoError}</p>
                      <p className="text-[11px] mt-1">
                        Allow location access to see nearby drivers.
                      </p>
                    </div>
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  )}
                </div>
              )}
            </div>

            {driversError && (
              <p className="mt-2 text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">
                {driversError}
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowDriverSheet(true)}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 bg-white rounded-2xl shadow-card text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
            >
              <ChevronUp className="w-4 h-4 text-primary" />
              {driversCount > 0
                ? `View ${driversCount} nearby driver${driversCount === 1 ? '' : 's'}`
                : 'View nearby drivers'}
            </button>
          </div>

          <BookDriverSection />

          <AdsCarousel />
        </div>
      </div>

      {/* ====== Nearby Drivers Bottom Sheet ====== */}
      {showDriverSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDriverSheet(false)}
          />

          <div className="relative bg-white rounded-t-3xl w-full max-w-lg animate-slide-up shadow-xl">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between px-5 py-2">
              <div>
                <h3 className="text-lg font-bold text-text">Nearby drivers</h3>
                <p className="text-xs text-text-muted">
                  {driversCount} within {Math.round(NEARBY_RADIUS_METERS / 1000)} km
                </p>
              </div>
              <button
                onClick={() => setShowDriverSheet(false)}
                className="p-2 rounded-full hover:bg-gray-100 text-text-secondary"
                type="button"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pb-8 max-h-[60vh] overflow-y-auto">
              <NearbyDriversList
                drivers={drivers}
                loading={driversLoading}
                selectedId={selectedDriverId}
                onDriverClick={(driver) => {
                  setSelectedDriverId(String(driver._id));
                  setShowDriverSheet(false);
                  navigate('/user/book/service');
                }}
              />
            </div>
          </div>
        </div>
      )}
      {notificationPanel}
    </div>
  );
};

export default UserHomePage;
