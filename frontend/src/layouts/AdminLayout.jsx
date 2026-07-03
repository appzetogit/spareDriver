import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../features/admin/components/Sidebar';
import AdminHeader from '../features/admin/components/AdminHeader';

const routeTitles = {
  '/admin': 'Dashboard',
  '/admin/users': 'Manage Users',
  '/admin/drivers': 'Manage Drivers',
  '/admin/tasks': 'Team Tasks',
  '/admin/tasks/activity': 'Task Activity Log',
  '/admin/settings/kits': 'Driver Kits',
  '/admin/kit-orders': 'Kit Orders',
  '/admin/bookings': 'Manage Bookings',
  '/admin/emergency-pool': 'Emergency Pool',
  '/admin/settings': 'Settings',
  '/admin/settings/coupons': 'Coupon Codes',
  '/admin/account/revenue': 'Revenue',
  '/admin/account/subscription-revenue': 'Subscription Revenue',
  '/admin/account/refunds': 'Refunds',
  '/admin/account/withdrawals': 'Withdrawals',
  '/admin/account/deletions': 'Account Deletions',
  '/admin/profile': 'My Profile',
};

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const pageTitle =
    location.pathname.includes('/admin/users/') && location.pathname.endsWith('/history')
      ? 'User History'
      : location.pathname.includes('/admin/users/') && location.pathname.endsWith('/profile')
      ? 'User Profile'
      : location.pathname.includes('/admin/drivers/') && location.pathname.endsWith('/profile')
        ? 'Driver Profile'
        : location.pathname.match(/^\/admin\/kit-orders\/[^/]+$/)
          ? 'Kit Order Detail'
          : routeTitles[location.pathname] || 'Admin';

  return (
    <div className="w-full flex h-screen bg-bg overflow-hidden">
      {/* Sidebar — sticky full height */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — sticky top */}
        <AdminHeader
          title={pageTitle}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
