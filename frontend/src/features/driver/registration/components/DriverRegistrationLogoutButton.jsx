import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useDriverAuthStore from '../../../../store/useDriverAuthStore';

const DriverRegistrationLogoutButton = ({ className = '' }) => {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useDriverAuthStore();

  if (!isAuthenticated) return null;

  const handleLogout = () => {
    logout();
    navigate('/driver/login', { replace: true });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text px-2 py-1.5 rounded-lg hover:bg-gray-100 ${className}`}
    >
      <LogOut className="w-4 h-4" />
      Log out
    </button>
  );
};

export default DriverRegistrationLogoutButton;
