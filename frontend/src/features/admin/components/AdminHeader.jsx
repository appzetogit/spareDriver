import { Bell, Menu, Search } from 'lucide-react';
import AdminUserMenu from './AdminUserMenu';
import { NotificationBell } from '../../../components/notifications/NotificationCenter';
import { useAdminNotificationStore } from '../../../store/useNotificationStore';
import { AdminNotificationBridge } from '../../../components/notifications/NotificationBridge';

const AdminHeader = ({ onMenuToggle, title = 'Dashboard' }) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 lg:px-6">
      <AdminNotificationBridge />
      <div className="flex items-center justify-between h-16">
        {/* Left: Hamburger + Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-xl hover:bg-gray-100 text-text-secondary transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-text">{title}</h1>
          </div>
        </div>

        {/* Right: Search + Notifications + Profile */}
        <div className="flex items-center gap-2">
          {/* Search — desktop only */}
          <div className="hidden md:block relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              className="h-10 w-56 bg-gray-50 rounded-xl pl-10 pr-4 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
            />
          </div>

          <NotificationBell store={useAdminNotificationStore} audience="admin" panelTitle="Admin alerts" />

          <AdminUserMenu />
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
