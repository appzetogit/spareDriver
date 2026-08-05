import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { MAX_USER_CARS } from '../../../../utils/constants';
import useUserAuthStore from '../../../../store/useUserAuthStore';
import AddCarForm from '../components/AddCarForm';

const AddCarPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const editCar = location.state?.editCar;
  const carCount = useUserAuthStore((s) => s.onboarding?.carCount ?? 0);
  const logout = useUserAuthStore((s) => s.logout);
  // First-time onboarding — leaving via history.back() exits the WebView wrapper.
  const isRequiredOnboarding = !editCar && carCount === 0;

  const handleSuccess = ({ carCount: nextCount }) => {
    if (editCar) {
      navigate('/user/my-cars', { replace: true });
    } else if (nextCount >= MAX_USER_CARS) {
      navigate('/user/home', { replace: true });
    } else {
      navigate('/user/my-cars', { replace: true });
    }
  };

  const goBackSafe = () => {
    if (isRequiredOnboarding) return;
    navigate('/user/my-cars', { replace: true });
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex-1 flex flex-col bg-white h-dvh max-h-dvh overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-slate-100 bg-white z-10">
        {!isRequiredOnboarding && (
          <button
            type="button"
            onClick={goBackSafe}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
        )}
        <div className={`flex-1 min-w-0 ${isRequiredOnboarding ? 'pl-1' : ''}`}>
          <h1 className="text-lg font-bold text-text">
            {editCar ? 'Edit Your Car' : 'Add Your Car'}
          </h1>
          <p className="text-xs text-text-muted">
            {editCar
              ? 'Update your vehicle details'
              : isRequiredOnboarding
                ? 'Add a vehicle to start booking drivers'
                : 'Register your vehicle to find matching drivers'}
          </p>
        </div>
        {isRequiredOnboarding && (
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-danger hover:bg-danger/5"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 px-5 pt-4 flex flex-col">
        <AddCarForm
          onSuccess={handleSuccess}
          onCancel={isRequiredOnboarding ? undefined : goBackSafe}
          editCar={editCar}
          submitLabel={editCar ? 'Save Changes' : 'Save & Continue'}
          stickyActions
        />
      </div>
    </div>
  );
};

export default AddCarPage;
