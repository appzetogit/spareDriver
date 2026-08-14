import { Navigate } from 'react-router-dom';
import useAdminAuthStore from '../../../store/useAdminAuthStore';
import { isSuperAdmin, isDeveloper } from '../../../constants/staffRoles';
import AdminDashboard from './AdminDashboard';

const AdminHomeRedirect = () => {
  const { admin } = useAdminAuthStore();

  if (isDeveloper(admin?.role)) {
    return <Navigate to="/admin/dev/booking-test" replace />;
  }

  if (isSuperAdmin(admin?.role)) {
    return <AdminDashboard />;
  }

  return <Navigate to="/admin/tasks" replace />;
};

export default AdminHomeRedirect;
