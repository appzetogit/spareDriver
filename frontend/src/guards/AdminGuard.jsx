import { Outlet, Navigate } from 'react-router-dom';
import useAdminAuthStore from '../store/useAdminAuthStore';
import { useStoreHydration } from '../hooks/useStoreHydration';
import { BootstrapShellSkeleton } from '../components/skeleton/SectionSkeletons';

const STAFF_ROLES = ['admin', 'sub_admin', 'team_member'];

const AdminGuard = () => {
  const hydrated = useStoreHydration(useAdminAuthStore);
  const { isAuthenticated, admin } = useAdminAuthStore();

  if (!hydrated) {
    return <BootstrapShellSkeleton />;
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
