import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Navigation,
  Loader2,
  Star,
  Trash2,
  Bookmark,
  X,
  Heart,
} from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import { useGoogleMaps } from '../../../../hooks/useGoogleMaps';
import { useMapPlaceSearch } from '../../../../hooks/useMapPlaceSearch';
import useUserSavedLocationsStore from '../../../../store/user/useUserSavedLocationsStore';

/**
 * Rapido-style location picker sheet. Used to pick a pickup point with three
 * shortcuts: search, "Use current location" and saved places. Optionally lets
 * the user save the current pickup as a favourite.
 *
 *   props:
 *     - open                       boolean
 *     - onClose                    () => void
 *     - title                      sheet title (default "Pickup location")
 *     - onSelect                   ({ address, city, lat, lng }) => void
 *     - onRequestCurrentLocation   () => Promise<{address,city,lat,lng}|null>
 *                                  Triggers reverse-geocoding via the parent
 *                                  page (which already has the maps Geocoder).
 *     - currentLocationLoading     boolean
 *     - currentLocationError       string | null
 *     - currentPickup              the active pickup so the user can save it
 *     - hideCurrentLocation        hide the "Use my current location" CTA — set
 *                                  for destination pickers where "where I am"
 *                                  isn't a sensible default.
 */
const LocationPickerSheet = ({
  open,
  onClose,
  title = 'Pickup location',
  onSelect,
  onRequestCurrentLocation,
  currentLocationLoading = false,
  currentLocationError = null,
  currentPickup = null,
  hideCurrentLocation = false,
}) => {
  const { maps, ready } = useGoogleMaps();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(null);

  const items = useUserSavedLocationsStore((s) => s.items);
  const loaded = useUserSavedLocationsStore((s) => s.loaded);
  const loading = useUserSavedLocationsStore((s) => s.loading);
  const error = useUserSavedLocationsStore((s) => s.error);
  const load = useUserSavedLocationsStore((s) => s.load);
  const add = useUserSavedLocationsStore((s) => s.add);
  const remove = useUserSavedLocationsStore((s) => s.remove);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  useEffect(() => {
    if (open) return;
    // Reset transient sheet state whenever the user dismisses the picker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery('');
    setSavedFlash(null);
  }, [open]);

  useMapPlaceSearch(inputRef, {
    maps,
    enabled: ready && open,
    onSelect: ({ lat, lng, address, name }) => {
      onSelect?.({
        address: address || name || '',
        city: '',
        lat,
        lng,
      });
      onClose?.();
    },
  });

  const handleUseCurrent = useCallback(async () => {
    if (!onRequestCurrentLocation) return;
    const point = await onRequestCurrentLocation();
    if (point) {
      onSelect?.(point);
      onClose?.();
    }
  }, [onRequestCurrentLocation, onSelect, onClose]);

  const handleSavedTap = (saved) => {
    onSelect?.({
      address: saved.address,
      city: saved.city || '',
      lat: saved.lat,
      lng: saved.lng,
    });
    onClose?.();
  };

  const handleSavedRemove = async (event, id) => {
    event.stopPropagation();
    try {
      await remove(id);
    } catch (err) {
      console.error(err);
    }
  };

  const canSaveCurrent = useMemo(() => {
    if (!currentPickup?.address) return false;
    return !items.some(
      (it) =>
        Math.abs(it.lat - currentPickup.lat) < 0.0001 &&
        Math.abs(it.lng - currentPickup.lng) < 0.0001,
    );
  }, [currentPickup, items]);

  const handleSaveCurrent = async () => {
    if (!canSaveCurrent || saving) return;
    setSaving(true);
    try {
      await add({
        label: 'Saved place',
        address: currentPickup.address,
        city: currentPickup.city || '',
        lat: currentPickup.lat,
        lng: currentPickup.lng,
      });
      setSavedFlash('Saved to favourites');
      setTimeout(() => setSavedFlash(null), 1500);
    } catch (err) {
      setSavedFlash(err?.message || 'Could not save');
      setTimeout(() => setSavedFlash(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={title}
      className="max-h-[90vh]"
    >
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places, areas, landmarks"
            className="w-full h-11 bg-gray-50 border border-border rounded-xl pl-9 pr-9 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-white"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 text-text-muted"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Use current location */}
        {!hideCurrentLocation && (
          <button
            type="button"
            onClick={handleUseCurrent}
            disabled={currentLocationLoading}
            className="w-full flex items-center gap-3 rounded-2xl bg-primary/10 hover:bg-primary/15 px-3 py-2.5 text-left transition disabled:opacity-60"
          >
            <span className="w-9 h-9 rounded-xl bg-primary text-slate-900 flex items-center justify-center shrink-0">
              {currentLocationLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text">
                Use my current location
              </span>
              <span className="block text-[11px] text-text-muted truncate">
                {currentLocationError
                  ? currentLocationError
                  : 'We will detect your location automatically'}
              </span>
            </span>
          </button>
        )}

        {/* Save current pickup */}
        {currentPickup?.address && (
          <button
            type="button"
            onClick={handleSaveCurrent}
            disabled={!canSaveCurrent || saving}
            className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-2.5 text-left hover:bg-gray-50 transition disabled:opacity-60"
          >
            <span className="w-9 h-9 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center shrink-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text">
                {savedFlash || (canSaveCurrent ? 'Save current pickup to favourites' : 'Already in your favourites')}
              </span>
              <span className="block text-[11px] text-text-muted truncate">
                {currentPickup.address}
              </span>
            </span>
          </button>
        )}

        {/* Saved places */}
        <div>
          <div className="flex items-center gap-2 mt-1 mb-2">
            <Bookmark className="w-4 h-4 text-text-muted" />
            <p className="text-xs uppercase tracking-wide font-semibold text-text-muted">
              Saved places
            </p>
          </div>
          {loading && !loaded ? (
            <div className="py-6 flex items-center justify-center text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-gray-50 px-3 py-4 text-center">
              <p className="text-xs text-text-muted">
                No favourites yet. Save your home or office for quick access next time.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item._id}>
                  <div className="group w-full flex items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2.5 hover:border-text-muted/40 transition">
                    <button
                      type="button"
                      onClick={() => handleSavedTap(item)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="w-9 h-9 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
                        <Star className="w-4 h-4 fill-current" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-text truncate">
                          {item.label || item.city || 'Saved place'}
                        </span>
                        <span className="block text-[11px] text-text-muted truncate">
                          {item.address}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSavedRemove(e, item._id)}
                      className="p-2 rounded-full hover:bg-gray-100 text-text-muted hover:text-danger shrink-0"
                      aria-label="Remove favourite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="mt-2 text-xs text-danger">{error}</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
};

export default LocationPickerSheet;
