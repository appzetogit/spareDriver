import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { OverlayViewF, OverlayView } from '@react-google-maps/api';
import { PIN_ASSETS, MAP_Z_INDEX } from '../../constants/mapTheme';
import { bearingDegrees } from '../../utils/geo';
import {
  easeInOutCubic,
  easeOutCubic,
  lerpLatLng,
  lerpHeading,
  nearlySameLatLng,
} from '../../utils/mapAnimation';

/**
 * <DriverMarker /> — animated driver pin used on every live-trip map.
 *
 * Interpolates between GPS samples with requestAnimationFrame so the pin
 * glides instead of jumping. Mid-flight retargets start from the *current
 * rendered* position (never the previous target) to prevent snaps when a
 * new Firebase sample lands mid-animation.
 *
 * When the next sample is late, a short velocity-based coast keeps motion
 * alive instead of freezing on the last point.
 */

const DEFAULT_ANIMATE_MS = 1400;
/** Keep coasting at most this long after a sample if GPS is late. */
const MAX_COAST_MS = 2800;
/** Ignore sub-metre GPS jitter. */
const JITTER_EPS = 1e-6;

const getPixelPositionOffset = (width, height) => ({
  x: -width / 2,
  y: -height / 2,
});

function DriverMarker({
  position,
  heading,
  /** Current map bearing (0 = north-up). Marker CSS rotation is heading − mapHeading. */
  mapHeading = 0,
  animateMs = DEFAULT_ANIMATE_MS,
  imageSrc = PIN_ASSETS.DRIVER,
  size = 46,
  rotate = true,
  pulse = true,
  ariaLabel = 'Driver',
  /** Fired each animation frame with the on-screen { lat, lng, heading }. */
  onAnimatedPositionChange,
}) {
  const [renderedPosition, setRenderedPosition] = useState(position || null);
  const [renderedHeading, setRenderedHeading] = useState(
    typeof heading === 'number' ? heading : 0,
  );

  const renderedRef = useRef({
    position: position || null,
    heading: typeof heading === 'number' ? heading : 0,
  });
  const sampleRef = useRef({
    position: position || null,
    heading: typeof heading === 'number' ? heading : 0,
    ts: Date.now(),
    velocity: null, // { dLat, dLng, dHeading } per ms
  });
  const rafRef = useRef(null);
  const onChangeRef = useRef(onAnimatedPositionChange);
  onChangeRef.current = onAnimatedPositionChange;

  const publish = (pos, head) => {
    renderedRef.current = { position: pos, heading: head };
    setRenderedPosition(pos);
    setRenderedHeading(head);
    onChangeRef.current?.({ ...pos, heading: head });
  };

  useEffect(() => {
    if (!position) return undefined;

    const now = Date.now();
    const prevSample = sampleRef.current;
    const startPos = renderedRef.current.position || position;
    const startHeading = renderedRef.current.heading;
    const endPos = position;

    const samePoint = nearlySameLatLng(startPos, endPos, JITTER_EPS);
    const explicitHeading = typeof heading === 'number' ? heading : null;
    const toHeading =
      explicitHeading != null
        ? explicitHeading
        : samePoint
          ? startHeading
          : bearingDegrees(startPos, endPos);

    // Derive velocity from successive samples for late-GPS coasting.
    let velocity = null;
    if (
      prevSample.position &&
      prevSample.ts &&
      now > prevSample.ts &&
      !nearlySameLatLng(prevSample.position, endPos, JITTER_EPS)
    ) {
      const dt = Math.max(1, now - prevSample.ts);
      velocity = {
        dLat: (endPos.lat - prevSample.position.lat) / dt,
        dLng: (endPos.lng - prevSample.position.lng) / dt,
        dHeading: (() => {
          let d = toHeading - (prevSample.heading || 0);
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          return d / dt;
        })(),
      };
    }

    sampleRef.current = {
      position: endPos,
      heading: toHeading,
      ts: now,
      velocity: velocity || prevSample.velocity,
    };

    if (samePoint) {
      if (explicitHeading != null && Math.abs(explicitHeading - startHeading) > 0.5) {
        // Heading-only update — short rotate, no teleport.
        const fromH = startHeading;
        const toH = explicitHeading;
        let startTs = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const tick = (ts) => {
          if (startTs == null) startTs = ts;
          const t = Math.min(1, (ts - startTs) / 280);
          const h = lerpHeading(fromH, toH, easeOutCubic(t));
          publish(endPos, h);
          if (t < 1) rafRef.current = requestAnimationFrame(tick);
          else rafRef.current = null;
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
      }
      return undefined;
    }

    // Duration: stretch toward the observed GPS interval when available so
    // the glide fills the gap between samples instead of stopping early.
    const observedInterval = prevSample.ts ? now - prevSample.ts : animateMs;
    const duration = Math.min(
      Math.max(animateMs, Math.min(observedInterval, 5000)),
      5200,
    );

    let startTs = null;
    let coasting = false;
    let coastStartTs = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (ts) => {
      if (startTs == null) startTs = ts;
      const elapsed = ts - startTs;

      if (!coasting) {
        const progress = Math.min(1, elapsed / Math.max(1, duration));
        const eased = easeInOutCubic(progress);
        const pos = lerpLatLng(startPos, endPos, eased);
        const head = lerpHeading(startHeading, toHeading, eased);
        publish(pos, head);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Reached sample — optionally coast if GPS is late.
        const vel = sampleRef.current.velocity;
        if (vel && (Math.abs(vel.dLat) > 1e-10 || Math.abs(vel.dLng) > 1e-10)) {
          coasting = true;
          coastStartTs = ts;
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        rafRef.current = null;
        return;
      }

      // Coast with decaying velocity until the next sample cancels us.
      const coastElapsed = ts - coastStartTs;
      if (coastElapsed > MAX_COAST_MS) {
        rafRef.current = null;
        return;
      }
      const vel = sampleRef.current.velocity;
      if (!vel) {
        rafRef.current = null;
        return;
      }
      const frameDt = Math.min(48, ts - (tick.prevTs || ts));
      tick.prevTs = ts;
      const decay = 1 - coastElapsed / MAX_COAST_MS;
      const cur = renderedRef.current.position;
      const next = {
        lat: cur.lat + vel.dLat * frameDt * decay,
        lng: cur.lng + vel.dLng * frameDt * decay,
      };
      const nextH =
        (renderedRef.current.heading + vel.dHeading * frameDt * decay + 360) % 360;
      publish(next, nextH);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [position, heading, animateMs]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const containerStyle = useMemo(
    () => {
      // Geographic heading relative to the rotated map, so the pin stays
      // road-aligned when the user two-finger-rotates the camera.
      const screenHeading =
        (((renderedHeading - (Number(mapHeading) || 0)) % 360) + 360) % 360;
      return {
        width: size,
        height: size,
        transform: rotate ? `rotate(${screenHeading}deg)` : 'none',
        transformOrigin: '50% 50%',
        transition: 'transform 80ms linear',
        pointerEvents: 'none',
        willChange: 'transform',
      };
    },
    [size, rotate, renderedHeading, mapHeading],
  );

  if (!renderedPosition) return null;

  return (
    <OverlayViewF
      position={renderedPosition}
      mapPaneName={OverlayView.FLOAT_PANE}
      zIndex={MAP_Z_INDEX.DRIVER_MARKER}
      getPixelPositionOffset={getPixelPositionOffset}
    >
      <div style={containerStyle} aria-label={ariaLabel}>
        {pulse && (
          <span
            style={{
              position: 'absolute',
              inset: '-30%',
              borderRadius: '9999px',
              background:
                'radial-gradient(circle, rgba(31,138,76,0.35) 0%, rgba(31,138,76,0) 70%)',
              animation: 'gmap-driver-pulse 1800ms ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}
        <img
          src={imageSrc}
          alt={ariaLabel}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 8px rgba(15, 23, 42, 0.35))',
            position: 'relative',
            zIndex: 1,
          }}
        />
        <style>{`
          @keyframes gmap-driver-pulse {
            0%   { transform: scale(0.7); opacity: 0.55; }
            70%  { transform: scale(1.25); opacity: 0.0; }
            100% { transform: scale(1.25); opacity: 0.0; }
          }
        `}</style>
      </div>
    </OverlayViewF>
  );
}

export default memo(DriverMarker);
