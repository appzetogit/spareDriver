import { Navigate, Outlet } from 'react-router-dom';
import useAdminAuthStore from '../store/useAdminAuthStore';
import { isDeveloper } from '../constants/staffRoles';

/** Developer QA routes — all other admin roles are redirected away. */
const DeveloperOnlyGuard = () => {
  const { admin } = useAdminAuthStore();

  if (!isDeveloper(admin?.role)) {
    return <Navigate to="/admin/tasks" replace />;
  }

  return <Outlet />;
};

export default DeveloperOnlyGuard;
