import { NavLink, useLocation } from 'react-router-dom';

const BottomNav = ({ items }) => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-border-light shadow-bottom-nav z-40">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
                          (item.matchPaths && item.matchPaths.some(p => location.pathname.startsWith(p)));
          const badge = Number(item.badge) || 0;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 min-w-[64px] group"
            >
              <div className={`relative p-1 rounded-xl transition-all duration-200 ${isActive ? 'bg-primary/15' : ''}`}>
                <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'}`} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-danger rounded-full">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-primary-dark' : 'text-text-muted group-hover:text-text-secondary'}`}>
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
