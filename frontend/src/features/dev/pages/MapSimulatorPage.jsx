import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Map as MapIcon } from 'lucide-react';
import TripTrackingMap from '../../../components/maps/TripTrackingMap';
import DriverSimulatorPanel from '../../../components/maps/DriverSimulatorPanel';
import { useDriverMovementSimulator } from '../../../hooks/useDriverMovementSimulator';
import { formatDistance } from '../../../utils/geo';

/**
 * /dev/map-simulator — developer-only sandbox for the live trip map.
 *
 * What it does:
 *   1. Picks a sensible origin and destination (Connaught Place →
 *      India Gate, two well-known points in central Delhi).
 *   2. Loads the real Google Directions path between them.
 *   3. Lets the developer press "Start" to walk a virtual driver along
 *      that path at a controllable speed.
 *   4. Feeds each new lat/lng/heading sample into <TripTrackingMap />
 *      exactly as the production Firebase pipeline would.
 *
 * As a result, every piece of the live-trip UI is exercised:
 *   - <DriverMarker /> interpolates and rotates smoothly between samples.
 *   - <RoutePolyline /> redraws as the driver→pickup vector shortens.
 *   - The follow-camera (when toggled on) trails the moving driver.
 *
 * The two scenarios mirror real flows:
 *   - "Driver heading to pickup": the simulated driver approaches the
 *     destination, so the polyline shrinks until the driver lands on the
 *     pickup pin.
 *   - "Trip in progress": the simulated driver moves *from* pickup
 *     *to* drop, so the camera follows and the route updates as the
 *     driver progresses — mirrors the `followDriver` mode used in the
 *     in-ride screens.
 *
 * Two predefined demo routes ship below so you can compare a short
 * city-centre route vs a longer cross-town route without typing
 * coordinates. Add more as needed.
 */

/** Predefined demo locations — easy to tweak as new test scenarios come up. */
const DEMO_ROUTES = [
  {
    id: 'cp-indiagate',
    label: 'Connaught Place → India Gate',
    origin: { lat: 28.6315, lng: 77.2167 },
    destination: { lat: 28.6129, lng: 77.2295 },
  },
  {
    id: 'airport-cp',
    label: 'IGI Airport T3 → Connaught Place',
    origin: { lat: 28.5562, lng: 77.1 },
    destination: { lat: 28.6315, lng: 77.2167 },
  },
  {
    id: 'redfort-lotus',
    label: 'Red Fort → Lotus Temple',
    origin: { lat: 28.6562, lng: 77.241 },
    destination: { lat: 28.5535, lng: 77.2588 },
  },
];

const SCENARIOS = [
  { id: 'approach', label: 'Driver heading to pickup' },
  { id: 'in-trip', label: 'Trip in progress (follow driver)' },
];

const MapSimulatorPage = () => {
  const [routeId, setRouteId] = useState(DEMO_ROUTES[0].id);
  const [scenario, setScenario] = useState('approach');
  const [speedKmh, setSpeedKmh] = useState(40);
  const [showRoute, setShowRoute] = useState(true);
  const [showOutline, setShowOutline] = useState(true);

  const activeRoute = useMemo(
    () => DEMO_ROUTES.find((r) => r.id === routeId) || DEMO_ROUTES[0],
    [routeId],
  );

  const sim = useDriverMovementSimulator({
    origin: activeRoute.origin,
    destination: activeRoute.destination,
    speedKmh,
    tickMs: 1000,
  });

  /* ---- Map prop derivation -------------------------------------------- */
  // "Driver heading to pickup": pickup = the route's destination so the
  // simulated driver visibly converges on it. "Trip in progress": pickup
  // is the start, drop is the destination, and the camera follows.
  const isApproach = scenario === 'approach';
  const pickupForMap = isApproach ? activeRoute.destination : activeRoute.origin;
  const dropoffForMap = isApproach ? null : activeRoute.destination;

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      {/* --------- Header --------- */}
      <div className="bg-white border-b border-border-light px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-text" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-amber-700" />
            <h1 className="text-base font-bold text-text">Map simulator</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900">
              Dev
            </span>
          </div>
          <p className="text-[11px] text-text-muted truncate">
            Walks a virtual driver along the directions path so you can verify the live trip UI without a real driver feed.
          </p>
        </div>
      </div>

      {/* --------- Map --------- */}
      <div className="px-4 pt-4">
        <TripTrackingMap
          driver={sim.driver}
          pickup={pickupForMap}
          dropoff={dropoffForMap}
          height={360}
          showRoute={showRoute}
          // showOutline={showOutline}
          followDriver={!isApproach}
          emphasis="driver"
          bookingStatus={isApproach ? 'en_route' : 'started'}
        />
      </div>

      {/* --------- Controls --------- */}
      <div className="flex-1 p-4 space-y-4">
        <DriverSimulatorPanel
          status={sim.status}
          progress={sim.progress}
          driver={sim.driver}
          speedKmh={speedKmh}
          onStart={sim.start}
          onPause={sim.pause}
          onReset={sim.reset}
          onSpeedChange={setSpeedKmh}
        />

        {/* Route picker */}
        <div className="rounded-2xl border border-border bg-white p-3 space-y-2">
          <p className="text-[11px] font-semibold text-text uppercase tracking-wide">
            Demo route
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_ROUTES.map((r) => {
              const active = r.id === routeId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRouteId(r.id)}
                  className={`text-left text-sm px-3 py-2 rounded-xl border transition ${
                    active
                      ? 'border-primary bg-primary/10 text-text font-semibold'
                      : 'border-border bg-white text-text-secondary hover:border-text-muted/40'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-text-muted">
            Origin {activeRoute.origin.lat.toFixed(4)}, {activeRoute.origin.lng.toFixed(4)}
            {' · '}
            Destination {activeRoute.destination.lat.toFixed(4)}, {activeRoute.destination.lng.toFixed(4)}
            {sim.path && sim.path.length > 1 ? (
              <>
                {' · '}
                {formatDistance(estimatePathLength(sim.path))} path
              </>
            ) : null}
          </p>
        </div>

        {/* Scenario picker */}
        <div className="rounded-2xl border border-border bg-white p-3 space-y-2">
          <p className="text-[11px] font-semibold text-text uppercase tracking-wide">
            Scenario
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SCENARIOS.map((s) => {
              const active = s.id === scenario;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenario(s.id)}
                  className={`text-left text-xs px-3 py-2 rounded-xl border transition ${
                    active
                      ? 'border-primary bg-primary/10 text-text font-semibold'
                      : 'border-border bg-white text-text-secondary hover:border-text-muted/40'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center justify-between text-xs text-text-secondary mt-1">
            <span>Show route polyline</span>
            <input
              type="checkbox"
              checked={showRoute}
              onChange={(e) => setShowRoute(e.target.checked)}
              className="accent-emerald-600"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-text-secondary">
            <span>Polyline outline (halo)</span>
            <input
              type="checkbox"
              checked={showOutline}
              onChange={(e) => setShowOutline(e.target.checked)}
              className="accent-emerald-600"
            />
          </label>
        </div>

        {/* Instructions */}
        <div className="rounded-2xl bg-white border border-border p-3 text-xs text-text-secondary leading-relaxed">
          <p className="font-semibold text-text mb-1">How to use</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Pick a demo route and scenario.</li>
            <li>Wait for the panel status to flip to <span className="font-mono">Ready</span> — that means the directions path loaded.</li>
            <li>Hit <span className="font-mono">Start</span>. The driver pin will glide along the route and the polyline + camera will react in real time.</li>
            <li>Use the speed slider to test how the smooth-animation behaves at slow walk vs highway speed.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

/* Rough path length helper kept page-local — the simulator hook already
 * computes this internally for its progress math but doesn't expose it
 * so we re-derive a quick estimate for the on-screen footer. Off by less
 * than a metre vs the canonical total. */
function estimatePathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const R = 6_371_000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

export default MapSimulatorPage;
