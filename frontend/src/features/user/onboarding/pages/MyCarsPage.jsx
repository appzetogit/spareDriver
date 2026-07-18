import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import Modal from '../../../../components/Modal';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import AddCarForm from '../components/AddCarForm';
import RowActionsMenu from '../../../admin/components/RowActionsMenu';
import {
  ArrowLeft,
  Plus,
  Car,
  Fuel,
  Settings,
  Trash2,
  ChevronRight,
  Pencil,
  AlertCircle,
} from 'lucide-react';
import api from '../../../../utils/api';
import { MAX_USER_CARS } from '../../../../utils/constants';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import {
  getCarBrandName,
  getCarModelName,
  getCarFuelName,
} from '../../../../utils/vehicleCatalog';

const MyCarsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setOnboarding = useUserAuthStore((s) => s.setOnboarding);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingCar, setEditingCar] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/cars');
      const list = Array.isArray(res.data.data) ? res.data.data : res.data.data?.cars || [];
      setCars(list);

      const incomplete = list.some((c) => c.hasChecklist === false);
      setOnboarding({
        carCount: list.length,
        hasCar: list.length > 0,
        hasChecklist: list.length > 0 && !incomplete,
      });
    } catch (err) {
      console.error('Failed to fetch cars', err);
    } finally {
      setLoading(false);
    }
  }, [setOnboarding]);

  useEffect(() => {
    fetchCars();
  }, [fetchCars, location.key]);

  // When checklist questions were added, open the first incomplete car to edit.
  useEffect(() => {
    if (loading || editingCar) return;
    const firstIncomplete = cars.find((c) => c.hasChecklist === false);
    if (firstIncomplete && location.state?.completeChecklist) {
      setEditingCar(firstIncomplete);
    }
  }, [loading, cars, editingCar, location.state]);

  const incompleteCars = useMemo(
    () => cars.filter((c) => c.hasChecklist === false),
    [cars],
  );
  const checklistComplete = cars.length > 0 && incompleteCars.length === 0;

  const handleEditSuccess = async () => {
    setEditingCar(null);
    await fetchCars();
    // After save, continue to next incomplete car if any remain.
    // fetchCars updates state asynchronously — use a fresh GET for the queue.
    try {
      const res = await api.get('/auth/cars');
      const list = Array.isArray(res.data.data) ? res.data.data : [];
      const next = list.find((c) => c.hasChecklist === false);
      if (next) {
        toast.success('Saved — complete the next vehicle');
        setEditingCar(next);
      } else {
        toast.success('Car profile updated');
      }
    } catch {
      toast.success('Car profile updated');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/auth/cars/${deleteTarget._id}`);
      setCars((prev) => prev.filter((c) => c._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove vehicle');
    } finally {
      setDeleting(false);
    }
  };

  const goToHome = () => {
    if (!checklistComplete) {
      toast.error('Edit each car and complete the safety checklist first');
      const first = incompleteCars[0];
      if (first) setEditingCar(first);
      return;
    }
    navigate('/user/home', { replace: true });
  };

  const canContinue = checklistComplete;
  const slotsLeft = MAX_USER_CARS - cars.length;

  return (
    <div className="flex flex-col bg-[#F8FAFC] h-dvh overflow-hidden">
      <PageHeader cars={cars} canContinue={canContinue} onDone={goToHome} />

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        {!loading && incompleteCars.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900">
                Update your car profile
              </p>
              <p className="text-xs text-amber-800 mt-0.5 leading-snug">
                New safety checklist questions were added. Edit each vehicle
                below and answer them to continue.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3 rounded-full"
                onClick={() => setEditingCar(incompleteCars[0])}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Complete car profile
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-sm font-semibold text-slate-400">Loading your garage...</p>
          </div>
        ) : cars.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <Car className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No cars yet</h3>
            <p className="text-sm text-slate-500 mt-1">Add at least one vehicle to continue</p>
            <Button fullWidth onClick={() => navigate('/user/add-car')} className="mt-6 rounded-full">
              Add your first car
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {cars.map((car, idx) => (
              <Card
                key={car._id}
                className={`group border-transparent hover:border-primary/20 transition-all shadow-sm hover:shadow-md animate-fade-in-up ${
                  car.hasChecklist === false ? 'ring-2 ring-amber-300' : ''
                }`}
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                <div className="flex gap-3 sm:gap-4 relative">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-2xl overflow-hidden shrink-0">
                    {car.image ? (
                      <img src={car.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-7 h-7 sm:w-8 sm:h-8 text-slate-200" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                            {getCarBrandName(car)}
                          </h3>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                            {getCarModelName(car)}
                          </span>
                          {car.hasChecklist === false && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-[9px] sm:text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                              Incomplete
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs font-bold font-mono text-slate-700 bg-slate-100 inline-block px-2 py-0.5 sm:py-1 rounded-md uppercase tracking-wide mb-2">
                          {car.vehicleNumber}
                        </p>
                      </div>

                      <RowActionsMenu
                        items={[
                          {
                            label: car.hasChecklist === false ? 'Complete checklist' : 'Edit',
                            icon: Pencil,
                            onClick: () => setEditingCar(car),
                          },
                          {
                            label: 'Remove',
                            icon: Trash2,
                            variant: 'danger',
                            onClick: () => setDeleteTarget(car),
                          },
                        ]}
                      />
                    </div>

                    <div className="flex items-center gap-3 text-[9px] sm:text-[10px] font-semibold text-slate-500 uppercase">
                      <span className="inline-flex items-center gap-1">
                        <Fuel className="w-3 text-slate-400" /> {getCarFuelName(car)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Settings className="w-3 text-slate-400" /> {car.transmission}
                      </span>
                    </div>

                    {car.hasChecklist === false && (
                      <button
                        type="button"
                        onClick={() => setEditingCar(car)}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit & complete profile
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && cars.length > 0 && cars.length < MAX_USER_CARS && checklistComplete && (
          <button
            type="button"
            onClick={() => navigate('/user/add-car')}
            className="w-full border-2 border-dashed border-slate-300 rounded-3xl p-6 flex flex-col items-center gap-3 hover:border-slate-500 hover:bg-white transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Plus className="w-6 h-6 text-slate-700" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-bold text-slate-800">Add another vehicle</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                {slotsLeft} more allowed (max {MAX_USER_CARS})
              </span>
            </div>
          </button>
        )}
      </div>

      {cars.length > 0 && (
        <div className="shrink-0 p-6 bg-white border-t border-slate-100 space-y-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          {canContinue ? (
            <>
              <Button
                fullWidth
                onClick={goToHome}
                className="rounded-full py-4 text-base font-bold flex items-center justify-center gap-2"
              >
                Continue to home
                <ChevronRight className="w-5 h-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={goToHome}
                className="rounded-full py-3.5 text-sm font-semibold border-2 border-slate-400 text-slate-900 bg-white hover:bg-slate-50"
              >
                Skip — I&apos;m done adding cars
              </Button>
            </>
          ) : (
            <Button
              fullWidth
              onClick={() => setEditingCar(incompleteCars[0])}
              className="rounded-full py-4 text-base font-bold flex items-center justify-center gap-2"
            >
              <Pencil className="w-5 h-5" />
              Complete car profile
            </Button>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(editingCar)}
        onClose={() => setEditingCar(null)}
        title={editingCar?.hasChecklist === false ? 'Complete car profile' : 'Edit vehicle'}
        size="xl"
      >
        <div className="px-5 py-5">
          {editingCar && (
            <AddCarForm
              key={editingCar._id}
              editCar={editingCar}
              onSuccess={handleEditSuccess}
              onCancel={() => setEditingCar(null)}
              submitLabel="Save changes"
              cancelLabel="Cancel"
              compact
            />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Remove this vehicle?"
        description={
          deleteTarget
            ? `${getCarBrandName(deleteTarget)} ${getCarModelName(deleteTarget)} (${deleteTarget.vehicleNumber}) will be removed from your garage.`
            : ''
        }
        confirmLabel="Remove vehicle"
        cancelLabel="Keep it"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
};

function PageHeader({ cars, canContinue, onDone }) {
  return (
    <div className="shrink-0 bg-white px-4 pt-6 pb-6 shadow-sm border-b border-slate-100 z-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => window.history.back()} className="p-2 -ml-2 rounded-xl hover:bg-slate-50">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold text-slate-900">Your garage</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {cars.length} of {MAX_USER_CARS} vehicles registered
          </p>
        </div>
        {canContinue && (
          <Button type="button" variant="dark" size="sm" onClick={onDone} className="shrink-0 rounded-full px-4">
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

export default MyCarsPage;
