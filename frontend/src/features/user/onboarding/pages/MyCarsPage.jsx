import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import Modal from '../../../../components/Modal';
import ConfirmDialog from '../../../../components/ConfirmDialog';
import AddCarForm from '../components/AddCarForm';
import { ArrowLeft, Plus, Car, Fuel, Settings, Trash2, ChevronRight, Pencil } from 'lucide-react';
import api from '../../../../utils/api';
import { MAX_USER_CARS } from '../../../../utils/constants';
import {
  getCarBrandName,
  getCarModelName,
  getCarFuelName,
} from '../../../../utils/vehicleCatalog';

const MyCarsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit modal state
  const [editingCar, setEditingCar] = useState(null);

  // Delete confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState(null); // car object to delete
  const [deleting, setDeleting] = useState(false);

  const fetchCars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/cars');
      setCars(res.data.data);
    } catch (err) {
      console.error('Failed to fetch cars', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCars();
  }, [fetchCars, location.key]);

  const handleEditSuccess = () => {
    setEditingCar(null);
    fetchCars();
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

  const goToHome = () => navigate('/user/home', { replace: true });

  const canContinue = cars.length > 0;
  const slotsLeft = MAX_USER_CARS - cars.length;

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] min-h-dvh">
      <PageHeader cars={cars} canContinue={canContinue} onDone={goToHome} />

      <div className="flex-1 p-5 space-y-4">
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
                className="group border-transparent hover:border-primary/20 transition-all shadow-sm hover:shadow-md animate-fade-in-up"
                style={{ animationDelay: `${idx * 0.08}s` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden shrink-0">
                    {car.image ? (
                      <img src={car.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-8 h-8 text-slate-200" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-base">{getCarBrandName(car)}</h3>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
                        {getCarModelName(car)}
                      </span>
                    </div>
                    <p className="text-xs font-bold font-mono text-slate-800 bg-slate-100 inline-block px-2 py-1 rounded-lg uppercase tracking-wide">
                      {car.vehicleNumber}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-[10px] font-semibold text-slate-500 uppercase">
                      <span className="inline-flex items-center gap-1">
                        <Fuel className="w-3.5 h-3.5" /> {getCarFuelName(car)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Settings className="w-3.5 h-3.5" /> {car.transmission}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingCar(car)}
                      className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:bg-primary/10 hover:text-primary transition-colors"
                      aria-label="Edit vehicle"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(car)}
                      className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      aria-label="Remove vehicle"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && cars.length > 0 && cars.length < MAX_USER_CARS && (
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

      {canContinue && (
        <div className="p-6 bg-white border-t border-slate-100 space-y-3">
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
        </div>
      )}

      {/* ── Edit car modal ──────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(editingCar)}
        onClose={() => setEditingCar(null)}
        title="Edit vehicle"
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

      {/* ── Delete confirmation dialog ──────────────────────────── */}
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
    <div className="bg-white px-4 pt-6 pb-6 shadow-sm border-b border-slate-100">
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


