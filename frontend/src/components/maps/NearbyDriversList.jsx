import { Star, Car } from 'lucide-react';
import Avatar from '../Avatar';
import { formatDistance, estimateEtaMinutes } from '../../utils/geo';
import { maskPersonName } from '../../utils/formatters';

/**
 * Reusable list of driver rows used inside the home-page bottom sheet and any
 * other surface that needs to render the same "drivers near you" UI. Pure
 * visual — pass an array shaped by `useNearbyDrivers` (or any compatible
 * driver object: `{ _id, name, profilePicture, rating, vehicleType,
 * distanceMeters, isOnTrip, live }`).
 *
 *   props:
 *     - drivers          driver array
 *     - loading          show skeleton when true and the list is empty
 *     - emptyText        copy for the empty state
 *     - onDriverClick    row click handler
 *     - selectedId       highlights the active row
 */
const NearbyDriversList = ({
  drivers = [],
  loading = false,
  emptyText = 'No drivers nearby right now. Please try again in a moment.',
  onDriverClick,
  selectedId = null,
}) => {
  if (loading && drivers.length === 0) {
    return (
      <ul className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="h-16 rounded-2xl bg-gray-100 animate-pulse"
            aria-hidden
          />
        ))}
      </ul>
    );
  }

  if (drivers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm text-text-muted">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {drivers.map((driver) => {
        const isSelected = String(selectedId) === String(driver._id);
        const eta = estimateEtaMinutes(driver.distanceMeters);
        const displayName =
          maskPersonName(driver.name) || `Driver ${String(driver._id).slice(-4)}`;
        return (
          <li key={driver._id}>
            <button
              type="button"
              onClick={() => onDriverClick?.(driver)}
              className={`group w-full flex items-center gap-3 rounded-2xl p-3 text-left transition border ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent bg-bg hover:shadow-md'
              }`}
            >
              <Avatar
                name={driver.name}
                src={driver.profilePicture || undefined}
                size="lg"
                online={!driver.isOnTrip}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-text text-sm truncate">
                    {displayName}
                  </h3>
                  {driver.live && (
                    <span className="text-[9px] uppercase tracking-wide font-semibold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5">
                      live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {driver.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-text-secondary">
                      <Star className="w-3 h-3 text-primary fill-primary" />
                      {driver.rating.toFixed?.(1) ?? driver.rating}
                    </span>
                  )}
                  {driver.vehicleType && (
                    <>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Car className="w-3 h-3" />
                        {driver.vehicleType}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-success font-medium mt-0.5">
                  {formatDistance(driver.distanceMeters)} away
                  {eta && ` · ${eta} min`}
                  {driver.isOnTrip && ' · on trip'}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default NearbyDriversList;
