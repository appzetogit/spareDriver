import { useEffect, useState, useCallback } from 'react';
import { Car as CarIcon, Check, ChevronDown, Loader2, Plus, Lock } from 'lucide-react';
import BottomSheet from '../../../../components/BottomSheet';
import api from '../../../../utils/api';
import {
  getCarBrandName,
  getCarModelName,
  getCarFuelName,
} from '../../../../utils/vehicleCatalog';
import { MAX_USER_CARS } from '../../../../constants/limits';
import AddCarModal from './AddCarModal';

/**
 * Rapido-style car picker: a single trigger row shows the currently chosen
 * vehicle, tapping it opens a bottom sheet listing every car the user has
 * registered (one per row) plus an "Add a new car" CTA at the bottom that
 * opens `AddCarModal` inline — the user never has to leave the booking flow.
 *
 *   props:
 *     - selectedId      currently selected car id (string)
 *     - onSelect        (carId, car) => void
 *     - autoSelectFirst when true, picks the first car automatically
 *     - className       extra classes for the trigger row
 */
const CarPickerSheet = ({
  selectedId,
  onSelect,
  autoSelectFirst = true,
  className = '',
}) => {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const selected = cars.find((c) => c._id === selectedId) || null;

  const fetchCars = useCallback(async ({ preferLatest = false } = {}) => {
    setLoading(true);
    try {
      const res = await api.get('/auth/cars');
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setCars(list);
      if (preferLatest && list[0]?._id) {
        onSelect?.(list[0]._id, list[0]);
      } else if (autoSelectFirst && !selectedId && list[0]?._id) {
        onSelect?.(list[0]._id, list[0]);
      }
    } catch {
      setCars([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectFirst, selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch-on-mount
    fetchCars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCarAdded = ({ car }) => {
    if (car?._id) {
      setCars((prev) => {
        const exists = prev.some((c) => c._id === car._id);
        return exists ? prev : [car, ...prev];
      });
      onSelect?.(car._id, car);
    } else {
      fetchCars({ preferLatest: true });
    }
    setSheetOpen(false);
  };

  const handleSelectCar = (car) => {
    onSelect?.(car._id, car);
    setSheetOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className={`w-full flex items-center gap-3 rounded-2xl border border-border bg-white px-3 py-3 text-left transition hover:border-text-muted/40 active:scale-[0.99] ${className}`}
      >
        <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
          {selected?.image ? (
            <img src={selected.image} alt="" className="w-full h-full object-cover" />
          ) : selected?.brandId?.logo ? (
            <img
              src={selected.brandId.logo}
              alt=""
              className="w-8 h-8 object-contain"
            />
          ) : (
            <CarIcon className="w-6 h-6 text-text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {loading ? (
            <p className="text-sm text-text-muted">Loading your cars…</p>
          ) : selected ? (
            <>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">
                Car for this trip
              </p>
              <p className="text-sm font-semibold text-text truncate">
                {getCarBrandName(selected)} {getCarModelName(selected)}
              </p>
              <p className="text-[11px] font-mono text-text-secondary truncate">
                {selected.vehicleNumber}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-text">Choose a car</p>
              <p className="text-[11px] text-text-muted">
                Pick which vehicle the driver should drive.
              </p>
            </>
          )}
        </div>
        <ChevronDown className="w-5 h-5 text-text-muted shrink-0" />
      </button>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Choose your car"
      >
        {loading ? (
          <div className="py-10 flex items-center justify-center text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : cars.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-text">No cars yet</p>
            <p className="text-xs text-text-muted mt-1">
              Add your first vehicle to continue booking.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {cars.map((car) => {
              const isSelected = car._id === selectedId;
              return (
                <li key={car._id}>
                  <button
                    type="button"
                    onClick={() => handleSelectCar(car)}
                    className={`w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-white hover:border-text-muted/40'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 relative">
                      {car.image ? (
                        <img src={car.image} alt="" className="w-full h-full object-cover" />
                      ) : car.brandId?.logo ? (
                        <img
                          src={car.brandId.logo}
                          alt=""
                          className="w-9 h-9 object-contain"
                        />
                      ) : (
                        <CarIcon className="w-6 h-6 text-text-muted" />
                      )}
                      {car.image && car.brandId?.logo && (
                        <span className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-md bg-white border border-border/70 flex items-center justify-center overflow-hidden shadow-sm">
                          <img
                            src={car.brandId.logo}
                            alt=""
                            className="w-4 h-4 object-contain"
                          />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text truncate">
                        {getCarBrandName(car)} {getCarModelName(car)}
                      </p>
                      <p className="text-[11px] text-text-muted truncate">
                        {getCarFuelName(car) || 'Vehicle'} •{' '}
                        {car.transmission === 'automatic' ? 'Automatic' : 'Manual'}
                      </p>
                      <p className="mt-0.5 text-[11px] font-mono font-semibold text-text-secondary truncate">
                        {car.vehicleNumber}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="w-7 h-7 rounded-full bg-primary text-slate-900 flex items-center justify-center shrink-0 shadow">
                        <Check className="w-4 h-4" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {(() => {
          const atLimit = cars.length >= MAX_USER_CARS;
          return (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={atLimit}
              aria-disabled={atLimit}
              className={`mt-4 w-full flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-left transition ${
                atLimit
                  ? 'border-border bg-gray-50 cursor-not-allowed opacity-70'
                  : 'border-border hover:bg-gray-50 active:scale-[0.99]'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  atLimit ? 'bg-gray-200 text-text-muted' : 'bg-primary/10 text-primary'
                }`}
              >
                {atLimit ? <Lock className="w-4 h-4" /> : <Plus className="w-5 h-5" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-text">
                  {atLimit ? `You've reached the ${MAX_USER_CARS}-car limit` : 'Add a new car'}
                </span>
                <span className="block text-[11px] text-text-muted">
                  {atLimit
                    ? 'Remove a car from "My cars" to register a new vehicle.'
                    : 'Register another vehicle without leaving this booking.'}
                </span>
              </span>
            </button>
          );
        })()}
      </BottomSheet>

      <AddCarModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCarAdded={handleCarAdded}
      />
    </>
  );
};

export default CarPickerSheet;
