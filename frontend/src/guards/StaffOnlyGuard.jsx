import { Navigate, Outlet } from 'react-router-dom';
import useAdminAuthStore from '../store/useAdminAuthStore';
import { isDeveloper } from '../constants/staffRoles';

/** Blocks developer accounts from staff-only admin routes. */
const StaffOnlyGuard = () => {
  const { admin } = useAdminAuthStore();

  if (isDeveloper(admin?.role)) {
    return <Navigate to="/admin/dev/booking-test" replace />;
  }

  return <Outlet />;
};

export default StaffOnlyGuard;
