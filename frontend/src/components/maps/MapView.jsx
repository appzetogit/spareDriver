import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { GoogleMap } from '@react-google-maps/api';
import { Loader2, MapPin } from 'lucide-react';
import { useGoogleMap } from '../../hooks/useGoogleMap';
import { DEFAULT_MAP_CENTER, GOOGLE_MAP_ID } from '../../constants/mapDefaults';
import { RAPIDO_MAP_STYLES } from '../../constants/mapTheme';

/**
 * <MapView /> — the single declarative entry point for every map in the app.
 *
 * Wraps `@react-google-maps/api`'s `<GoogleMap>` with:
 *   1. The shared Rapido-style theme + mobile-first option defaults.
 *   2. A consistent loading / error UI so callers don't reinvent it.
 *   3. An imperative ref handle (`getMap`, `panTo`, `panToWithOffset`,
 *      `setZoom`, `fitBounds`, `triggerResize`) — useful for camera-follow
 *      logic that lives in the parent component.
 *
 * The ref handle is critical for the live-trip experience: while the driver
 * moves we want to *smoothly* re-center the camera each tick instead of
 * letting React re-mount the map on every prop change. Exposing `panTo`
 * means parents can run their animation loop without the map being
 * controlled.
 *
 * Children rendered inside `<MapView>` are placed inside `<GoogleMap>`, so
 * components like `<MarkerF>`, `<PolylineF>` and `<OverlayViewF>` from
 * `@react-google-maps/api` can be used directly without extra wiring.
 */

const DEFAULT_OPTIONS = Object.freeze({
  disableDefaultUI: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
  backgroundColor: '#f5f0e8',
  styles: RAPIDO_MAP_STYLES,
  zoomControl: false,
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  rotateControl: false,
  tilt: 0,
  // Anti-jitter: limit how far the user can zoom out so the world doesn't
  // wrap and lose the marker. Trip maps barely ever need <12.
  minZoom: 3,
  maxZoom: 20,
});

const CONTAINER_STYLE = { width: '100%', height: '100%' };

const MapView = forwardRef(function MapView(
  {
    center = DEFAULT_MAP_CENTER,
    zoom = 15,
    height = 240,
    width = '100%',
    className = '',
    rounded = true,
    options,
    onLoad,
    onUnmount,
    onClick,
    onDragStart,
    onDragEnd,
    onZoomChanged,
    onIdle,
    children,
  },
  ref,
) {
  const { isLoaded, loadError } = useGoogleMap();
  const mapRef = useRef(null);

  // Merge caller options on top of the Rapido defaults. We always inject
  // the mapId so any AdvancedMarkers attached via legacy imperative code
  // continue to render correctly.
  const mergedOptions = useMemo(
    () => ({
      ...DEFAULT_OPTIONS,
      mapId: GOOGLE_MAP_ID,
      ...(options || {}),
    }),
    [options],
  );

  const handleLoad = useCallback(
    (map) => {
      mapRef.current = map;
      onLoad?.(map);
    },
    [onLoad],
  );

  const handleUnmount = useCallback(() => {
    const map = mapRef.current;
    mapRef.current = null;
    onUnmount?.(map);
  }, [onUnmount]);

  useImperativeHandle(
    ref,
    () => ({
      /** Raw map instance — escape hatch for anything not exposed below. */
      getMap: () => mapRef.current,
      /** Smoothly pan to a coordinate. */
      panTo: (latLng) => {
        if (!latLng) return;
        mapRef.current?.panTo(latLng);
      },
      /**
       * Pan to coordinate and then nudge by `(dx, dy)` pixels. Used by the
       * trip-tracking screens to keep the driver pin above the bottom
       * sheet — without an offset the driver hides under the card.
       */
      panToWithOffset: (latLng, dx = 0, dy = 0) => {
        const map = mapRef.current;
        if (!map || !latLng) return;
        map.panTo(latLng);
        if (dx || dy) map.panBy(dx, dy);
      },
      setZoom: (z) => mapRef.current?.setZoom(z),
      /** Map bearing in degrees (0 = north-up). Used for rotate + recenter. */
      setHeading: (deg) => {
        const map = mapRef.current;
        if (!map || typeof map.setHeading !== 'function') return;
        map.setHeading(((Number(deg) % 360) + 360) % 360);
      },
      getHeading: () => {
        const map = mapRef.current;
        if (!map || typeof map.getHeading !== 'function') return 0;
        return map.getHeading() || 0;
      },
      fitBounds: (bounds, padding) => mapRef.current?.fitBounds(bounds, padding),
      triggerResize: () => {
        const map = mapRef.current;
        if (!map || typeof window === 'undefined') return;
        const api = window.google?.maps;
        if (api?.event) api.event.trigger(map, 'resize');
      },
    }),
    [],
  );

  const wrapperClass = [
    'relative overflow-hidden bg-[#f5f0e8]',
    rounded ? 'rounded-2xl' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (loadError) {
    return (
      <div className={wrapperClass} style={{ height, width }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50 p-4 text-center">
          <MapPin className="w-7 h-7 text-rose-400" />
          <p className="text-sm font-medium text-rose-800 mt-2">
            {loadError.message || 'Failed to load Google Maps'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass} style={{ height, width }}>
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={CONTAINER_STYLE}
          center={center}
          zoom={zoom}
          options={mergedOptions}
          onLoad={handleLoad}
          onUnmount={handleUnmount}
          onClick={onClick}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onZoomChanged={onZoomChanged}
          onIdle={onIdle}
        >
          {children}
        </GoogleMap>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      )}
    </div>
  );
});

export default memo(MapView);
