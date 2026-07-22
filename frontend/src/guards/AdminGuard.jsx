import { Outlet, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useAdminAuthStore from '../store/useAdminAuthStore';
import { useStoreHydration } from '../hooks/useStoreHydration';

const STAFF_ROLES = ['admin', 'sub_admin', 'team_member'];

const AdminGuard = () => {
  const hydrated = useStoreHydration(useAdminAuthStore);
  const { isAuthenticated, admin } = useAdminAuthStore();

  if (!hydrated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white min-h-dvh">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !admin || !STAFF_ROLES.includes(admin.role)) {
    return <Navigate to="/admin/login" replace />;
  }

  if (admin.isActive === false) {
    return <Navigate to="/admin/inactive" replace />;
  }

  return <Outlet />;
};

export default AdminGuard;
