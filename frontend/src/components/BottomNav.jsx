import { NavLink, useLocation } from 'react-router-dom';

const isItemActive = (pathname, item) => {
  if (pathname === item.path) return true;
  if (item.matchPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Nested screens under the same tab (e.g. /user/account/wallet)
  if (pathname.startsWith(`${item.path}/`)) return true;
  return false;
};

const BottomNav = ({ items }) => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-border-light shadow-bottom-nav z-40">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(location.pathname, item);
          const badge = Number(item.badge) || 0;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 min-w-[64px] group"
            >
              <div
                className={`relative p-1.5 rounded-xl transition-all duration-200 ${
                  isActive ? 'bg-primary shadow-sm' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive
                      ? 'text-text'
                      : 'text-text-muted group-hover:text-text-secondary'
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-danger rounded-full">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] transition-colors ${
                  isActive
                    ? 'text-text font-bold'
                    : 'text-text-muted font-medium group-hover:text-text-secondary'
                }`}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
